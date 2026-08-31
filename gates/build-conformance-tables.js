#!/usr/bin/env node
/**
 * gates/build-conformance-tables.js
 *
 * 正典 docs/ から G3〜G6 が消費する照合表を生成する（§11.4「判定の出典は必ず正典 docs」）。
 * docs/ は読取専用。本スクリプトは docs/ を一切書き換えない。
 *
 * 設計要件:
 * - 決定論のみ。LLM 不使用（§1.3）。
 * - 全リーフに出典（file:line）を付す。正典更新への追従を可能にするため（§11.4）。
 * - 「抽出できるはずのものが0件」は例外で落ちる（ExtractionError）。
 *   silent empty は vacuous pass の温床（§11.5）。
 * - 抽出できないものは「抽出できた」ことにしない。表自身に能力の限界を宣言させる。
 *
 * 使い方: npm run build:tables
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  GATES_DIR,
  loadDoc,
  ExtractionError,
  requireNonEmpty,
  requireCount,
  requireIncludes,
  extractCanonVersion,
  posix,
  DESIGN_DOC_DETAIL,
} from './lib/canon.js';
import { isMainModule } from './lib/run.js';
import {
  findHeading,
  sectionSlice,
  firstFencedBlock,
  parseTables,
  backtickTokens,
  plain,
  computeFenceMask,
} from './lib/markdown.js';

const OUT_DIR = path.join(GATES_DIR, 'conformance_tables');

// export: G14（正典整合・§13.1）が「docs/ 9ファイルの全量」を own-list として二重管理せず
// ここから import する（L005 の同期漏れ回避）。
export const CANON_FILES = [
  '00_INDEX.md',
  'L1_CONTEXT_MANAGEMENT.md',
  'L2_SKILLS.md',
  'L3_AGENTS.md',
  'L4_AUTOMATION.md',
  'L5_DISTRIBUTION.md',
  'TOOLS.md',
  'BEST_PRACTICES.md',
  'ORCHESTRATION.md',
];

const WARNING = [
  '自動生成ファイル。手動編集禁止。',
  '生成元: gates/build-conformance-tables.js / 出典: docs/（SSoT・正典）。',
  '再生成: npm run build:tables',
  '正典を変えたいときは docs/ を直し、本ファイルは再生成すること。',
  '本ファイルを直接編集すると SSoT が壊れ、次回再生成で黙って失われる。',
];

// ---------------------------------------------------------------------------
// frontmatter 完全リファレンス（YAML ブロック）のパース
// ---------------------------------------------------------------------------

/**
 * `#### frontmatter 完全リファレンス` 直下の yaml ブロックを解析する。
 * ブロックは `# === グループ名 ===` で区切られ、`key: value  # コメント` が並ぶ。
 * 「必須」グループに属するキーが必須キー。この構造が抽出の足場。
 */
function parseFrontmatterReference(doc, headingText) {
  const h = findHeading(doc.lines, headingText, 4);
  if (h < 0) {
    throw new ExtractionError(
      `${doc.ref}: 見出し「${headingText}」が見つからない。frontmatter スキーマの抽出足場が消えている。`
    );
  }
  const { start, end } = sectionSlice(doc.lines, h);
  const block = firstFencedBlock(doc.lines, start, end, 'yaml');
  if (!block) {
    throw new ExtractionError(`${doc.ref}:${h + 1} 「${headingText}」直下に yaml コードブロックが無い。`);
  }

  const keys = [];
  let group = null;
  for (let i = 0; i < block.body.length; i++) {
    const line = block.body[i];
    const abs = block.start + i + 1; // 1-based 絶対行番号
    const g = line.match(/^#\s*===\s*(.+?)\s*===\s*$/);
    if (g) {
      group = g[1].trim();
      continue;
    }
    // インデントされた継続コメント・リスト項目・--- は対象外（トップレベルキーのみ）
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!m) continue;
    const [, key, rest] = m;
    const c = rest.split('#');
    keys.push({
      key,
      group,
      example: c[0].trim(),
      comment: c.length > 1 ? c.slice(1).join('#').trim() : null,
      source: `${doc.ref}:${abs}`,
    });
  }
  requireNonEmpty(keys, `${doc.ref} の frontmatter キー`, `${doc.ref}:${block.start}`);
  return { keys, blockStart: block.start, headingLine: h + 1 };
}

/** 「主要フィールド」表からキー集合を取り、YAML ブロックと相互検証する。 */
function fieldTableKeys(doc, start, end) {
  const tables = parseTables(doc.lines, start, end);
  const out = [];
  for (const t of tables) {
    if (!/フィールド/.test(t.header[0])) continue;
    for (const r of t.rows) {
      for (const tok of backtickTokens(r.cells[0])) {
        // `isolation: worktree` のような複合表記はキー部分だけ採る
        const key = tok.split(':')[0].trim();
        if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(key)) {
          out.push({ key, line: r.line, cells: r.cells });
        }
      }
    }
  }
  return out;
}

