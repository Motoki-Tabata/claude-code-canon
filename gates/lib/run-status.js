/**
 * run の現在地の判定（`/canon resume <ts>` の材料）。
 *
 * /canon は4セッションに分けて実行する（S1 工程1-4 / S2 工程5-6 / S3 工程7-9 / S4 工程10）。
 * 別セッションから run を再開するとき、会話履歴は引き継がれない。現在地は**ディスク上の成果物・
 * 決定論ゲートが鋳造した完了マーカー・ブロックラッチ**から導く（会話にも state.md にも依存しない）。
 *
 * 【state.md の扱い】人間ゲートの対話承認は `work/<ts>/state.md` に記録される（tools/record-state.js）。
 * state.md は LLM が書ける記録なので、**ゲートの通過判定には使わない**（それはマーカーの役目）。
 * ここでは「人間の返事待ちか」という**待ち状態の判定にだけ**使う。承認は「承認対象の成果物
 * （マーカー等）の鋳造時刻以降に記録されたもの」だけが有効——差し戻しで成果物を作り直したのに
 * 古い承認が残って待ちを飛ばす事故を防ぐ。
 *
 * 純粋寄りの関数（fs 読取のみ・副作用なし）。tests/run_status.test.js が判定表の各行を検証する。
 */

import path from 'node:path';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { CANON_ROOT, posix } from './canon.js';
import { listCandidates, candidateDir } from './generations.js';
import {
  workDir,
  outputDir,
  markersDir,
  blocksDir,
  markerPath,
  hasMarker,
  listRequests,
  investigationMarkerKey,
  resolveTargetRoot,
} from './run.js';

/** 人間ゲート（承認の記録を待つもの）。P1・P3 は報告のみで停止しないので含めない。 */
export const APPROVAL_GATES = ['P2', 'P4', 'P5', 'P6+7', 'P8'];

export const EVAL_AXES = ['correctness', 'security', 'canon', 'context', 'keep-review'];

export function stateFilePath(ts) {
  return path.join(workDir(ts), 'state.md');
}

// `- P4 | 2026-09-24T10:00:00.000Z | 要旨` / `- 差し戻し P4 | … | 要旨`
const RECORD_RE = /^-\s*(差し戻し\s+)?(P\d(?:\+\d)?)\s*\|\s*([^|]+?)\s*\|\s*(.*)$/;

/** state.md の本文を記録の配列（出現順）にする。書式外の行は読み飛ばす。 */
export function parseStateRecords(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = RECORD_RE.exec(line.trim());
    if (!m) continue;
    const at = Date.parse(m[3]);
    if (Number.isNaN(at)) continue; // 時刻が読めない記録は根拠にしない
    out.push({ kind: m[1] ? 'revision' : 'approval', gate: m[2], at, summary: m[4] });
  }
  return out;
}

function readRecords(ts) {
  const p = stateFilePath(ts);
  return existsSync(p) ? parseStateRecords(readFileSync(p, 'utf8')) : [];
}

const mtime = (p) => (existsSync(p) ? statSync(p).mtimeMs : null);

/** 承認対象の成果物の確定時刻（この時刻より前の承認は、作り直される前のものなので無効）。 */
export function gateReferenceMtime(ts, gate) {
  switch (gate) {
    case 'P2':
      return mtime(markerPath(ts, 'requirements'));
    case 'P4':
      return mtime(markerPath(ts, 'spec'));
    case 'P5':
      return mtime(markerPath(ts, 'design'));
    case 'P6+7': {
      const times = [mtime(markerPath(ts, 'generation')), mtime(path.join(outputDir(ts), 'eval-report.md'))].filter((t) => t !== null);
      return times.length ? Math.max(...times) : null;
    }
    case 'P8':
      return mtime(path.join(outputDir(ts), '.deploy', 'pre-deploy-report.txt'));
    default:
      return null;
  }
}

/**
 * 人間ゲートが承認済みか。そのゲートの**最後の記録**が承認で、かつ承認対象の成果物の確定より後に
 * 記録されている場合だけ true（最後の記録が差し戻しなら false・対象が未確定なら false）。
 */
export function gateApproved(ts, gate) {
  const last = readRecords(ts).filter((r) => r.gate === gate).pop();
  if (!last || last.kind !== 'approval') return false;
  const ref = gateReferenceMtime(ts, gate);
  return ref !== null && last.at >= ref;
}

// ---------------------------------------------------------------------------
// 鮮度（成果物がマーカー鋳造後に更新されていないか・tools/recheck.js と共有）
// ---------------------------------------------------------------------------

/**
 * マーカーキー→そのマーカーが保証する成果物。investigation は2段（profile／focused）で、
 * focused が `project_profile.md` へ追記するため、focused マーカー鋳造後は project_profile.md を
 * focused 側の管轄にする（S3-1: 追記のたびに調査1のマーカーが「古い」と誤警告されていた）。
 */
