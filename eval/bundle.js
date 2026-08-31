/**
 * eval/bundle.js — 判定入力バンドル生成（詳細設計書 §16.3）。決定論。
 *
 * ## なぜ入力収集を LLM に任せないか
 *
 * judge が入力を探し損ねて「何も見つからなかった → clean」と答える経路を塞ぐため、
 * 「何を見るか」は決定論的に確定させてから渡す。judge の仕事は**意味判断だけ**にする。
 *
 * ## 宣言除去規約（本モジュールの最重要責務・§16.3）
 *
 * design-map の keep レコードには designer 自身の主張
 * （`keep_conditions` の boolean と rationale）が書かれている。これをそのまま渡すと、
 * judge は「C2 は true と書いてある」という**判定対象自身の主張に自己一致**し、
 * 常に clean と答える——検査が恒真（vacuous）になる。これは G6 の experimental 開示検査が
 * 環境変数名 `..._EXPERIMENTAL_...` に自己一致した恒真バグと同型である。
 *
 * ゆえに本モジュールは「宣言を後から削る」のではなく、**構造的に読まない**:
 * パース済みレコードから `path` / `disposition` / `superseded_by` のみを使い、
 * `keep_conditions` ・ `rationale` ・ `manifest_note`（＝designer の正当化）には触れない。
 * 「削り忘れ」が起きない形にすることが肝で、除去はテストで固定する。
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { findHeading, sectionSlice } from '../gates/lib/markdown.js';
import { parseExistingDisposition } from '../gates/lib/design-map.js';
import { parseSystemA } from '../gates/lib/investigation.js';
import { workDir, outputDir, resolveTargetRoot, isMainModule, readSessionTs } from '../gates/lib/run.js';

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
 * keep-review 軸の判定ケースを列挙する（§16.2）。
 *   keep  → C2（要件非抵触）・C4（強度整合）の意味判断
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
        conditions: ['C2', 'C4'],
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
    // modify / retire / 新規は eval の keep-review 対象外（決定論ゲートと P5 が見る）。
  }
  return cases;
}

/**
 * judge へ渡す事実だけを組む（designer の主張は構造的に含めない・§16.3）。
 * @returns {string} バンドル Markdown
 */
export function renderBundle(c, ctx) {
  const out = [];
  out.push(`# eval 判定入力バンドル: ${c.target}`);
  out.push('');
  out.push('```yaml');
  out.push('axis: keep-review');
  out.push(`ts: ${ctx.ts}`);
  out.push(`case_id: ${c.caseId}`);
  out.push(`target: ${c.target}`);
  out.push(`disposition: ${c.disposition}`);
  if (c.supersededBy) out.push(`merged_into: ${c.supersededBy}`);
  out.push(`judge_conditions: [${c.conditions.join(', ')}]`);
  out.push('```');
  out.push('');
  out.push('> **設計者の判定根拠は意図的に伏せてある**（§16.3）。設計者がこの判定をどう正当化したかは');
  out.push('> 判定材料にならない。以下に列挙した事実のみから、あなた自身の判断で結論を出すこと。');
  out.push('');

  out.push('## 判定してほしいこと');
  if (c.disposition === 'keep') {
    out.push('- **C2 要件非抵触**: この既存カスタマイズを「変えずに維持」したとき、下記の新要件・統合方針と');
    out.push('  競合または重複しないか（重複＝新規生成物と役割が被る、競合＝新要件の方針と食い違う）。');
    out.push('- **C4 強度整合**: この既存が担う強度（advisory / deterministic / enforced）が、下記要件の');
    out.push('  `strength_needed` と constraints に照らして矛盾しないか。');
  } else {
    out.push('- **merge_target 統合先の妥当性**: この既存を `merged_into` に寄せる判断が妥当か');
    out.push('  （役割が実際に重なるか・統合先が元の責務を吸収できているか）。');
  }
  out.push('');

  out.push('## 対象の実体（対象プロジェクトの原本・全文）');
  out.push('');
  out.push('```markdown');
  out.push(ctx.targetBody === null ? '(原本が読めなかった: 実在確認は G2/G8 の領分)' : ctx.targetBody);
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

  out.push('## 系統A: この既存の棚卸し事実（§6.1）');
  out.push('');
  out.push('```yaml');
  out.push(ctx.systemARecord ?? '(系統A に該当レコードなし)');
  out.push('```');
  out.push('');

  out.push('## spec: 新要件（§2）');
  out.push('');
  out.push(ctx.specRequirements ?? '(spec に「新要件」節が無い)');
  out.push('');
  out.push('## spec: 統合方針（§4）');
  out.push('');
  out.push(ctx.specIntegration ?? '(spec に「統合方針」節が無い)');
  out.push('');

  out.push('## requirements: 確定要件・constraints・conflicts（§6.3）');
  out.push('');
  out.push(ctx.requirements ?? '(requirements.md の該当節が無い)');
  out.push('');

  out.push('## 出力');
  out.push('');
  out.push('本文で根拠を述べたうえで、```json フェンス1個に verdict を書くこと（§16.4）。');
  out.push('`coverage` には判定した target を必ず列挙する（空判定を「違反なし」と読ませないため）。');
  out.push('');
  return out.join('\n') + '\n';
}

