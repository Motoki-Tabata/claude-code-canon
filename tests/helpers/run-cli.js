/**
 * Phase Skill の `scripts/*.js` を子プロセスとして実行する共通契約。
 * CLI の exit code と stdout/stderr を、実際の起動と同じ経路で観測するために使う。
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { scriptsDir } from './paths.js';

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

/** `.claude/skills/<phase>/scripts/<script>` を子プロセス実行する。 */
export function runScript(phase, script, args = [], opts = {}) {
  return runNodeScript(path.join(scriptsDir(phase), script), args, opts);
}
