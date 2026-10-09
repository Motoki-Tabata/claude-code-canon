/**
 * リポジトリのパスの基準と、設計書2冊のパス。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** リポジトリのルート（このファイルは `<root>/lib/canon.js`）。 */
export const CANON_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * 設計書2冊（architecture.md・artifacts.md）のパスの SSoT。
 * V1・テストが個別にハードコードするのを避け、ここへ集約する。
 * パスを変える際はここ1箇所を直せば全参照が追従する。
 */
export const DESIGN_DOC_ARCHITECTURE = 'design/architecture.md';
export const DESIGN_DOC_ARTIFACTS = 'design/artifacts.md';
export const DESIGN_DOCS = [DESIGN_DOC_ARCHITECTURE, DESIGN_DOC_ARTIFACTS];

/** 出力 JSON に入れるパスは常にスラッシュ正規化する（Windows 対応）。 */
export function posix(p) {
  return p.split(path.sep).join('/');
}
