/**
 * テスト用の一時 git リポジトリを操作する。作者は `-c` で渡し、ユーザーや CI の git 設定に依存しない。
 * lib/ の関数が自分で git を起動する経路（commitWorktree など）には、作者を IDENTITY の環境変数で渡す。
 */

import { execFileSync } from 'node:child_process';

/** `git -C <cwd> <args>` を実行して標準出力を返す。失敗すると例外を投げる。 */
export function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** 作者の環境変数。lib/ の関数が起動する git にも効く。 */
export const IDENTITY = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' };

/**
 * dir を git リポジトリにし、その時点の全ファイルで最初のコミットを作る。
 * core.autocrlf を切り、worktree の取り出しで改行を変えない（Windows の CI の既定は true）。
 */
export function gitInit(dir, branch = 'main') {
  git(dir, 'init', '-q', '-b', branch);
  git(dir, 'config', 'core.autocrlf', 'false');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
}
