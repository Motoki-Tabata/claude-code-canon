#!/usr/bin/env node
/**
 * G10 README 整合（snapshot 系統・§11.2・§12）。SubagentStop@generation。
 *
 * 「読むだけで使いこなせる」README を機械照合する。README は作文でなく規則適用で
 * 書かれる（§12.2）ため、frontmatter から一意に導いた起動方式と README の記述が
 * 一致するかを検査できる。
 *
 * 検査項目（§11.2）:
 *   - 網羅性: 生成した各コンポーネント（内部専用を除く）が README に登場する
 *   - 起動方式の正典整合: §12.4 の導出ルール表と README の記述が一致
 *       * listed な Skill（slash-only / auto+slash）は `/名前` が README にあること
 *       * Subagent・Rule には `/名前` が無いこと（直接起動の UI 手順は書かない／自動ロード）
 *   - 内部専用の非露出: user-invocable:false の Skill を利用者向け一覧に出さない
 *
 * vacuous pass 防止: 生成物があるのに README が無い／空なら違反。
 *
 * ## 判定粒度（2026-09-04 是正・§12.4「一覧に載せない」の運用定義）
 *
 * 内部専用の非露出はかつて `readme.includes(name)` という**位置関係を見ない出現ベース**の
 * 判定だった。これは §12.4 が禁じる「利用者向け一覧への掲載」でなく「本文への出現」を
 * 禁じており、同じ行が推奨する「「内部で参照される知識」に留める」を充足不可能にしていた
 * （ライブ run `20260903_091044` で実測）。判定は `gates/lib/readme-listing.js` の
 * 「`/名前` 表記」「一覧項目としての出現（見出し・表の第1セル・箇条書きの先頭）」の2軸へ絞り、
 * **散文とパス表記（`.claude/skills/<name>/scripts/<script>`）は対象にしない**——後者は
 * §12.5「Hooks 配線 → 参照スクリプトの実行権限付与」が README へ書くことを要求している。
 *
 * 注（現行スコープ）: セットアップ完全性（experimental 依存・MCP secret の手順）の
 * 網羅照合は experimental/MCP を含む生成物が対象になった段階で強化する。扱わない項目は
 * 下記 not_yet で明示する。
 */

import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { outputDir, isMainModule, readHookInput, readSessionTs, blockStop, passStop } from './lib/run.js';
import { parseFrontmatter, detectKind } from './lib/artifact.js';
import { listGeneratedArtifacts } from './g12_output_perfile.js';
import { isNonSchemaRel } from './lib/non-schema.js';
import { collectListingEntries, analyzeReadmeMentions, LISTING_KIND_LABEL } from './lib/readme-listing.js';

const GATE = 'G10';
const NOT_YET = ['setup_completeness(experimental/MCP secret)'];

/** `/名前` を書いてはいけない種別と、その §12.4 上の理由。 */
const NO_SLASH_REASON = {
  agent: 'Subagent は description ベース委譲であり、ユーザー直接起動の UI 手順は書かない',
  rule: 'Rule は paths: に一致したとき自動ロードされ、ユーザーが起動する対象ではない',
};

/** frontmatter フィールドの値を取り出す（parseFrontmatter は {raw, value, ...} で返す）。 */
function fval(fm, key) {
  const f = fm[key];
  if (f === undefined || f === null) return undefined;
  return typeof f === 'object' && 'value' in f ? f.value : f;
}

/** §12.4 の導出ルール: frontmatter → 起動方式。 */
export function deriveLaunchMethod(kind, fm) {
  if (kind === 'skill') {
    if (fval(fm, 'user-invocable') === false) return { method: 'internal', listed: false };
    if (fval(fm, 'disable-model-invocation') === true) return { method: 'slash-only', listed: true };
    return { method: 'auto+slash', listed: true };
  }
  if (kind === 'agent') return { method: 'delegated', listed: true };
  if (kind === 'rule') return { method: 'auto-load', listed: true };
  return { method: 'unknown', listed: true };
}

function componentName(fm, absPath) {
  const v = fval(fm, 'name');
  if (v) return String(v);
  return path.basename(path.dirname(absPath));
}

/** 一覧項目1件を違反メッセージ用の位置表記に落とす。 */
function whereListed(hit) {
  const label = LISTING_KIND_LABEL[hit.kind] ?? hit.kind;
  return `${label}・L${hit.line}: "${hit.text.slice(0, 60)}"`;
}

