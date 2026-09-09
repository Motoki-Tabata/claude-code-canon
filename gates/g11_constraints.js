#!/usr/bin/env node
/**
 * G11 制約遵守（snapshot 系統・§11.2「G11 実装契約」）。SubagentStop@generation。
 *
 * 「このプロジェクトで使ってはいけない機能」が生成物に混入していないかを判定する。
 *
 * ## G6 との区別（§11.2・実装コメントに残すことが契約）
 *
 * G6 は**普遍的な安全性**（secret 直書き・experimental 依存の「明示」の有無）を見る。
 * G11 は**このプロジェクト固有の環境制約**（`requirements.md` の constraints）を見る。
 * 同じ `context: fork` でも、G6 は「実験機能である旨を書いたか」を、G11 は
 * 「そもそも使ってよいか」を問う。判定の出典も違う: G6 は正典 docs、G11 は
 * requirements.md（§11.4 が挙げる「正典由来でない例外」の1つ）。
 *
 * ## 禁止集合の導出規約（L005 の構造的封鎖）
 *
 * 禁止機能を代表例で列挙しない。`constraints` の**キー全集合**を走査し、
 * `allowed: false` のキーごとに CAPABILITY_DETECTORS の検出器を当てる。検出器は
 * 「その能力が生成物に現れうる全経路」を持ち、可能な限り正典 SSoT から導出する
 * （hooks のイベント名は conformance_tables/hooks.json の全31件（2026-08-19時点。旧30件）、plugin 同梱物は
 * L5_DISTRIBUTION.md:72 の自動発見ディレクトリ）。hooks 禁止を「settings.json の
 * hooks キー」だけで書くと、plugin 同梱 hooks や .claude/hooks/ の実体が素通りする。
 *
 * **未知キーは違反**（2026-07-24 ユーザー裁定）: `allowed: false` なのに検出器を
 * 持たないキーは「禁止したはずの機能が検査されないまま違反0件で通る」経路になるため、
 * 検査不能として run をブロックする。constraints にキーを足したら本ファイルの検出器も
 * 同時に実装しなければ run が止まる——この非対称は意図的である。
 *
 * ## 検出しないもの
 *
 * 散文（Markdown 本文）中の語は検出しない。hooks のイベント名（Stop・Setup・
 * Notification 等）は普通の英単語でもあり、「Hooks は使いません」と説明する生成物を
 * 違反にすると検査が実用不能になる。判定は**構成として現れる経路**（JSON 宣言・
 * frontmatter・ファイル配置）に限る。この限界は結果（notes）に明示する。
 *
 * 純関数（fs 読取のみ・process.exit は CLI 実行時のみ）。
 */

import path from 'node:path';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import hooksTable from './conformance_tables/hooks.json' with { type: 'json' };
import { outputDir, workDir, isMainModule, readHookInput, readSessionTs, blockStop, passStop } from './lib/run.js';
import { parseFrontmatter } from './lib/artifact.js';
import { parseRequirementsDoc, RequirementsError } from './lib/requirements.js';
import { L5_PLUGIN_PATTERN } from './lib/managed-paths.js';
import { findHeading, sectionSlice, mentionsIdentifier } from './lib/markdown.js';

const GATE = 'G11';

/** 正典 SSoT: hook イベント名の全集合（31件・docs/L4_AUTOMATION.md §2.1 由来。2026-08-19時点。旧30件）。 */
const HOOK_EVENTS = new Set((hooksTable.events ?? []).map((e) => e.event));

/** `allowed` を持たない自由文キー（機械判定できないことを明示する対象）。 */
const FREEFORM_KEYS = new Set(['organization_policy']);

/**
 * 強度（§6.3 / 00_INDEX.md §4.4 の3段階）→ その強度を実現する機能。
 * 縮退設計の検査（conflicts の登録漏れ）に使う。advisory は CLAUDE.md であり
 * constraints で禁止されうる機能に対応しないため写像を持たない。
 */
const STRENGTH_TO_CAPABILITY = {
  deterministic: 'hooks',
  enforced: 'permissions',
};

// ---------------------------------------------------------------------------
// 生成物スナップショットの読み込み
// ---------------------------------------------------------------------------

function walkAllFiles(root) {
  if (!existsSync(root)) return [];
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(root);
  return out;
}

