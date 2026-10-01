#!/usr/bin/env node
/**
 * review-bundle.js（npm run review-bundle -- <ts>）— keep-reviewer の判定入力バンドル（artifacts.md §9.1）。決定論。
 *
 * ## なぜ入力収集を LLM に任せないか
 *
 * 判定者が入力を探し損ねて「何も見つからなかった → 問題なし」と答える経路を塞ぐため、
 * 「何を見るか」は決定論的に確定させてから渡す。keep-reviewer の仕事は**意味判断だけ**にする。
 *
 * ## 宣言を除く規約（本モジュールの最重要責務）
 *
 * design-map の keep レコードには designer 自身の主張
 * （`keep_conditions` の boolean と rationale）が書かれている。これをそのまま渡すと、
 * 判定者は「K2 は true と書いてある」という**判定対象自身の主張に自己一致**し、
 * 常に問題なしと答える——検査が恒真（vacuous）になる。V4 の experimental 開示検査が
 * 環境変数名 `..._EXPERIMENTAL_...` に自己一致しうるのと同型である。
 *
 * ゆえに本モジュールは「宣言を後から削る」のではなく、**構造的に読まない**:
 * パース済みレコードから `path` / `disposition` / `superseded_by` のみを使い、
 * `keep_conditions` ・ `rationale` ・ `manifest_note`（＝designer の正当化）には触れない。
 * 「削り忘れ」が起きない形にすることが肝で、除去はテストで固定する。
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import path from 'node:path';
import { findHeading, sectionSlice } from '../../../../lib/markdown.js';
import { parseExistingDisposition } from '../../../../lib/design-map.js';
import { parseExisting } from '../../../../lib/investigation.js';
import { workDir, outputDir, resolveTargetRoot, isMainModule } from '../../../../lib/run.js';

export class BundleError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BundleError';
  }
}

/** ケース ID（パスから決定論的に導く・ファイル名に使える形へ）。 */
export function caseIdFor(relPath) {
  return relPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** Markdown から見出し節の本文を取り出す（無ければ null）。 */
function section(text, heading) {
  const lines = text.split(/\r?\n/);
  const h = findHeading(lines, heading);
  if (h === -1) return null;
  const { start, end } = sectionSlice(lines, h);
  return lines.slice(start + 1, end).join('\n').trim() || null;
}

/**
 * keep-reviewer の判定ケースを列挙する（artifacts.md §6.3・§9.2）。
 *   keep  → K2（要件非抵触）・K4（強度整合）の意味判断
 *   merge → 統合先の妥当性（merge_target）
 * @returns {{caseId, target, disposition, supersededBy, conditions: string[]}[]}
 */
export function collectKeepReviewCases(designMapText) {
  const records = parseExistingDisposition(designMapText); // 0件は throw（vacuous 防止）
  const cases = [];
  for (const r of records) {
    if (r.disposition === 'keep') {
      cases.push({
        caseId: caseIdFor(r.path),
        target: r.path,
        disposition: 'keep',
        supersededBy: null,
        conditions: ['K2', 'K4'],
      });
    } else if (r.disposition === 'merge') {
      cases.push({
        caseId: caseIdFor(r.path),
        target: r.path,
        disposition: 'merge',
        supersededBy: r.superseded_by,
        conditions: ['merge_target'],
      });
    }
    // modify / retire / 新規は keep-reviewer の対象外（verify と P3・P4 の人間が見る）。
  }
  return cases;
}

/**
 * keep-reviewer へ渡す事実だけを組む（designer の主張は構造的に含めない）。
 * @returns {string} バンドル Markdown
 */
export function renderBundle(c, ctx) {
  const out = [];
  out.push(`# keep-review 判定入力バンドル: ${c.target}`);
  out.push('');
  out.push('```yaml');
  out.push('axis: keep-review');
  out.push(`ts: ${ctx.ts}`);
  out.push(`case_id: ${c.caseId}`);
  out.push(`target: ${c.target}`);
  out.push(`disposition: ${c.disposition}`);
  if (c.supersededBy) out.push(`merged_into: ${c.supersededBy}`);
  out.push(`review_conditions: [${c.conditions.join(', ')}]`);
  out.push('```');
  out.push('');
  out.push('> **設計者の判定根拠は意図的に伏せてある**。設計者がこの判定をどう正当化したかは');
  out.push('> 判定材料にならない。以下に列挙した事実のみから、あなた自身の判断で結論を出すこと。');
  out.push('');

  out.push('## 判定してほしいこと');
  if (c.disposition === 'keep') {
    out.push('- **K2 要件非抵触**: この既存カスタマイズを「変えずに維持」したとき、下記の新要件・統合方針と');
    out.push('  競合または重複しないか（重複＝新規生成物と役割が被る、競合＝新要件の方針と食い違う）。');
    out.push('- **K4 強度整合**: この既存が担う強度（advisory / deterministic / enforced）が、下記要件の');
    out.push('  `strength_needed` と constraints に照らして矛盾しないか。');
  } else {
    out.push('- **merge_target 統合先の妥当性**: この既存を `merged_into` に寄せる判断が妥当か');
    out.push('  （役割が実際に重なるか・統合先が元の責務を吸収できているか）。');
  }
  out.push('');

  out.push('## 対象の実体（対象プロジェクトの原本・全文）');
  out.push('');
  out.push('```markdown');
  out.push(ctx.targetBody === null ? '(原本が読めなかった: 実在の確認は verify の V7 の領分)' : ctx.targetBody);
  out.push('```');
  out.push('');

  if (c.disposition === 'merge' && ctx.mergedBody !== undefined) {
    out.push(`## 統合先の実体（${c.supersededBy}）`);
    out.push('');
    out.push('```markdown');
    out.push(ctx.mergedBody === null ? '(統合先が読めなかった)' : ctx.mergedBody);
    out.push('```');
    out.push('');
  }

  out.push('## investigation/existing.md: この既存の棚卸し事実');
  out.push('');
  out.push('```yaml');
  out.push(ctx.existingRecord ?? '(existing.md に該当レコードなし)');
  out.push('```');
  out.push('');

  out.push('## 生成物内での言及（逆引き・file:line）');
  out.push('');
  out.push('> この既存を名指ししている生成物の箇所。**「生成物のどこにも言及が無い」を根拠にする前に、この一覧と Grep で確かめること**（不在を言う前に探す）。');
  out.push('');
  if (ctx.references === undefined) out.push('(逆引きは生成されていない)');
  else if (ctx.references.length === 0) out.push('(生成物に言及なし。ただし Grep で確かめてから「不在」と言うこと)');
  else for (const r of ctx.references) out.push(`- ${r}`);
  out.push('');

  out.push('## spec: 新要件（§2）');
  out.push('');
  out.push(ctx.specRequirements ?? '(spec に「新要件」節が無い)');
  out.push('');
  out.push('## spec: 統合方針（§4）');
  out.push('');
  out.push(ctx.specIntegration ?? '(spec に「統合方針」節が無い)');
  out.push('');

  out.push('## requirements: 確定要件・constraints・conflicts');
  out.push('');
  out.push(ctx.requirements ?? '(requirements.md の該当節が無い)');
  out.push('');

  out.push('## 出力');
  out.push('');
  out.push('判定は `output/<ts>/review/keep-review.md` に書く。各指摘は観点・対象（file:line）・根拠・重大度・提案を持つ');
  out.push('（output-contract.md の書式）。判定した target を必ず列挙する（空の判定を「問題なし」と読ませないため）。');
  out.push('');
  return out.join('\n') + '\n';
}

/**
 * keep 対象を名指しする語（パス全体と、skill／agent／rule の名前）。逆引きの検索語。
 * 名前は短すぎると無関係な行に当たるため4文字以上に限る。
 */
export function referenceTokens(target) {
  const t = target.replace(/\\/g, '/');
  const tokens = [t];
  const m = /^\.claude\/(?:skills|agents)\/([^/]+)\//.exec(t) ?? /^\.claude\/rules\/([^/]+?)\.md$/.exec(t);
  if (m && m[1].length >= 4) tokens.push(m[1]);
  return tokens;
}

/** generated ルート配下の全ファイル（.md/.json/.yml 等）を相対パスで列挙する。 */
export function collectGeneratedArtifacts(generatedRoot) {
  const out = [];
  if (!generatedRoot || !existsSync(generatedRoot)) return out;
  const walk = (abs, rel) => {
    for (const name of readdirSync(abs).sort()) {
      const childAbs = path.join(abs, name);
      const childRel = rel ? `${rel}/${name}` : name;
      if (statSync(childAbs).isDirectory()) walk(childAbs, childRel);
      else out.push(childRel);
    }
  };
  walk(generatedRoot, '');
  return out;
}

/**
 * generated/ 配下で keep 対象を名指ししている箇所を `file:line: 本文` で返す。
 * keep-reviewer はバンドルしか読まないため、この逆引きが無いと「生成物のどこもこの既存に
 * 言及していない」と誤認して、事実と異なる K2 の指摘を出しうる。
 * @returns {string[]} 最大 40 件。
 */
export function findReferencesToTarget(generatedRoot, target) {
  if (!generatedRoot || !existsSync(generatedRoot)) return [];
  const tokens = referenceTokens(target);
  const hits = [];
  for (const rel of collectGeneratedArtifacts(generatedRoot)) {
    if (rel === target) continue; // 自分自身（verbatim コピー）は言及とみなさない
    const lines = (readIfExists(path.join(generatedRoot, rel)) ?? '').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (tokens.some((tok) => lines[i].includes(tok))) {
        hits.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 160)}`);
        if (hits.length >= 40) return hits;
      }
    }
  }
  return hits;
}

/** existing.md の該当レコードを yaml 風に整形する（判定に要る事実のみ）。 */
function renderExistingRecord(rec) {
  if (!rec) return null;
  const out = [`path: ${rec.path}`];
  if (rec.layer) out.push(`layer: ${rec.layer}`);
  if (rec.kind) out.push(`kind: ${rec.kind}`);
  if (rec.strength) out.push(`strength: ${rec.strength}`);
  out.push(`customization_refs: [${rec.customization_refs.join(', ')}]`);
  out.push('project_refs:');
  for (const r of rec.project_refs) out.push(`  - kind: ${r.kind}  value: ${r.value}`);
  if (rec.project_refs.length === 0) out.push('  (なし)');
  return out.join('\n');
}

function readIfExists(p) {
  return p && existsSync(p) ? readFileSync(p, 'utf8') : null;
}

/**
 * <ts> の run から keep-review バンドルを生成して work/<ts>/review-bundle/keep-review/ へ書く。
 * @param {{ts: string, write?: boolean, roots?: object}} opts
 * @returns {{cases: object[], written: string[], outDir: string}}
 */
export function buildKeepReviewBundles({ ts, write = true, roots = {} }) {
  const oDir = roots.outputDir ?? outputDir(ts);
  const wDir = roots.workDir ?? workDir(ts);
  const targetRoot = roots.targetRoot ?? resolveTargetRoot(ts);

  const designMapPath = path.join(oDir, 'design-map.md');
  if (!existsSync(designMapPath)) {
    throw new BundleError(`design-map.md が無い（${designMapPath}）。keep-reviewer の判定対象を確定できない。不在を「対象0件＝合格」と読まない。`);
  }
  const designMapText = readFileSync(designMapPath, 'utf8');
  const cases = collectKeepReviewCases(designMapText);

  const specText = readIfExists(path.join(oDir, 'spec.md')) ?? '';
  const reqText = readIfExists(path.join(wDir, 'requirements.md')) ?? '';
  const existingText = readIfExists(path.join(wDir, 'investigation', 'existing.md'));
  const existing = existingText ? parseExisting(existingText) : new Map();

  const reqParts = ['確定要件', '使用可能なカスタマイズ機能', '制約と要件の衝突']
    .map((h) => {
      const body = section(reqText, h);
      return body ? `### ${h}\n\n${body}` : null;
    })
    .filter(Boolean)
    .join('\n\n');

  const outDir = path.join(wDir, 'review-bundle', 'keep-review');
  // 出力先を空にしてから書く。前回の keep が残ると、消えた対象の古いバンドルを keep-reviewer が読む。
  if (write) {
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
  }
  const generatedRoot = roots.generatedRoot ?? path.join(oDir, 'generated');

  const written = [];
  for (const c of cases) {
    const targetAbs = targetRoot ? path.join(targetRoot, c.target) : null;
    const ctx = {
      ts,
      targetBody: readIfExists(targetAbs),
      existingRecord: renderExistingRecord(existing.get(c.target)),
      specRequirements: section(specText, '新要件'),
      specIntegration: section(specText, '統合方針'),
      requirements: reqParts || null,
      references: findReferencesToTarget(generatedRoot, c.target),
    };
    if (c.disposition === 'merge') {
      const mergedAbs = c.supersededBy ? path.join(oDir, 'generated', c.supersededBy) : null;
      ctx.mergedBody = readIfExists(mergedAbs);
    }
    const text = renderBundle(c, ctx);
    if (write) {
      const p = path.join(outDir, `${c.caseId}.md`);
      writeFileSync(p, text, 'utf8');
      written.push(p);
    }
    c.text = text;
  }

  return { cases, written, outDir };
}

// ---------------------------------------------------------------------------
// CLI: npm run review-bundle -- <ts>
// ---------------------------------------------------------------------------

export function main(argv = process.argv.slice(2)) {
  const ts = argv[0];
  if (!ts) {
    process.stderr.write('使い方: npm run review-bundle -- <ts>\n');
    process.exitCode = 2;
    return;
  }

  const { cases, written, outDir } = buildKeepReviewBundles({ ts });
  process.stdout.write(`[review-bundle] ts=${ts} keep-review 対象 ${cases.length} 件 → ${outDir}\n`);
  for (const w of written) process.stdout.write(`  - ${path.basename(w)}\n`);
  if (cases.length === 0) {
    // 0件は「合格」ではない。keep/merge が無いという事実の報告であり、
    // 「keep-reviewer で品質を確認した」ことを意味しない。
    process.stdout.write(
      '  注意: keep/merge が0件のため keep-reviewer の判定対象は無い。' +
        'これは「keep-reviewer で品質を確認した」ことを意味しない。\n'
    );
  }
}

if (isMainModule(import.meta.url)) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`review-bundle: ${err.message}\n`);
    process.exit(2);
  }
}
