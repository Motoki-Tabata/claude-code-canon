#!/usr/bin/env node
/**
 * G1 工程順・状態（stage 系統・§11.2）。SubagentStop@各リクエスト（investigation / requirements /
 * spec / design / generation の全ステージで発火・stage-guard.js と gen-guard.js の両方から呼ばれる）。
 *
 * 詳細設計書 §11.2 の内容列を、完了リクエストの5ステージへ次のように配分する。各項目が
 * どのステージの成果物を検査対象にするかは、成果物が実際にそのステージで書かれる
 * タイミング（§6.1〜§6.3・§7・§4.4）から一意に決まる:
 *
 *   - stage=investigation: focused 空欄違反／evidence_paths 実在
 *       （work/<ts>/project_profile.md ## focused・§6.2。調査は1段目と2段目の両方が
 *        同じ 'investigation' 完了リクエストを書く（§4.3 の既知の語彙に "investigation2"
 *        は無い）ため、"要件確定後か" を work/<ts>/requirements.md の有無で判別する。
 *        requirements.md が無い＝調査1＝focused が空でも正当。requirements.md が有る＝
 *        調査2＝focused が空なら違反）。
 *   - stage=requirements: requirements の enum（strength_needed・priority）
 *       （work/<ts>/requirements.md ## 確定要件・§6.3）
 *   - stage=spec: open_questions 残存
 *       （output/<ts>/spec.md §9 未決事項・§7）
 *   - stage=design: 承認サイドカーの存在＋approved_by（spec 側）
 *       （design-map.md 書込は spec.approved 前提で承認ガードが既に強制するが、G1 は
 *        権威再検証として構造を再確認する＝停止時点で改めて機械照合する）
 *   - stage=generation: 承認サイドカーの存在＋approved_by（design 側）
 *       （同様に generated/** 書込は design.approved 前提）
 *
 * 純関数。副作用（fs 書込・process.exit）なし。
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CANON_ROOT, posix } from './lib/canon.js';
import { violation } from './lib/artifact.js';
import {
  findHeading,
  sectionSlice,
  stripInlineComment,
  unwrapValue,
  parseBulletRecords,
  parseListLike,
  stripLineSuffix,
} from './lib/markdown.js';
import { workDir, outputDir, approvalPath, resolveTargetRoot } from './lib/run.js';

const GATE = 'G1';
const STRENGTH_VALUES = new Set(['advisory', 'deterministic', 'enforced']);
const PRIORITY_VALUES = new Set(['must', 'should', 'could']);

function rel(absPath) {
  return posix(path.relative(CANON_ROOT, absPath));
}

function isBlocking(v) {
  return (v.severity ?? 'error') === 'error';
}

function formatViolation(v) {
  return `${v.gate} ${v.path}: ${v.message} [出典: ${v.source}]`;
}

// 共通パーサ（stripInlineComment / unwrapValue / parseBulletRecords / parseListLike）は
// gates/lib/markdown.js の共有実装を使う。書式（章立て Markdown 内の入れ子リスト・§6.3）は
// G1 と eval の判定入力バンドル生成（§16.3）が共有するため、片方だけが仕様に追従する
// 単一障害点を避けて SSoT を1箇所に置く（lessons L005）。
// resolveTargetRoot は gates/lib/run.js の共有実装を使う（G1/G8 で SSoT・§6.2）。

// ---------------------------------------------------------------------------
// stage=investigation: focused 空欄違反／evidence_paths 実在
// ---------------------------------------------------------------------------

function checkInvestigationStage(ts) {
  const violations = [];
  const profilePath = path.join(workDir(ts), 'project_profile.md');
  if (!existsSync(profilePath)) {
    violations.push(
      violation(GATE, rel(profilePath), 'work/<ts>/project_profile.md が存在しない（調査工程の成果物欠落）。', '§6.2')
    );
    return violations;
  }

  const requirementsPath = path.join(workDir(ts), 'requirements.md');
  const requirementsConfirmed = existsSync(requirementsPath);
  if (!requirementsConfirmed) {
    // 調査1（要件確定前）。focused は空であることが正当（§6.2: 調査2・要件確定後にのみ追記）。
    return violations;
  }

  const lines = readFileSync(profilePath, 'utf8').split(/\r?\n/);
  const h = findHeading(lines, 'focused');
  if (h === -1) {
    violations.push(
      violation(
        GATE,
        rel(profilePath),
        '要件確定後（work/<ts>/requirements.md 存在）のはずが ## focused セクションが無い（focused 空欄違反）。',
        '§6.2'
      )
    );
    return violations;
  }

  const { start, end } = sectionSlice(lines, h);
  const bodyLines = lines.slice(start + 1, end);
  const body = bodyLines.join('\n');

  // findings: キーの行から、次のトップレベルキー（インデント無しで "word:" 形）または
  // セクション終端までを findings ブロックとみなし、その中に bullet 項目があるか判定する。
  const findingsLineIdx = bodyLines.findIndex((l) => /^\s*findings\s*:/.test(l));
  let hasFindingItem = false;
  if (findingsLineIdx !== -1) {
    for (let i = findingsLineIdx + 1; i < bodyLines.length; i++) {
      const l = bodyLines[i];
      if (/^[A-Za-z_][\w-]*\s*:/.test(l)) break; // 次のトップレベルキーでブロック終端
      if (/^\s*-\s+\S/.test(l)) {
        hasFindingItem = true;
        break;
      }
    }
  }

  if (!hasFindingItem) {
    violations.push(
      violation(
        GATE,
        rel(profilePath),
        '## focused の findings が空（要件確定後にもかかわらず深掘り結果が無い＝focused 空欄違反）。',
        '§6.2'
      )
    );
  }

  const targetRoot = resolveTargetRoot(ts);
  const evRe = /evidence_paths\s*:\s*(.+)/g;
  let m2;
  const checkedAny = { value: false };
  while ((m2 = evRe.exec(body)) !== null) {
    const items = parseListLike(m2[1]);
    for (const item of items) {
      checkedAny.value = true;
      if (!targetRoot) continue;
      const resolved = path.resolve(targetRoot, stripLineSuffix(item));
      if (!existsSync(resolved)) {
        violations.push(
          violation(
            GATE,
            rel(profilePath),
            `evidence_paths "${item}" が対象リポジトリ（${posix(targetRoot)}）に実在しない（幻覚防止・§6.2）。`,
            '§6.2'
          )
        );
      }
    }
  }
  if (checkedAny.value && !targetRoot) {
    violations.push(
      violation(
        GATE,
        rel(path.join(workDir(ts), 'target.txt')),
        'evidence_paths が記載されているが work/<ts>/target.txt が無く実在照合できない。',
        '§5.1・§6.2'
      )
    );
  }

  return violations;
}

// ---------------------------------------------------------------------------
// stage=requirements: requirements の enum（strength_needed・priority）
// ---------------------------------------------------------------------------

function checkRequirementsStage(ts) {
  const violations = [];
  const reqPath = path.join(workDir(ts), 'requirements.md');
  if (!existsSync(reqPath)) {
    violations.push(violation(GATE, rel(reqPath), 'work/<ts>/requirements.md が存在しない（工程2成果物欠落）。', '§6.3'));
    return violations;
  }

  const lines = readFileSync(reqPath, 'utf8').split(/\r?\n/);
  const h = findHeading(lines, '確定要件');
  if (h === -1) {
    violations.push(violation(GATE, rel(reqPath), '## 確定要件 セクションが見つからない。', '§6.3'));
    return violations;
  }
  const { start, end } = sectionSlice(lines, h);
  const records = parseBulletRecords(lines, start + 1, end);

  if (records.length === 0) {
    violations.push(violation(GATE, rel(reqPath), '## 確定要件 に1件もレコードが無い（要件0件は work/<ts>/requirements.md として不正）。', '§6.3'));
    return violations;
  }

  for (const r of records) {
    const id = r.fields.id || `(id欠落・${r.line}行目)`;
    const strength = r.fields.strength_needed;
    const priority = r.fields.priority;
    if (!strength || !STRENGTH_VALUES.has(strength)) {
      violations.push(
        violation(
          GATE,
          rel(reqPath),
          `要件 ${id}（${r.line}行目）の strength_needed が enum {advisory|deterministic|enforced} に無い（実際: ${JSON.stringify(strength)}）。`,
          '§6.3'
        )
      );
    }
    if (!priority || !PRIORITY_VALUES.has(priority)) {
      violations.push(
        violation(
          GATE,
          rel(reqPath),
          `要件 ${id}（${r.line}行目）の priority が enum {must|should|could} に無い（実際: ${JSON.stringify(priority)}）。`,
          '§6.3'
        )
      );
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// stage=spec: open_questions 残存（§9 未決事項）
// ---------------------------------------------------------------------------

function checkSpecStage(ts) {
  const violations = [];
  const specPath = path.join(outputDir(ts), 'spec.md');
  if (!existsSync(specPath)) {
    violations.push(violation(GATE, rel(specPath), 'output/<ts>/spec.md が存在しない（工程4成果物欠落）。', '§7'));
    return violations;
  }
  const lines = readFileSync(specPath, 'utf8').split(/\r?\n/);
  const h = findHeading(lines, '未決事項');
  if (h === -1) {
    violations.push(
      violation(GATE, rel(specPath), '§9 未決事項 セクションが見つからない（spec テンプレート §7 §9 不備）。', '§7')
    );
    return violations;
  }
  const { start, end } = sectionSlice(lines, h);
  const bodyLines = lines.slice(start + 1, end);
  const openItems = bodyLines.filter((l) => /^\s*-\s+\S/.test(l));
  if (openItems.length > 0) {
    violations.push(
      violation(
        GATE,
        rel(specPath),
        `§9 未決事項が${openItems.length}件残存している（空でなければ次工程へ進めない・§7）。`,
        '§7'
      )
    );
  }
  return violations;
}

// ---------------------------------------------------------------------------
// stage=design / generation: 承認サイドカーの存在＋approved_by
// ---------------------------------------------------------------------------

function checkApprovalSidecar(ts, kind) {
  const violations = [];
  const p = approvalPath(ts, kind);
  if (!existsSync(p)) {
    violations.push(
      violation(
        GATE,
        rel(p),
        `承認サイドカー .gate/approvals/${kind}.approved が存在しない（${kind === 'spec' ? 'design' : 'generation'} 工程はこの承認を前提とする）。`,
        '§4.4・§7 §0メタ・§9.2'
      )
    );
    return violations;
  }
  let data;
  try {
    data = JSON.parse(readFileSync(p, 'utf8'));
  } catch (err) {
    violations.push(violation(GATE, rel(p), `${kind}.approved が正当な JSON として解析できない: ${err.message}`, '§4.4'));
    return violations;
  }
  if (!data.approved_by || typeof data.approved_by !== 'string' || data.approved_by.trim() === '') {
    violations.push(
      violation(GATE, rel(p), `${kind}.approved に approved_by（承認者）が記録されていない（監査不能）。`, '§4.4・tools/approve.js')
    );
  }
  return violations;
}

// ---------------------------------------------------------------------------
// エントリポイント
// ---------------------------------------------------------------------------

/** 構造化版（テスト・再利用向け）。violation() 形の配列を返す。 */
export function checkG1({ ts, stage }) {
  let violations;
  switch (stage) {
    case 'investigation':
      violations = checkInvestigationStage(ts);
      break;
    case 'requirements':
      violations = checkRequirementsStage(ts);
      break;
    case 'spec':
      violations = checkSpecStage(ts);
      break;
    case 'design':
      violations = checkApprovalSidecar(ts, 'spec');
      break;
    case 'generation':
      violations = checkApprovalSidecar(ts, 'design');
      break;
    default:
      violations = [
        violation(GATE, `work/${ts}/.requests/${stage}`, `未知のステージ "${stage}" のため G1 の検査項目を決定できない。`, '§11.2 G1・§4.3'),
      ];
  }
  const blocking = violations.filter(isBlocking);
  return { ok: blocking.length === 0, violations, blocking };
}

/** stage-guard.js / gen-guard.js が期待する { ok, violations: string[] } 形。 */
export function check({ ts, stage }) {
  const { blocking } = checkG1({ ts, stage });
  return { ok: blocking.length === 0, violations: blocking.map(formatViolation) };
}