/** 系統A の該当レコードを yaml 風に整形する（判定に要る事実のみ）。 */
function renderSystemARecord(rec) {
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
 * <ts> の run から keep-review バンドルを生成して work/<ts>/eval-bundle/keep-review/ へ書く。
 * @param {{ts: string, write?: boolean, roots?: object}} opts
 * @returns {{cases: object[], written: string[], outDir: string}}
 */
export function buildKeepReviewBundles({ ts, write = true, roots = {} }) {
  const oDir = roots.outputDir ?? outputDir(ts);
  const wDir = roots.workDir ?? workDir(ts);
  const targetRoot = roots.targetRoot ?? resolveTargetRoot(ts);

  const designMapPath = path.join(oDir, 'design-map.md');
  if (!existsSync(designMapPath)) {
    throw new BundleError(`design-map.md が無い（${designMapPath}）。eval の判定対象を確定できない。不在を「対象0件＝合格」と読まない（§16.5）。`);
  }
  const designMapText = readFileSync(designMapPath, 'utf8');
  const cases = collectKeepReviewCases(designMapText);

  const specText = readIfExists(path.join(oDir, 'spec.md')) ?? '';
  const reqText = readIfExists(path.join(wDir, 'requirements.md')) ?? '';
  const systemAText = readIfExists(path.join(wDir, 'existing_customizations.md'));
  const systemA = systemAText ? parseSystemA(systemAText) : new Map();

  const reqParts = ['確定要件', '使用可能なカスタマイズ機能', '制約と要件の衝突']
    .map((h) => {
      const body = section(reqText, h);
      return body ? `### ${h}\n\n${body}` : null;
    })
    .filter(Boolean)
    .join('\n\n');

  const outDir = path.join(wDir, 'eval-bundle', 'keep-review');
  if (write) mkdirSync(outDir, { recursive: true });

  const written = [];
  for (const c of cases) {
    const targetAbs = targetRoot ? path.join(targetRoot, c.target) : null;
    const ctx = {
      ts,
      targetBody: readIfExists(targetAbs),
      systemARecord: renderSystemARecord(systemA.get(c.target)),
      specRequirements: section(specText, '新要件'),
      specIntegration: section(specText, '統合方針'),
      requirements: reqParts || null,
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
// 4軸バンドル（correctness / security / canon / context・§16.3 の一般化・B 2026-08-12）
//
// keep-review は「対象プロジェクトの既存原本」を判定するが、4軸は「生成物そのもの」を判定する。
// 各軸が「何を見るか」を決定論で確定してから渡す原則は共通。**design-map の rationale
// （designer の自己弁護）はどの軸のバンドルにも含めない**（自己一致封鎖の横展開・§16.3）。
// ---------------------------------------------------------------------------

export const AXES_4 = ['correctness', 'security', 'canon', 'context'];

/** 軸ごとの「判定してほしいこと」と、同梱する接地材料（design-map rationale は決して含めない）。 */
export const AXIS_SPEC = {
  correctness: {
    ask: [
      '- **A1 functional**: 下記 spec の受け入れ基準（`functional`・A1）を、生成物が実際に満たすか。',
      '  「それらしい文書がある」ではなく「その基準が達成されるか」で見る。',
      '- **プロジェクト接地**: 実在しないコマンド・スクリプト・パスを手順として書いていないか',
      '  （下記のプロジェクト実態に照らす）。',
    ],
    sections: ['spec_requirements', 'spec_functional', 'project_profile'],
  },
  security: {
    ask: [
      '- **最小権限の実質**: 生成物（特に Subagent）の `tools:` が役割に対して過剰でないか。',
      '  読み取りで足りる役割に `Write`/`Edit`・不要な広域ツールを与えていないか。',
      '- **危険な操作の誘導**: 確認なしの破壊的操作・広範な削除・認証情報の平文取り扱いを促していないか。',
      '- **organization_policy 準拠**: 下記 constraints セクションに `organization_policy`（自由文の',
      '  組織ポリシー）があれば、生成物の手順がそれに反していないか。G11 はこのキーを機械判定できず',
      '  明示的に見送っている（judge が意味を読んで判定する唯一の経路）。当該制約が無ければこの観点は',
      '  該当なしとする。',
    ],
    sections: ['constraints'],
  },
  canon: {
    ask: [
      '- **段階的開示**: SKILL.md が入口として機能し、詳細を必要時に開く構成か。すべてを1ファイルに',
      '  詰め込んでいないか。',
      '- **`description` の委譲トリガー品質**: いつ委譲すべきかが具体的で、他の役割と識別可能か。',
      '  抽象的すぎて発火しない／広すぎて誤発火する記述になっていないか。',
    ],
    sections: [],
  },
  context: {
    ask: [
      '- **重複**: 同じ内容が複数ファイルに書かれ、更新時に片方が腐る構造になっていないか。',
      '- **読まれない冗長・責務の肥大**: 判断に使われない説明・自明な注意書きで実効的な指示が',
      '  埋もれていないか。1文の責務に対し実体が別の責務まで抱えていないか。',
    ],
    sections: ['responsibilities'],
  },
};

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

/** 判定に含める生成物（判定の主体）。README・MANIFEST 等の集計物は判定対象から除く。 */
function judgeableArtifacts(generatedRoot) {
  return collectGeneratedArtifacts(generatedRoot)
    .filter((p) => p.endsWith('.md') || p.endsWith('.json') || p.endsWith('.mcp.json'))
    .filter((p) => !/\/README\.md$/.test(p) && !/(^|\/)MANIFEST/.test(p));
}

/**
 * 4軸バンドルを1件（＝1ケース分・生成物全部を含む）レンダリングする。
 * @returns {string}
 */
export function renderAxisBundle({ axis, ts, caseId, artifacts, ctx }) {
  const spec = AXIS_SPEC[axis];
  if (!spec) throw new BundleError(`未知の軸: ${axis}`);
  const out = [];
  out.push(`# eval 判定入力バンドル（${axis}）: ${caseId}`);
  out.push('');
  out.push('```yaml');
  out.push(`axis: ${axis}`);
  out.push(`ts: ${ts}`);
  out.push(`case_id: ${caseId}`);
  out.push(`targets: [${artifacts.map((a) => a.path).join(', ')}]`);
  out.push('```');
  out.push('');
  out.push('> **設計者の判定根拠（design-map の rationale）は意図的に伏せてある**（§16.3）。');
  out.push('> 設計者がこの生成物をどう正当化したかは判定材料にならない。以下の事実のみから、');
  out.push('> あなた自身の判断で結論を出すこと。');
  out.push('');

  out.push('## 判定してほしいこと');
  for (const line of spec.ask) out.push(line);
  out.push('');

  out.push('## 生成物の実体（判定対象・全文）');
  out.push('');
  for (const a of artifacts) {
    out.push(`### ${a.path}`);
    out.push('');
    out.push('```markdown');
    out.push(a.body === null ? '(読めなかった)' : a.body);
    out.push('```');
    out.push('');
  }

  const titles = {
    spec_requirements: '## spec: 新要件（§2）',
    spec_functional: '## spec: 受け入れ基準 functional（A1・§8）',
    project_profile: '## 系統B: プロジェクト実態（接地の照合先）',
    constraints: '## requirements: constraints（組織ポリシー由来の制約）',
    responsibilities: '## design-map: 各生成物の1文責務（rationale は含まない）',
  };
  for (const key of spec.sections) {
    const body = ctx[key];
    if (body == null) continue;
    out.push(titles[key]);
    out.push('');
    out.push(body);
    out.push('');
  }

  out.push('## 出力');
  out.push('');
  out.push('本文で根拠を述べたうえで、```json フェンス1個に verdict を書くこと（§16.4）。');
  out.push(`\`axis\` は \`${axis}\`、\`condition\` は \`null\`。\`coverage\` に判定した target を`);
  out.push('必ず全列挙する（空判定を「違反なし」と読ませないため）。clean でも finding を1件書く。');
  out.push('');
  return out.join('\n') + '\n';
}

/**
 * <ts>（または roots 上書き）の1ケースから、指定軸のバンドルを1件生成する。
 * @param {{axis, ts, caseId?, write?, roots?}} opts
 * @returns {{caseId, targets: string[], text: string, written?: string}}
 */
export function buildAxisBundle({ axis, ts, caseId, write = true, roots = {} }) {
  if (!AXES_4.includes(axis)) throw new BundleError(`未対応の軸: ${axis}（4軸は ${AXES_4.join('/')})`);
  const oDir = roots.outputDir ?? outputDir(ts);
  const wDir = roots.workDir ?? workDir(ts);
  const generatedRoot = roots.generatedRoot ?? path.join(oDir, 'generated');

  const rels = judgeableArtifacts(generatedRoot);
  if (rels.length === 0) {
    throw new BundleError(
      `判定対象の生成物が0件（${generatedRoot}）。0件を「問題なし＝合格」と読まない（§16.5）。`
    );
  }
  const artifacts = rels.map((rel) => ({
    path: rel,
    body: readIfExists(path.join(generatedRoot, rel)),
  }));

  const specText = readIfExists(path.join(oDir, 'spec.md')) ?? '';
  const reqText = readIfExists(path.join(wDir, 'requirements.md')) ?? '';
  const ctx = {
    spec_requirements: section(specText, '新要件'),
    spec_functional: section(specText, '受け入れ基準') ?? section(specText, 'functional'),
    project_profile: readIfExists(path.join(wDir, 'project_profile.md')),
    constraints: (() => {
      const body = section(reqText, '使用可能なカスタマイズ機能');
      return body ? body : null;
    })(),
    // design-map の rationale は含めない。責務は別ファイル（responsibilities.md）から取る。
    responsibilities: readIfExists(path.join(oDir, 'responsibilities.md')),
  };

  const cid = caseId ?? caseIdFor(rels[0]);
  const text = renderAxisBundle({ axis, ts, caseId: cid, artifacts, ctx });

  let written;
  if (write) {
    const outDir = path.join(wDir, 'eval-bundle', axis);
    mkdirSync(outDir, { recursive: true });
    written = path.join(outDir, `${cid}.md`);
    writeFileSync(written, text, 'utf8');
  }
  return { caseId: cid, targets: rels, text, written };
}

// ---------------------------------------------------------------------------
// CLI: npm run eval:bundle -- <ts>（省略時は work/.session-ts）
// ---------------------------------------------------------------------------

export function main(argv = process.argv.slice(2)) {
  const ts = argv[0] || readSessionTs();
  if (!ts) {
    process.stderr.write('使い方: npm run eval:bundle -- <ts>（work/.session-ts があれば省略可）\n');
    process.exitCode = 2;
    return;
  }
  const { cases, written, outDir } = buildKeepReviewBundles({ ts });
  process.stdout.write(`[eval:bundle] ts=${ts} axis=keep-review 対象 ${cases.length} 件 → ${outDir}\n`);
  for (const w of written) process.stdout.write(`  - ${path.basename(w)}\n`);
  if (cases.length === 0) {
    // 0件は「合格」ではない。keep/merge が無いという事実の報告であり、
    // 「eval で品質を確認した」ことを意味しない（§16.5）。
    process.stdout.write(
      '  注意: keep/merge が0件のため keep-review の判定対象は無い。' +
        'これは「eval で品質を確認した」ことを意味しない（§16.5）。\n'
    );
  }
}

if (isMainModule(import.meta.url)) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`eval:bundle: ${err.message}\n`);
    process.exit(2);
  }
}
