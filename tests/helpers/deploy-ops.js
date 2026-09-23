/**
 * deploy/deploy.js の moveFile と同じ動作（親ディレクトリを作って rename）。テストが moveFile を差し替えるとき、
 * 「失敗させたいとき以外は本物と同じ動きをする」ための土台に使う（deploy.js の moveFile は非公開のため）。
 */
import path from 'node:path';
import { mkdirSync, renameSync } from 'node:fs';

export function moveFileForTest(src, dst) {
  mkdirSync(path.dirname(dst), { recursive: true });
  renameSync(src, dst);
}
