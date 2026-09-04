/**
 * eval/report.js — eval-report.md と各軸 verdict の集約検証（詳細設計書 §16.5）。決定論。
 *
 * eval の合否そのもの（意味判断）は judge が出す。本モジュールが決定論的に確かめるのは
 * 「**judge が judge すべきものを実際に judge したか**」であり、次の3点を分けて扱う:
 *
 *   (1) スキーマ  : 各軸 verdict がパースでき、契約どおりの形か（eval/verdict.js）
 *   (2) カバレッジ: G2 が回付した対象（keep 全件 × C2/C4・merge 全件 × 統合先）が
 *                   keep-review の coverage に全件現れるか。**未判定を pass と読まない**
 *   (3) 集約     : violation の finding が eval-report.md に落ちているか（集約で消えていないか）
 *
 * (1) が失敗した軸は「判定不能（judge が判定できなかった）」として `undecided` に載り、notes と
 * violations の両方に現れる（§16.4）。判定不能な軸は `forcedReview` に1件も寄与しないため、
 * **violation 0件を「違反なし」と読んではならない**——この区別を戻り値の形で持たせないと、
 * `ok` を見ずに `forcedReview` だけ読む呼び出し側が「指摘なし」と誤読する。
 *
 * 回付0件（keep/merge が無い＝新規シナリオ）は違反ではないが、**「eval で品質を確認した」
 * ことを意味しない**。この区別を notes として必ず可視化する（§16.5・§11.5 と同じ規律）。
 */

import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { outputDir, isMainModule, readSessionTs } from '../gates/lib/run.js';
import { parseExistingDisposition, DesignMapError } from '../gates/lib/design-map.js';
import { AXES, loadVerdict, violationFindings } from './verdict.js';

/**
 * design-map から「eval へ回付される対象」を導く（G2 の回付規約と同一・§8.4）。
 * @returns {{target: string, condition: string}[]}
 */
export function referredTargets(designMapText) {
  const records = parseExistingDisposition(designMapText);
  const out = [];
  for (const r of records) {
    if (r.disposition === 'keep') {
      out.push({ target: r.path, condition: 'C2' });
      out.push({ target: r.path, condition: 'C4' });
    } else if (r.disposition === 'merge') {
      out.push({ target: r.path, condition: 'merge_target' });
    }
  }
  return out;
}

/**
 * @param {{ts: string, roots?: {outputDir?: string}, axes?: string[]}} opts
 * @returns {{ok, violations, notes, referred, perAxis, forcedReview, undecided}}
 */