export function markerArtifacts(ts, key) {
  const w = (f) => path.join(workDir(ts), f);
  switch (key) {
    case 'investigation':
      return hasMarker(ts, 'investigation.focused') ? [w('existing_customizations.md')] : [w('existing_customizations.md'), w('project_profile.md')];
    case 'investigation.focused':
      return [w('project_profile.md')];
    case 'requirements':
      return [w('requirements.md')];
    case 'spec':
      return [path.join(outputDir(ts), 'spec.md')];
    case 'design':
      return [path.join(outputDir(ts), 'design-map.md')];
    case 'generation':
      return [path.join(outputDir(ts), 'generated')];
    default:
      return [];
  }
}

/** p が存在すればその mtimeMs、ディレクトリなら配下の最大 mtimeMs。無ければ null。 */
export function maxMtimeMs(p) {
  if (!existsSync(p)) return null;
  const st = statSync(p);
  if (!st.isDirectory()) return st.mtimeMs;
  let max = st.mtimeMs;
  for (const entry of readdirSync(p, { withFileTypes: true })) {
    const m = maxMtimeMs(path.join(p, entry.name));
    if (m !== null && m > max) max = m;
  }
  return max;
}

/** マーカー `key` が在るのに成果物が鋳造後に更新されているか。 */
export function checkStaleness(ts, key) {
  if (!hasMarker(ts, key)) return { stale: false, artifact: null };
  const markerMtime = statSync(markerPath(ts, key)).mtimeMs;
  for (const a of markerArtifacts(ts, key)) {
    const m = maxMtimeMs(a);
    if (m !== null && m > markerMtime) return { stale: true, artifact: a };
  }
  return { stale: false, artifact: null };
}

// ---------------------------------------------------------------------------
// 現在地
// ---------------------------------------------------------------------------

const MARKER_KEYS = ['investigation', 'requirements', 'investigation.focused', 'spec', 'design', 'generation'];

export const SESSIONS = {
  S1: { stages: '工程1〜4（調査・ヒアリング・spec）', model: 'opus', canary: true },
  S2: { stages: '工程5〜6（機能選定・設計）', model: 'opus', canary: true },
  S3: { stages: '工程7〜9（生成・検証・eval）', model: 'sonnet', canary: true },
  // generation.done 以降は run が in-flight でなくガードも非適用（currentRunTs() が null）なので、
  // カナリア（ガードの deny を確かめる）は撃てない。
  S4: { stages: '工程10（配置）', model: 'sonnet', canary: false },
};

function evalComplete(ts) {
  const dir = path.join(outputDir(ts), 'eval');
  return EVAL_AXES.every((a) => existsSync(path.join(dir, `${a}.md`))) && existsSync(path.join(outputDir(ts), 'eval-report.md'));
}

/** /self-optimize の run か（調査対象が claude-canon 自身。終了後に sentinel が消えても判別できる）。 */
function isSelfOptimizeRun(ts) {
  const target = resolveTargetRoot(ts);
  return target !== null && path.resolve(target) === path.resolve(CANON_ROOT);
}

/** この run から取り込まれた候補世代があるか（generations/candidate-<label>/SOURCE_RUN が <ts>）。 */
function candidateStaged(ts) {
  return listCandidates().some((label) => {
    const f = path.join(candidateDir(label), 'SOURCE_RUN');
    return existsSync(f) && readFileSync(f, 'utf8').trim() === ts;
  });
}

