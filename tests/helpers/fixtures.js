/**
 * 成果物 fixture（agent/skill の frontmatter）とサンプルリポジトリ配置の共通ヘルパ。
 *
 * 継ぎ足しで16ファイル・55箇所に散っていた frontmatter リテラル文字列と、
 * scenario2_helpers.js／scenario3_helpers.js／deploy_helpers.js の3実装
 * （いずれも fixtures/sample-repos/<case>/expected-output→output/<ts>/・
 * expected-work→work/<ts>/ という同一規約）を統合する。
 */

import { mkdirSync, writeFileSync, cpSync, mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, outputDir, workDir } from './paths.js';
import { mintMarker } from '../../gates/lib/run.js';

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
export function agentMd({ name = 'x', description = 'x', tools, model, extra, body = '本文' } = {}) {
  return fmBlock({ name, description, tools, model, extra }) + `${body}\n`;
}

/** SKILL.md の本文文字列。 */
export function skillMd({ name = 'x', description = 'x', extra, body = '本文' } = {}) {
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
// 使い捨てスクラッチディレクトリ
// ---------------------------------------------------------------------------

/**
 * `os.tmpdir()` 配下に使い捨てディレクトリを作り、t.after() で削除する。
 * `makeCanonRoot`/`makeStageScratch`/`makeScratchRoot`/`makeDivergenceScratch` の置換。
 */
export function scratchDir(t, prefix) {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// ---------------------------------------------------------------------------
// サンプルリポジトリ配置（fixtures/sample-repos/<name>/）
// ---------------------------------------------------------------------------

export function sampleRepoDir(name) {
  return path.join(ROOT, 'fixtures', 'sample-repos', name);
}

/**
 * `fixtures/sample-repos/<name>/expected-output/**` を実 `output/<ts>/` へ、
 * `expected-work/**` を実 `work/<ts>/` へ配置し、`target.txt`（対象リポの絶対パス）を書く。
 * `scenario2_helpers.setupScenario2` と `scenario3_helpers.setupScenario3` を統合したもの
 * （両者は `markers` の有無以外は同一規約——`expected-output/` の中身をそのまま複写する）。
 * t.after() で実 output/work の当該 <ts> を削除する。
 */
export function setupSampleRepo(t, name, ts, { markers = [] } = {}) {
  const caseDir = sampleRepoDir(name);
  const o = outputDir(ts);
  const w = workDir(ts);
  mkdirSync(o, { recursive: true });
  mkdirSync(w, { recursive: true });
  cpSync(path.join(caseDir, 'expected-output'), o, { recursive: true });
  cpSync(path.join(caseDir, 'expected-work'), w, { recursive: true });
  writeFileSync(path.join(w, 'target.txt'), caseDir + '\n');

  // 前段工程の完了マーカー（G1 の design／generation ステージは前段の done を前提とする）。
  for (const stage of markers) mintMarker(ts, stage, { fixture: true });

  t.after(() => {
    rmSync(o, { recursive: true, force: true });
    rmSync(w, { recursive: true, force: true });
  });

  return { ts, out: o, work: w, gen: path.join(o, 'generated'), req: path.join(w, 'requirements.md') };
}

/**
 * deploy/ 系向け: 対象リポ（expected-output を除く）と `output/<ts>/`（= expected-output）を
 * tmpdir へ複写する。fixture 本体・実 work/output を一切汚さない（`deploy_helpers.setupCase` 相当）。
 */
export function setupTmpCase(t, name, ts = '20260722_000000') {
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
  return { tmp, target, output };
}

/**
 * `output/<ts>/MANIFEST.md` を、その時点の generated/ の全ファイルを `## 全ファイル` 節に列挙して書く
 * （G9 が MANIFEST ⇔ generated/ を双方向に照合する契約・S1-3）。generated/ を書き終えてから呼ぶこと。
 * `extra` は節の外（差分サマリ）に足す本文。
 */
export function writeManifest(ts, { extra = '' } = {}) {
  const root = path.join(outputDir(ts), 'generated');
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, name.name);
      if (name.isDirectory()) walk(p);
      else files.push(path.relative(root, p).replace(/\\/g, '/'));
    }
  };
  if (existsSync(root)) walk(root);
  mkdirSync(outputDir(ts), { recursive: true });
  writeFileSync(
    path.join(outputDir(ts), 'MANIFEST.md'),
    `# 差分\n${extra}\n## 全ファイル\n${files.sort().map((f) => `- \`${f}\``).join('\n')}\n`
  );
}
