/**
 * 正典 docs/ の読込と、抽出の健全性を守る不変条件。
 *
 * §11.5 の失敗様式（vacuous pass）と同型の事故を抽出器で起こさないため、
 * 「抽出できるはずのものが 0 件」は必ず例外にする。黙って空表を出すことは禁止。
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const GATES_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const CANON_ROOT = path.dirname(GATES_DIR);
export const DOCS_DIR = path.join(CANON_ROOT, 'docs');

/**
 * 設計書2冊（基本設計書・詳細設計書）のパスの SSoT。
 * `canon-update-scope-guard.js`・`self-optimize-scope-guard.js`・`g15_propagation.js`・
 * `build-conformance-tables.js`・`g3_path_convention.js` が個別にハードコードするのを避け、
 * ここへ集約する（`gates/lib/non-schema.js`・`gates/lib/shell-write.js` と同じ既定パターン）。
 * パスを変える際はここ1箇所を直せば全参照が追従する。
 */
export const DESIGN_DOC_BASIC = 'design/basic-design.md';
export const DESIGN_DOC_DETAIL = 'design/detailed-design.md';
export const DESIGN_DOCS = [DESIGN_DOC_BASIC, DESIGN_DOC_DETAIL];

/** DESIGN_DOCS のいずれかにマッチする正規表現（特殊文字をエスケープしたうえで OR 結合）。 */
export function designDocRegExp(flags = 'i') {
  const alternation = DESIGN_DOCS.map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(alternation, flags);
}

/** 出力 JSON に入れるパスは常にスラッシュ正規化する（Windows 対応）。 */
export function posix(p) {
  return p.split(path.sep).join('/');
}

/** docs/ からの相対パス（出典表記に使う）。 */
export function docRef(file) {
  return posix(path.relative(CANON_ROOT, path.join(DOCS_DIR, file)));
}

const cache = new Map();

export function loadDoc(name) {
  if (cache.has(name)) return cache.get(name);
  const abs = path.join(DOCS_DIR, name);
  if (!existsSync(abs)) {
    throw new ExtractionError(`正典ファイルが存在しない: ${posix(abs)}`);
  }
  const text = readFileSync(abs, 'utf8');
  const doc = { name, abs, ref: docRef(name), text, lines: text.split(/\r?\n/) };
  cache.set(name, doc);
  return doc;
}

/**
 * 抽出失敗を表す例外。build は必ずこれで落ち、部分的な表を書き出さない。
 * 正典の書式が変わったとき「黙って壊れる」のを防ぐための唯一の防衛線。
 */
export class ExtractionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExtractionError';
  }
}

/** 抽出結果が空でないことを強制する。0 件＝正典の書式が変わった＝落とす。 */
export function requireNonEmpty(value, what, where) {
  // Map/Set は Object.keys が常に [] を返すため個別に扱う。
  // （これを取り違えると「中身があるのに0件」と誤判定し、逆に空を見逃す形にも転びうる）
  const n =
    value instanceof Map || value instanceof Set
      ? value.size
      : Array.isArray(value)
        ? value.length
        : Object.keys(value ?? {}).length;
  if (n === 0) {
    throw new ExtractionError(
      `抽出0件: ${what}（出典: ${where}）。` +
        `正典の書式が変わった可能性がある。抽出器を追従させること。` +
        `空表のまま出力するとゲートが沈黙し vacuous pass する（§11.5）。`
    );
  }
  return value;
}

/** 期待件数との一致を強制する（正典が自ら明示している総数と突き合わせる）。 */
export function requireCount(actual, expected, what, where) {
  if (actual !== expected) {
    throw new ExtractionError(
      `件数不一致: ${what} は ${expected} 件のはずが ${actual} 件（出典: ${where}）。` +
        `正典の書式変更か、正典側の記述変更。人間の確認が要る。`
    );
  }
}

/** 抽出値が期待トークンを含むことを強制する（語彙抽出の妥当性検査）。 */
export function requireIncludes(arr, expected, what, where) {
  for (const e of expected) {
    if (!arr.includes(e)) {
      throw new ExtractionError(
        `語彙抽出が不正: ${what} に必須トークン '${e}' が無い（抽出結果: ${JSON.stringify(arr)}／出典: ${where}）。`
      );
    }
  }
  return arr;
}

/**
 * 正典バージョンを全ファイルのメタ情報表から抽出し、一致を強制する。
 * 照合表の stale 検出（§11.4）の基準値。ファイル間で食い違うなら
 * 正典自体が不整合なので落とす（黙って片方を採らない）。
 */
export function extractCanonVersion(fileNames) {
  const found = [];
  for (const name of fileNames) {
    const doc = loadDoc(name);
    let hit = null;
    for (let i = 0; i < doc.lines.length; i++) {
      // 表記ゆれを吸収する: 00_INDEX.md は「確認した Claude Code バージョン」（空白あり）で
      // 値を **v2.1.209**（…）と太字にする。他7ファイルは「確認したClaude Codeバージョン」で素の値。
      // 意味は同一なので吸収してよいが、ゆれを黙って読み飛ばす（行が無いのに null を返す）ことはしない。
      const m = doc.lines[i].match(/^\|\s*確認した\s*Claude\s*Code\s*バージョン\s*\|\s*\**\s*(v[\d.]+)/);
      if (m) {
        hit = { version: m[1], source: `${doc.ref}:${i + 1}` };
        break;
      }
    }
    if (!hit) {
      throw new ExtractionError(
        `${doc.ref}: メタ情報表の「確認したClaude Codeバージョン」行が見つからない。` +
          `正典バージョンが取れなければ照合表の stale 検出が機能しない（§11.4）。`
      );
    }
    found.push({ file: doc.ref, ...hit });
  }
  requireNonEmpty(found, 'canon_version', 'docs/*.md メタ情報表');
  const versions = [...new Set(found.map((f) => f.version))];
  if (versions.length !== 1) {
    throw new ExtractionError(
      `正典バージョンがファイル間で不一致: ${JSON.stringify(found, null, 2)}。` +
        `どのバージョンを基準にすべきか機械では決められない。人間の確認が要る。`
    );
  }
  return { version: versions[0], sources: found };
}
