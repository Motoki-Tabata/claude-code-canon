#!/usr/bin/env node
/**
 * review-bundle.js（npm run review-bundle -- <ts>）— reviewer と keep-reviewer の判定入力バンドル（artifacts.md §9.1）。決定論。
 *
 *   work/<ts>/review-bundle/reviewer/      INDEX.md（判定の対象の全件と接地材料）・design.md・acceptance.md（常に作る）
 *   work/<ts>/review-bundle/keep-review/   keep・merge 1件につき1ファイル（refactor モードのときだけ作る）
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
 * reviewer 用も同じ理由で、design-map の rationale（designer の自己弁護）を渡さない。
 *
 * ゆえに本モジュールは「宣言を後から削る」のではなく、**構造的に読まない**:
 * パース済みレコードから `path` / `disposition` / `superseded_by` のみを使い、
 * `keep_conditions` ・ `rationale` ・ `manifest_note`（＝designer の正当化）には触れない。
 * 「削り忘れ」が起きない形にすることが肝で、除去はテストで固定する。
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import path from 'node:path';
import { findHeading, sectionSlice } from '../../../../lib/markdown.js';
import { parseExistingDisposition, DesignMapError, h2SectionText, LAYER_SECTIONS } from '../../../../lib/design-map.js';
import { parseFrontmatter } from '../../../../lib/artifact.js';
import { parseExisting } from '../../../../lib/investigation.js';
import { workDir, outputDir, readHandoff, resolveTargetRoot, isMainModule, isValidTs } from '../../../../lib/run.js';

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
  // 非英数字を `_` に潰すので別パスが同じ ID になりうる。衝突したら 2・3… の連番を付ける（出力名の上書きを防ぐ）。
  const used = new Set();
  const uniqueCaseId = (relPath) => {
    const base = caseIdFor(relPath);
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}_${n}`;
    used.add(id);
    return id;
  };
  for (const r of records) {
    if (r.disposition === 'keep') {
      cases.push({
        caseId: uniqueCaseId(r.path),
        target: r.path,
        disposition: 'keep',
        supersededBy: null,
        conditions: ['K2', 'K4'],
      });
    } else if (r.disposition === 'merge') {
      cases.push({
        caseId: uniqueCaseId(r.path),
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
      specRequirements: section(specText, '§2 新要件'),
      specIntegration: section(specText, '§4 統合方針'),
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
// reviewer 用バンドル
// ---------------------------------------------------------------------------

/**
 * reviewer に渡す design-map の節（設計意図）。層の節（`## L1`〜`## L5`）はこの後に足す。
 * `## メタ`（層数の rationale）と `## 既存判定`（keep_conditions・rationale・manifest_note）は入れない。
 */
export const REVIEWER_DESIGN_SECTIONS = [
  'Used Features',
  'レイヤー構成',
  'Write Scopes',
  'Model Assignments',
  'Interface Contracts',
  '生成上の制約',
  '要件→生成物の対応',
  '配置時の追加手順',
  '管理パス外の変更',
  'Experimental Dependencies',
  '依存フラグ',
];

/** frontmatter のうち、security 観点で見るキー。 */
const SECURITY_KEYS = ['tools', 'allowed-tools', 'disallowedTools', 'model', 'permissionMode'];

/** 節の本文から `rationale:` の行を落とす（designer の自己弁護を構造的に渡さない）。 */
export function stripRationale(text) {
  return text
    .split(/\r?\n/)
    .filter((l) => !/^\s*(?:-\s+)?rationale\s*:/.test(l))
    .join('\n');
}

/** design-map から reviewer 用の design.md を組む。既存判定は path・disposition・統合先・interface_change だけにする。 */
export function renderReviewerDesign(designMapText, records) {
  const lines = designMapText.split(/\r?\n/);
  const out = ['# reviewer 判定入力: 設計意図（design-map の抜粋）', ''];
  out.push('> design-map の `rationale`・`keep_conditions`・`manifest_note` は意図的に伏せてある。設計者の正当化は判定材料にならない。');
  out.push('');
  for (const name of [...REVIEWER_DESIGN_SECTIONS, ...LAYER_SECTIONS.map((l) => l.heading)]) {
    const body = h2SectionText(lines, name);
    if (body) out.push(stripRationale(body), '');
  }
  out.push('## 既存判定（処遇だけ）', '');
  if (records.length === 0) out.push('なし（new モード、または既存判定の節が無い）');
  for (const r of records) {
    const extra = [
      r.superseded_by ? `統合先・後継: \`${r.superseded_by}\`` : null,
      r.interface_change ? `interface_change: ${r.interface_change}` : null,
    ].filter(Boolean);
    out.push(`- \`${r.path}\` — ${r.disposition}${extra.length > 0 ? `（${extra.join('・')}）` : ''}`);
  }
  return out.join('\n').replace(/\s+$/, '') + '\n';
}

/** 生成物1件の INDEX 行（処遇と、security 観点で見る frontmatter）。 */
function indexLine(rel, genRoot, dispositionOf) {
  const parts = [`処遇: ${dispositionOf(rel)}`];
  if (rel.endsWith('.md')) {
    const { frontmatter } = parseFrontmatter(readFileSync(path.join(genRoot, rel), 'utf8'));
    for (const k of SECURITY_KEYS) if (frontmatter[k]?.raw) parts.push(`${k}: ${frontmatter[k].raw}`);
  }
  return `- \`${rel}\` — ${parts.join('・')}`;
}