/** 検査対象は generated/ 配下の【全ファイル型】。型で絞ると経路が漏れる（§10.1 で G9 が踏んだ穴と同型）。 */
function loadSnapshot(genRoot) {
  return walkAllFiles(genRoot).map((abs) => {
    const rel = path.relative(genRoot, abs).replace(/\\/g, '/');
    let text = null;
    try {
      text = readFileSync(abs, 'utf8');
    } catch {
      text = null; // 読めないファイル（バイナリ等）は本文検査の対象外。配置検査は rel で効く。
    }
    let json = null;
    if (text !== null && (rel.endsWith('.json') || path.basename(rel) === '.mcp.json')) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null; // 壊れた JSON は G6/G9 の領分。G11 は構造検査を諦め、本文経路のみで見る。
      }
    }
    let frontmatter = null;
    if (text !== null && rel.endsWith('.md')) {
      try {
        frontmatter = parseFrontmatter(text).frontmatter;
      } catch {
        frontmatter = null;
      }
    }
    return { abs, rel, text, json, frontmatter };
  });
}

/** frontmatter の値を取り出す（parseFrontmatter は {raw, value} 形で返す）。 */
function fval(fm, key) {
  const f = fm?.[key];
  if (f === undefined || f === null) return undefined;
  return typeof f === 'object' && 'value' in f ? f.value : f;
}

function fraw(fm, key) {
  const f = fm?.[key];
  if (f === undefined || f === null) return undefined;
  return typeof f === 'object' && 'raw' in f ? f.raw : String(f);
}

/** JSON 構造を再帰的に歩き、キー名が pred に合致する箇所を返す。 */
function findJsonKeys(node, pred, trail = [], out = []) {
  if (node === null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((v, i) => findJsonKeys(v, pred, [...trail, String(i)], out));
    return out;
  }
  for (const [k, v] of Object.entries(node)) {
    if (pred(k)) out.push({ pointer: [...trail, k].join('.'), key: k, value: v });
    findJsonKeys(v, pred, [...trail, k], out);
  }
  return out;
}

const ev = (file, evidence) => ({ file, evidence });

// ---------------------------------------------------------------------------
// 能力検出器（constraints キー → 全経路）
// ---------------------------------------------------------------------------

