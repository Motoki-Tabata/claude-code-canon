/**
 * テスト用の一時 git リポジトリを操作する。作者は `-c` で渡し、ユーザーや CI の git 設定に依存しない。
 */

import { execFileSync } from 'node:child_process';

/** `git -C <cwd> <args>` を実行して標準出力を返す。失敗すると例外を投げる。 */
export function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** dir を git リポジトリにし、その時点の全ファイルで最初のコミットを作る。 */
export function gitInit(dir, branch = 'main') {
  git(dir, 'init', '-q', '-b', branch);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
}
