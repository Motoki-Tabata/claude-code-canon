/**
 * テスト入力の生成ヘルパ: 成果物（agent/skill の frontmatter）の文字列、サンプルリポジトリと
 * keep-review ケースの書き出し（データは tests/helpers/sample-repos.js・keep-review-cases.js）。
 *
 * サンプルリポジトリは expected-output/→output/<ts>/・expected-work/→work/<ts>/ という規約で配置する。
 */

import { mkdirSync, writeFileSync, cpSync, mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { outputDir, workDir } from './paths.js';
import { SAMPLE_REPOS, SAMPLE_MODES } from './sample-repos.js';
import { renderHandoff } from '../../lib/handoff.js';
import { hashTree } from '../../lib/tree-hash.js';
import { recordApproval } from '../../tools/approvals.js';
import { computeVanishing, writeReport } from '../../.claude/skills/canon-d/scripts/pre-deploy-check.js';
import { KEEP_REVIEW_CASES } from './keep-review-cases.js';

// ---------------------------------------------------------------------------
// frontmatter 文字列生成
// ---------------------------------------------------------------------------

function fmBlock({ name, description, tools, model, extra = '' }) {
  let fm = `---\nname: ${name}\ndescription: ${description}\n`;
  if (tools !== undefined) fm += `tools: ${tools}\n`;
  if (model !== undefined) fm += `model: ${model}\n`;
  fm += extra;
  fm += '---\n';
  return fm;
}

/** agent 定義（<name>.md）の本文文字列。既定は最小構成、渡したキーだけ上書きする。 */
function agentMd({ name = 'x', description = 'x', tools, model, extra, body = '本文' } = {}) {
  return fmBlock({ name, description, tools, model, extra }) + `${body}\n`;
}

/** SKILL.md の本文文字列。 */
function skillMd({ name = 'x', description = 'x', extra, body = '本文' } = {}) {
  return fmBlock({ name, description, extra }) + `${body}\n`;
}

/** `<genRoot>/.claude/agents/<name>/<name>.md` を書く。genRoot は通常 genDir(ts) か scratch の canonRoot。 */
export function writeAgent(genRoot, name, fields = {}) {
  const d = path.join(genRoot, '.claude', 'agents', name);
  mkdirSync(d, { recursive: true });
  const p = path.join(d, `${name}.md`);
  writeFileSync(p, agentMd({ name, ...fields }));
  return p;
}

/** `<genRoot>/.claude/skills/<name>/SKILL.md` を書く。 */
export function writeSkill(genRoot, name, fields = {}) {
  const d = path.join(genRoot, '.claude', 'skills', name);
  mkdirSync(d, { recursive: true });
  const p = path.join(d, 'SKILL.md');
  writeFileSync(p, skillMd({ name, ...fields }));
  return p;
}

// ---------------------------------------------------------------------------
// 使い捨てスクラッチディレクトリ・実 work/<ts>・output/<ts> の後始末
// ---------------------------------------------------------------------------

/** 実 output/<ts>・work/<ts> の後始末を t.after() へ登録する（複数 ts をまとめて渡せる）。 */
export function cleanupTs(t, ...tsList) {
  t.after(() => {
    for (const ts of tsList) {
      rmSync(outputDir(ts), { recursive: true, force: true });
      rmSync(workDir(ts), { recursive: true, force: true });
    }
  });
}

/** `os.tmpdir()` 配下に使い捨てディレクトリを作り、t.after() で削除する。 */
export function scratchDir(t, prefix) {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// ---------------------------------------------------------------------------
// サンプルリポジトリ・keep-review ケースの書き出し
// ---------------------------------------------------------------------------

/** root 配下の rel（`/` 区切り）に、親ディレクトリを作って書く。書いた絶対パスを返す。 */
export function writeFile(root, rel, content) {
  const p = path.join(root, rel);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, content);
  return p;
}

/** { 相対パス: 内容 } を root 配下へ書き出す。 */
function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) writeFile(root, rel, content);
}

/** root 配下の全ファイルを posix 相対パスで列挙する（root が無ければ []）。 */
export function listFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else files.push(path.relative(root, p).replace(/\\/g, '/'));
    }
  };
  if (existsSync(root)) walk(root);
  return files;
}

// 書き出しはテストプロセスごとに1回だけ行い、プロセス終了時に消す。複写元として読むだけで
// 書き換えないこと（書き換えるテストは setupSampleRepo・setupTmpCase のコピーを使う）。
let materializedRoot = null;
function materialize(kind, name, table) {
  if (!table[name]) throw new Error(`未知の ${kind}: ${name}`);
  if (!materializedRoot) {
    materializedRoot = mkdtempSync(path.join(os.tmpdir(), 'canon-fixtures-'));
    process.on('exit', () => rmSync(materializedRoot, { recursive: true, force: true }));
  }
  const dir = path.join(materializedRoot, kind, name);
  if (!existsSync(dir)) writeTree(dir, table[name]);
  return dir;
}