const CAPABILITY_DETECTORS = {
  /**
   * Hooks（L4）。settings.json だけを見ない: plugin 同梱 hooks・hook スクリプトの実体配置も
   * 同じ能力の別経路である（L005）。イベント名は正典 hooks.json の全集合と照合する。
   */
  hooks(files, ctx) {
    const hits = [];
    for (const f of files) {
      // 経路①: JSON 中の hooks 宣言（settings.json / plugin.json / .claude-plugin/plugin.json 等）
      if (f.json) {
        for (const h of findJsonKeys(f.json, (k) => k === 'hooks')) {
          hits.push(ev(f.rel, `JSON の "${h.pointer}" に hooks 宣言がある`));
          // 経路②: 宣言内のイベント名を正典の全イベント集合と照合（キー名でも文字列値でも拾う）
          const names = new Set();
          findJsonKeys(h.value, (k) => HOOK_EVENTS.has(k)).forEach((m) => names.add(m.key));
          if (h.value && typeof h.value === 'object') {
            for (const e of JSON.stringify(h.value).matchAll(/"([A-Za-z]+)"/g)) {
              if (HOOK_EVENTS.has(e[1])) names.add(e[1]);
            }
          }
          for (const n of names) {
            hits.push(ev(f.rel, `hooks 宣言に正典イベント "${n}" が含まれる（出典: conformance_tables/hooks.json）`));
          }
        }
      }
      // 経路③: hook スクリプトの実体配置（.claude/hooks/**・plugin/hooks/**・hooks/**）
      if (/(^|\/)hooks\//.test(f.rel) || /(^|\/)hooks\.json$/.test(f.rel)) {
        hits.push(ev(f.rel, 'hook スクリプト／設定の実体が配置されている'));
      }
    }
    void ctx;
    return hits;
  },

  /** MCP（L4）。.mcp.json の実在・frontmatter 宣言・mcp__ ツール名・settings の有効化。 */
  mcp(files) {
    const hits = [];
    for (const f of files) {
      if (path.basename(f.rel) === '.mcp.json') hits.push(ev(f.rel, '.mcp.json が生成されている'));
      if (f.json) {
        for (const m of findJsonKeys(f.json, (k) => k === 'mcpServers' || k === 'enabledMcpjsonServers')) {
          hits.push(ev(f.rel, `JSON の "${m.pointer}" が MCP を宣言・有効化している`));
        }
      }
      if (f.frontmatter) {
        if (fraw(f.frontmatter, 'mcpServers') !== undefined) {
          hits.push(ev(f.rel, 'frontmatter に mcpServers 宣言がある'));
        }
        const tools = fraw(f.frontmatter, 'tools');
        if (typeof tools === 'string' && /\bmcp__[\w-]+__/.test(tools)) {
          hits.push(ev(f.rel, `frontmatter tools に MCP ツール（mcp__<server>__<tool> 構文）がある: ${tools.trim()}`));
        }
      }
    }
    return hits;
  },

  /** Plugins（L5）。管理パス集合の L5 パターン・マニフェスト・settings の有効化。 */
  plugins(files) {
    const hits = [];
    for (const f of files) {
      if (L5_PLUGIN_PATTERN.test(f.rel)) {
        hits.push(ev(f.rel, 'L5 plugin 配布物（管理パス集合の plugin/ パターン）が生成されている'));
      }
      const base = path.basename(f.rel);
      if (base === 'plugin.json' || base === 'marketplace.json' || f.rel.includes('.claude-plugin/')) {
        hits.push(ev(f.rel, `plugin マニフェスト（${base}）が生成されている`));
      }
      if (f.json) {
        for (const m of findJsonKeys(f.json, (k) => k === 'enabledPlugins' || k === 'extraKnownMarketplaces')) {
          hits.push(ev(f.rel, `JSON の "${m.pointer}" が plugin を有効化している`));
        }
      }
    }
    return hits;
  },

  /**
   * Experimental（context:fork / Agent Teams / Channels / Monitors / Themes・§6.3）。
   * 環境変数は単一の変数名でなく**接頭辞**で見る（G6 が AGENT_TEAMS 1件を見るのとは粒度が違う）。
   */
  experimental(files, ctx) {
    const hits = [];
    for (const f of files) {
      if (f.frontmatter) {
        if (String(fval(f.frontmatter, 'context') ?? '').trim() === 'fork') {
          hits.push(ev(f.rel, 'frontmatter に context: fork がある'));
        }
        if (String(fval(f.frontmatter, 'isolation') ?? '').trim() === 'subagent') {
          hits.push(ev(f.rel, 'frontmatter に isolation: subagent がある（context:fork の公式表記・00_INDEX.md:302）'));
        }
      }
      if (typeof f.text === 'string') {
        for (const m of f.text.matchAll(/CLAUDE_CODE_EXPERIMENTAL_[A-Z0-9_]+/g)) {
          hits.push(ev(f.rel, `実験機能の環境変数 ${m[0]} に依存している（接頭辞 CLAUDE_CODE_EXPERIMENTAL_ で検出）`));
        }
      }
      if (/(^|\/)(themes|monitors|channels)\//.test(f.rel)) {
        hits.push(ev(f.rel, 'plugin 同梱の experimental 配布物（themes/ monitors/ channels/・L5_DISTRIBUTION.md:625-626）'));
      }
    }
    // design-map の ## Experimental Dependencies 節（§9.2 が「eval と G11 が見る」と規定）
    if (ctx.designMapExperimental) {
      hits.push(ev('design-map.md', `## Experimental Dependencies 節が非空: ${ctx.designMapExperimental}`));
    }
    return hits;
  },
};

/**
 * design-map の `## Experimental Dependencies` 節が**依存を宣言している**か（§9.2 が
 * 「eval と G11 が見る」と規定する節）。
 *
 * 判定は**箇条書き（`- ...`）の実体**に限る。この節は自由記述であり、experimental を
 * 使わない設計でも「なし（context:fork / Agent Teams … とも不使用）」のように機能名を
 * 並べた散文を書く。散文中の機能名を依存とみなすと、正しい設計が違反になる（偽陽性で
 * 検査が信用されなくなる）。依存の宣言は箇条書きとして現れる、という構造だけを見る。
 * **権威ある検出は生成物（frontmatter・配置・環境変数）側**であり、本検査はそれを補う
 * 「設計時点での宣言」の捕捉である。
 */