export function checkG10({ ts }) {
  const violations = [];
  const readmePath = path.join(outputDir(ts), 'generated', '.claude', 'README.md');

  const { exists, files } = listGeneratedArtifacts(ts);
  if (!exists || files.length === 0) {
    // G12 が別途 output ツリー不在を違反にするが、G10 も README の前提が崩れるので明示。
    return { ok: false, violations: [`${GATE}: 生成物が無い（README 整合を検査する前提が無い）。`] };
  }

  if (!existsSync(readmePath)) {
    return {
      ok: false,
      violations: [`${GATE}: ${path.relative(process.cwd(), readmePath)} が存在しない。生成物があるのに使用説明書が無い（§12.1）。`],
    };
  }
  const readme = readFileSync(readmePath, 'utf8');
  if (readme.trim() === '') {
    return { ok: false, violations: [`${GATE}: README.md が空。`] };
  }

  const genRoot = path.join(outputDir(ts), 'generated');

  // ---- ① コンポーネントの棚卸し（判定は全件揃えてから行う）----
  const components = [];
  for (const f of files) {
    if (!f.endsWith('.md')) continue; // .mcp.json は対象外
    const rel = path.relative(genRoot, f).replace(/\\/g, '/');
    // README 自身と CLAUDE.md はコンポーネントでない（列挙対象でない）。
    if (isNonSchemaRel(rel, 'generated')) continue;
    const raw = readFileSync(f, 'utf8');
    const fm = parseFrontmatter(raw).frontmatter || {};
    const kind = detectKind(f);
    // rule は name を持たない（paths: で接地）。ファイル名の stem を識別子にする。
    const name = kind === 'rule' ? path.basename(f, '.md') : componentName(fm, f);
    const { method, listed } = deriveLaunchMethod(kind, fm);
    components.push({ name, kind, method, listed });
  }

  // Skill と同名の Rule/Agent が併存するとき、その Skill の正当な `/名前` を
  // Rule/Agent 側の「スラッシュ禁止」で誤検出しないための除外集合。
  const slashOwners = new Set(components.filter((c) => c.kind === 'skill' && c.listed).map((c) => c.name));

  // ---- ② README の一覧項目は1回だけ抽出して使い回す ----
  const entries = collectListingEntries(readme);

  let listable = 0;
  for (const { name, kind, method, listed } of components) {
    const { slash, listing } = analyzeReadmeMentions(readme, name, entries);

    if (listed) {
      listable++;
      // 網羅性: 利用者向けコンポーネントは README に名前が登場すること。
      if (!readme.includes(name)) {
        violations.push(`${GATE}: コンポーネント "${name}"（${kind}）が README に登場しない（網羅性・§12.2）。`);
      }
      // 起動方式の正典整合（§12.4 導出ルール表）。
      if (kind === 'skill' && slash.length === 0) {
        violations.push(
          `${GATE}: Skill "${name}"（${method}）の起動方法 \`/${name}\` が README に書かれていない` +
            `（起動方式の正典整合・§12.4）。`
        );
      }
      if (NO_SLASH_REASON[kind] && slash.length > 0 && !slashOwners.has(name)) {
        violations.push(
          `${GATE}: ${kind} "${name}"（${method}）に起動表記 \`/${name}\` が書かれている（§12.4）。` +
            `${NO_SLASH_REASON[kind]}。（L${slash[0].line}）`
        );
      }
    } else {
      // 内部専用（user-invocable:false）: 起動不可なので起動方法を案内してはならない。
      if (slash.length > 0) {
        violations.push(
          `${GATE}: 内部専用 Skill "${name}"（user-invocable:false）の起動表記 \`/${name}\` が` +
            `README にある（§12.4 起動不可）。（L${slash[0].line}）`
        );
      }
      // 内部専用の非露出: 利用者向け一覧の項目にしない（散文・パス表記での言及は可）。
      if (listing.length > 0) {
        violations.push(
          `${GATE}: 内部専用 Skill "${name}"（user-invocable:false）が利用者向け一覧に載っている` +
            `（${whereListed(listing[0])}）（§12.4）。散文・パス表記での言及は可だが、` +
            `見出し・表の第1セル・箇条書きの先頭という一覧項目にはしない。`
        );
      }
    }
  }

  // 全コンポーネントが内部専用でも README が空でないことは上でチェック済み。
  // listable===0（全部内部）でも README があること自体は不自然でないため violation にしない。
  return { ok: violations.length === 0, violations, scanned: files.length, listable, not_yet: NOT_YET };
}

export function check({ ts }) {
  const { ok, violations } = checkG10({ ts });
  return { ok, violations };
}

if (isMainModule(import.meta.url)) {
  readHookInput();
  const ts = readSessionTs();
  if (!ts) {
    passStop('G10: .session-ts 不在のため対象なし');
  } else {
    const r = checkG10({ ts });
    if (r.ok) passStop(`G10: 通過（利用者向け${r.listable}件が README に整合）`);
    else blockStop(`G10: 違反を検出（${r.violations.length}件）\n${r.violations.join('\n')}`);
  }
}
