/**
 * V7 keep（artifacts.md §8.2・§6.3）。
 *
 * 全量スナップショット方式では、keep（変えない判断）は差分に出ないので人間が気づけない。そこで keep に
 * 事実照合できる条件をすべて機械で課し、modify・retire・merge の宣言も生成物の実体と突き合わせる。
 *
 * 検査内容（design-map の existing_disposition・investigation・対象の原本を読む）:
 *   1. 非回帰: keep のファイルがすべて generated/ にあり、対象の原本と sha256 が一致する。
 *   2. 廃止の明示: retire と merge の統合元が generated/ に無く、`deploy/retired.list` に載り、
 *      `manifest_note` が空でない。
 *   3. keep の宣言: `keep_conditions` の K1〜K5 がすべて true と宣言されている。
 *   4. K1: keep の原本について、existing.md の `canon_conformance` が clean。
 *   5. K3: keep の原本の `customization_refs` の参照先が retire・merge になっていない。modify なら
 *      そのレコードが `interface_change: none` を宣言している。`interface_change` の値が none・breaking
 *      以外のもの、retire・merge のレコードに書いたものも違反。
 *   6. K5: keep の原本の `project_refs` がすべて focused.md の `ref_resolution` で `resolved: true`。
 *      エントリが無い**具体的なパス**だけは対象のルートからの実在で確かめる。`resolved: false`・glob・
 *      まとめ書きの参照は実在確認で代えない。
 *   7. interface の照合: modify で `interface_change: none` を宣言したレコードは、原本と generated/ の
 *      対外インタフェースの署名が一致する（`lib/interface-signature.js`）。署名を取れない種別への
 *      `none` 宣言は違反（宣言と強制がずれることを許さない）。
 *   8. 対象なし: new モードは existing_disposition が空であるべきで、V7 は「対象なし」になる。
 *      refactor モードで existing_disposition が読めない・0件のときは違反。
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseExistingDisposition, DesignMapError, DISPOSITION_VALUES } from '../../../../../lib/design-map.js';
import { parseExisting, parseFocused, isCanonClean } from '../../../../../lib/investigation.js';
import { sha256File, hasGlobMeta } from '../../../../../lib/managed-paths.js';
import { interfaceSignature } from '../../../../../lib/interface-signature.js';
import { MODES } from '../../../../../lib/handoff.js';

const CHECK = 'V7';
const KEEP_CONDITIONS = ['K1', 'K2', 'K3', 'K4', 'K5'];
const INTERFACE_CHANGE_VALUES = ['none', 'breaking'];

/** 実在確認で代えてよい「具体的な1パス」か（glob・まとめ書き・空白入りの散文は不可）。 */
function isConcretePath(value) {
  return value !== '' && !hasGlobMeta(value) && !/[,、\s]/.test(value);
}

/** existing_disposition を読む。new モードの「対象なし」と refactor モードの違反をここで分ける。 */
function loadRecords(ctx, violations) {
  const mode = ctx.handoff?.mode;
  if (!MODES.includes(mode)) {
    violations.push(`${CHECK}: handoff.md の mode が new・refactor のいずれでもない（${mode ?? '未記入'}）。keep の検査対象を決められない。`);
    return null;
  }
  if (ctx.designMapText === null) {
    violations.push(`${CHECK}: output/<ts>/design-map.md が無い（keep 検査の入力欠落）。`);
    return null;
  }
  let records;
  try {
    records = parseExistingDisposition(ctx.designMapText);
  } catch (e) {
    if (!(e instanceof DesignMapError)) throw e;
    if (mode === 'new') return [];
    violations.push(`${CHECK}: refactor モードなのに existing_disposition を読めない: ${e.message}`);
    return null;
  }
  if (mode === 'new' && records.length > 0) {
    violations.push(`${CHECK}: new モードなのに existing_disposition に ${records.length} 件のレコードがある（new モードでは空であるべき）。`);
  }
  return records;
}

