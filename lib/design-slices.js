/**
 * design-map.md を、ワーカーごとに必要な節だけの「スライス」へ切り出す（純関数）。
 *
 * design-map は大きく（実測で約96KB）、各ワーカーが全文を読むと、読んだ内容がそのワーカーの以後の
 * 全ターンで cache_read として積み上がる（artifacts.md §5.4）。ワーカーは自分の担当の節と共通の制約
 * だけで足りる。切り出しは決定論（節見出しと disposition レコードの分割）で、
 * **ビルダーの読む記述を1文字も変えない**（再シリアライズしない）。
 *
 * 出力（ファイル名 → 本文）:
 *   common.md        メタ・Used Features・構成と責務（Responsibility Map を含む）・Model Assignments・
 *                    Interface Contracts・生成上の制約・要件→生成物の対応・参照元からのコピー・管理パス外の変更・Experimental Dependencies・依存フラグ
 *   write-scopes.md  Write Scopes
 *   <担当>.md        担当（claude-md・rules・skills・subagents・settings・mcp・plugins・output-styles）が受け持つ
 *                    機能の節 ＋ その担当の disposition レコード（modify・merge のみ）。settings・plugins は複数の機能の節を連結する
 *   disposition-other.md   keep・retire・out_of_scope のレコードと、どの担当にも属さない modify・merge のレコード
 *                          （keep は copy-keep.js がコピー済み。担当外の modify・merge は全スライスから落ちないための受け皿）
 *   other-sections.md      上のどれにも属さない節（例: 反映追跡表。builder は通常読まない。設計者が足した
 *                          未知の節を黙って落とさないための受け皿——全スライスの和集合が design-map の全節を覆う）
 *   responsibilities.md    Responsibility Map（責務の膨張を見る材料。reviewer には review-bundle の design.md で渡る）
 *   skills-<k>.md・targets-skills-<k>.txt   skills の宣言が SKILLS_SLICE_SIZE 件を超えるときだけ、skill 単位に分けたスライス（k は1始まり。
 *                    skills.md・targets-skills.txt は全体として常に残す）
 *   targets-<担当|other>.txt / targets-all.txt   生成される宣言パス（builder の件数照合・V8 と同じ宣言源）
 *   INDEX.md         スライスの一覧（サイズ・件数）
 */

import { computeFenceMask, sectionSlice } from './markdown.js';
import {
  DesignMapError,
  DISPOSITION_HEADING,
  FEATURE_SECTIONS,
  h2Section,
  featureSection,
  h2SectionText,
  splitDispositionRecords,
  listDeclaredArtifacts,
} from './design-map.js';
import { UNITS, UNIT_NAMES, OTHER_UNIT, unitOfFeature, featureOfPath, unitOfPath } from './features.js';

const COMMON_PREFIXES = ['メタ', 'Used Features', '構成と責務', 'Model Assignments', 'Interface Contracts', '生成上の制約', '要件→生成物の対応', '参照元からのコピー', '管理パス外の変更', 'Experimental Dependencies', '依存フラグ'];
// 必須節のうち、どの builder を起動するかを決める Used Features だけを要求する（メタ・Write Scopes は
// 役割分担が無い設計で省略・N/A になりうる）。無ければ空のスライスを黙って作らず throw する。
const REQUIRED = ['Used Features'];
/** skills の宣言がこの件数を超えたら、skill 単位に分けて builder を並列に起動できるようにする。 */
export const SKILLS_SLICE_SIZE = 20;
const skillOf = (p) => /^\.claude\/skills\/([^/]+)\//.exec(p)?.[1] ?? null;

/**
 * skills の宣言パスを skill 単位に、1チャンクが size 件以内になるよう貪欲に詰める（skill は分割しない。
 * 1つの skill が size を超えるときはその skill だけで1チャンク）。
 * @returns {string[][]} チャンクごとの skill 名（宣言が size 件以内なら空配列＝分割しない）
 */
