/**
 * verify のテスト用コンテキスト。`work/<ts>/generated/` の全ファイルを「変えたファイル」（追加）かつ
 * 「追跡されているファイル」として扱い、`work/<ts>/` の requirements.md・change-plan.md を読む。
 * git は使わない（git を使う経路は verify_cli.test.js が実際の起動経路で見る）。
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { makeContext } from '../../lib/verify/context.js';
import { listFiles } from './fixtures.js';
import { genDir, workDir } from './paths.js';

const readOrNull = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);

/** generated/ の全ファイルを変更（追加）として組み立てる。`deleted` は削除したファイルの名前。 */
export function buildContext(ts, { deleted = [], extraTracked = [] } = {}) {
  const root = genDir(ts);
  const rels = listFiles(root);
  return makeContext({
    root,
    changed: [...rels.map((rel) => ({ rel, status: 'A' })), ...deleted.map((rel) => ({ rel, status: 'D' }))],
    tracked: [...rels, ...extraTracked],
    requirementsText: readOrNull(path.join(workDir(ts), 'requirements.md')),
    changePlanText: readOrNull(path.join(workDir(ts), 'change-plan.md')),
  });
}
