/**
 * hook（ガード）を実プロセスとして叩く共通契約。5ファイルに複製されていた
 * `runGuard`/`decide`/CLI 実行の3実装を1箇所に集約する。
 *
 * ガードは意図的に子プロセス起動のままにする——in-process import に変えると
 * 「ロジックが正しい」と「hook として発火する」の区別が消える
 * （`.claude/rules/workflow.md`・L006）。
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { posix, ROOT } from './paths.js';

/**
 * ガード（PreToolUse/PostToolUse hook 契約）を stdin 経由で叩く。
 * `{ cwd, ...input }` を JSON で渡し、生の stdout を返す。exit≠0（block・exit 2 等）も
 * 例外にせず握って返す（`eval_wiring` が exit コードそのものを観測するため）。
 */
export function hookRun(guardAbsPath, input) {
  try {
    return execFileSync(process.execPath, [guardAbsPath], {
      input: JSON.stringify({ cwd: posix(ROOT), ...input }),
      encoding: 'utf8',
    });
  } catch (err) {
    return `EXIT${err.status}:${err.stdout || ''}${err.stderr || ''}`;
  }
}

/** PreToolUse の permissionDecision（'allow' | 'deny'）を返す。 */
export function decide(guardAbsPath, input) {
  return JSON.parse(hookRun(guardAbsPath, input)).hookSpecificOutput.permissionDecision;
}

/** `tools/*.js` や `deploy/*.js` を子プロセス実行し `{code, stdout, stderr}` を返す。 */
export function runNodeScript(absScript, args = [], opts = {}) {
  try {
    const stdout = execFileSync(process.execPath, [absScript, ...args], { encoding: 'utf8', ...opts });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return {
      code: e.status ?? 1,
      stdout: (e.stdout ?? '').toString(),
      stderr: (e.stderr ?? '').toString(),
    };
  }
}

/** `deploy/<script>` を子プロセス実行する（`deploy_helpers.runCli` 相当）。 */
export function runDeployCli(script, args = [], opts = {}) {
  return runNodeScript(path.join(ROOT, 'deploy', script), args, opts);
}

/** `tools/<script>` を子プロセス実行する（`self_optimize.test.js` の `runToolCli` 相当）。 */
export function runToolCli(script, args = [], opts = {}) {
  return runNodeScript(path.join(ROOT, 'tools', script), args, opts);
}
