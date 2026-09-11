/**
 * gates/lib/interface-signature.js — 種別ごとの「対外インタフェース署名」（S1-2・§11.2）。
 *
 * ## なぜ要るか
 *
 * G8 の `interface_change: none` 実照合は、旧実装では frontmatter `name` の同一性しか
 * 検査手段を持たなかった（`gates/g8_non_regression.js`）。「対外インタフェースを変えない改修」
 * という概念は frontmatter を持てない対象（`CLAUDE.md`・rules・JSON 設定・付随スクリプト）にも
 * 実在するのに、検証手段が無いために**宣言すること自体が違反**になっていた
 * （ライブ run `20260910_220906` で実測。`.claude/settings.json` の C3 が依存先
 * `scope-guard.mjs` の `interface_change: none` 宣言に依存する連鎖で、両立不能の袋小路が生じた）。
 *
 * ここでは種別ごとに「対外インタフェース」を定義し、それぞれの検査手段（署名）を用意する。
 * 検査手段が無い種別は `verifiable: false` を返し、G8 はそれを**違反にせず「検査対象外」**として
 * 扱う（宣言は残せるが実照合はしない旨を通過メッセージへ必ず出す・§11.5）。
 *
 * 依存ゼロ（§14）。
 */

import { parseFrontmatter } from './artifact.js';

function posixPath(p) {
  return String(p).replace(/\\/g, '/');
}

/** `## 見出し` 行だけを抽出する（frontmatter を持たない md の対外インタフェース）。 */
function headingSignature(text) {
  const headings = text
    .split(/\r?\n/)
    .filter((l) => /^##\s+\S/.test(l))
    .map((l) => l.trim());
  return JSON.stringify(headings);
}

/** JSON のトップレベルキー集合（設定ファイルの配線点）。 */
function jsonTopKeysSignature(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return null; // パース不能 = 検査対象外（構文検査は G6/G11 等の別ゲートの領分）
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return null;
  return JSON.stringify(Object.keys(obj).sort());
}

/** `export` される識別子の集合（付随スクリプトの対外インタフェース）。字句ベースの近似。 */
function jsExportsSignature(text) {
  const names = new Set();
  const reList = [
    /export\s+(?:async\s+)?function\s*\*?\s+([A-Za-z_$][\w$]*)/g,
    /export\s+const\s+([A-Za-z_$][\w$]*)/g,
    /export\s+let\s+([A-Za-z_$][\w$]*)/g,
    /export\s+class\s+([A-Za-z_$][\w$]*)/g,
  ];
  for (const re of reList) {
    let m;
    while ((m = re.exec(text)) !== null) names.add(m[1]);
  }
  const braceRe = /export\s*\{([^}]*)\}/g;
  let m;
  while ((m = braceRe.exec(text)) !== null) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  if (/export\s+default\b/.test(text)) names.add('default');
  return JSON.stringify([...names].sort());
}

/**
 * パスと本文から対外インタフェース署名を導出する。
 * @param {string} rel リポジトリ相対パス（区切りはどちらでも可）
 * @param {string} text ファイル内容
 * @returns {{kind: string, signature: string|null, verifiable: boolean}}
 *   `signature` が非 null のときだけ `verifiable: true`。
 */
export function interfaceSignature(rel, text) {
  const p = posixPath(rel);
  const base = p.split('/').pop() ?? '';

  // frontmatter name を持つもの（SKILL.md・Subagent 定義）。旧実装から引き継ぐ検査手段。
  if (base === 'SKILL.md' || /(^|\/)\.claude\/agents\/[^/]+\/[^/]+\.md$/.test(p)) {
    const fm = parseFrontmatter(text);
    const name = fm.present ? fm.frontmatter.name?.value : undefined;
    if (typeof name === 'string' && name !== '') {
      return { kind: 'frontmatter-name', signature: name, verifiable: true };
    }
    return { kind: 'frontmatter-name', signature: null, verifiable: false };
  }

  // rules（`paths:` frontmatter のみ）。
  if (/(^|\/)\.claude\/rules\/.+\.md$/.test(p)) {
    const fm = parseFrontmatter(text);
    const raw = fm.present ? fm.frontmatter.paths?.value : undefined;
    if (raw !== undefined) {
      const list = (Array.isArray(raw) ? raw : [raw]).map(String).sort();
      return { kind: 'rule-paths', signature: JSON.stringify(list), verifiable: true };
    }
    return { kind: 'rule-paths', signature: null, verifiable: false };
  }

  // frontmatter を持たない md（CLAUDE.md・.claude/README.md）→ 見出し構造。
  if (p === 'CLAUDE.md' || p === '.claude/README.md') {
    return { kind: 'heading-structure', signature: headingSignature(text), verifiable: true };
  }

  // JSON（settings.json・.mcp.json 等）→ トップレベルキー集合（hooks 等の配線点）。
  if (base.endsWith('.json')) {
    const sig = jsonTopKeysSignature(text);
    return { kind: 'json-top-keys', signature: sig, verifiable: sig !== null };
  }

  // 付随スクリプト（.mjs/.js）→ export される識別子の集合。
  if (base.endsWith('.mjs') || base.endsWith('.js')) {
    return { kind: 'js-exports', signature: jsExportsSignature(text), verifiable: true };
  }

  return { kind: 'unknown', signature: null, verifiable: false };
}
