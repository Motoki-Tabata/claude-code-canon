#!/usr/bin/env node
/**
 * G8 非退行（snapshot 系統・§11.2・§9.3）。SubagentStop@generation。
 *
 * design-map の disposition:keep について「維持ファイル全量が output に存在」かつ「対象原本と
 * output コピーが sha256 バイト同一」を照合する。維持は再生成せず verbatim コピーゆえ、退避スワップ
 * の全置換で消えないよう output に literal に存在しなければならない（§8.2）。retire/merge 被統合元は
 * output 非在かつ retired.list に明示（廃止の明示照合）。keep 0件を成功と誤認しない（§11.5）。
 *
 * disposition:modify かつ interface_change: none を宣言したレコードについて、対象原本と
 * output コピーの**対外インタフェース署名**（`gates/lib/interface-signature.js`・種別ごとに
 * frontmatter name／rules の paths:／md の見出し構造／JSON のトップレベルキー集合／
 * スクリプトの export 集合のいずれかを使う・S1-2）を実照合する（G2・design 段階では生成物が
 * 未存在で実照合できなかった宣言を、ここで工程をまたいで裏取りする・§11.2）。
 *
 * 【C3 との連鎖】`gates/g2_keep_judgement.js` の C3 実照合は「keep の依存先が modify されるなら
 * interface_change: none の宣言があること」を要求する。その宣言の実照合可能性は**ここ**
 * （G8・種別ごとの署名）に懸かっている。frontmatter を持たない対象への宣言を「検査不能=違反」に
 * していた旧実装では、この連鎖が両立不能の袋小路になっていた（S1-2・ライブ run
 * `20260910_220906` で実測: `.claude/settings.json` の C3 が依存先 `scope-guard.mjs` の宣言に
 * 依存し、宣言を残せば G8 が落ち、外せば C3 が崩れて keep にできなかった）。
 */

import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import {
  outputDir,
  isMainModule,
  readHookInput,
  readSessionTs,
  resolveTargetRoot,
  blockStop,
  passStop,
} from './lib/run.js';
import { parseExistingDisposition, DesignMapError } from './lib/design-map.js';
import { sha256File, readList } from './lib/managed-paths.js';
import { interfaceSignature } from './lib/interface-signature.js';

const GATE = 'G8';