export function chunkSkills(paths, size = SKILLS_SLICE_SIZE) {
  if (paths.length <= size) return [];
  const byName = new Map();
  for (const p of [...paths].sort()) {
    const n = skillOf(p) ?? '';
    byName.set(n, (byName.get(n) ?? 0) + 1);
  }
  const chunks = [];
  let cur = [];
  let n = 0;
  for (const [name, count] of byName) {
    if (cur.length > 0 && n + count > size) {
      chunks.push(cur);
      cur = [];
      n = 0;
    }
    cur.push(name);
    n += count;
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

/** レベル2見出し ちょうど `name` の全文（見出し含む）。無ければ null。 */
function exactH2Text(lines, name, mask) {
  const r = h2Section(lines, name, mask);
  return r ? lines.slice(r.start, r.end).join('\n').replace(/\s+$/, '') : null;
}

/** 機能の節の全文（見出し含む）。照合は V8 と同じ featureSection（完全一致優先・括弧書き付きも可）。 */
function featureH2Text(lines, name, mask) {
  const r = featureSection(lines, name, mask);
  return r ? lines.slice(r.start, r.end).join('\n').replace(/\s+$/, '') : null;
}

/** 全レベル2見出しの一覧 [{ title, text }]（出現順・コードブロック内は無視）。 */
function allH2(lines, mask) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue;
    const m = lines[i].match(/^##\s+(.*?)\s*$/);
    if (!m) continue;
    const { start, end } = sectionSlice(lines, i, mask);
    out.push({ title: m[1], text: lines.slice(start, end).join('\n').replace(/\s+$/, '') });
  }
  return out;
}

/** `### <name>` で始まるレベル3節の全文。無ければ null。 */
function h3Text(lines, prefix, mask) {
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue;
    const m = lines[i].match(/^###\s+(.*?)\s*$/);
    if (!m || !m[1].startsWith(prefix)) continue;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      if (!mask[j] && /^#{1,3}\s/.test(lines[j])) {
        end = j;
        break;
      }
    }
    return lines.slice(i, end).join('\n').replace(/\s+$/, '');
  }
  return null;
}

/**
 * @param {string} text design-map.md の本文
 * @returns {{ files: Record<string,string>, counts: Record<string,number> }}
 * @throws {DesignMapError} 必須の節（Used Features）が無い（空のスライスを黙って作らない）
 */
