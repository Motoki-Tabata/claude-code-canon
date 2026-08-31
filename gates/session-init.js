#!/usr/bin/env node
/**
 * session-init（SessionStart）。基本設計書 §14。
 *
 * SessionStart は非ブロッキング（docs/L4_AUTOMATION.md §2.1: Block可 ❌）なので、
 * ここでの責務は「run in-flight 判定を壊さない範囲の足場作り」に限る。
 *
 * 重要な設計判断（意図的に <ts> をここで新規採番しない）:
 *   - <ts> の採番点は §11.5 ランタイム・カナリアの「順序の制約」により
 *     「工程1の直前・output-path-resolver による <ts> 確定の直後」に固定されている。
 *     SessionStart はターミナルセッションの開始/再開のたびに発火し、/canon を
 *     一度も実行しないメンテナンスセッションでも同様に発火する。もしここで
 *     無条件に新しい <ts> を work/.session-ts へ書けば、そのメンテナンスセッションが
 *     即座に「run in-flight」と誤判定され（ガードの有効条件が run 外を守れなくなる）、
 *     /update-docs や実装作業が再び全滅する。
 *   - 中断からの再開（§15.2「初版は人間が .gate/markers/*.done を確認して当該工程から
 *     手動再開する」）を壊さないためにも、既存の work/.session-ts は上書きしない。
 *     新しいセッションが古い in-flight な <ts> を引き継いで正しくガード対象になる
 *     必要があるため。
 *   - 実際の採番は tools/new-ts.js（npm run ts）が担う。オーケストレータ（Bash を
 *     持つ Skill）が /canon 実行時に呼び出す想定。
 *
 * ゆえに本スクリプトが行うのは:
 *   1. work/ ディレクトリの存在保証（無ければ tools/new-ts.js 等が失敗しないよう作る）
 *   2. .session-ts が指す <ts> が終端マーカー済み（run 完了）なのに残置されている場合、
 *      情報ログのみ出す（削除はしない＝監査証跡を壊さない。実害はガード側が
 *      currentRunTs() で既に「run外」と判定するため無い）。
 */

import { readHookInput, readSessionTs, hasTerminalMarker, ensureDir, WORK_ROOT, isMainModule } from './lib/run.js';

function main() {
  readHookInput(); // SessionStart は入力を使わない（matcher: startup/resume/clear/compact）

  ensureDir(WORK_ROOT);

  const ts = readSessionTs();
  if (ts && hasTerminalMarker(ts)) {
    process.stderr.write(
      `[session-init] work/.session-ts は完了済み run（${ts}）を指している（情報ログのみ・削除しない）\n`
    );
  }

  // SessionStart は非ブロッキング。素通りする（exit 0・JSON出力なし）。
  process.exit(0);
}

if (isMainModule(import.meta.url)) main();
