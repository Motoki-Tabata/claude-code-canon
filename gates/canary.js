#!/usr/bin/env node
/**
 * gates/canary.js — ランタイム・カナリア（配線生存の証明・詳細設計書 §11.5）。
 *
 * ## 正直な限界（実装前に明記する）
 *
 * このファイルは「Hooks 配線が生きているか」を**それ自体では証明できない**。
 * 証明できるのは、実際にツール呼出（Write 等）を発行し、その結果（deny された/
 * されなかった）を観測できる主体だけである。gates/ 配下のスクリプトはワーカー同様
 * Node プロセスとして起動されるだけで、Claude Code のツール発行経路そのものではない
 * ——`node gates/write-scope-guard.js` を直接呼んでも、それは「ガードの判定ロジックが
 * 正しいか」のテストにしかならず（`npm test` が既にやっている）、「settings.json の
 * hooks 配線が現に発火するか」の証明には**ならない**。後者を証明できるのは、実際に
 * Claude Code のハーネスを通してツールを発行し、ハーネスがそのツール呼出を許可/拒否
 * する様子を観測できる主体——すなわち **`/canon` を実行しているオーケストレータ
 * （inline のメイン Claude）自身**だけである（詳細設計書 §11.5「実行主体」）。
 *
 * ゆえに本ファイルは「カナリアを撃つ主体」ではなく、**オーケストレータが撃った後の
 * 結果を受け取って判定・記録する検証ヘルパ**として設計する:
 *
 *   1. オーケストレータが `node gates/canary.js target <ts>` で的パスを取得する。
 *   2. オーケストレータが自身の Write ツールでそのパスへの書込を実際に試みる
 *      （sanctioned 外・`.gate/**` は deny-all のはずなので、正常なら deny される）。
 *   3. オーケストレータがその結果（deny された/されなかった）を観測し、
 *      `node gates/canary.js report <ts> denied|allowed` で本ファイルへ通知する。
 *   4. 本ファイルが判定（生死）を確定し、`.gate/processed.log` へ記録し、
 *      判定に応じて exit 0（生存・工程1へ進んでよい）/ exit 2（死亡・run を中断）を返す。
 *
 * この設計だと「オーケストレータが gates/canary.js の判定結果を偽って report できて
 * しまう」という懸念が残る。しかしそれは本質的な限界であり、偽れる主体（オーケストレータ）
 * は既に Bash・Write を持つ特権的実行者であって、G13 が塞ぐ「ワーカーの特権昇格」とは
 * 層が異なる（§11.5「G13 との関係」表）。カナリアが守るのは「ワーカーが気づかぬまま
 * ガードが死んでいる状態で run が進む」ことの防止であり、オーケストレータ自身の悪意や
 * 誤りまでは守備範囲ではない（オーケストレータは人間の直接の代理・§13.1 と同じ層）。
 *
 * ## 書込先・順序制約
 *
 * 的は `output/<ts>/.gate/.canary`（`.gate/**` は deny-all・残骸無害・§11.5）。
 * `<ts>` 採番の後・工程1の前でなければならない（採番前は run 外と判定されガードが
 * 素通りし偽陽性になる・§11.3 ガードの有効条件）。本ファイルは `evaluateCanary()` 内で
 * `currentRunTs() === ts` を強制することでこの順序制約を実行時に検証する
 * （呼び出し側の運用規律に頼らず、機械的に弾く）。
 */

import path from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { CANON_ROOT, posix } from './lib/canon.js';
import { gateDir, currentRunTs, appendProcessedLog, isValidTs, blockStop, passStop, isMainModule } from './lib/run.js';

const STAGE = 'canary';

/** カナリアの的（絶対パス）。`.gate/**` は deny-all なので必ず deny されるべき対象。 */
export function canaryTargetPath(ts) {
  return path.join(gateDir(ts), '.canary');
}

/** オーケストレータへ提示する repo 相対パス（表示・Write ツールへの入力用）。 */
export function canaryTargetRelPath(ts) {
  return posix(path.relative(CANON_ROOT, canaryTargetPath(ts)));
}

/**
 * 観測結果から生死を判定する純関数（ファイル読取はするが書込はしない）。
 * @param {{ts: string, observed: 'denied'|'allowed'}} args
 */
