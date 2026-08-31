#!/usr/bin/env node
/**
 * tools/smoke-wiring.js — hooks 実発火のスモークテスト（新セッション用）。
 *
 * 目的: `.claude/settings.json` の hooks 配線が、この Claude Code セッションで
 * 現に発火するかを確かめる。詳細設計書 §11.5 のランタイム・カナリアと同型だが、
 * `/canon` を起動せず配線の生存だけを最小コストで確認する。
 *
 * ## なぜ必要か
 *
 * hooks はセッション開始時に読み込まれる。settings.json を作成・変更したセッションでは
 * 発火しない。また当該 SDK/harness が project 配下の settings.json hooks をそもそも
 * 発火させるかは環境依存。npm test（ロジック・構造）が緑でも配線は死んでいうる。
 * これは「セッションを跨いだ実発火」でしか確かめられない（§11.5・配線の生存検証）。
 *
 * ## 使い方（3ステップ・オーケストレータ＝メイン Claude が実行）
 *
 *   1. node tools/smoke-wiring.js arm
 *        → <ts> を採番し（run in-flight 化）、カナリアの的パスを表示する。
 *   2. メイン Claude が **Write ツール**でその的パスへ何か書き込もうとする。
 *        → 配線が生きていれば write-scope-guard が deny する（.gate/** は deny-all）。
 *        → 配線が死んでいれば書込が成功してしまう。
 *   3. node tools/smoke-wiring.js check
 *        → 的パスにファイルが在るか（＝書込が通ってしまったか）で判定し、後片付けする。
 *           在る  = 配線が死んでいる（要セッション再起動 or harness 非対応）→ exit 2
 *           無い  = 配線が生きている（deny された）→ exit 0
 *
 * bash の `> file` では検証にならない（hooks は Claude のツール呼出に対して発火し、
 * 子プロセスのファイル書込には発火しない）。必ず Write ツールで試すこと。
 */

import { existsSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  mintTs,
  writeSessionTs,
  readSessionTs,
  SESSION_TS_FILE,
  outputDir,
  workDir,
  gateDir,
  ensureDir,
} from '../gates/lib/run.js';

const cmd = process.argv[2];

function canaryPath(ts) {
  return path.join(gateDir(ts), '.canary');
}

if (cmd === 'arm') {
  const ts = mintTs();
  ensureDir(outputDir(ts));
  ensureDir(gateDir(ts));
  mkdirSync(workDir(ts), { recursive: true });
  writeSessionTs(ts);
  const target = canaryPath(ts);
  process.stdout.write(
    `arm 完了。run in-flight（<ts>=${ts}）。\n` +
      `次に、メイン Claude が Write ツールで下記へ書き込みを試みること:\n` +
      `  ${target}\n` +
      `配線が生きていれば deny される。その後 'node tools/smoke-wiring.js check' を実行。\n`
  );
  process.exit(0);
}

if (cmd === 'check') {
  const ts = readSessionTs();
  if (!ts) {
    process.stderr.write('check: work/.session-ts が無い。先に arm を実行すること。\n');
    process.exit(1);
  }
  const target = canaryPath(ts);
  const leaked = existsSync(target);

  // 後片付け（run 外へ戻す）。
  rmSync(outputDir(ts), { recursive: true, force: true });
  rmSync(workDir(ts), { recursive: true, force: true });
  rmSync(SESSION_TS_FILE, { force: true });

  if (leaked) {
    process.stdout.write(
      '✗ 配線が死んでいる: カナリアの的への Write が deny されず成功した。\n' +
        '  → .claude/settings.json 変更後にセッションを再起動していないか、\n' +
        '    当該 harness が project の settings.json hooks を発火させない可能性。\n' +
        '  ゲートのロジックは npm test で緑でも、この状態では実運用で沈黙する（vacuous pass）。\n'
    );
    process.exit(2);
  }
  process.stdout.write(
    '✓ 配線が生きている: カナリアの的への Write が deny された（ファイルが作られていない）。\n' +
      '  決定論ゲートが hooks として現に発火している。/canon を実行してよい。\n'
  );
  process.exit(0);
}

process.stderr.write(
  'usage: node tools/smoke-wiring.js <arm|check>\n' +
    '  arm   : <ts> を採番しカナリアの的を表示（run in-flight 化）\n' +
    '  check : Write が通ってしまったかで配線の生存を判定し後片付け\n'
);
process.exit(1);
