/**
 * V9 constraints（artifacts.md §8.2）。
 *
 * 「このプロジェクトで使ってはいけない機能」が生成物に紛れ込んでいないかを判定する。
 *
 * ## V4 との区別
 *
 * V4 は**普遍的な安全性**（secret 直書き・experimental 依存の「明示」の有無）を見る。
 * V9 は**このプロジェクト固有の環境制約**（`requirements.md` の constraints）を見る。
 * 同じ `context: fork` でも、V4 は「実験機能である旨を書いたか」を、V9 は
 * 「そもそも使ってよいか」を問う。判定の出典も違う: V4 は正典 docs、V9 は
 * requirements.md（artifacts.md §8.3 の「正典由来でない規則」の1つ）。
 *
 * ## 禁止集合の導出規約
 *
 * 禁止機能を代表例で列挙しない。`constraints` の**キー全集合**を走査し、
 * `allowed: false` のキーごとに CAPABILITY_DETECTORS の検出器を当てる。検出器は
 * 「その能力が生成物に現れうる全経路」を持ち、可能な限り canon-reference の data から導出する
 * （hooks のイベント名は canon-reference の hook-events:events の全イベント、plugin 同梱物は
 * `plugin-manifest:components` の既定のディレクトリに合わせた正規表現）。hooks 禁止を「settings.json の
 * hooks キー」だけで書くと、plugin 同梱 hooks や .claude/hooks/ の実体が素通りする。
 *
 * **未知キーは違反**: `allowed: false` なのに検出器を持たないキーは「禁止したはずの機能が
 * 検査されないまま違反0件で通る」経路になるため、検査不能として違反にする。constraints に
 * キーを足したら本ファイルの検出器も同時に実装しなければ run が止まる——この非対称は意図的である。
 *
 * ## 検出しないもの
 *
 * 散文（Markdown 本文）中の語は検出しない。hooks のイベント名（Stop・Setup・
 * Notification 等）は普通の英単語でもあり、「Hooks は使いません」と説明する生成物を
 * 違反にすると検査が実用不能になる。判定は**構成として現れる経路**（JSON 宣言・
 * frontmatter・ファイル配置）に限る。この限界は report に明示する。
 */

import path from 'node:path';
import { collection } from '../../../../../lib/tables.js';
import { parseRequirementsDoc, RequirementsError } from '../../../../../lib/requirements.js';
import { L5_PLUGIN_PATTERN } from '../../../../../lib/managed-paths.js';
import { findHeading, sectionSlice, mentionsIdentifier } from '../../../../../lib/markdown.js';

const CHECK = 'V9';

/** Hook のイベント名の全集合（canon-reference の `hook-events:events`。`complete: true`）。 */
const HOOK_EVENTS = new Set(collection('hook-events:events').items.map((e) => e.id));

/** `allowed` を持たない自由文キー（機械判定できないことを明示する対象）。 */
const FREEFORM_KEYS = new Set(['organization_policy']);

/**
 * 強度（artifacts.md §3 の3段階）→ その強度を実現する機能。
 * 縮退設計の検査（conflicts の登録漏れ）に使う。advisory は CLAUDE.md であり
 * constraints で禁止されうる機能に対応しないため写像を持たない。
 */
const STRENGTH_TO_CAPABILITY = {
  deterministic: 'hooks',
  enforced: 'permissions',
};

// ---------------------------------------------------------------------------
// 生成物の読み込み（verify.js の1回の走査の結果に JSON の解析を足す）
// ---------------------------------------------------------------------------