export function evaluateCanary({ ts, observed }) {
  if (!isValidTs(ts)) {
    return { ok: false, verdict: 'invalid_ts', message: `<ts> の形式が不正: ${JSON.stringify(ts)}（期待形式: YYYYMMDD_hhmmss）` };
  }
  if (observed !== 'denied' && observed !== 'allowed') {
    return {
      ok: false,
      verdict: 'invalid_observation',
      message: `observed は 'denied' か 'allowed' のいずれかでなければならない（実際: ${JSON.stringify(observed)}）。`,
    };
  }

  // 順序制約の実行時強制（§11.5）: <ts> が「今まさに in-flight」でなければ、
  // ガードは常に素通り（allow）する（§11.3 ガードの有効条件）。この状態で観測した
  // "allowed" は「ガードが死んでいる」ではなく「まだ run が始まっていない」を意味する
  // だけであり、偽陽性になる。ゆえにここで区別して弾く。
  const inFlightTs = currentRunTs();
  if (inFlightTs !== ts) {
    return {
      ok: false,
      verdict: 'order_error',
      message:
        `<ts>=${ts} が run in-flight と判定されない（currentRunTs()=${JSON.stringify(inFlightTs)}）。` +
        'カナリアは <ts> 採番（npm run ts）の後・工程1の前でなければならない（§11.5 順序の制約）。' +
        '採番前に撃つとガードは常に allow するため、この観測結果はガードの生死を証明しない（偽陽性の恐れ）。' +
        '<ts> 採番が完了しているか確認してから再度撃つこと。',
    };
  }

  if (observed === 'denied') {
    return {
      ok: true,
      verdict: 'guard_alive',
      message: `カナリア書込（${canaryTargetRelPath(ts)}）は deny された。write-scope-guard の Hooks 配線は生きている。工程1へ進んでよい。`,
    };
  }

  return {
    ok: false,
    verdict: 'guard_dead',
    message:
      `カナリア書込（${canaryTargetRelPath(ts)}）が deny されなかった（許可された）。` +
      '.gate/** は deny-all のはずであり、ここが allow されるのは .claude/settings.json の Hooks 配線が' +
      '死んでいることを意味する（配線の生存検証・§11.5）。run を中断し、人間へエスカレーションすること。',
  };
}

/** 判定結果を .gate/processed.log へ記録する（監査可能にする・§11.5「記録」）。 */
export function recordCanary(ts, evaluation, meta = {}) {
  appendProcessedLog(ts, {
    stage: STAGE,
    ok: evaluation.ok,
    verdict: evaluation.verdict,
    message: evaluation.message,
    ...meta,
  });
}

/**
 * 万一 allow されて残骸が残った場合の後始末（ベストエフォート）。
 * `output/` は gitignore され残骸自体は無害だが（§11.5）、衛生上削除を試みる。
 * 削除に失敗しても判定結果には影響させない（掃除の失敗で誤って guard_alive 側に
 * 倒してはならない）。
 */
export function cleanupCanaryArtifact(ts) {
  const p = canaryTargetPath(ts);
  if (!existsSync(p)) return false;
  try {
    unlinkSync(p);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// CLI（オーケストレータ専用の検証ヘルパ。hook ではないので stdin JSON 契約は無い）
// ---------------------------------------------------------------------------

function usage() {
  return (
    'usage:\n' +
    '  node gates/canary.js target <ts>\n' +
    '      カナリアの的パス（repo 相対）を表示する。オーケストレータはこのパスへ Write ツールで\n' +
    '      書込を試み、deny されることを確認する（Bash/PowerShell の文字列検査は保険に過ぎないため、\n' +
    '      Write ツールでの直接検証を推奨する）。\n' +
    '  node gates/canary.js report <ts> <denied|allowed> [reason...]\n' +
    '      手順2で観測した結果を報告する。exit 0 = ガード生存（工程1へ進んでよい）。\n' +
    '      exit 2 = ガード死亡または順序エラー（run を中断すること）。\n'
  );
}

function main() {
  const [cmd, ts, ...rest] = process.argv.slice(2);

  if (cmd === 'target') {
    if (!ts) {
      process.stderr.write(usage());
      process.exit(1);
      return;
    }
    process.stdout.write(canaryTargetRelPath(ts) + '\n');
    process.exit(0);
    return;
  }

  if (cmd === 'report') {
    const observed = rest[0];
    const reason = rest.slice(1).join(' ');
    if (!ts || !observed) {
      process.stderr.write(usage());
      process.exit(1);
      return;
    }

    const evaluation = evaluateCanary({ ts, observed });

    if (evaluation.verdict === 'order_error' || evaluation.verdict === 'invalid_observation' || evaluation.verdict === 'invalid_ts') {
      // <ts> が in-flight と確認できない、または入力が不正 → processed.log への記録先
      // 自体が信頼できない（誤った <ts> 配下に監査ログを残すと後日の調査を誤導する）。
      // 記録はせず、理由を添えてブロックするに留める。
      blockStop(evaluation.message);
      return;
    }

    recordCanary(ts, evaluation, { observed, reason });

    if (evaluation.ok) {
      passStop(evaluation.message);
    } else {
      cleanupCanaryArtifact(ts);
      blockStop(evaluation.message);
    }
    return;
  }

  process.stderr.write(usage());
  process.exit(1);
}

if (isMainModule(import.meta.url)) main();