export function checkEvalReport({ ts, roots = {}, axes = AXES }) {
  const oDir = roots.outputDir ?? outputDir(ts);
  const violations = [];
  const notes = [];
  /** 判定不能（不在・パース不能・スキーマ違反）な軸名。§16.4。 */
  const undecided = [];

  // --- 回付対象の確定（design-map が唯一の根拠） ---
  const dmPath = path.join(oDir, 'design-map.md');
  let referred = [];
  if (!existsSync(dmPath)) {
    violations.push('design-map.md が存在しない。eval の判定対象を確定できない（不在を「対象0件＝合格」と読まない・§16.5）。');
  } else {
    try {
      referred = referredTargets(readFileSync(dmPath, 'utf8'));
    } catch (e) {
      if (e instanceof DesignMapError) violations.push(`design-map: ${e.message}`);
      else throw e;
    }
  }

  // --- 各軸 verdict ---
  const perAxis = {};
  const forcedReview = [];
  for (const axis of axes) {
    const p = path.join(oDir, 'eval', `${axis}.md`);
    const res = loadVerdict(p, `eval/${axis}.md`);
    perAxis[axis] = res;
    if (!res.ok) {
      undecided.push(axis);
      violations.push(...res.violations);
      continue;
    }
    for (const f of violationFindings(res.verdict)) {
      forcedReview.push({ axis, ...f });
    }
  }

  // 判定不能は「違反なし」ではない（§16.4）。notes は main() で常時出力されるので、
  // 違反一覧を読まない読者にも「この軸は誰も判定していない」が届く。
  if (undecided.length > 0) {
    notes.push(
      `判定不能の軸がある（judge が判定できなかった・§16.4）: ${undecided.join(', ')}。` +
        '判定不能な軸は forcedReview に1件も寄与しないため、violation 0件を「違反なし」と読んではならない。'
    );
    violations.push(
      `judge が判定できなかった軸がある（未判定を pass と読まない・§16.5）: ${undecided.join(', ')}。` +
        '当該 judge に verdict の書き出しをやり直させてから再実行する' +
        '（判定が応答に残っているなら再判定させず、そのまま Write させる）。'
    );
  }

  // --- カバレッジ（keep-review） ---
  const kr = perAxis['keep-review'];
  if (referred.length === 0) {
    notes.push(
      'keep/merge が0件のため keep-review の判定対象は無い（新規シナリオ等）。' +
        'これは「eval で品質を確認した」ことを意味しない（§16.5）。'
    );
  } else if (kr && kr.ok) {
    const covered = new Set(kr.verdict.coverage);
    const missing = [...new Set(referred.map((r) => r.target))].filter((t) => !covered.has(t));
    if (missing.length > 0) {
      violations.push(
        `keep-review: 回付された対象が coverage に無い（未判定を pass と読まない・§16.5）: ${missing.join(', ')}`
      );
    }
    // 条件単位の網羅（keep は C2/C4 の両方、merge は merge_target）。
    const judged = new Set(kr.verdict.findings.map((f) => `${f.target}::${f.condition}`));
    const missingCond = referred.filter((r) => !judged.has(`${r.target}::${r.condition}`));
    if (missingCond.length > 0) {
      violations.push(
        `keep-review: 条件単位で未判定がある（回付は条件ごと・§8.4）: ` +
          missingCond.map((m) => `${m.target}(${m.condition})`).join(', ')
      );
    }
  } else if (kr && !kr.ok) {
    // 軸ファイルが判定不能なら coverage 検査そのものが成立しない。ここで沈黙すると
    // 「回付されたのに誰も見ていない対象」が出力のどこにも現れなくなる（§16.5）。
    violations.push(
      `keep-review が判定不能のため、回付された ${referred.length} 件が全て未判定（未判定を pass と読まない・§16.5）: ` +
        referred.map((r) => `${r.target}(${r.condition})`).join(', ')
    );
  }

  // --- 集約（eval-report.md） ---
  const reportPath = path.join(oDir, 'eval-report.md');
  if (!existsSync(reportPath)) {
    violations.push('eval-report.md が存在しない（工程9 の集約成果物・§14）。');
  } else {
    const reportText = readFileSync(reportPath, 'utf8');
    if (reportText.trim() === '') {
      violations.push('eval-report.md が空。空を「違反なし」と読まない（§16.5）。');
    }
    for (const axis of axes) {
      if (!reportText.includes(axis)) {
        violations.push(`eval-report.md に軸 "${axis}" の記載が無い（集約漏れ）。`);
      }
    }
    // violation が集約で消えると P5/P7 の強制表示（§8.4）が成立しない。
    for (const f of forcedReview) {
      if (!reportText.includes(f.target)) {
        violations.push(
          `eval-report.md に violation の対象 "${f.target}"（${f.axis}）が現れない。` +
            `集約で違反が落ちると P5/P7 の強制表示が成立しない（§8.4）。`
        );
      }
    }
  }

  return { ok: violations.length === 0, violations, notes, referred, perAxis, forcedReview, undecided };
}

// ---------------------------------------------------------------------------
// CLI: npm run eval:report -- <ts>（省略時は work/.session-ts）
//
// 詳細設計書 §16.7・§16.8「eval ハーネスは CLI と npm test から回る」の実体。
// オーケストレータが工程9 の手順3（.claude/skills/canon/SKILL.md）でこれを実行し、
// eval-reviewer が集約せずに turn を終えた場合（§11.5 の vacuous pass）を検出する。
// ---------------------------------------------------------------------------

export function main(argv = process.argv.slice(2)) {
  const ts = argv[0] || readSessionTs();
  if (!ts) {
    process.stderr.write('使い方: npm run eval:report -- <ts>（work/.session-ts があれば省略可）\n');
    process.exitCode = 2;
    return;
  }
  const { ok, violations, notes } = checkEvalReport({ ts });
  process.stdout.write(`[eval:report] ts=${ts} ${ok ? 'OK' : 'NG'}\n`);
  for (const n of notes) process.stdout.write(`  注意: ${n}\n`);
  if (!ok) {
    for (const v of violations) process.stdout.write(`  違反: ${v}\n`);
    process.exitCode = 2;
  }
}

if (isMainModule(import.meta.url)) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`eval:report: ${err.message}\n`);
    process.exit(2);
  }
}