/** 上から順に「未完了の最初の段」が現在地。 */
function ladder(ts) {
  const dep = (f) => path.join(outputDir(ts), '.deploy', f);
  const M = (k) => hasMarker(ts, k);
  return [
    { id: 'investigation-1', session: 'S1', done: M('investigation'), action: '工程1: 系統A・系統Bを並列に直接 spawn し、各ワーカーが成果物を書く（SKILL.md「工程1」）' },
    { id: 'requirements', session: 'S1', done: M('requirements'), action: '工程2: 要件ヒアリング。会話履歴は失われているので、調査サマリの提示からやり直す（SKILL.md「工程2」）' },
    { id: 'P2', gate: 'P2', session: 'S1', done: gateApproved(ts, 'P2'), action: 'P2: 確定要件を提示して対話承認を取る。承認は npm run state:record で記録する' },
    { id: 'investigation-2', session: 'S1', done: M('investigation.focused'), action: '工程3: project-profiler を focused モードで直接起動し、## focused 節を追記させる（SKILL.md「工程3」）' },
    { id: 'spec', session: 'S1', done: M('spec'), action: '工程4: spec-writer を起動して spec.md を書かせる（SKILL.md「工程4」）' },
    { id: 'P4', gate: 'P4', session: 'S1', done: gateApproved(ts, 'P4'), action: 'P4（最重要）: spec.md を提示し、内容を精査して対話承認を取る' },
    { id: 'design', session: 'S2', done: M('design'), action: '工程5+6: selector → designer を起動して design-map.md を書かせる（SKILL.md「工程5+6」）' },
    { id: 'P5', gate: 'P5', session: 'S2', done: gateApproved(ts, 'P5'), action: 'P5: design-map を提示し（廃止判定は強調）対話承認を取る' },
    { id: 'generation', session: 'S3', done: M('generation'), action: '工程7: まず npm run slice -- <ts> で design-map をスライスに切り出し、generator を起動して generated/** を生成させる（SKILL.md「工程7」）' },
    { id: 'eval', session: 'S3', done: evalComplete(ts), action: '工程9: eval を実施する。初回は npm run eval:bundle -- <ts>、差し戻し後は --round N で差分だけ再判定し、judge の verdict を揃えて npm run eval:report -- <ts> --write で集約する（SKILL.md「工程9」）' },
    { id: 'P6+7', gate: 'P6+7', session: 'S3', done: gateApproved(ts, 'P6+7'), action: 'P6+7: 生成物と eval-report を1回で提示し（violation は全件）対話承認を取る' },
    ...(isSelfOptimizeRun(ts)
      ? [
          // /self-optimize は工程10 の代わりに世代ステージングで終わる（配置しない）。
          { id: 'selfopt-stage', session: 'S4', done: candidateStaged(ts), action: '工程10（代替）: npm run stage -- output/<ts> <label> → npm run selfopt:end → npm run promote -- <label> --dry-run（self-optimize SKILL「工程10（代替）」）。実昇格は行わない' },
        ]
      : [
          { id: 'predeploy-emit', session: 'S4', done: existsSync(dep('RUN.md')), action: '工程10: node deploy/emit-run-manifest.js で RUN.md を出力する' },
          { id: 'predeploy-check', session: 'S4', done: existsSync(dep('pre-deploy-report.txt')), action: '工程10: node deploy/pre-deploy-check.js で配置前照合（uncaptured があれば止める）' },
          { id: 'P8', gate: 'P8', session: 'S4', done: gateApproved(ts, 'P8'), action: 'P8: pre-deploy-report の retired 一覧が意図した廃止と一致するか、ユーザーに確認して対話承認を取る' },
          { id: 'deploy', session: 'S4', done: existsSync(dep('deploy-result.json')), action: '配置: 対象リポジトリで人間が node deploy/deploy.js --confirm を実行する（サンドボックスの外・RUN.md 参照）' },
        ]),
  ];
}

/**
 * run の現在地を導く。
 * @returns {{ ts:string, position:string, session:string|null, expected_model:string|null,
 *   canary_required:boolean, waiting_gate:string|null, next_action:string, blocked:string[],
 *   pending_requests:string[], stale:{marker:string,artifact:string}[], markers:string[] }}
 */
export function deriveRunStatus(ts) {
  const markers = existsSync(markersDir(ts)) ? MARKER_KEYS.filter((k) => hasMarker(ts, k)) : [];
  const bdir = blocksDir(ts);
  const blocked = existsSync(bdir) ? readdirSync(bdir).filter((f) => f.endsWith('.blocked')).map((f) => f.replace(/\.blocked$/, '')) : [];
  // 未消費の完了リクエスト（マーカーが無いものだけ。マーカーが在れば冪等に消えるだけ）。
  const pending = listRequests(ts).filter((stage) => !hasMarker(ts, investigationMarkerKey(ts, stage)));
  const stale = MARKER_KEYS.map((k) => ({ k, s: checkStaleness(ts, k) }))
    .filter((x) => x.s.stale)
    .map((x) => ({ marker: x.k, artifact: posix(path.relative(CANON_ROOT, x.s.artifact)) }));

  const step = ladder(ts).find((s) => !s.done) ?? null;
  const base = { ts, blocked, pending_requests: pending, stale, markers };
  if (!step) {
    return { ...base, position: 'done', session: null, expected_model: null, canary_required: false, waiting_gate: null, next_action: 'run は完了している。' };
  }
  const sess = SESSIONS[step.session];
  let next = step.action;
  if (blocked.length > 0) next = `ブロックラッチが残っている（${blocked.join(', ')}）。原因を提示して人間の判断を仰ぐ（自動で解除・再生成しない）。`;
  else if (pending.length > 0) next = `未消費の完了リクエストがある（${pending.join(', ')}）。npm run recheck -- ${ts} <stage> でゲートを起動する。`;
  return {
    ...base,
    position: step.id,
    session: step.session,
    expected_model: sess.model,
    canary_required: sess.canary,
    waiting_gate: step.gate ?? null,
    next_action: next,
  };
}