/** サンプルリポジトリ（new・existing・constrained）を書き出したディレクトリ。 */
export function sampleRepoDir(name) {
  return materialize('sample-repos', name, SAMPLE_REPOS);
}

/** keep-review ケース（k4-strength-gap・merge-target-bad）を書き出したディレクトリ。 */
export function keepReviewCaseDir(name) {
  return materialize('keep-review', name, KEEP_REVIEW_CASES);
}

/**
 * サンプルリポジトリの `expected-output/**` を実 `output/<ts>/` へ、
 * `expected-work/**` を実 `work/<ts>/` へ配置し、`work/<ts>/handoff.md`（target＝対象リポの絶対パス・
 * mode は SAMPLE_MODES）を書く。t.after() で実 output/work の当該 <ts> を削除する。
 */
export function setupSampleRepo(t, name, ts) {
  const caseDir = sampleRepoDir(name);
  const o = outputDir(ts);
  const w = workDir(ts);
  mkdirSync(o, { recursive: true });
  mkdirSync(w, { recursive: true });
  cpSync(path.join(caseDir, 'expected-output'), o, { recursive: true });
  cpSync(path.join(caseDir, 'expected-work'), w, { recursive: true });
  writeHandoff(ts, { target: caseDir, mode: SAMPLE_MODES[name] });

  cleanupTs(t, ts);

  return { ts, out: o, work: w, gen: path.join(o, 'generated'), req: path.join(w, 'requirements.md') };
}

/** 実 `work/<ts>/handoff.md` を書く（new-run.js と同じ雛形）。 */
export function writeHandoff(ts, { target, mode = 'new' }) {
  mkdirSync(workDir(ts), { recursive: true });
  writeFileSync(path.join(workDir(ts), 'handoff.md'), renderHandoff({ ts, target: target.split(path.sep).join('/'), mode }));
}

/** setupTmpCase の既定の ts と、deploy がその ts で作る退避ディレクトリの名前。 */
export const TMP_CASE_TS = '20260722_000000';
export const TMP_CASE_BAK = `.claude-canon.bak.${TMP_CASE_TS}`;

/**
 * canon-d 系向け: 対象リポ（expected-output を除く）と `output/<ts>/`（= expected-output）を
 * tmpdir へ複写する。複写元・実 work/output を一切汚さない。
 */
export function setupTmpCase(t, name, ts = TMP_CASE_TS, { approved = true } = {}) {
  const caseDir = sampleRepoDir(name);
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'canon-deploy-'));
  const target = path.join(tmp, 'target');
  const output = path.join(tmp, 'output', ts);
  cpSync(caseDir, target, {
    recursive: true,
    filter: (s) => !s.split(path.sep).includes('expected-output'),
  });
  cpSync(path.join(caseDir, 'expected-output'), output, { recursive: true });
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  if (approved) approveAll(tmp, target, output, ts);
  return { tmp, target, output, ts };
}

/**
 * `<tmp>/work/<ts>/handoff.md` を作り、P1〜P5 の承認行を記録する（deploy.js --confirm が P1〜P5 を照合する）。
 * P1〜P3 の対象は中身を問わないのでダミーを置く。P4 の前提の verify-report は現在の generated/ のハッシュを書き、
 * P5 の対象の pre-deploy-report は本物の writeReport で書く。
 */
function approveAll(root, target, output, ts) {
  const work = path.join(root, 'work', ts);
  mkdirSync(work, { recursive: true });
  writeFileSync(path.join(work, 'handoff.md'), renderHandoff({ ts, target, mode: 'new' }));
  writeFileSync(path.join(work, 'requirements.md'), '# requirements\n');
  writeFileSync(path.join(output, 'spec.md'), '# spec\n');
  writeFileSync(path.join(output, 'design-map.md'), '# design-map\n');
  writeFileSync(path.join(output, 'verify-report.md'), `- generated/ のハッシュ: \`${hashTree(path.join(output, 'generated')).hash}\`\n`);
  for (const g of ['P1', 'P2', 'P3', 'P4']) recordApproval(root, ts, g, 'テスト用の承認');
  writeReport(output, target, computeVanishing(output, target));
  recordApproval(root, ts, 'P5', 'テスト用の承認');
}

/**
 * `output/<ts>/MANIFEST.md` を、その時点の generated/ の全ファイルを `## 全ファイル` 節に列挙して書く
 * （V8 が MANIFEST ⇔ generated/ を双方向に照合する契約）。generated/ を書き終えてから呼ぶこと。
 * `extra` は節の外（差分サマリ）に足す本文。
 */
export function writeManifest(ts, { extra = '' } = {}) {
  const files = listFiles(path.join(outputDir(ts), 'generated'));
  mkdirSync(outputDir(ts), { recursive: true });
  writeFileSync(
    path.join(outputDir(ts), 'MANIFEST.md'),
    `# 差分\n${extra}\n## 全ファイル\n${files.sort().map((f) => `- \`${f}\``).join('\n')}\n`
  );
}
