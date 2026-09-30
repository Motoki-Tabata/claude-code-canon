/**
 * `tools/*.js`・`deploy/*.js` を子プロセスとして実行する共通契約。
 * CLI の exit code と stdout/stderr を、実際の起動と同じ経路で観測するために使う。
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ROOT } from './paths.js';

/** スクリプトを子プロセス実行し `{code, stdout, stderr}` を返す（exit≠0 も例外にしない）。 */
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

/** `deploy/<script>` を子プロセス実行する。 */
export function runDeployCli(script, args = [], opts = {}) {
  return runNodeScript(path.join(ROOT, 'deploy', script), args, opts);
}

/** `tools/<script>` を子プロセス実行する。 */
export function runToolCli(script, args = [], opts = {}) {
  return runNodeScript(path.join(ROOT, 'tools', script), args, opts);
}
