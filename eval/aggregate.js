/**
 * eval/aggregate.js — 各軸の有効な verdict から `output/<ts>/eval-report.md` を決定論で組み立てる（詳細設計書 §16.6）。
 *
 * 以前は `eval-reviewer`（LLM）が5軸の verdict を読んで eval-report.md に書き写していた。集約は
 * 「1件も落とさず転記する」機械作業であり、LLM に任せると転記漏れ（violation の脱落）が起きうるうえ、
 * コーディネータを1体余計に起動して深さ2の中継を挟むコストがかかっていた。verdict は JSON で
 * 構造化済みなので、集約はコードで決定論に行う。**judge の判定内容は1文字も変えない**（rationale は
 * 全文を転記する）。eval/report.js の集約検査（軸名の記載・violation の対象名の記載）は、この出力が満たす。
 */

import { AXES, violationFindings } from './verdict.js';

/** 判定の由来（round N での判定か、前 round から引き継いだか）。 */
function origin(res, plan) {
  if (!plan) return `判定済み（round 1）`;
  if (res.carried) return `前 round（round ${plan.prev_round}）の判定を引き継ぎ（再判定していない）`;
  return `判定済み（round ${plan.round}・再判定）`;
}

/**
 * @param {{ ts: string, perAxis: Record<string, object>, referred: {target:string,condition:string}[],
 *           notes: string[], undecided: string[], plan: object|null }} input
 * @returns {string} eval-report.md の本文
 */
export function renderEvalReport({ ts, perAxis, referred, notes, undecided, plan }) {
  const out = [];
  const forced = [];
  for (const axis of AXES) {
    const r = perAxis[axis];
    if (r?.ok) for (const f of violationFindings(r.verdict)) forced.push({ axis, ...f });
  }

  out.push(`# eval-report（工程9・${ts}）`, '');
  out.push('> このファイルは各軸の判定（`output/<ts>/eval/<axis>.md` の json フェンス）から `npm run eval:report -- <ts> --write` が決定論で組み立てた。判定内容は変えていない。', '');

  out.push('## サマリ');
  out.push(`- 判定軸: ${AXES.join(' / ')}`);
  for (const axis of AXES) {
    const r = perAxis[axis];
    const state = !r ? '未判定' : r.ok ? origin(r, plan) : '**判定不能**（judge が判定できなかった・§16.4）';
    out.push(`  - ${axis}: ${state}`);
  }
  const referredTargets = [...new Set(referred.map((r) => r.target))];
  out.push(
    referred.length === 0
      ? '- 回付対象（keep×C2/C4・merge×統合先）: 0件（keep/merge が無い。これは「eval で品質を確認した」ことを意味しない・§16.5）'
      : `- 回付対象（keep×C2/C4・merge×統合先）: ${referredTargets.length}件（${referred.length}条件）`
  );
  out.push(`- violation: ${forced.length}件${undecided.length > 0 ? `（判定不能の軸: ${undecided.join(', ')}。**判定不能の軸の violation 0件を「違反なし」と読んではならない**）` : ''}`);
  if (plan) {
    out.push(`- round ${plan.round}: 再判定 ${plan.rejudge_axes.length ? plan.rejudge_axes.join(' / ') : 'なし'}・引き継ぎ ${plan.carry_axes.length ? plan.carry_axes.join(' / ') : 'なし'}（変更ファイル ${plan.changed.length}件・削除 ${plan.removed.length}件）`);
  }
  out.push('');

  out.push('## 要確認（P6+7 で人間が見る・§8.4）');
  if (forced.length === 0) {
    out.push(undecided.length > 0 ? '- （判定できた軸に violation は無い。ただし判定不能の軸がある）' : '- violation は無い');
  } else {
    for (const f of forced) {
      out.push(`- \`${f.target}\`（${f.axis} / ${f.condition ?? '-'} / confidence: ${f.confidence}）: ${f.rationale.replace(/\s*\n\s*/g, ' ')}`);
    }
  }
  out.push('');

  out.push('## 軸ごとの結果');
  for (const axis of AXES) {
    const r = perAxis[axis];
    out.push(`### ${axis}`);
    if (!r || !r.ok) {
      out.push(`- **判定不能**: ${(r?.violations ?? ['軸ファイルが無い']).join(' / ')}`, '');
      continue;
    }
    out.push(`- ${origin(r, plan)}`);
    out.push(`- coverage: ${r.verdict.coverage.length}件`);
    if (r.verdict.findings.length === 0) {
      out.push('- findings: なし（coverage を網羅して問題が見つからなかった。coverage が空なら「見ていない」）');
    } else {
      for (const f of r.verdict.findings) {
        out.push(`- [${f.verdict}] \`${f.target}\`（${f.condition ?? '-'} / ${f.confidence}）`);
        out.push(`  - rationale: ${f.rationale.replace(/\s*\n\s*/g, ' ')}`);
        if (f.evidence.length > 0) out.push(`  - evidence: ${f.evidence.join(' / ')}`);
      }
    }
    out.push('');
  }

  out.push('## eval が判定しなかったこと');
  out.push('決定論ゲートが既に真偽を出した項目（G3〜G13 の領分）。再判定していない。', '');

  if (notes.length > 0) {
    out.push('## 注意');
    for (const n of notes) out.push(`- ${n}`);
    out.push('');
  }
  return out.join('\n');
}
