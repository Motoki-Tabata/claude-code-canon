/**
 * design-map.md を、ワーカーごとに必要な節だけの「スライス」へ切り出す（純関数）。
 *
 * design-map は約96KB・約34,000文字ある。実測（run 20260919・20260922）では generator・3 builder・
 * readme-writer・eval judge が同じ design-map を全文 Read し（1 run で 19〜30 回・1 回 3.4〜3.7 万文字）、
 * 読んだ内容がそのエージェントの以後の全ターンで cache_read として積み上がった。ワーカーは自分の
 * 担当層の節と共通の制約だけで足りる。切り出しは決定論（節見出しと disposition レコードの分割）で、
 * **ビルダーの読む記述を1文字も変えない**（再シリアライズしない）。
 *
 * 出力（ファイル名 → 本文）:
 *   common.md        メタ・Used Features・レイヤー構成（Responsibility Map を含む）・Model Assignments・
 *                    Interface Contracts・生成上の制約・Experimental Dependencies・依存フラグ
 *   write-scopes.md  Write Scopes
 *   l1.md skills.md agents.md l4.md l5.md   各層の節 ＋ その層の disposition レコード（modify・merge のみ）
 *   disposition-other.md   keep・retire・out_of_scope のレコード（generator が verbatim コピー・廃止を扱う）
 *   other-sections.md      上のどれにも属さない節（例: 反映追跡表。builder は通常読まない。設計者が足した
 *                          未知の節を黙って落とさないための受け皿——全スライスの和集合が design-map の全節を覆う）
 *   responsibilities.md    Responsibility Map（judge が責務の膨張を見る材料）
 *   targets-<l1|l2|l3|l4|l5|other>.txt / targets-all.txt   生成される宣言パス（generator の件数照合・G9 と同じ宣言源）
 *   INDEX.md         スライスの一覧（サイズ・件数）
 */

import { computeFenceMask, sectionSlice } from './markdown.js';
import {
  DesignMapError,
  LAYER_SECTIONS,
  h2Section,
  h2SectionText,
  splitDispositionRecords,
  listDeclaredArtifacts,
  layerOfPath,
} from './design-map.js';

const COMMON_PREFIXES = ['メタ', 'Used Features', 'レイヤー構成', 'Model Assignments', 'Interface Contracts', '生成上の制約', 'Experimental Dependencies', '依存フラグ'];
// designer 定義の必須節のうち、generator 自身が読む前提の Used Features だけを要求する（メタ・Write Scopes は
// 役割分担が無い設計で省略・N/A になりうる）。無ければ空のスライスを黙って作らず throw する。
const REQUIRED = ['Used Features'];
const LAYER_FILE = { L1: 'l1.md', L2: 'skills.md', L3: 'agents.md', L4: 'l4.md', L5: 'l5.md' };

/** レベル2見出し ちょうど `name` の全文（見出し含む）。無ければ null。 */
function exactH2Text(lines, name, mask) {
  const r = h2Section(lines, name, mask);
  return r ? lines.slice(r.start, r.end).join('\n').replace(/\s+$/, '') : null;
}

/** ちょうど `name`、無ければ `name` で始まり直後が英数字でない見出し（`## L1 レイヤー…` 等）の節。 */
function layerH2Text(lines, name, mask) {
  const exact = exactH2Text(lines, name, mask);
  if (exact !== null) return exact;
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue;
    const m = lines[i].match(/^##\s+(.*?)\s*$/);
    if (m && m[1].startsWith(name) && !/^[A-Za-z0-9]/.test(m[1].slice(name.length))) {
      const { start, end } = sectionSlice(lines, i, mask);
      return lines.slice(start, end).join('\n').replace(/\s+$/, '');
    }
  }
  return null;
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
    throw new DesignMapError(`design-map に必須の節が無い: ${missing.join('・')}（空のスライスを黙って作らない・§11.5）。`);
  }

  const files = {};
  const title = lines.find((l) => /^#\s+/.test(l)) ?? '# design-map';

  files['common.md'] = [title, '', ...COMMON_PREFIXES.map((p) => h2SectionText(lines, p, mask)).filter(Boolean)].join('\n\n') + '\n';
  files['write-scopes.md'] = `${title}\n\n${exactH2Text(lines, 'Write Scopes', mask) ?? '（design-map に ## Write Scopes 節は無い）'}\n`;

  const records = splitDispositionRecords(text);
  const recordDisposition = (raw) => /^\s*disposition:\s*(\w+)/m.exec(raw)?.[1] ?? null;
  const builderRecords = records.filter((r) => ['modify', 'merge'].includes(recordDisposition(r.raw)));
  const otherRecords = records.filter((r) => !['modify', 'merge'].includes(recordDisposition(r.raw)));

  for (const sec of LAYER_SECTIONS) {
    const body = layerH2Text(lines, sec.heading, mask);
    const mine = builderRecords.filter((r) => layerOfPath(r.path) === sec.layer);
    const parts = [title, '', body ?? `（design-map に ## ${sec.heading} 節は無い）`];
    if (mine.length > 0) parts.push('', `## この層の既存判定レコード（existing_disposition・modify／merge のみ）`, '', '```yaml', mine.map((r) => r.raw).join('\n'), '```');
    files[LAYER_FILE[sec.layer]] = parts.join('\n') + '\n';
  }

  files['disposition-other.md'] =
    [title, '', '## keep・retire・out_of_scope の既存判定レコード', '', '```yaml', otherRecords.map((r) => r.raw).join('\n'), '```'].join('\n') + '\n';

  // どの層・共通・Write Scopes・既存判定にも属さない節は other-sections.md へ（黙って落とさない）。
  const claimed = (title) =>
    COMMON_PREFIXES.some((p) => title.startsWith(p)) ||
    title === 'Write Scopes' ||
    title.includes('existing_disposition') ||
    LAYER_SECTIONS.some((sec) => title.startsWith(sec.heading) && !/^[A-Za-z0-9]/.test(title.slice(sec.heading.length)));
  const unclaimed = allH2(lines, mask).filter((h) => !claimed(h.title));
  files['other-sections.md'] = [title, '', ...(unclaimed.length ? unclaimed.map((h) => h.text) : ['（該当する節は無い）'])].join('\n\n') + '\n';

  const resp = h3Text(lines, 'Responsibility Map', mask);
  files['responsibilities.md'] = `${title}\n\n${resp ?? '（design-map に Responsibility Map 節は無い）'}\n`;

  const declared = listDeclaredArtifacts(text);
  const byLayer = { l1: [], l2: [], l3: [], l4: [], l5: [], other: [] };
  for (const d of declared) {
    const layer = (d.layer ?? layerOfPath(d.path)).toLowerCase();
    (byLayer[layer] ?? byLayer.other).push(d.path);
  }
  const counts = { all: declared.length };
  for (const [k, v] of Object.entries(byLayer)) {
    v.sort();
    files[`targets-${k}.txt`] = v.length ? v.join('\n') + '\n' : '';
    counts[k] = v.length;
  }
  files['targets-all.txt'] = declared.map((d) => d.path).sort().join('\n') + (declared.length ? '\n' : '');

  files['INDEX.md'] =
    ['# design-map スライス一覧', '', '| ファイル | 文字数 |', '|---|---|', ...Object.entries(files).map(([n, c]) => `| ${n} | ${c.length} |`), '', `宣言された生成物: 全${counts.all}件（${Object.entries(byLayer).map(([k, v]) => `${k} ${v.length}`).join('・')}）`, ''].join('\n');

  return { files, counts };
}