/** disposition が語彙（DISPOSITION_VALUES）に無い・未記入のレコードを違反にする（typo は他の検査から黙って外れる）。 */
function checkDispositionValues(records, violations) {
  for (const r of records) {
    if (DISPOSITION_VALUES.includes(r.disposition)) continue;
    violations.push(
      `${CHECK}: "${r.path}" の disposition が${r.disposition === null ? '未記入（null）' : ` "${r.disposition}"`}で、` +
        `語彙（${DISPOSITION_VALUES.join('・')}）に無い（keep・retire 等の検査から外れて黙って通ってしまう）。`
    );
  }
}

/** 原本と generated/ の両方が揃っているかを確かめ、揃っていれば両方の絶対パスを返す。 */
function locatePair(ctx, r, label, violations) {
  const file = ctx.byRel.get(r.path);
  if (!file) {
    violations.push(`${CHECK}: ${label} "${r.path}" が generated/ に存在しない。`);
    return null;
  }
  if (!ctx.targetRoot) {
    violations.push(`${CHECK}: handoff.md の target が無く、${label} "${r.path}" の原本と照合できない。`);
    return null;
  }
  const origin = path.join(ctx.targetRoot, r.path);
  if (!existsSync(origin)) {
    violations.push(`${CHECK}: ${label} "${r.path}" の原本が対象（${ctx.targetRoot}）に無い（照合不能）。`);
    return null;
  }
  return { origin, outBytes: file.bytes, outText: file.text };
}

/** 1. 非回帰。 */
function checkNonRegression(ctx, keeps, violations) {
  for (const r of keeps) {
    const pair = locatePair(ctx, r, 'keep', violations);
    if (pair && sha256File(pair.origin) !== createHash('sha256').update(pair.outBytes).digest('hex')) {
      violations.push(`${CHECK}: keep "${r.path}" が原本と sha256 で一致しない（keep は verbatim コピーでなければならない）。`);
    }
  }
}

/** 2. 廃止の明示。 */
function checkRetirements(ctx, gone, violations) {
  if (gone.length > 0 && ctx.lists.retired === null) {
    violations.push(`${CHECK}: retire・merge が ${gone.length} 件あるのに output/<ts>/deploy/retired.list が無い。`);
  }
  const retired = new Set(ctx.lists.retired ?? []);
  for (const r of gone) {
    if (ctx.byRel.has(r.path)) {
      violations.push(`${CHECK}: ${r.disposition} "${r.path}" が generated/ に残っている（廃止したのに除外されていない）。`);
    }
    if (ctx.lists.retired !== null && !retired.has(r.path)) {
      violations.push(`${CHECK}: ${r.disposition} "${r.path}" が retired.list に載っていない（廃止の明示）。`);
    }
    if (!r.manifest_note || r.manifest_note.trim() === '') {
      violations.push(`${CHECK}: ${r.disposition} "${r.path}" に manifest_note が無い（MANIFEST で廃止の理由を示せない）。`);
    }
  }
}

/** 3. keep の宣言。 */
function checkKeepDeclarations(keeps, violations) {
  for (const r of keeps) {
    const kc = r.keep_conditions ?? {};
    const bad = KEEP_CONDITIONS.filter((k) => kc[k] !== true);
    if (bad.length > 0) {
      violations.push(
        `${CHECK}: keep "${r.path}" の keep_conditions で ${bad.join('・')} が true と宣言されていない` +
          '（K1〜K5 が1つでも欠ければ keep にできない・artifacts.md §6.3）。'
      );
    }
  }
}