/**
 * <ts> の run から reviewer 用バンドルを生成して work/<ts>/review-bundle/reviewer/ へ書く。
 * @param {{ts: string, write?: boolean, roots?: object}} opts
 * @returns {{files: string[], texts: Record<string,string>, written: string[], outDir: string}}
 */
export function buildReviewerBundle({ ts, write = true, roots = {} }) {
  const oDir = roots.outputDir ?? outputDir(ts);
  const wDir = roots.workDir ?? workDir(ts);
  const targetRoot = roots.targetRoot ?? resolveTargetRoot(ts);
  const genRoot = roots.generatedRoot ?? path.join(oDir, 'generated');

  const designMapPath = path.join(oDir, 'design-map.md');
  if (!existsSync(designMapPath)) {
    throw new BundleError(`design-map.md が無い（${designMapPath}）。reviewer に設計意図を渡せない。`);
  }
  const files = collectGeneratedArtifacts(genRoot);
  if (files.length === 0) {
    throw new BundleError(`generated/ にファイルが無い（${genRoot}）。判定の対象0件を「問題なし」と読まない。`);
  }

  const designMapText = readFileSync(designMapPath, 'utf8');
  let records = [];
  try {
    records = parseExistingDisposition(designMapText);
  } catch (e) {
    if (!(e instanceof DesignMapError)) throw e; // new モードで既存判定の節が無い
  }
  const byPath = new Map(records.map((r) => [r.path, r.disposition]));
  const mergedInto = new Map();
  for (const r of records) {
    if (r.disposition === 'merge' && r.superseded_by) {
      mergedInto.set(r.superseded_by, [...(mergedInto.get(r.superseded_by) ?? []), r.path]);
    }
  }
  const dispositionOf = (rel) => {
    if (rel === '.claude/README.md') return 'emit-manifest が生成（README）';
    const d = byPath.get(rel) ?? '新規';
    const m = mergedInto.get(rel);
    return m ? `${d}（統合先: ${m.map((x) => `\`${x}\``).join('・')} を吸収）` : d;
  };

  const specText = readIfExists(path.join(oDir, 'spec.md'));
  const grounding = [
    ['spec', path.join(oDir, 'spec.md')],
    ['requirements', path.join(wDir, 'requirements.md')],
    ['profile', path.join(wDir, 'investigation', 'profile.md')],
    ['focused', path.join(wDir, 'investigation', 'focused.md')],
    ['official-check', path.join(wDir, 'investigation', 'official-check.md')],
  ].filter(([, p]) => existsSync(p));

  const index = [
    '# reviewer 判定入力バンドル',
    '',
    '```yaml',
    'axis: review',
    `ts: ${ts}`,
    `generated_root: ${genRoot}`,
    `target_root: ${targetRoot ?? '(handoff.md から解決できなかった)'}`,
    `file_count: ${files.length}`,
    '```',
    '',
    '> design-map の全文と `work/<ts>/slices/` は読まない。設計意図は同梱の design.md だけを使う（designer の rationale を伏せてある）。',
    '',
    `## 判定の対象（generated/ の全ファイル・${files.length} 件）`,
    '',
    '再レビューでは、プロンプトで渡された変更の対象だけを見る。',
    '',
    ...files.map((rel) => indexLine(rel, genRoot, dispositionOf)),
    '',
    '## 同梱したもの',
    '',
    '- `design.md`: 設計意図（design-map の抜粋・既存判定は処遇だけ）',
    '- `acceptance.md`: spec §8 受入基準の逐語',
    '',
    '## 接地材料（読む）',
    '',
    ...grounding.map(([k, p]) => `- ${k}: ${p}`),
    `- 対象プロジェクトのルート: ${targetRoot ?? '(不明)'}`,
    '',
    '## 出力',
    '',
    '判定は `output/<ts>/review/review.md` に書く（output-contract.md の書式）。判定した対象を必ず列挙する（空の判定を「問題なし」と読ませないため）。',
  ].join('\n') + '\n';

  const acceptanceBody = specText ? section(specText, '§8 受入基準') ?? section(specText, '受入基準') : null;
  const texts = {
    'INDEX.md': index,
    'design.md': renderReviewerDesign(designMapText, records),
    'acceptance.md': `# reviewer 判定入力: spec §8 受入基準（逐語）\n\n${acceptanceBody ?? '(spec.md に受入基準の節が無い)'}\n`,
  };

  const outDir = path.join(wDir, 'review-bundle', 'reviewer');
  const written = [];
  if (write) {
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    for (const [name, text] of Object.entries(texts)) {
      const p = path.join(outDir, name);
      writeFileSync(p, text, 'utf8');
      written.push(p);
    }
  }
  return { files, texts, written, outDir };
}

// ---------------------------------------------------------------------------
// CLI: npm run review-bundle -- <ts>
// ---------------------------------------------------------------------------

export function main(argv = process.argv.slice(2)) {
  const ts = argv[0];
  if (!isValidTs(ts)) {
    process.stderr.write('使い方: npm run review-bundle -- <ts>（<ts> は YYYYMMDD_hhmmss）\n');
    process.exitCode = 2;
    return;
  }

  const reviewer = buildReviewerBundle({ ts });
  process.stdout.write(`[review-bundle] ts=${ts} reviewer 対象 ${reviewer.files.length} 件 → ${reviewer.outDir}\n`);

  const mode = readHandoff(ts)?.mode;
  if (mode !== 'refactor') {
    process.stdout.write(`  keep-review は作らない（mode: ${mode ?? '不明'}。refactor モードだけが対象）\n`);
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
    process.exit(1);
  }
}