/** セル内のバッククォート語彙を列挙（キー名自身は除外）。 */
function vocabFromCell(cell, excludeKeys = []) {
  const toks = backtickTokens(cell).map((t) => t.trim());
  const out = [];
  for (const t of toks) {
    if (excludeKeys.includes(t)) continue;
    if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(t)) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** YAML 行のインラインコメントから区切り語彙を採る（`# a, b, c` / `# a/b/c`）。 */
function vocabFromComment(comment, sep) {
  if (!comment) return [];
  const head = comment.split(/[（(。]/)[0];
  return head
    .split(sep)
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(s));
}

// ---------------------------------------------------------------------------
// frontmatter.json（G4）
// ---------------------------------------------------------------------------

function buildFrontmatter() {
  const l3 = loadDoc('L3_AGENTS.md');
  const l2 = loadDoc('L2_SKILLS.md');
  const l1 = loadDoc('L1_CONTEXT_MANAGEMENT.md');

  // ---- agent (L3 §2.1) ----
  const agentRef = parseFrontmatterReference(l3, 'frontmatter 完全リファレンス');
  const agentSec = sectionSlice(l3.lines, findHeading(l3.lines, '2.1 Subagents', 3));
  const agentTable = fieldTableKeys(l3, agentSec.start, agentSec.end);

  const agentKeys = agentRef.keys.map((k) => k.key);
  const agentRequired = agentRef.keys.filter((k) => k.group === '必須').map((k) => k.key);
  requireNonEmpty(agentRequired, 'agent の必須キー', `${l3.ref}:${agentRef.blockStart}`);
  requireIncludes(agentRequired, ['name', 'description'], 'agent 必須キー', `${l3.ref}:${agentRef.blockStart}`);

  // 相互検証: 表のキーは YAML ブロックに含まれるはず。含まれなければ抽出漏れ。
  const agentTableKeys = [...new Set(agentTable.map((r) => r.key))];
  const agentOrphans = agentTableKeys.filter((k) => !agentKeys.includes(k));
  if (agentOrphans.length > 0) {
    throw new ExtractionError(
      `${l3.ref}: 「主要フィールド」表にあるが frontmatter リファレンス yaml に無いキー: ` +
        `${JSON.stringify(agentOrphans)}。YAML ブロックの抽出漏れか正典の不整合。`
    );
  }

  const agentModelRow = agentTable.find((r) => r.key === 'model');
  const agentModelVocab = agentModelRow
    ? vocabFromCell(agentModelRow.cells[1] ?? agentModelRow.cells[0], ['model', 'effort'])
    : [];
  requireIncludes(
    agentModelVocab,
    ['sonnet', 'opus', 'haiku', 'inherit'],
    'agent model 語彙',
    `${l3.ref}:${agentModelRow?.line}`
  );

  const effortEntry = agentRef.keys.find((k) => k.key === 'effort');
  const effortVocab = vocabFromComment(effortEntry?.comment, ',');
  requireIncludes(effortVocab, ['low', 'medium', 'high', 'xhigh', 'max'], 'effort 語彙', effortEntry?.source);

  const pmEntry = agentRef.keys.find((k) => k.key === 'permissionMode');
  const pmVocab = vocabFromComment(pmEntry?.comment, '/');
  requireIncludes(pmVocab, ['default', 'acceptEdits', 'plan'], 'permissionMode 語彙', pmEntry?.source);
  // `manual` は別行の散文注記。抽出は脆い（下記 extraction_confidence 参照）。
  const manualLine = l3.lines.findIndex((l) => /#\s*manual は default のエイリアス/.test(l));

  const memEntry = agentRef.keys.find((k) => k.key === 'memory');
  const memVocab = vocabFromComment(memEntry?.comment, '/');
  requireIncludes(memVocab, ['user', 'project', 'local'], 'memory 語彙', memEntry?.source);

  const colorRow = agentTable.find((r) => r.key === 'color');
  const colorVocab = colorRow ? vocabFromCell(colorRow.cells[1] ?? '', ['color']) : [];
  requireIncludes(colorVocab, ['red', 'blue', 'green'], 'color 語彙', `${l3.ref}:${colorRow?.line}`);

  // ---- skill (L2 §2.1) ----
  const skillRef = parseFrontmatterReference(l2, 'SKILL.md frontmatter 完全リファレンス');
  const skillSec = sectionSlice(l2.lines, findHeading(l2.lines, '2.1 Skills', 3));
  const skillTable = fieldTableKeys(l2, skillSec.start, skillSec.end);
  const skillKeys = skillRef.keys.map((k) => k.key);
  const skillTableKeys = [...new Set(skillTable.map((r) => r.key))];
  const skillOrphans = skillTableKeys.filter((k) => !skillKeys.includes(k));
  if (skillOrphans.length > 0) {
    throw new ExtractionError(
      `${l2.ref}: 「主要フィールド詳細」表にあるが frontmatter リファレンス yaml に無いキー: ` +
        `${JSON.stringify(skillOrphans)}。`
    );
  }
  // Skill の必須キーは正典が「実質なし」と明言している（L2:157）。0 件が正しい状態。
  const skillRequiredLine = l2.lines.findIndex((l) => /^\*\*必須フィールド\*\*:\s*実質なし/.test(l));
  if (skillRequiredLine < 0) {
    throw new ExtractionError(
      `${l2.ref}: 「**必須フィールド**: 実質なし」の記述が見つからない。` +
        `Skill の必須キーが0件であることの根拠が取れないため、0件を「抽出成功」と主張できない。`
    );
  }

  // Skill の表には「値」列があり型が取れる（agent 側には無い＝非対称）。
  const skillTypes = {};
  for (const r of skillTable) {
    const t = plain(r.cells[1] ?? '');
    if (t) skillTypes[r.key] = { type: t, source: `${l2.ref}:${r.line}` };
  }
  requireNonEmpty(skillTypes, 'skill フィールド型', l2.ref);

  const skillModelRow = skillTable.find((r) => r.key === 'model');
  const skillModelVocab = skillModelRow ? vocabFromCell(skillModelRow.cells[2] ?? '', ['model']) : [];
  requireIncludes(skillModelVocab, ['sonnet', 'opus', 'haiku', 'inherit'], 'skill model 語彙', l2.ref);

  const shellRow = skillTable.find((r) => r.key === 'shell');
  const shellVocab = shellRow ? vocabFromCell(shellRow.cells[1] ?? '', ['shell']) : [];
  requireIncludes(shellVocab, ['bash', 'powershell'], 'shell 語彙', `${l2.ref}:${shellRow?.line}`);

  const contextRow = skillTable.find((r) => r.key === 'context');
  const contextVocab = contextRow ? vocabFromCell(contextRow.cells[1] ?? '', ['context']) : [];
  requireIncludes(contextVocab, ['fork'], 'context 語彙', `${l2.ref}:${contextRow?.line}`);

  // ---- rule (L1 §2.2) ----
  // 注意: rules には「frontmatter 完全リファレンス」が存在せず、実装例しか無い。
  // ゆえに既知キー集合は「例に現れたキー」でしかなく、未知キー検出には使えない。
  const ruleH = findHeading(l1.lines, 'Path-Specific Rules', 4);
  if (ruleH < 0) throw new ExtractionError(`${l1.ref}: 「Path-Specific Rules」見出しが無い。`);
  const ruleSec = sectionSlice(l1.lines, ruleH);
  const ruleBlock = firstFencedBlock(l1.lines, ruleSec.start, ruleSec.end, 'markdown');
  if (!ruleBlock) throw new ExtractionError(`${l1.ref}: rules の実装例ブロックが無い。`);
  const ruleKeys = [];
  for (let i = 0; i < ruleBlock.body.length; i++) {
    const m = ruleBlock.body[i].match(/^([A-Za-z][A-Za-z0-9_-]*):\s*$/);
    if (m) ruleKeys.push({ key: m[1], source: `${l1.ref}:${ruleBlock.start + i + 1}` });
  }
  requireNonEmpty(ruleKeys, 'rule frontmatter キー', l1.ref);

  return {
    _warning: WARNING,
    kinds: {
      agent: {
        canon_section: `${l3.ref}:${agentRef.headingLine} (§2.1 frontmatter 完全リファレンス)`,
        required_keys: agentRequired.map((k) => ({
          key: k,
          source: agentRef.keys.find((e) => e.key === k).source,
        })),
        required_keys_corroboration: {
          statement: '**必須**: `name` + `description` フィールド + Markdown body（system prompt）。それ以外は任意。',
          source: `${l3.ref}:194`,
          note: 'YAML ブロックの `# === 必須 ===` グループと散文の двух経路で一致を確認済み。',
        },
        known_keys: agentRef.keys.map((k) => ({
          key: k.key,
          group: k.group,
          optional: k.group !== '必須',
          source: k.source,
        })),
        unknown_key_detection: {
          supported: true,
          basis: 'known_keys は「frontmatter 完全リファレンス」= 正典が完全性を主張するブロックに由来する。',
        },
        // `disallowedTools` ⇔ `disallowed-tools` の互換 alias は2026-08-19に撤廃した
        // （L3_AGENTS.md:198・保守課題まとめ処理）。公式 sub-agents ページに複数回の再検証
        // （2026-06-09〜2026-08-19）でハイフン形が一度も確認できず、黙認し続けると
        // 「deny が黙って効かない」静かな失敗を招くため、G4 が未知キーとして検出する側へ倒した。
        vocabularies: {
          model: {
            values: agentModelVocab,
            closed: false,
            open_reason:
              'full model ID（例 claude-opus-4-8 / claude-sonnet-5）も可。正典は例のみ示し ID の構文規則を定義していないため、閉じた語彙照合はできない。',
            source: `${l3.ref}:${agentModelRow.line}`,
          },
          effort: { values: effortVocab, closed: true, source: effortEntry.source },
          permissionMode: {
            values: pmVocab,
            closed: true,
            source: pmEntry.source,
            alias:
              manualLine >= 0
                ? { value: 'manual', of: 'default', source: `${l3.ref}:${manualLine + 1}` }
                : null,
            extraction_confidence: manualLine >= 0 ? 'low' : 'none',
            extraction_note:
              '`manual` エイリアスは YAML の継続コメント（散文）由来。文面が変わると黙って落ちる。',
          },
          memory: { values: memVocab, closed: true, source: memEntry.source },
          color: { values: colorVocab, closed: true, source: `${l3.ref}:${colorRow.line}` },
        },
        types: {
          available: false,
          reason:
            'L3 の「主要フィールド」表には型の列が無い（L2 の Skill 表には「値」列がある）。型は YAML の例示値から推測するしかなく、決定論的に抽出できない。G4 の「型照合」は agent については正典由来で実装できない。',
        },
      },

      skill: {
        canon_section: `${l2.ref}:${skillRef.headingLine} (§2.1 SKILL.md frontmatter 完全リファレンス)`,
        required_keys: [],
        required_keys_basis: {
          statement: '**必須フィールド**: 実質なし（`description` 推奨だが技術的には任意）。',
          source: `${l2.ref}:${skillRequiredLine + 1}`,
          note: '0 件は抽出失敗ではなく正典の明示的な帰結。根拠行の存在を検査して初めて 0 件を正当化している。',
        },
        known_keys: skillRef.keys.map((k) => ({
          key: k.key,
          group: k.group,
          optional: true,
          source: k.source,
        })),
        unknown_key_detection: { supported: true, basis: '「完全リファレンス」ブロック由来。' },
        types: skillTypes,
        vocabularies: {
          model: {
            values: skillModelVocab,
            closed: false,
            open_reason: 'full ID 可。agent と同じ理由で閉じない。',
            source: `${l2.ref}:${skillModelRow.line}`,
          },
          shell: { values: shellVocab, closed: true, source: `${l2.ref}:${shellRow.line}` },
          context: { values: contextVocab, closed: true, source: `${l2.ref}:${contextRow.line}` },
        },
      },

      rule: {
        canon_section: `${l1.ref}:${ruleH + 1} (§2.2 Path-Specific Rules)`,
        required_keys: [],
        required_keys_basis: {
          statement: 'frontmatter なし → 無条件ロード。`paths` あり → 該当ファイル読取時のみロード。',
          source: `${l1.ref}:${ruleSec.start + 1}`,
        },
        known_keys: ruleKeys.map((k) => ({ key: k.key, optional: true, source: k.source })),
        unknown_key_detection: {
          supported: false,
          reason:
            'rules には「frontmatter 完全リファレンス」が存在せず、根拠は実装例1件のみ（L1 §2.2）。' +
            '例に現れたキー集合を「既知キーの全集合」と見なすと、正当なキーを未知キーとして誤検出する。' +
            'G4 の未知キー検出は rule には適用してはならない。',
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// paths.json（G3）
// ---------------------------------------------------------------------------

function placementTable(doc, headingText) {
  const h = findHeading(doc.lines, headingText, 4);
  if (h < 0) throw new ExtractionError(`${doc.ref}: 見出し「${headingText}」が無い。パス規約の抽出足場が消えている。`);
  const { start, end } = sectionSlice(doc.lines, h);
  const tables = parseTables(doc.lines, start, end);
  const t = tables.find((x) => /階層/.test(x.header[0]));
  if (!t) throw new ExtractionError(`${doc.ref}:${h + 1} 配置場所の表が見つからない。`);
  const out = [];
  for (const r of t.rows) {
    const scope = plain(r.cells[0]);
    const paths = backtickTokens(r.cells[1]).filter((p) => p.includes('/'));
    if (paths.length === 0) continue;
    out.push({ scope, paths, source: `${doc.ref}:${r.line}`, deprecated: /廃止予定/.test(r.cells[0]) });
  }
  requireNonEmpty(out, `${doc.ref} の配置場所`, `${doc.ref}:${h + 1}`);
  return out;
}

function buildPaths() {
  const l3 = loadDoc('L3_AGENTS.md');
  const l2 = loadDoc('L2_SKILLS.md');
  const l1 = loadDoc('L1_CONTEXT_MANAGEMENT.md');

  const agentPlacements = placementTable(l3, '配置場所とスコープ（4階層）');
  const skillPlacements = placementTable(l2, '配置場所とスコープ階層（4階層 + 廃止予定）');

  // agent: 「ファイル名・ディレクトリ名は識別に無関係」という正典の明示を機械で確認する。
  const agentNameIndep = l3.lines.findIndex((l) =>
    /ファイル名・ディレクトリ名と一致する必要はない/.test(l)
  );
  const agentNameIndep2 = l3.lines.findIndex((l) =>
    /ファイル名・ディレクトリ名・配置パスは識別に無関係/.test(l)
  );
  if (agentNameIndep < 0 || agentNameIndep2 < 0) {
    throw new ExtractionError(
      `${l3.ref}: agent の「ディレクトリ名と name は無関係」の明示が見つからない。` +
        `この一文の有無で G3 の判定が反転するため、黙って既定値を採ってはならない。`
    );
  }

  const skillNameDefault = l2.lines.findIndex((l) => /^name: my-skill\s+#\s*表示名（既定: ディレクトリ名）/.test(l));
  if (skillNameDefault < 0) {
    throw new ExtractionError(`${l2.ref}: skill の name 既定値（ディレクトリ名）の記述が見つからない。`);
  }

  // rules: 表ではなく箇条書き。
  const ruleH = findHeading(l1.lines, '2.2 Rules', 3);
  const ruleSec = sectionSlice(l1.lines, ruleH);
  const rulePaths = [];
  for (let i = ruleSec.start; i < ruleSec.end; i++) {
    const m = l1.lines[i].match(/^-\s*(Project|User)-level:\s*`([^`]+)`/);
    if (m) rulePaths.push({ scope: m[1], path: m[2], source: `${l1.ref}:${i + 1}` });
  }
  requireNonEmpty(rulePaths, 'rules の配置場所', `${l1.ref}:${ruleH + 1}`);

  return {
    _warning: WARNING,
    kinds: {
      agent: {
        canon_section: `${l3.ref} §2.1 配置場所とスコープ（4階層）`,
        placements: agentPlacements,
        project_patterns: agentPlacements.find((p) => p.scope === 'Project').paths,
        dirname_must_match_name: {
          value: false,
          source: `${l3.ref}:${agentNameIndep + 1}`,
          corroboration: `${l3.ref}:${agentNameIndep2 + 1}`,
          note:
            '正典は「ファイル名・ディレクトリ名と一致する必要はない（識別は name のみ）」と明言する。' +
            'G3 が agent に対しディレクトリ名＝name を要求すると正典に反する誤検出になる。',
        },
        extension: '.md',
      },
      skill: {
        canon_section: `${l2.ref} §2.1 配置場所とスコープ階層`,
        placements: skillPlacements,
        project_patterns: skillPlacements.find((p) => p.scope === 'Project').paths,
        filename_fixed: 'SKILL.md',
        dirname_must_match_name: {
          value: null,
          canon_says: 'name の既定値がディレクトリ名（＝未指定ならディレクトリ名が採用される）',
          source: `${l2.ref}:${skillNameDefault + 1}`,
          note:
            '正典は「既定: ディレクトリ名」と述べるのみで、name を明示した場合にディレクトリ名と一致せねば' +
            'ならないとは述べていない。詳細設計書 §11.2 の G3「skill ディレクトリ名＝name 一致」は' +
            '正典由来ではなく設計由来の追加規律である（§11.4 の「例外は2つ」に該当しない第3の例外）。' +
            '本表は正典に無い要件を捏造しないため null を返す。G3 実装者は design_derived_requirements を見よ。',
        },
      },
      rule: {
        canon_section: `${l1.ref} §2.2 Rules`,
        placements: rulePaths,
        extension: '.md',
        frontmatter_key_for_scoping: 'paths',
      },
    },
    design_derived_requirements: {
      _note:
        '以下は docs/（正典）に根拠が無く、設計書由来の規律。§11.4 は「判定の出典は必ず正典 docs／例外は G11 と G13 の2つ」と' +
        '述べるが、G3 にも正典外の要件が混入している。本表は出典を偽らないため別枠に隔離する。' +
        'G3 実装者はこれを正典由来と誤認してはならない。人間の裁定済みの項目でも、正典の根拠が無いという' +
        '事実そのものは変わらないため、G3 実装時は違反メッセージに「正典由来でなく設計由来」と明示すること。',
      items: [
        {
          requirement: 'skill ディレクトリ名 = frontmatter name の一致',
          source: `${DESIGN_DOC_DETAIL} §11.2 G3`,
          canon_support: 'なし（L2_SKILLS.md は「既定: ディレクトリ名」と述べるのみ）',
          status: 'accepted_by_human',
          decided_at: '2026-07-16',
          decision_basis:
            'ユーザー裁定。G3 実装タスクの一部として決定。設計由来要件として明示したうえで検査対象に含める' +
            '（要件そのものを削除するのではなく、出典が正典でないことをコード・照合表の双方に残す）。' +
            '根拠: (1) 移植元の旧 `.claude/skills`（2026-07 実測・17件）は全ての skill で' +
            'ディレクトリ名と frontmatter name が一致しており、一致させることが実運用上の保守性を' +
            `高める慣行として既に定着している。(2) §11.4 の「例外は2つ（G11・G13）」という記述と矛盾しないよう、` +
            `この要件は ${DESIGN_DOC_DETAIL} §11.4 に「第3の例外」として追記されている` +
            '（G3 の skill dirname 要件のみが正典由来でない）。',
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// tools.json（G5）— 本タスクの核心的な失敗点
// ---------------------------------------------------------------------------

function buildTools() {
  const tools = loadDoc('TOOLS.md');
  const mask = computeFenceMask(tools.lines);

  // --- 全ツール表（正典が見出しに総数を自己宣言する。buildHooks と同じ規律） ---
  const h = findHeading(tools.lines, '全ツール', 4, mask);
  if (h < 0) throw new ExtractionError(`${tools.ref}: 「全ツール」見出しが無い。`);
  const declared = tools.lines[h].match(/（(\d+)種）/);
  if (!declared) {
    throw new ExtractionError(
      `${tools.ref}:${h + 1} 見出しにツール総数「（N種）」の明示が無い。` +
        `抽出結果を突き合わせる基準が失われるため落とす。`
    );
  }
  const declaredTotal = Number(declared[1]);

  const { start, end } = sectionSlice(tools.lines, h, mask);
  const toolTable = parseTables(tools.lines, start, end, mask)
    .find((t) => /ツール名/.test(t.header[0] ?? '') && /Permission required/.test(t.header[1] ?? ''));
  if (!toolTable) {
    throw new ExtractionError(`${tools.ref}:${h + 1} 「ツール名 | Permission required」表が見つからない。`);
  }

  const canonical = [];
  for (const r of toolTable.rows) {
    const name = backtickTokens(r.cells[0])[0];
    const perm = plain(r.cells[1] ?? '');
    if (!name) throw new ExtractionError(`${tools.ref}:${r.line} ツール名がバッククォート囲みでない。`);
    if (perm !== 'Yes' && perm !== 'No') {
      throw new ExtractionError(`${tools.ref}:${r.line} Permission required が Yes/No でない: ${perm}`);
    }
    canonical.push({ name, permission_required: perm === 'Yes', source: `${tools.ref}:${r.line}` });
  }
  requireNonEmpty(canonical, '正規ツール名', `${tools.ref}:${toolTable.headerLine}`);
  requireCount(canonical.length, declaredTotal, '正規ツール名の総数', `${tools.ref}:${h + 1}`);

  // 直交した自己検算（権限要 + 権限不要 = 総数）。正典本文の宣言と突き合わせる。
  const yes = canonical.filter((t) => t.permission_required).length;
  const no = canonical.length - yes;
  const selfCheck = tools.lines
    .slice(start, end)
    .find((l) => /自己検算/.test(l) && /権限要\s*(\d+)/.test(l));
  if (!selfCheck) throw new ExtractionError(`${tools.ref}: 「自己検算」行が無い（二重検査が成立しない）。`);
  const dy = Number(selfCheck.match(/権限要\s*(\d+)/)[1]);
  const dn = Number(selfCheck.match(/権限不要\s*(\d+)/)[1]);
  requireCount(yes, dy, '権限要ツール数', `${tools.ref}: 自己検算行`);
  requireCount(no, dn, '権限不要ツール数', `${tools.ref}: 自己検算行`);

  // --- 旧称・非推奨（G5 の旧称検出の出典） ---
  const dh = findHeading(tools.lines, '旧称・非推奨・既定無効', 3, mask);
  if (dh < 0) throw new ExtractionError(`${tools.ref}: 「旧称・非推奨・既定無効」見出しが無い。`);
  const ds = sectionSlice(tools.lines, dh, mask);
  const depTable = parseTables(tools.lines, ds.start, ds.end, mask)
    .find((t) => /名前/.test(t.header[0] ?? '') && /区分/.test(t.header[1] ?? ''));
  if (!depTable) throw new ExtractionError(`${tools.ref}:${dh + 1} 旧称表が見つからない。`);

  const deprecated = [];
  for (const r of depTable.rows) {
    const name = backtickTokens(r.cells[0])[0];
    if (!name) continue;
    deprecated.push({
      name,
      kind: plain(r.cells[1] ?? ''),
      note: plain(r.cells[2] ?? ''),
      source: `${tools.ref}:${r.line}`,
    });
  }
  requireNonEmpty(deprecated, '旧称・非推奨ツール', `${tools.ref}:${depTable.headerLine}`);

  // 旧称（改名）のみを G5 の検出対象にする。非推奨・既定無効は「実在する正規名」であり弾いてはならない。
  const renamed = deprecated.filter((d) => /旧称/.test(d.kind));
  requireNonEmpty(renamed, '旧称（改名）', `${tools.ref}:${depTable.headerLine}`);
  const canonicalNames = new Set(canonical.map((t) => t.name));
  for (const r of renamed) {
    if (canonicalNames.has(r.name)) {
      throw new ExtractionError(
        `${r.source}: 「${r.name}」が旧称表と全ツール表の双方に在る。` +
          `旧称なら全ツール表に在ってはならない（正典の自己矛盾）。`
      );
    }
  }

  // --- MCP 命名規約 ---
  const mh = findHeading(tools.lines, 'MCP ツールの命名規約', 3, mask);
  if (mh < 0) throw new ExtractionError(`${tools.ref}: 「MCP ツールの命名規約」見出しが無い。`);
  const ms = sectionSlice(tools.lines, mh, mask);
  const mcpTable = parseTables(tools.lines, ms.start, ms.end, mask)
    .find((t) => /形式/.test(t.header[0] ?? ''));
  if (!mcpTable) throw new ExtractionError(`${tools.ref}:${mh + 1} MCP 形式表が見つからない。`);
  const mcpForms = mcpTable.rows
    .map((r) => ({ form: backtickTokens(r.cells[0])[0], meaning: plain(r.cells[1] ?? ''), source: `${tools.ref}:${r.line}` }))
    .filter((x) => x.form);
  requireIncludes(mcpForms.map((f) => f.form), ['mcp__<server>__<tool>'], 'MCP 形式', `${tools.ref}:${mh + 1}`);

  // --- Subagent 非提供ツール ---
  const sh = findHeading(tools.lines, 'Subagent の `tools` フィールド', 3, mask);
  const unavailable = [];
  if (sh >= 0) {
    const ss = sectionSlice(tools.lines, sh, mask);
    const t = parseTables(tools.lines, ss.start, ss.end, mask).find((x) => /ツール名/.test(x.header[0] ?? ''));
    if (t) {
      for (const r of t.rows) {
        const name = backtickTokens(r.cells[0])[0];
        if (name) unavailable.push({ name, condition: plain(r.cells[1] ?? ''), source: `${tools.ref}:${r.line}` });
      }
    }
  }

  return {
    _warning: WARNING,
    _status: 'OK',
    _headline:
      '正典 docs/TOOLS.md（2026-07-16 新設）から抽出した正規ツール名の集合。' +
      'G5 の closed-world 検査（非実在ツール検出・旧称検出）はこの表を出典にできる。',

    canonical_tool_set: {
      available: true,
      total: canonical.length,
      permission_required_count: yes,
      permission_not_required_count: no,
      source: `${tools.ref}:${h + 1}`,
      tools: canonical.sort((a, b) => a.name.localeCompare(b.name)),
    },

    g5_capability: {
      _note: 'G5 実装者への能力宣言。false のものを実装すると正典に無い判断を捏造することになる。',
      mcp_syntax_check: { supported: true, basis: `${tools.ref}:${mh + 1}` },
      canonical_name_allowlist_check: { supported: true, basis: `${tools.ref}:${h + 1}` },
      deprecated_name_detection: {
        supported: true,
        basis: `${tools.ref}:${depTable.headerLine}`,
        scope: '旧称（改名）のみ。非推奨・既定無効は実在する正規名であり違反にしてはならない。',
      },
      nonexistent_tool_detection: {
        supported: true,
        basis: `${tools.ref}:${h + 1}`,
        caveat:
          '「正規な名前か」は判定できるが「この環境で利用可能か」は判定できない。' +
          '公式が "Your exact tool set depends on your provider, platform, and settings." と留保しているため。',
      },
      case_sensitivity_check: {
        supported: false,
        reason: '正典 §3 [要確認]: 公式は "the exact strings" と述べるのみで大文字小文字の厳密性を明示しない。',
      },
    },

    deprecated_tools: {
      _note: 'kind が「旧称（改名）」のもののみ G5 で違反にしてよい。非推奨・既定無効は正規名として通す。',
      all: deprecated,
      renamed_only: renamed.map((r) => r.name),
    },

    mcp_tool_syntax: {
      forms: mcpForms,
      regex: '^mcp__[A-Za-z0-9_-]+__[A-Za-z0-9_-]+$',
      regex_derivation:
        'テンプレート mcp__<server>__<tool> の <...> を識別子1個に対応させた。' +
        '正典は server/tool 名に許される文字集合を定義していないため、この文字クラスは推定である。',
      regex_confidence: 'medium',
    },

    subagent_unavailable_tools: {
      _note:
        'これらは正規ツール名だが Subagent には提供されない。' +
        'G5 は「正規名か」を見るゲートなので違反にしてはならない（tools: に書いても無視されるだけ）。',
      tools: unavailable,
    },
  };
}

// ---------------------------------------------------------------------------
// hooks.json（G6/G11 の材料）
// ---------------------------------------------------------------------------

function buildHooks() {
  const l4 = loadDoc('L4_AUTOMATION.md');
  const h = findHeading(l4.lines, '全 Hook イベント', 4);
  if (h < 0) throw new ExtractionError(`${l4.ref}: 「全 Hook イベント」見出しが無い。`);

  // 正典が見出しに明示する総数を採り、抽出結果と突き合わせる（自己検証）。
  const declared = l4.lines[h].match(/（(\d+)種）/);
  if (!declared) {
    throw new ExtractionError(
      `${l4.ref}:${h + 1} 見出しにイベント総数「（N種）」の明示が無い。` +
        `抽出結果を突き合わせる基準が失われるため落とす。`
    );
  }
  const declaredTotal = Number(declared[1]);

  const { start, end } = sectionSlice(l4.lines, h);
  const tables = parseTables(l4.lines, start, end);
  const events = [];
  const groups = [];

  for (const t of tables) {
    if (!/イベント/.test(t.header[0]) || !/Block可/.test(t.header[2] ?? '')) continue;
    // 表の直前にある `**グループ名（N種）**` を探す。
    let groupName = null;
    let groupDeclared = null;
    for (let i = t.headerLine - 2; i >= start; i--) {
      const m = l4.lines[i].match(/^\*\*(.+?)（(\d+)種）\*\*\s*$/);
      if (m) {
        groupName = m[1];
        groupDeclared = Number(m[2]);
        break;
      }
      if (l4.lines[i].trim().startsWith('|')) break;
    }
    if (!groupName) {
      throw new ExtractionError(
        `${l4.ref}:${t.headerLine} のイベント表に対応するグループ見出し（**名前（N種）**）が見つからない。`
      );
    }

    const groupEvents = [];
    for (const r of t.rows) {
      const nameToks = backtickTokens(r.cells[0]);
      if (nameToks.length === 0) continue;
      const raw = (r.cells[2] ?? '').trim();
      let blockable = null;
      if (raw.startsWith('✅')) blockable = true;
      else if (raw.startsWith('❌')) blockable = false;
      else if (raw.startsWith('-')) blockable = null;
      else {
        throw new ExtractionError(
          `${l4.ref}:${r.line} Block可 列が ✅/❌/- のいずれでもない: ${JSON.stringify(raw)}`
        );
      }
      const ev = {
        event: nameToks[0],
        group: groupName,
        timing: plain(r.cells[1]),
        blockable,
        blockable_raw: raw,
        source: `${l4.ref}:${r.line}`,
      };
      if (blockable === null) {
        ev.blockable_note = '正典の Block可 欄が「-」＝ブロック可否が明記されていない。true と仮定してはならない。';
      }
      groupEvents.push(ev);
      events.push(ev);
    }

    // グループが自ら宣言する件数と抽出件数の一致を強制する。
    requireCount(
      groupEvents.length,
      groupDeclared,
      `Hook イベント群「${groupName}」`,
      `${l4.ref}:${t.headerLine}`
    );
    groups.push({ group: groupName, declared: groupDeclared, extracted: groupEvents.length });
  }

  requireNonEmpty(events, 'Hook イベント', `${l4.ref}:${h + 1}`);
  // 見出しの「30種」と実抽出数の一致（正典の自己検算 2+2+4+9+3+5+5=30 と同じ不変条件）。
  requireCount(events.length, declaredTotal, 'Hook イベント総数', `${l4.ref}:${h + 1}`);

  const names = events.map((e) => e.event);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  if (dup.length > 0) throw new ExtractionError(`Hook イベント名が重複: ${JSON.stringify(dup)}`);

  // 設計が依存する個別イベントの存在を明示的に検査する（配線の前提が消えたら落とす）。
  for (const [ev, want] of [
    ['UserPromptExpansion', true], // G13 preflight（§11.1）
    ['PostToolUse', false], // per-file 系統はブロック不可（§11.1）
    ['SubagentStop', true], // snapshot 系統
    ['Stop', true],
    ['PreToolUse', true], // 3ガード
  ]) {
    const e = events.find((x) => x.event === ev);
    if (!e) throw new ExtractionError(`設計が前提とする Hook イベント '${ev}' が正典に無い。`);
    if (e.blockable !== want) {
      throw new ExtractionError(
        `設計の前提が崩れた: '${ev}' の Block可 は ${want} のはずが ${e.blockable}（${e.source}）。` +
          `§11.1 の系統設計を見直す必要がある。`
      );
    }
  }

  // Exit code セマンティクス
  const eh = findHeading(l4.lines, 'Exit code セマンティクス', 4);
  if (eh < 0) throw new ExtractionError(`${l4.ref}: 「Exit code セマンティクス」見出しが無い。`);
  const es = sectionSlice(l4.lines, eh);
  const et = parseTables(l4.lines, es.start, es.end).find((t) => /Exit code/.test(t.header[0]));
  if (!et) throw new ExtractionError(`${l4.ref}:${eh + 1} exit code 表が無い。`);
  const exitCodes = et.rows.map((r) => ({
    code: plain(r.cells[0]),
    behavior: plain(r.cells[1]),
    blocking: /Blocking/i.test(r.cells[1]) && !/Non-blocking/i.test(r.cells[1]),
    source: `${l4.ref}:${r.line}`,
  }));
  requireNonEmpty(exitCodes, 'exit code セマンティクス', `${l4.ref}:${eh + 1}`);
  const two = exitCodes.find((e) => e.code === '2');
  if (!two || !two.blocking) {
    throw new ExtractionError(
      `exit code 2 が blocking として抽出できない。§11.1「exit 2 のみがブロッキング」の根拠が崩れる。`
    );
  }

  return {
    _warning: WARNING,
    canon_section: `${l4.ref}:${h + 1} (§2.1 全 Hook イベント)`,
    declared_total: { value: declaredTotal, source: `${l4.ref}:${h + 1}` },
    extracted_total: events.length,
    groups,
    events,
    blockable_events: events.filter((e) => e.blockable === true).map((e) => e.event),
    non_blockable_events: events.filter((e) => e.blockable === false).map((e) => e.event),
    unspecified_blockable_events: {
      _note: '正典が「-」とした＝ブロック可否 未記載。設計でブロックを当てにしてはならない。',
      events: events.filter((e) => e.blockable === null).map((e) => e.event),
    },
    exit_code_semantics: {
      canon_section: `${l4.ref}:${eh + 1}`,
      codes: exitCodes,
      blocking_code: 2,
    },
  };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function write(name, data, meta) {
  const payload = { ...meta, ...data };
  const file = path.join(OUT_DIR, name);
  writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return posix(path.relative(path.dirname(GATES_DIR), file));
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const canon = extractCanonVersion(CANON_FILES);

  const meta = {
    _generated_by: 'gates/build-conformance-tables.js',
    _do_not_edit: true,
    canon_version: canon.version,
    canon_version_sources: canon.sources,
    generated_at: new Date().toISOString(),
    generator_note:
      'canon_version が docs/ の現行値と一致しない場合、本表は stale。npm run build:tables で再生成すること（§11.4）。',
  };

  const built = [
    ['paths.json', buildPaths()],
    ['frontmatter.json', buildFrontmatter()],
    ['tools.json', buildTools()],
    ['hooks.json', buildHooks()],
  ];

  const written = built.map(([n, d]) => write(n, d, meta));

  // インデックス（stale 検出と一覧のため）
  write(
    'index.json',
    {
      _warning: WARNING,
      tables: built.map(([n]) => n),
      consumed_by: {
        'paths.json': 'G3',
        'frontmatter.json': 'G4',
        'tools.json': 'G5（能力制限あり。tools.json の g5_capability を必ず読むこと）',
        'hooks.json': 'G11（hooks 禁止制約の照合）/ §11.1 の発火系統設計 / 全ゲートの exit code 規約',
      },
      not_yet_built: {
        'G6（セキュリティ）': {
          note:
            'G6 の照合表は未構築。hooks.json は G6 の材料ではない（G6 は secret 検出・${VAR} 展開遵守・' +
            'experimental 依存フラグであり、Hook イベント一覧とは無関係）。別タスクで要検討。',
          canon_availability: {
            '${VAR} 展開規約': '抽出可（docs/L4_AUTOMATION.md:555-556 に箇条書きで規則あり）',
            'secret ハードコード検出パターン': '正典に無い（BEST_PRACTICES.md §7.2 は方針を述べるがパターン定義は無い）',
            'experimental 機能の一覧': '構造化された一覧が正典に無い。「実験機能」の語が散文に散在するのみ（要 docs 側の構造化）',
          },
        },
      },
      known_limitations: [
        'tools.json: 正典に正規ツール名の列挙が無いため closed-world 検査は不可（§11.2 G5 の一部は実装不能）。',
        'frontmatter.json: agent の型情報は正典に無い（L3 の表に型列が無い）。G4 の型照合は agent には適用できない。',
        'frontmatter.json: rule の未知キー検出は不可（正典に完全リファレンスが無く、根拠が実装例1件のみ）。',
        'frontmatter.json: model 語彙は full ID を許すため閉じない。`model: gpt-4o` のような明白な誤りも G4 は棄却できない。',
        'paths.json: G3 の「skill ディレクトリ名＝name 一致」は正典に根拠が無い（design_derived_requirements 参照）。',
      ],
    },
    meta
  );

  console.log(`canon_version: ${canon.version}`);
  for (const w of written) console.log(`  generated: ${w}`);
  console.log(`  generated: gates/conformance_tables/index.json`);
}

// isMainModule ガード（機能X 追記）: `npm run build:tables` として直接実行された
// ときのみ副作用（照合表の書込・process.exit）を起こす。CANON_FILES を named export として
// 参照する他モジュール（G14・§11.2「G14/G15/G16 実装契約」）が単に import しただけで
// 照合表が再生成され、しかも ExtractionError 時に process.exit(1) でプロセス全体が
// 落ちる事故を避けるため（本ファイルはもともと「実行専用スクリプト」であり「ライブラリ」
// として import される用途を想定していなかった。CANON_FILES の export 追加で用途が
// 増えたことに伴う必須の対策）。
if (isMainModule(import.meta.url)) {
  try {
    main();
  } catch (e) {
    if (e instanceof ExtractionError) {
      console.error(`\n[ExtractionError] ${e.message}\n`);
      console.error('照合表は生成されなかった。ハードコードで回避せず、正典と抽出器の乖離を解消すること（§11.4）。');
      process.exit(1);
    }
    throw e;
  }
}