/** 4〜6. K1・K3・K5 の事実照合。 */
function checkKeepFacts(ctx, records, keeps, violations) {
  if (keeps.length === 0) return;
  if (ctx.existingText === null) {
    violations.push(`${CHECK}: keep が ${keeps.length} 件あるのに work/<ts>/investigation/existing.md が無い（K1・K3・K5 を照合できない）。`);
    return;
  }
  const existing = parseExisting(ctx.existingText);
  const resolution = ctx.focusedText === null ? new Map() : parseFocused(ctx.focusedText);
  const byPath = new Map(records.map((r) => [r.path, r]));

  for (const r of keeps) {
    const rec = existing.get(r.path);
    if (!rec) {
      violations.push(`${CHECK}: keep "${r.path}" のレコードが existing.md に無い（K1・K3・K5 を照合できない）。`);
      continue;
    }

    // K1
    if (!isCanonClean(rec.canon_conformance)) {
      violations.push(
        `${CHECK}: keep "${r.path}" は K1 を満たさない（existing.md の canon_conformance が clean でない: ` +
          `${JSON.stringify(rec.canon_conformance)}）。`
      );
    }

    // K3
    for (const ref of rec.customization_refs) {
      const dep = byPath.get(ref);
      if (!dep) continue; // 今回の design-map で扱わない参照先は変わらない
      if (dep.disposition === 'retire' || dep.disposition === 'merge') {
        violations.push(`${CHECK}: keep "${r.path}" は K3 を満たさない（参照先 "${ref}" が ${dep.disposition} になり実体が消える）。`);
      } else if (dep.disposition === 'modify' && dep.interface_change !== 'none') {
        violations.push(
          `${CHECK}: keep "${r.path}" は K3 を満たさない（参照先 "${ref}" が modify だが interface_change: none を宣言していない）。`
        );
      }
    }

    // K5
    for (const { value } of rec.project_refs) {
      if (resolution.has(value)) {
        if (resolution.get(value) !== true) {
          violations.push(`${CHECK}: keep "${r.path}" は K5 を満たさない（project_refs "${value}" が ref_resolution で resolved: false）。`);
        }
        continue;
      }
      if (isConcretePath(value) && ctx.targetRoot && existsSync(path.join(ctx.targetRoot, value))) continue;
      violations.push(
        `${CHECK}: keep "${r.path}" は K5 を満たさない（project_refs "${value}" が focused.md の ref_resolution に無く、` +
          '具体的なパスとして対象に実在することも確かめられない）。'
      );
    }
  }
}

/** 5 の後半（interface_change の値と置き場所）と 7（署名の照合）。 */
function checkInterfaceChange(ctx, records, violations) {
  for (const r of records) {
    if (r.interface_change === null) continue;
    if (!INTERFACE_CHANGE_VALUES.includes(r.interface_change)) {
      violations.push(`${CHECK}: "${r.path}" の interface_change の値 "${r.interface_change}" は none・breaking のいずれでもない。`);
      continue;
    }
    if (r.disposition === 'retire' || r.disposition === 'merge') {
      violations.push(`${CHECK}: ${r.disposition} "${r.path}" に interface_change が書かれている（実体が消えるので意味を持たない）。`);
      continue;
    }
    if (r.disposition !== 'modify' || r.interface_change !== 'none') continue;

    const pair = locatePair(ctx, r, 'modify（interface_change: none）', violations);
    if (!pair) continue;
    const originSig = interfaceSignature(r.path, readFileSync(pair.origin, 'utf8'));
    const outSig = interfaceSignature(r.path, pair.outText);
    if (!originSig.verifiable || !outSig.verifiable) {
      violations.push(
        `${CHECK}: modify "${r.path}" が interface_change: none を宣言しているが、この種別（${originSig.kind}）には` +
          '対外インタフェースの署名が無く照合できない（宣言を強制できないので breaking とすること）。'
      );
      continue;
    }
    if (originSig.signature !== outSig.signature) {
      violations.push(
        `${CHECK}: modify "${r.path}" が interface_change: none を宣言しているが対外インタフェース署名` +
          `（${originSig.kind}）が変化している: ${originSig.signature} → ${outSig.signature}`
      );
    }
  }
}

/** verify のコンテキストに V7 を当てる。 */
export function checkV7(ctx) {
  const violations = [];
  const records = loadRecords(ctx, violations);
  if (records === null) return { violations, warnings: [], checked: 0 };
  if (records.length === 0 && ctx.handoff.mode === 'new') {
    return { violations, warnings: [], checked: 0, na: 'new モード（existing_disposition が空）' };
  }

  checkDispositionValues(records, violations);
  const keeps = records.filter((r) => r.disposition === 'keep');
  const gone = records.filter((r) => r.disposition === 'retire' || r.disposition === 'merge');
  checkNonRegression(ctx, keeps, violations);
  checkRetirements(ctx, gone, violations);
  checkKeepDeclarations(keeps, violations);
  checkKeepFacts(ctx, records, keeps, violations);
  checkInterfaceChange(ctx, records, violations);
  return { violations, warnings: [], checked: records.length };
}
