#!/usr/bin/env node
/**
 * tools/rollback.js（npm run rollback [-- <ts>]）。機能Y ロールバック。詳細設計書 §13.2。
 *
 * `generations/archive/` の世代から `.claude/` を復元する。既定は直近（最新 ts）の退避世代。
 * `<ts>` を明示すればその世代へ戻す（複数世代遡る場合に使う）。
 *
 * `tools/promote.js` が自動ロールバック時に呼ぶ `rollbackFrom()` と同じ実処理を共有する
 * （二重実装しない・L005）。
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { rollbackFrom } from './promote.js';
import { CANON_ROOT } from '../gates/lib/canon.js';
import { currentRunTs } from '../gates/lib/run.js';
import { currentCanonUpdateRunTs } from '../gates/lib/canon-run.js';
import { archiveDir, liveClaudeDir, listArchived, writeCurrent } from '../gates/lib/generations.js';

function main() {
  const canonRunTs = currentRunTs();
  if (canonRunTs) {
    process.stderr.write(`[rollback] 中断: /canon の run（${canonRunTs}）が in-flight。先に完了させること。\n`);
    process.exit(1);
  }
  const canonUpdateRunTs = currentCanonUpdateRunTs();
  if (canonUpdateRunTs) {
    process.stderr.write(`[rollback] 中断: 機能X run（${canonUpdateRunTs}）が in-flight。先に完了させること。\n`);
    process.exit(1);
  }

  const explicitTs = process.argv[2];
  const ts = explicitTs || listArchived(CANON_ROOT)[0];
  if (!ts) {
    process.stderr.write('[rollback] generations/archive/ に復元可能な世代が無い。\n');
    process.exit(1);
  }

  const archive = archiveDir(ts, CANON_ROOT);
  if (!existsSync(path.join(archive, '.claude'))) {
    process.stderr.write(`[rollback] 退避世代が壊れている（.claude/ が無い）: ${archive}\n`);
    process.exit(1);
  }

  const promotedFromPath = path.join(archive, 'PROMOTED_FROM');
  const previousLabel = existsSync(promotedFromPath) ? readFileSync(promotedFromPath, 'utf8').trim() : 'baseline';

  rollbackFrom(archive, liveClaudeDir(CANON_ROOT));
  writeCurrent(previousLabel, CANON_ROOT);

  process.stdout.write(
    `[rollback] 復元完了（${ts} → 現行 .claude/・CURRENT を ${previousLabel} へ戻した）。` +
      `続けて npm test / npm run smoke:arm・smoke:check で健全性を確認すること。\n`
  );
}

main();
