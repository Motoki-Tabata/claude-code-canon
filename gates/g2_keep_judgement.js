#!/usr/bin/env node
/**
 * G2 維持判定妥当性（stage 系統・§11.2・§8.2）。SubagentStop@design。
 *
 * keep 全レコードで keep_conditions C1〜C5 を検証する:
 *   実照合  C1（系統A canon_conformance clean）・C3（keep の依存先が同 design-map で
 *           retire/merge されない、または modify かつ interface_change: none 宣言）・
 *           C5（project_refs が系統B ref_resolution で resolved）
 *   形式検査 C2・C4（design-map の boolean true 宣言のみ確認。意味的妥当性は eval 工程9 へ回付・§8.4）
 * retire/merge は manifest_note 非空を照合。interface_change の宣言は G8（generation 段階）が
 * frontmatter name 同一性で実照合する（design 段階は生成物が未存在で実照合できないため・§11.2）。
 * keep 0件・design-map 不在を成功と誤認しない（§11.5）。
 */

import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import {
  outputDir,
  workDir,
  isMainModule,
  readHookInput,
  readSessionTs,
  blockStop,
  passStop,
} from './lib/run.js';
import { parseExistingDisposition, DesignMapError, DISPOSITION_VALUES } from './lib/design-map.js';
import { parseSystemA, parseSystemB, isCanonClean } from './lib/investigation.js';
import { isManaged } from './lib/managed-paths.js';

const GATE = 'G2';
// keep の依存先がこの disposition なら常に C3 違反（実体が消えるため依存は現に壊れる）。
const BREAKING_DISPOSITIONS = new Set(['retire', 'merge']);
// interface_change の値語彙（modify レコードのみ有効）。
const INTERFACE_CHANGE_VALUES = new Set(['none', 'breaking']);