function readDesignMapExperimental(ts) {
  const p = path.join(outputDir(ts), 'design-map.md');
  if (!existsSync(p)) return null;
  const lines = readFileSync(p, 'utf8').split(/\r?\n/);
  const h = findHeading(lines, 'Experimental Dependencies');
  if (h === -1) return null;
  const { start, end } = sectionSlice(lines, h);
  const bullets = lines
    .slice(start + 1, end)
    .map((l) => l.trim())
    .filter((l) => /^-\s+\S/.test(l))
    .filter((l) => !/なし|N\/A|不使用|none/i.test(l));
  return bullets.length > 0 ? bullets.join(' / ').slice(0, 200) : null;
}

// ---------------------------------------------------------------------------
// 縮退設計（conflicts）の検査
// ---------------------------------------------------------------------------

// 識別子境界の照合は `gates/lib/markdown.js` の `mentionsIdentifier` が SSoT
// （G10 と共有・`.claude/rules/gates-and-tests.md`「同じ判定ロジックを複数箇所へ複製しない」）。
const mentions = mentionsIdentifier;

function checkDegradation(doc, prohibitedKeys) {
  const violations = [];
  const conflicts = doc.conflicts ?? [];

  // 登録漏れ: 強度の実現手段が禁止されている要件は conflicts に載っていなければならない。
  // conflicts の【整合】検査（要件 id・constraints キー・禁止済みであること）はここには無い。
  // requirements の書式の問題を生成完了後に落とすのは工程順として誤りなので、G1 の
  // requirements ステージへ移した（gates/lib/requirements.js の checkConflictsIntegrity）。
  // 本検査が G11 に残るのは、「縮退の判断が記録されないまま【生成が通る】」ことを防ぐのが
  // 目的で、生成の直前が最後の関門だからである。
  for (const r of doc.requirements) {
    const cap = STRENGTH_TO_CAPABILITY[r.strength_needed ?? ''];
    if (!cap || !prohibitedKeys.has(cap)) continue;
    const found = conflicts.some((c) => mentions(c.requirement ?? '', r.id ?? ''));
    if (!found) {
      violations.push(
        `${GATE}: 要件 ${r.id}（${r.line}行目・strength_needed: ${r.strength_needed}）は「${cap}」で実現する強度だが ` +
          `constraints で ${cap} が禁止されている。にもかかわらず conflicts に当該要件のエントリが無い` +
          `（縮退の判断が記録されないまま生成が通る・§6.3「使用不可制約の波及」）。`
      );
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// エントリポイント
// ---------------------------------------------------------------------------

export function checkG11({ ts }) {
  const violations = [];
  const notes = [];

  // --- A. 判定入力の前提検査（vacuous pass 封鎖・§11.5）---
  const reqPath = path.join(workDir(ts), 'requirements.md');
  if (!existsSync(reqPath)) {
    return {
      ok: false,
      violations: [
        `${GATE}: work/${ts}/requirements.md が存在しない。制約が「書かれていない」ことを` +
          `「制約なし＝合格」と読まない（§6.3・§11.5）。`,
      ],
    };
  }
  let doc;
  try {
    doc = parseRequirementsDoc(readFileSync(reqPath, 'utf8'));
  } catch (e) {
    if (e instanceof RequirementsError) return { ok: false, violations: [`${GATE}: ${e.message}`] };
    throw e;
  }
  if (!doc.constraintsFound) {
    return {
      ok: false,
      violations: [
        `${GATE}: requirements.md に constraints ブロックが無い（§6.3 の必須項目）。` +
          `制約の記録が無いことを合格と読まない（§11.5）。`,
      ],
    };
  }
  if (doc.constraints.length === 0) {
    return { ok: false, violations: [`${GATE}: constraints にキーが1件も無い（0件を合格と読まない・§11.5）。`] };
  }

  // 生成物スナップショット。対象ゼロを合格と扱わない（G12 と同じ規律）。
  const genRoot = path.join(outputDir(ts), 'generated');
  const files = loadSnapshot(genRoot);
  if (!existsSync(genRoot)) {
    return { ok: false, violations: [`${GATE}: generated/ が存在しない（制約検査の対象ゼロを合格と扱わない・§11.5）。`] };
  }
  if (files.length === 0) {
    return { ok: false, violations: [`${GATE}: generated/ が空（制約検査の対象ゼロを合格と扱わない・§11.5）。`] };
  }

  const ctx = { ts, genRoot, designMapExperimental: readDesignMapExperimental(ts) };

  // --- B. constraints のキー全集合を走査（代表例で列挙しない・L005）---
  const prohibited = new Set();
  const checked = [];

  for (const c of doc.constraints) {
    // 自由文キー（organization_policy 等）: 機械判定できないことを明示する。黙って無いことにしない。
    if (c.freeform) {
      if (FREEFORM_KEYS.has(c.key)) {
        notes.push(
          `${c.key}（${c.line}行目）は自由文の制約であり機械判定できない。G11 は判定していない` +
            `（人間ゲート P5/P7 が読む）: ${JSON.stringify(c.reason ?? '')}`
        );
        continue;
      }
      violations.push(
        `${GATE}: constraints の "${c.key}"（${c.line}行目）は allowed を持たず、既知の自由文キー` +
          `（${[...FREEFORM_KEYS].join(', ')}）でもない。禁止か否かを機械判定できないため合格にしない（§11.5）。`
      );
      continue;
    }
    if (c.allowed === null) {
      violations.push(
        `${GATE}: constraints の "${c.key}"（${c.line}行目）の allowed が真偽値でない（実際: ${JSON.stringify(c.allowedRaw)}）。` +
          `真偽が決まらない制約を合格と読まない（§11.5）。`
      );
      continue;
    }
    if (c.allowed === true) {
      checked.push({ key: c.key, prohibited: false, hits: 0 });
      continue;
    }

    // allowed: false → 検出器が要る。持たないキーは「検査不能」として違反（2026-07-24 ユーザー裁定）。
    const detector = CAPABILITY_DETECTORS[c.key];
    if (!detector) {
      violations.push(
        `${GATE}: constraints の "${c.key}"（${c.line}行目）は allowed: false（禁止）だが、G11 に対応する` +
          `能力検出器が無い＝この制約は検査されていない。禁止の宣言と強制が乖離したまま「違反0件」で` +
          `通る経路になるためブロックする。gates/g11_constraints.js の CAPABILITY_DETECTORS に` +
          `"${c.key}" の検出器（全経路）を実装すること（§11.2 G11 実装契約）。`
      );
      continue;
    }
    prohibited.add(c.key);
    const hits = detector(files, ctx);
    checked.push({ key: c.key, prohibited: true, hits: hits.length });
    for (const h of hits) {
      violations.push(
        `${GATE}: constraints で "${c.key}" は禁止（${c.line}行目・reason: ${JSON.stringify(c.reason ?? '')}）` +
          `だが、生成物 "${h.file}" が違反している: ${h.evidence}`
      );
    }
  }

  // --- C. 縮退設計（conflicts の登録漏れ＋整合）---
  violations.push(...checkDegradation(doc, prohibited));

  notes.push(
    '検出は「構成として現れる経路」（JSON 宣言・frontmatter・ファイル配置）に限る。' +
      'Markdown 本文中の語（Stop・Setup 等は普通の英単語でもある）は検出しない（§11.2 G11 実装契約）。'
  );

  return {
    ok: violations.length === 0,
    violations,
    checked,
    prohibited: [...prohibited],
    scanned: files.length,
    notes,
  };
}

/** stage-guard.js / gen-guard.js が期待する { ok, violations: string[] } 形。 */
export function check({ ts }) {
  const { ok, violations } = checkG11({ ts });
  return { ok, violations };
}

if (isMainModule(import.meta.url)) {
  readHookInput();
  const ts = readSessionTs();
  if (!ts) {
    passStop('G11: .session-ts 不在のため対象なし');
  } else {
    const r = checkG11({ ts });
    if (r.ok) {
      passStop(
        `G11: 通過（禁止 ${r.prohibited?.length ?? 0} 機能 [${(r.prohibited ?? []).join(', ')}] を ` +
          `${r.scanned} ファイルに照合・違反0）\n${(r.notes ?? []).join('\n')}`
      );
    } else {
      blockStop(`G11: 違反を検出（${r.violations.length}件）\n${r.violations.join('\n')}`);
    }
  }
}