export function buildSlices(text) {
  const lines = text.split(/\r?\n/);
  const mask = computeFenceMask(lines);

  const missing = REQUIRED.filter((name) => h2SectionText(lines, name, mask) === null);
  if (missing.length > 0) {
    throw new DesignMapError(`design-map に必須の節が無い: ${missing.join('・')}（空のスライスを黙って作らない）。`);
  }

  const files = {};
  const title = lines.find((l) => /^#\s+/.test(l)) ?? '# design-map';

  files['common.md'] = [title, '', ...COMMON_PREFIXES.map((p) => h2SectionText(lines, p, mask)).filter(Boolean)].join('\n\n') + '\n';
  files['write-scopes.md'] = `${title}\n\n${exactH2Text(lines, 'Write Scopes', mask) ?? '（design-map に ## Write Scopes 節は無い）'}\n`;

  const records = splitDispositionRecords(text);
  const recordDisposition = (raw) => /^\s*disposition:\s*(\w+)/m.exec(raw)?.[1] ?? null;
  // builder が書くのは「modify・merge で、いずれかの担当に属するパス」。担当に属さない modify・merge
  // （emit-manifest が作る .claude/README.md など）はどの担当のスライスにも入らず落ちるので、disposition-other.md に入れる。
  const forBuilder = (r) => ['modify', 'merge'].includes(recordDisposition(r.raw)) && unitOfPath(r.path) !== OTHER_UNIT;
  const builderRecords = records.filter(forBuilder);
  const otherRecords = records.filter((r) => !forBuilder(r));

  for (const unit of UNIT_NAMES) {
    const bodies = UNITS[unit].map((f) => featureH2Text(lines, f, mask)).filter(Boolean);
    const mine = builderRecords.filter((r) => unitOfPath(r.path) === unit);
    const parts = [title, '', bodies.length > 0 ? bodies.join('\n\n') : `（design-map に ${UNITS[unit].map((f) => `## ${f}`).join('・')} 節は無い）`];
    if (mine.length > 0) parts.push('', `## この担当の既存判定レコード（existing_disposition・modify／merge のみ）`, '', '```yaml', mine.map((r) => r.raw).join('\n'), '```');
    files[`${unit}.md`] = parts.join('\n') + '\n';
  }

  files['disposition-other.md'] =
    [title, '', '## keep・retire・out_of_scope と、どの担当にも属さない modify・merge の既存判定レコード', '', '```yaml', otherRecords.map((r) => r.raw).join('\n'), '```'].join('\n') + '\n';

  // どの担当・共通・Write Scopes・既存判定にも属さない節は other-sections.md へ（黙って落とさない）。
  const claimed = (title) =>
    COMMON_PREFIXES.some((p) => title.startsWith(p)) ||
    title === 'Write Scopes' ||
    title.startsWith(DISPOSITION_HEADING) ||
    FEATURE_SECTIONS.some((sec) => title.startsWith(sec.heading) && !/^[A-Za-z0-9-]/.test(title.slice(sec.heading.length)));
  const unclaimed = allH2(lines, mask).filter((h) => !claimed(h.title));
  files['other-sections.md'] = [title, '', ...(unclaimed.length ? unclaimed.map((h) => h.text) : ['（該当する節は無い）'])].join('\n\n') + '\n';

  const resp = h3Text(lines, 'Responsibility Map', mask);
  files['responsibilities.md'] = `${title}\n\n${resp ?? '（design-map に Responsibility Map 節は無い）'}\n`;

  const declared = listDeclaredArtifacts(text);
  const byUnit = Object.fromEntries([...UNIT_NAMES, OTHER_UNIT].map((u) => [u, []]));
  for (const d of declared) {
    const unit = unitOfFeature(d.feature ?? featureOfPath(d.path)) ?? OTHER_UNIT;
    byUnit[unit].push(d.path);
  }
  const counts = { all: declared.length };
  for (const [k, v] of Object.entries(byUnit)) {
    v.sort();
    files[`targets-${k}.txt`] = v.length ? v.join('\n') + '\n' : '';
    counts[k] = v.length;
  }
  // skills が多いときは skill 単位の分割スライスも作る（全体の skills.md・targets-skills.txt は残す）。
  const chunks = chunkSkills(byUnit.skills);
  counts.skills_slices = chunks.length;
  chunks.forEach((names, idx) => {
    const k = idx + 1;
    const inChunk = (p) => names.includes(skillOf(p) ?? '');
    files[`targets-skills-${k}.txt`] = byUnit.skills.filter(inChunk).join('\n') + '\n';
    const body = featureH2Text(lines, 'skills', mask) ?? '';
    const bl = body.split('\n');
    const bmask = computeFenceMask(bl);
    const blocks = [];
    let pre = [];
    let curBlock = null;
    bl.forEach((l, i) => {
      if (!bmask[i] && /^###\s/.test(l)) {
        curBlock = { head: l, lines: [l] };
        blocks.push(curBlock);
      } else if (curBlock) curBlock.lines.push(l);
      else pre.push(l);
    });
    const keepBlock = (b) => {
      const tok = /^###\s+`([^`]+)`/.exec(b.head)?.[1]?.trim();
      if (!tok) return k === 1; // 宣言に読めない見出しは1つ目だけに入れる（黙って落とさない）
      const isPathLike = tok.includes('/') || /\.[A-Za-z0-9]+$/.test(tok);
      const name = isPathLike ? skillOf(tok) : tok;
      return name === null ? k === 1 : names.includes(name);
    };
    const mineRecords = builderRecords.filter((r) => unitOfPath(r.path) === 'skills' && inChunk(r.path));
    const parts = [title, '', `> 分割スライス ${k}/${chunks.length}: この builder が担当する skill は ${names.join('・')}（他の skill は別の builder が書く）。`, '', pre.join('\n').replace(/\s+$/, ''), ...blocks.filter(keepBlock).map((b) => b.lines.join('\n').replace(/\s+$/, ''))];
    if (mineRecords.length > 0) parts.push('', `## この担当の既存判定レコード（existing_disposition・modify／merge のみ）`, '', '```yaml', mineRecords.map((r) => r.raw).join('\n'), '```');
    files[`skills-${k}.md`] = parts.join('\n') + '\n';
  });

  files['targets-all.txt'] = declared.map((d) => d.path).sort().join('\n') + (declared.length ? '\n' : '');

  files['INDEX.md'] =
    ['# design-map スライス一覧', '', '| ファイル | 文字数 |', '|---|---|', ...Object.entries(files).map(([n, c]) => `| ${n} | ${c.length} |`), '', `宣言された生成物: 全${counts.all}件（${Object.entries(byUnit).map(([k, v]) => `${k} ${v.length}`).join('・')}）`, ''].join('\n');

  return { files, counts };
}