export function checkG2({ ts }) {
  const violations = [];
  const dmPath = path.join(outputDir(ts), 'design-map.md');
  if (!existsSync(dmPath)) {
    return { ok: false, violations: [`${GATE}: design-map.md が存在しない（維持判定の入力欠落・§9.2）。`] };
  }
  let records;
  try {
    records = parseExistingDisposition(readFileSync(dmPath, 'utf8'));
  } catch (e) {
    if (e instanceof DesignMapError) return { ok: false, violations: [`${GATE}: ${e.message}`] };
    throw e;
  }

  const recordsByPath = new Map(records.map((r) => [r.path, r]));

  const sysAPath = path.join(workDir(ts), 'existing_customizations.md');
  const sysBPath = path.join(workDir(ts), 'project_profile.md');
  const sysA = existsSync(sysAPath) ? parseSystemA(readFileSync(sysAPath, 'utf8')) : new Map();
  const sysB = existsSync(sysBPath) ? parseSystemB(readFileSync(sysBPath, 'utf8')) : new Map();

  const keeps = records.filter((r) => r.disposition === 'keep');

  // keep 0件を「keep に値するものが無かった」と機械的に区別する（S1-1 推奨③）。
  // 系統A が0件（ファイル不在／パース失敗）なのに design-map に modify/retire/merge の
  // レコードがある（＝既存改修モードで対象実体は存在する）なら、keep が「選ばれなかった」の
  // ではなく「機構的に選べなかった」可能性がある。keep を選ばなければこのガードは元々何も
  // 言わない（vacuous pass）ので、ここで名指しする。
  if (keeps.length === 0 && sysA.size === 0) {
    const nonGreenfield = records.some((r) => r.disposition && r.disposition !== 'keep');
    if (nonGreenfield) {
      violations.push(
        `${GATE}: keep が0件で、系統A（existing_customizations.md）のレコードも0件（不在または` +
          'パース失敗）。既存改修モード（modify/retire/merge のレコードが存在する）で keep 対象が' +
          '本当に無かったのか、系統Aの `- path:` 見出しが壊れていて keep が機構的に選べなかったのか' +
          'を区別できない（S1-1）。`work/<ts>/existing_customizations.md` の見出し書式を確認すること。'
      );
    }
  }

  for (const r of keeps) {
    const kc = r.keep_conditions;
    if (!kc) {
      violations.push(`${GATE}: keep "${r.path}" に keep_conditions が無い（5条件の明示が必須・§8.2）。`);
      continue;
    }
    // 形式検査: C1〜C5 の boolean が全て true 宣言か（1つでも false なら keep 不可）。
    for (const c of ['C1', 'C2', 'C3', 'C4', 'C5']) {
      if (kc[c] !== true) {
        violations.push(
          `${GATE}: keep "${r.path}" の keep_conditions ${c} が true 宣言でない（1つでも false なら keep 不可・§8.2）。` +
            ` 形式: \`${c}_<name>: true|false\`（行末インラインコメント \`# …\` は可）。値が読めない場合は書式を確認。`
        );
      }
    }
    // 実照合には系統A の該当レコードが要る。
    const a = sysA.get(r.path);
    if (!a) {
      violations.push(
        `${GATE}: keep "${r.path}" が系統A（existing_customizations.md）に無く C1/C3/C5 を実照合できない。`
      );
      continue;
    }
    // C1 実照合: canon_conformance clean。
    if (!isCanonClean(a.canon_conformance)) {
      violations.push(`${GATE}: keep "${r.path}" の C1 実照合失敗（系統A canon_conformance が clean でない）。`);
    }
    // C3 実照合: retire/merge の依存先は常に違反。modify の依存先は
    // interface_change: none の宣言があれば健全とみなす（宣言の実照合は G8・generation 段階が担う）。
    for (const ref of a.customization_refs) {
      const dep = recordsByPath.get(ref);
      const d = dep?.disposition;
      if (BREAKING_DISPOSITIONS.has(d)) {
        violations.push(`${GATE}: keep "${r.path}" の C3 実照合失敗（依存先 "${ref}" が同 design-map で ${d} される）。`);
      } else if (d === 'modify' && dep.interface_change !== 'none') {
        violations.push(
          `${GATE}: keep "${r.path}" の C3 実照合失敗（依存先 "${ref}" が modify されるが interface_change: none の宣言が無い。` +
            `対外インタフェースを変えない modify なら design-map に \`interface_change: none\` を明記すること・§11.2）。` +
            // C3 の成立（この宣言）は、G8（generation 段階）が種別ごとの対外インタフェース署名で
            // 実照合できるかに懸かっている（`gates/lib/interface-signature.js`・S1-2）。design 段階の
            // この時点では生成物が未存在のため実照合できず、宣言の有無だけを見る。
            ' 宣言の実照合は G8（generation 段階）が種別ごとの対外インタフェース署名で行う（S1-2）。'
        );
      }
    }
    // C5 実照合: project_refs が系統B で resolved。
    for (const pr of a.project_refs) {
      if (sysB.get(pr.value) !== true) {
        violations.push(`${GATE}: keep "${r.path}" の C5 実照合失敗（project_ref "${pr.value}" が対象リポジトリで未解決）。`);
      }
    }
  }

  // disposition の値語彙契約（S3-2）: keep/modify/merge/retire/out_of_scope 以外は不正値。
  // 旧実装は語彙検査そのものを持たず、契約外の値（designer が独自に発明した値等）が
  // 静かに受理されていた（ライブ run `20260910_220906` で実例あり）。
  for (const r of records) {
    if (!DISPOSITION_VALUES.includes(r.disposition)) {
      violations.push(
        `${GATE}: "${r.path}" の disposition が不正値 "${r.disposition}"（許可: ${DISPOSITION_VALUES.join('|')}）。`
      );
    }
  }

  // out_of_scope は「canon の管理集合外」が条件（§8.1）。管理集合内のパスに付けて
  // retire/keep/modify の代わりに使うことを禁じる（管理対象を静かに素通りさせない）。
  for (const r of records) {
    if (r.disposition === 'out_of_scope' && isManaged(r.path)) {
      violations.push(
        `${GATE}: "${r.path}" は canon の管理集合内（isManaged）なのに disposition が out_of_scope。` +
          'out_of_scope は管理集合外の実体専用（§8.1）。管理対象なら keep/modify/merge/retire のいずれかにすること。'
      );
    }
  }

  // retire/merge/out_of_scope の manifest_note 明示照合（§8.1）。out_of_scope も
  // 「なぜ canon の管理対象外か」を明示させる（黙って触れないだけでは判断の跡が残らない）。
  const NOTE_REQUIRED = new Set(['retire', 'merge', 'out_of_scope']);
  for (const r of records) {
    if (NOTE_REQUIRED.has(r.disposition) && !r.manifest_note) {
      violations.push(`${GATE}: ${r.disposition} "${r.path}" に manifest_note が無い（廃止/統合/対象外の明示が必須・§8.1）。`);
    }
  }

  // interface_change の値語彙契約（§6.2）: modify 以外への宣言・不正値は違反。
  for (const r of records) {
    if (r.interface_change === null) continue;
    if (r.disposition !== 'modify') {
      violations.push(
        `${GATE}: ${r.disposition} "${r.path}" に interface_change の宣言がある（modify レコードにのみ意味を持つ・§9.2）。`
      );
      continue;
    }
    if (!INTERFACE_CHANGE_VALUES.has(r.interface_change)) {
      violations.push(
        `${GATE}: modify "${r.path}" の interface_change が不正値 "${r.interface_change}"（none|breaking のみ有効・§9.2）。`
      );
    }
  }

  return { ok: violations.length === 0, violations, scanned: records.length, keeps: keeps.length };
}

export function check({ ts }) {
  const { ok, violations } = checkG2({ ts });
  return { ok, violations };
}

if (isMainModule(import.meta.url)) {
  readHookInput();
  const ts = readSessionTs();
  if (!ts) {
    passStop('G2: .session-ts 不在のため対象なし');
  } else {
    const r = checkG2({ ts });
    if (r.ok) passStop(`G2: 通過（keep ${r.keeps}件・維持5条件 C1〜C5 実照合＋形式検査）`);
    else blockStop(`G2: 違反を検出（${r.violations.length}件）\n${r.violations.join('\n')}`);
  }
}
