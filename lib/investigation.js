/**
 * lib/investigation.js — 調査成果物（`work/<ts>/investigation/existing.md`・`focused.md`）の
 * 半構造パーサ（artifacts.md §2）。
 *
 * V7 の事実照合（artifacts.md §6.3）の入力に使う:
 *   K1 = existing.md の `canon_conformance` が clean
 *   K3 = existing.md の `depends_on.customization_refs`（design-map の disposition と突合）
 *   K5 = existing.md の `depends_on.project_refs` を focused.md の `ref_resolution` で解決確認
 * review-bundle も existing.md のレコードを keep-reviewer の入力に使う。
 * markdown.js ベースの行パース（依存ゼロ）。
 */

import { matchPathHeading, parseInlineSlashFields } from './markdown.js';

function strip(s) {
  return s.trim().replace(/^["']|["']$/g, '');
}
function norm(s) {
  return strip(s).replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * existing.md をパースし path→レコードのマップを返す。
 * @returns {Map<string,{canon_conformance:Object, customization_refs:string[], project_refs:{kind,value}[]}>}
 */
export function parseExisting(text) {
  const lines = text.split(/\r?\n/);
  const records = new Map();
  let cur = null;
  let section = null; // 'customization_refs' | 'project_refs' | 'canon_conformance'

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const head = matchPathHeading(line);
    if (head) {
      // has_* は「節が書かれたか」の記録。値の空（`project_refs: []`）と節そのものの
      // 欠落は意味が違う——前者は正当な「参照なし」の宣言、後者は調査が出力契約を
      // 守っていない。
      cur = {
        path: norm(head.path),
        canon_conformance: {},
        customization_refs: [],
        project_refs: [],
        has_canon_conformance: false,
        has_customization_refs: false,
        has_project_refs: false,
      };
      records.set(cur.path, cur);
      section = null;
      // 1行形式（`- path: X / feature: plugins / kind: … / strength: …`）を分解する
      // （複数行形式（後続の feature:/kind:/strength: 行）でも二重に上書きされるだけで害はない）。
      const inline = parseInlineSlashFields(head.rest);
      for (const k of ['feature', 'kind', 'strength']) {
        if (inline[k] !== undefined) cur[k] = strip(inline[k]);
      }
      continue;
    }
    if (!cur) continue;

    if (/^\s*customization_refs\s*:/.test(line)) {
      cur.has_customization_refs = true;
      const inline = line.match(/customization_refs\s*:\s*\[(.*)\]/);
      if (inline) {
        cur.customization_refs = inline[1]
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
          .map(norm);
        section = null;
      } else {
        section = 'customization_refs';
      }
      continue;
    }
    if (/^\s*project_refs\s*:/.test(line)) {
      cur.has_project_refs = true;
      const inline = line.match(/project_refs\s*:\s*\[(.*)\]/);
      section = inline ? null : 'project_refs';
      continue;
    }
    if (/^\s*canon_conformance\s*:/.test(line)) {
      cur.has_canon_conformance = true;
      section = 'canon_conformance';
      continue;
    }
    if (/^\s*depends_on\s*:/.test(line)) {
      section = null;
      continue;
    }

    // レコード直下のスカラ（feature / kind / strength）。K1/K3/K5 の照合には不要だが、
    // keep-reviewer（K4 強度整合）が「既存が担う強度」を事実として要る。
    if (section === null) {
      const sc = line.match(/^\s*(feature|kind|strength):\s*(.+?)\s*$/);
      if (sc) {
        cur[sc[1]] = strip(sc[2]);
        continue;
      }
    }

    if (section === 'customization_refs') {
      const it = line.match(/^\s*-\s*(.+?)\s*$/);
      if (it) cur.customization_refs.push(norm(it[1]));
      else if (/^\s*\w+:/.test(line)) section = null;
      continue;
    }
    if (section === 'project_refs') {
      const it = line.match(/^\s*-\s*kind:\s*(\w+)\s+value:\s*(.+?)\s*$/);
      if (it) cur.project_refs.push({ kind: it[1], value: strip(it[2]) });
      else if (/^\s*\w+:/.test(line) && !/^\s*-/.test(line)) section = null;
      continue;
    }
    if (section === 'canon_conformance') {
      const kv = line.match(/^\s*(\w+):\s*(.+?)\s*$/);
      if (kv) cur.canon_conformance[kv[1]] = strip(kv[2]);
      continue;
    }
  }
  return records;
}

/** canon_conformance が clean か（K1 の判定）。 */
export function isCanonClean(cc) {
  return (
    cc.frontmatter_keys_valid === 'true' &&
    cc.tool_names_valid === 'true' &&
    isEmptyList(cc.unknown_frontmatter_keys) &&
    isEmptyList(cc.deprecated_notation)
  );
}
function isEmptyList(v) {
  return v === undefined || v === '[]' || v === '';
}

/**
 * focused.md の ref_resolution をパースし ref→resolved(boolean) を返す（K5）。
 */
export function parseFocused(text) {
  const lines = text.split(/\r?\n/);
  const map = new Map();
  let inRR = false;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (/^\s*ref_resolution\s*:/.test(line)) {
      inRR = true;
      continue;
    }
    if (inRR) {
      const m = line.match(/^\s*-\s*ref:\s*(.+?)\s+kind:\s*\w+\s+resolved:\s*(true|false)/);
      if (m) {
        map.set(strip(m[1]), m[2] === 'true');
        continue;
      }
      if (/^\s*\w+:/.test(line) && !/^\s*-/.test(line)) inRR = false;
    }
  }
  return map;
}