/** 検査対象は generated/ 配下の【全ファイル型】。型で絞ると経路が漏れる。 */
function toSnapshot(ctx) {
  return ctx.files.map((f) => {
    let json = null;
    if (f.rel.endsWith('.json')) {
      try {
        json = JSON.parse(f.text);
      } catch {
        json = null; // 壊れた JSON は V4・V6 の領分。V9 は構造検査を諦め、本文経路のみで見る。
      }
    }
    return { rel: f.rel, text: f.text, json, frontmatter: f.artifact?.frontmatter ?? null };
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

/** MCP ツール名を書きうる frontmatter のキー（tools.json の TOOL_LIST_FIELDS と同じ顔ぶれ）。 */
const MCP_TOOL_FIELDS = ['tools', 'disallowedTools', 'allowed-tools', 'disallowed-tools'];

const ev = (file, evidence) => ({ file, evidence });

// ---------------------------------------------------------------------------
// 能力検出器（constraints キー → 全経路）
// ---------------------------------------------------------------------------

const CAPABILITY_DETECTORS = {
  /**
   * Hooks（L4）。settings.json だけを見ない: plugin 同梱 hooks・hook スクリプトの実体配置も
   * 同じ能力の別経路である。イベント名は正典 hooks.json の全集合と照合する。
   */
  hooks(files) {
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
            hits.push(ev(f.rel, `hooks 宣言に正典イベント "${n}" が含まれる（出典: canon-reference hook-events:events）`));
          }
        }
      }
      // 経路④: frontmatter の hooks 宣言（agent・skill がライフサイクルフックを自前で持てる・L2/L3 の完全リファレンス）
      if (f.frontmatter && fraw(f.frontmatter, 'hooks') !== undefined) {
        hits.push(ev(f.rel, 'frontmatter に hooks 宣言がある'));
      }
      // 経路③: hook スクリプトの実体配置（.claude/hooks/**・plugin/hooks/**）。
      // skill の supporting dir にある `hooks/*.md`（説明資料）は hook の実体ではないので含めない。
      if (/^(\.claude|plugin)\/hooks\//.test(f.rel) || /(^|\/)hooks\.json$/.test(f.rel)) {
        hits.push(ev(f.rel, 'hook スクリプト／設定の実体が配置されている'));
      }
    }
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
        // MCP ツール名（mcp__<server>__<tool>・mcp__<server>・mcp__*）の参照。agent の tools・disallowedTools と
        // skill の allowed-tools・disallowed-tools が対象。複数行リストは raw に「a, b」で入る。
        for (const key of MCP_TOOL_FIELDS) {
          const v = fraw(f.frontmatter, key);
          if (typeof v === 'string' && /\bmcp__/.test(v)) {
            hits.push(ev(f.rel, `frontmatter ${key} に MCP ツール（mcp__ 構文）がある: ${v.trim()}`));
          }
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
   * Experimental（context:fork / Agent Teams / Channels / Monitors / Themes・artifacts.md §3）。
   * 環境変数は単一の変数名でなく**接頭辞**で見る（V4 が AGENT_TEAMS 1件を見るのとは粒度が違う）。
   */
  experimental(files, ctx) {
    const hits = [];
    for (const f of files) {
      if (f.frontmatter) {
        if (String(fval(f.frontmatter, 'context') ?? '').trim() === 'fork') {
          hits.push(ev(f.rel, 'frontmatter に context: fork がある'));
        }
        if (String(fval(f.frontmatter, 'isolation') ?? '').trim() === 'subagent') {
          hits.push(ev(f.rel, 'frontmatter に isolation: subagent がある（canon 独自の検出。canon-reference の `frontmatter:subagent/isolation` の値は `worktree` だけで、この値は V2 も別に止める）'));
        }
      }
      if (typeof f.text === 'string') {
        for (const m of f.text.matchAll(/CLAUDE_CODE_EXPERIMENTAL_[A-Z0-9_]+/g)) {
          hits.push(ev(f.rel, `実験機能の環境変数 ${m[0]} に依存している（接頭辞 CLAUDE_CODE_EXPERIMENTAL_ で検出）`));
        }
      }
      if (/(^|\/)(themes|monitors|channels)\//.test(f.rel)) {
        hits.push(ev(f.rel, 'plugin 同梱の experimental 配布物（themes/ monitors/ channels/・`plugin-manifest:fields/experimental.themes` ほか）'));
      }
    }
    // design-map の ## Experimental Dependencies 節（artifacts.md §8.2 V9 の experimental ④）
    if (ctx.designMapExperimental) {
      hits.push(ev('design-map.md', `## Experimental Dependencies 節が非空: ${ctx.designMapExperimental}`));
    }
    return hits;
  },
};

/**
 * design-map の `## Experimental Dependencies` 節が**依存を宣言している**か。
 *
 * 判定は**箇条書き（`- ...`）の実体**に限る。この節は自由記述であり、experimental を
 * 使わない設計でも「なし（context:fork / Agent Teams … とも不使用）」のように機能名を
 * 並べた散文を書く。散文中の機能名を依存とみなすと、正しい設計が違反になる（偽陽性で
 * 検査が信用されなくなる）。依存の宣言は箇条書きとして現れる、という構造だけを見る。
 * **権威ある検出は生成物（frontmatter・配置・環境変数）側**であり、本検査はそれを補う
 * 「設計時点での宣言」の捕捉である。
 */
function readDesignMapExperimental(designMapText) {
  if (designMapText === null) return null;
  const lines = designMapText.split(/\r?\n/);
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

// 識別子境界の照合は `lib/markdown.js` の `mentionsIdentifier` が SSoT
// （`.claude/rules/gates-and-tests.md`「同じ判定ロジックを複数箇所へ複製しない」）。
const mentions = mentionsIdentifier;

function checkDegradation(doc, prohibitedKeys) {
  const violations = [];
  if (doc.conflicts === null) {
    // 「ブロックが無い」と「空 `conflicts: []`」は別の事象（requirements-template.md）。
    // 記録が無いことを「衝突なし」と読まない（constraints ブロックと同じ規律）。
    violations.push(
      `${CHECK}: requirements.md に conflicts ブロックが無い。衝突が無ければ \`conflicts: []\` と明示する` +
        '（記録が無いことを「衝突なし」と読まない・artifacts.md §3）。'
    );
  }
  const conflicts = doc.conflicts ?? [];

  // 登録漏れ: 強度の実現手段が禁止されている要件は conflicts に載っていなければならない
  // （縮退の判断が記録されないまま生成が通ることを防ぐ）。
  for (const r of doc.requirements) {
    const cap = STRENGTH_TO_CAPABILITY[r.strength_needed ?? ''];
    if (!cap || !prohibitedKeys.has(cap)) continue;
    const found = conflicts.some((c) => mentions(c.requirement ?? '', r.id ?? ''));
    if (!found) {
      violations.push(
        `${CHECK}: 要件 ${r.id}（${r.line}行目・strength_needed: ${r.strength_needed}）は「${cap}」で実現する強度だが ` +
          `constraints で ${cap} が禁止されている。にもかかわらず conflicts に当該要件のエントリが無い` +
          '（縮退の判断が記録されないまま生成が通る・artifacts.md §3）。'
      );
    }
  }

  // 整合: conflicts の各エントリが実在する要件 id と、実在して禁止されている constraints のキーを指す
  // （無関係な conflicts を1件書けば登録漏れの検査が通る、という形骸化を防ぐ）。
  const reqIds = doc.requirements.map((r) => r.id).filter(Boolean);
  for (const c of conflicts) {
    const where = `conflicts（${c.line}行目）`;
    if (!reqIds.some((id) => mentions(c.requirement ?? '', id))) {
      violations.push(`${CHECK}: ${where} の requirement "${c.requirement ?? ''}" が確定要件の id を指していない。`);
    }
    if (![...prohibitedKeys].some((k) => mentions(c.constraint ?? '', k))) {
      violations.push(
        `${CHECK}: ${where} の constraint "${c.constraint ?? ''}" が、constraints で禁止（allowed: false）されたキーを指していない。`
      );
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// エントリポイント
// ---------------------------------------------------------------------------

/** verify のコンテキストに V9 を当てる。 */
export function checkV9(ctx) {
  const violations = [];
  const warnings = [];
  const fail = (msg) => ({ violations: [`${CHECK}: ${msg}`], warnings, checked: 0 });

  // --- A. 判定入力の前提検査（検査対象ゼロを合格にしない）---
  if (ctx.requirementsText === null) {
    return fail('work/<ts>/requirements.md が無い。制約が「書かれていない」ことを「制約なし＝合格」と読まない。');
  }
  let doc;
  try {
    doc = parseRequirementsDoc(ctx.requirementsText);
  } catch (e) {
    if (e instanceof RequirementsError) return fail(e.message);
    throw e;
  }
  if (!doc.constraintsFound) {
    return fail('requirements.md に constraints ブロックが無い（必須項目）。制約の記録が無いことを合格と読まない。');
  }
  if (doc.constraints.length === 0) return fail('constraints にキーが1件も無い（0件を合格と読まない）。');

  const files = toSnapshot(ctx);
  const detectorCtx = { designMapExperimental: readDesignMapExperimental(ctx.designMapText) };

  // --- B. constraints のキー全集合を走査（代表例で列挙しない）---
  const prohibited = new Set();
  for (const c of doc.constraints) {
    // 自由文キー（organization_policy 等）: 機械判定できないことを明示する。黙って無いことにしない。
    if (c.freeform) {
      if (FREEFORM_KEYS.has(c.key)) {
        warnings.push(
          `${CHECK}: ${c.key}（${c.line}行目）は自由文の制約であり機械では判定できない。準拠は reviewer の security 観点と` +
            ` P4 の人間が見る: ${JSON.stringify(c.reason ?? '')}`
        );
        continue;
      }
      violations.push(
        `${CHECK}: constraints の "${c.key}"（${c.line}行目）は allowed を持たず、既知の自由文キー` +
          `（${[...FREEFORM_KEYS].join(', ')}）でもない。禁止か否かを機械判定できないため合格にしない。`
      );
      continue;
    }
    if (c.allowed === null) {
      violations.push(
        `${CHECK}: constraints の "${c.key}"（${c.line}行目）の allowed が真偽値でない（実際: ${JSON.stringify(c.allowedRaw)}）。` +
          '真偽が決まらない制約を合格と読まない。'
      );
      continue;
    }
    if (c.allowed === true) continue;

    prohibited.add(c.key);
    // allowed: false → 検出器が要る。持たないキーは「検査不能」として違反。
    const detector = CAPABILITY_DETECTORS[c.key];
    if (!detector) {
      violations.push(
        `${CHECK}: constraints の "${c.key}"（${c.line}行目）は allowed: false（禁止）だが、対応する能力検出器が無い` +
          '＝この制約は検査されていない。禁止の宣言と強制がずれたまま「違反0件」で通る経路になるので違反にする。' +
          `verify/v9-constraints.js の CAPABILITY_DETECTORS に "${c.key}" の検出器（全経路）を実装すること。`
      );
      continue;
    }
    for (const h of detector(files, detectorCtx)) {
      violations.push(
        `${CHECK}: constraints で "${c.key}" は禁止（${c.line}行目・reason: ${JSON.stringify(c.reason ?? '')}）` +
          `だが、生成物 "${h.file}" が違反している: ${h.evidence}`
      );
    }
  }

  // --- C. 縮退設計（conflicts の登録漏れ＋整合）---
  violations.push(...checkDegradation(doc, prohibited));

  warnings.push(
    `${CHECK}: 検出は「構成として現れる経路」（JSON 宣言・frontmatter・ファイル配置）に限る。` +
      'Markdown 本文中の語（Stop・Setup 等は普通の英単語でもある）は検出しない。'
  );
  return { violations, warnings, checked: doc.constraints.length, prohibited: [...prohibited] };
}
