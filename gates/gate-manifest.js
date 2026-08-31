/**
 * gates/gate-manifest.js
 *
 * 「未実装ゲート」の明示マニフェスト。詳細設計書 §11.5（vacuous pass）への対策。
 *
 * ## なぜ要るか
 *
 * バッチ（stage-guard / gen-guard）は G1〜G12 を動的 import して呼ぶ。素朴に
 * 「ファイルが無ければスキップして通す」と実装すると、次の2つを区別できない:
 *
 *   (a) まだ実装していない（ブートストラップ中・MVP 段階分割による正当な不在）
 *   (b) 実装済みのゲートを誤って消した・改名した・import を壊した（退行）
 *
 * (b) を (a) として黙って通すと、**検証能力が静かに失われる**。ゲートは沈黙したまま
 * 全ての run が「違反ゼロ」で通る——§11.5 が「claude-canon の最も静かな失敗様式」と
 * 呼ぶ vacuous pass そのものである。しかも「テストは緑・ゲートは通過」に見えるため、
 * 気づく契機が無い。
 *
 * ## 解
 *
 * 未実装を**明示的に宣言**させ、宣言と実体の突合を強制する:
 *
 *   | 実体 | 宣言 | 判定 |
 *   |---|---|---|
 *   | 有 | 無 | implemented … 通常どおり検査する |
 *   | 無 | 有 | declared_missing … スキップするが stderr と processed.log に必ず残す |
 *   | 無 | 無 | **undeclared_missing … 違反**（消した・改名した・パスを間違えた） |
 *   | 有 | 有 | **stale_declaration … 違反**（実装したのに宣言を消し忘れた） |
 *
 * 「有×有」も違反にするのが肝。これが無いとマニフェストが腐り、実装済みゲートが
 * 宣言に残ったまま「未実装だからスキップ」と誤って扱われうる。宣言の更新を強制する。
 *
 * ## 運用
 *
 * ゲートを実装したら**このファイルから該当エントリを消す**こと。消し忘れたら
 * stale_declaration で落ちるので、忘れようがない。全ゲートが揃えば
 * NOT_YET_IMPLEMENTED は空になり、以降は「不在＝常に違反」に自動的に切り替わる。
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { GATES_DIR } from './lib/canon.js';

/**
 * まだ実装していないゲート。実装したらエントリを削除すること（残すと違反になる）。
 * 各エントリは「なぜ今は無くてよいか」の根拠を持つ。根拠を書けない不在は許さない。
 */
export const NOT_YET_IMPLEMENTED = {
  // 2026-07-24: 最後の1件だった g11_constraints.js を実装したため空になった。
  // これ以降は「宣言の無いゲート不在＝undeclared_missing＝常に違反」へ自動的に切り替わる
  // （上表の3行目）。新しいゲートを足すときだけ、実装までの間ここに根拠付きで宣言する。
};

/**
 * ゲートモジュールの実体と宣言を突き合わせる。
 * @returns {{name, status, path, declaration}} status は
 *   'implemented' | 'declared_missing' | 'undeclared_missing' | 'stale_declaration'
 */
export function resolveGate(name) {
  const modPath = path.join(GATES_DIR, name);
  const exists = existsSync(modPath);
  const declared = Object.prototype.hasOwnProperty.call(NOT_YET_IMPLEMENTED, name);
  let status;
  if (exists && !declared) status = 'implemented';
  else if (!exists && declared) status = 'declared_missing';
  else if (!exists && !declared) status = 'undeclared_missing';
  else status = 'stale_declaration';
  return { name, status, path: modPath, declaration: declared ? NOT_YET_IMPLEMENTED[name] : null };
}

/**
 * バッチが呼ぶゲート群を解決し、違反（vacuous pass の芽）を返す。
 * @param {string[]} names
 * @returns {{runnable: string[], skipped: object[], violations: string[]}}
 */
export function resolveGates(names) {
  const runnable = [];
  const skipped = [];
  const violations = [];
  for (const name of names) {
    const r = resolveGate(name);
    switch (r.status) {
      case 'implemented':
        runnable.push(name);
        break;
      case 'declared_missing':
        skipped.push({ name, ...r.declaration });
        break;
      case 'undeclared_missing':
        violations.push(
          `${name}: ゲートモジュールが存在せず、gate-manifest.js の NOT_YET_IMPLEMENTED にも宣言が無い。` +
            `消した・改名した・パスを間違えた可能性がある。未実装なら宣言を書くこと（根拠付きで）。` +
            `黙ってスキップすると vacuous pass になるためブロックする（§11.5）。`
        );
        break;
      case 'stale_declaration':
        violations.push(
          `${name}: 実装済みなのに gate-manifest.js の NOT_YET_IMPLEMENTED に宣言が残っている。` +
            `宣言を削除すること。放置すると実装済みゲートが「未実装」として飛ばされ、検査が沈黙する（§11.5）。`
        );
        break;
    }
  }
  return { runnable, skipped, violations };
}