export function checkG8({ ts }) {
  const violations = [];
  const dmPath = path.join(outputDir(ts), 'design-map.md');
  if (!existsSync(dmPath)) {
    return { ok: false, violations: [`${GATE}: design-map.md が存在しない（非退行照合の入力欠落・§9.2）。`] };
  }
  let records;
  try {
    records = parseExistingDisposition(readFileSync(dmPath, 'utf8'));
  } catch (e) {
    if (e instanceof DesignMapError) return { ok: false, violations: [`${GATE}: ${e.message}`] };
    throw e;
  }

  const genRoot = path.join(outputDir(ts), 'generated');
  const targetRoot = resolveTargetRoot(ts);
  const keeps = records.filter((r) => r.disposition === 'keep');
  const gone = records.filter((r) => r.disposition === 'retire' || r.disposition === 'merge');
  const modifiedInterfaceNone = records.filter(
    (r) => r.disposition === 'modify' && r.interface_change === 'none'
  );

  // keep: 全量 output 存在＋対象原本と sha256 バイト同一。
  for (const r of keeps) {
    const outCopy = path.join(genRoot, r.path);
    if (!existsSync(outCopy)) {
      violations.push(`${GATE}: keep "${r.path}" が output に存在しない（維持＝output に literal コピー必須・§8.2）。`);
      continue;
    }
    if (!targetRoot) {
      violations.push(`${GATE}: work/<ts>/target.txt が無く keep "${r.path}" の原本と sha256 照合できない。`);
      continue;
    }
    const origin = path.join(targetRoot, r.path);
    if (!existsSync(origin)) {
      violations.push(`${GATE}: keep "${r.path}" の対象原本が ${targetRoot} に無い（照合不能）。`);
      continue;
    }
    if (sha256File(origin) !== sha256File(outCopy)) {
      violations.push(`${GATE}: keep "${r.path}" が非退行違反（対象原本と output コピーが sha256 バイト同一でない）。`);
    }
  }

  // retire/merge: output 非在＋retired.list に明示（§9.3）。
  const retired = new Set(readList(path.join(outputDir(ts), '.deploy', 'retired.list')) ?? []);
  for (const r of gone) {
    if (existsSync(path.join(genRoot, r.path))) {
      violations.push(`${GATE}: ${r.disposition} "${r.path}" が output に残存している（除外されていない・§9.3）。`);
    }
    if (!retired.has(r.path)) {
      violations.push(`${GATE}: ${r.disposition} "${r.path}" が retired.list に明示されていない（廃止の明示照合・§9.3）。`);
    }
  }

  // modify かつ interface_change: none 宣言: 原本と output コピーの対外インタフェース署名を
  // 種別ごとに実照合する（G2 が design 段階で実照合できなかった宣言の裏取り・S1-2・§11.2）。
  const unverified = [];
  for (const r of modifiedInterfaceNone) {
    const outCopy = path.join(genRoot, r.path);
    if (!existsSync(outCopy)) {
      violations.push(`${GATE}: modify "${r.path}"（interface_change: none）が output に存在しない。`);
      continue;
    }
    if (!targetRoot) {
      violations.push(`${GATE}: work/<ts>/target.txt が無く modify "${r.path}" の原本と署名照合できない。`);
      continue;
    }
    const origin = path.join(targetRoot, r.path);
    if (!existsSync(origin)) {
      violations.push(`${GATE}: modify "${r.path}" の対象原本が ${targetRoot} に無い（照合不能）。`);
      continue;
    }
    const originSig = interfaceSignature(r.path, readFileSync(origin, 'utf8'));
    const outSig = interfaceSignature(r.path, readFileSync(outCopy, 'utf8'));
    if (!originSig.verifiable || !outSig.verifiable) {
      // 検査手段が無い種別は違反にせず「検査対象外」として名指しする（黙って通さない・§11.5）。
      unverified.push(`${r.path}（${originSig.kind}）`);
      continue;
    }
    if (originSig.signature !== outSig.signature) {
      violations.push(
        `${GATE}: modify "${r.path}" が interface_change: none を宣言しているが対外インタフェース署名` +
          `（${originSig.kind}）が変化している（宣言と矛盾）: ${originSig.signature} → ${outSig.signature}`
      );
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    keeps: keeps.length,
    gone: gone.length,
    unverified,
  };
}

export function check({ ts }) {
  const { ok, violations, unverified } = checkG8({ ts });
  // 検査手段が無い種別への interface_change: none 宣言は違反にしないが、黙って通さない
  // （§11.5）。gen-guard のバッチ実行では passStop の unverifiedNote は生きないため、
  // notes 経由で可視化する（gen-guard は skipped ゲートと同じ扱いで stderr へ出す）。
  const notes =
    unverified.length > 0
      ? [`G8: interface_change: none を宣言したが検査手段が無く実照合しなかった${unverified.length}件: ${unverified.join(', ')}`]
      : [];
  return { ok, violations, notes };
}

if (isMainModule(import.meta.url)) {
  readHookInput();
  const ts = readSessionTs();
  if (!ts) {
    passStop('G8: .session-ts 不在のため対象なし');
  } else {
    const r = checkG8({ ts });
    const unverifiedNote =
      r.unverified.length > 0
        ? ` / interface_change: none を宣言したが検査手段が無く実照合しなかった${r.unverified.length}件: ${r.unverified.join(', ')}`
        : '';
    if (r.ok) passStop(`G8: 通過（keep ${r.keeps}件 sha256 同一・廃止 ${r.gone}件 明示）${unverifiedNote}`);
    else blockStop(`G8: 違反を検出（${r.violations.length}件）${unverifiedNote}\n${r.violations.join('\n')}`);
  }
}
