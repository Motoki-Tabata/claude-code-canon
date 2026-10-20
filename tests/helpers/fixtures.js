/**
 * テスト入力の生成ヘルパ: 成果物（agent/skill の frontmatter）の文字列と、制約強めのケースの書き出し
 * （データは tests/helpers/constrained-case.js）。
 */

import { mkdirSync, writeFileSync, mkdtempSync, rmSync, existsSync, readdirSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { workDir } from './paths.js';
import { CONSTRAINED_CASE } from './constrained-case.js';

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
// 使い捨てスクラッチディレクトリ・実 work/<ts> の後始末
// ---------------------------------------------------------------------------

/** 実 work/<ts> の後始末を t.after() へ登録する（複数 ts をまとめて渡せる）。 */
export function cleanupTs(t, ...tsList) {
  t.after(() => {
    for (const ts of tsList) {
      rmSync(workDir(ts), { recursive: true, force: true });
    }
  });
}

/** `os.tmpdir()` 配下に使い捨てディレクトリを作り、t.after() で削除する。 */
export function scratchDir(t, prefix) {
  // Windows の os.tmpdir() は短い名前（RUNNER~1）を返すことがあり、git の --show-toplevel の長い名前と食い違うので、実体のパスにする。
  const dir = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// ---------------------------------------------------------------------------
// 制約強めのケースの書き出し
// ---------------------------------------------------------------------------

/** root 配下の rel（`/` 区切り）に、親ディレクトリを作って書く。書いた絶対パスを返す。 */
export function writeFile(root, rel, content) {
  const p = path.join(root, rel);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, content);
  return p;
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

/**
 * 制約強めのケースを実 `work/<ts>/` へ配置する。`work/<ts>/requirements.md` と、変えたファイルに
 * 見立てた `work/<ts>/generated/**` を書く。t.after() で当該 <ts> を削除する。
 */
export function setupConstrainedCase(t, ts) {
  const w = workDir(ts);
  for (const [rel, content] of Object.entries(CONSTRAINED_CASE)) writeFile(w, rel.replace(/^work\//, ''), content);
  cleanupTs(t, ts);
  return { ts, work: w, gen: path.join(w, 'generated'), req: path.join(w, 'requirements.md') };
}
