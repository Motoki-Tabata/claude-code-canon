/**
 * gates/lib/investigation.js — 系統A/B（調査成果物）の半構造パーサ（§6.1・§6.2）。
 *
 * G2 の実照合入力に使う:
 *   C1 = 系統A `canon_conformance` が clean
 *   C3 = 系統A `depends_on.customization_refs`（design-map の disposition と突合）
 *   C5 = 系統A `depends_on.project_refs` を系統B `ref_resolution` で解決確認
 * markdown.js ベースの行パース（依存ゼロ・§14）。
 */

function strip(s) {
  return s.trim().replace(/^["']|["']$/g, '');
}
function norm(s) {
  return strip(s).replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * 系統A existing_customizations.md をパースし path→レコードのマップを返す。
 * @returns {Map<string,{canon_conformance:Object, customization_refs:string[], project_refs:{kind,value}[]}>}
 */
export function parseSystemA(text) {
  const lines = text.split(/\r?\n/);
  const records = new Map();
  let cur = null;
  let section = null; // 'customization_refs' | 'project_refs' | 'canon_conformance'

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const pathM = line.match(/^\s*-\s*path:\s*(.+?)\s*$/);
    if (pathM) {
      cur = { path: norm(pathM[1]), canon_conformance: {}, customization_refs: [], project_refs: [] };
      records.set(cur.path, cur);
      section = null;
      continue;
    }
    if (!cur) continue;

    if (/^\s*customization_refs\s*:/.test(line)) {
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
      const inline = line.match(/project_refs\s*:\s*\[(.*)\]/);
      section = inline ? null : 'project_refs';
      continue;
    }
    if (/^\s*canon_conformance\s*:/.test(line)) {
      section = 'canon_conformance';
      continue;
    }
    if (/^\s*depends_on\s*:/.test(line)) {
      section = null;
      continue;
    }

    // レコード直下のスカラ（layer / kind / strength）。C1/C3/C5 の実照合には不要だが、
    // eval の keep-review（C4 強度整合・§16.3）が「既存が担う強度」を事実として要る。
    if (section === null) {
      const sc = line.match(/^\s*(layer|kind|strength):\s*(.+?)\s*$/);
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

/** canon_conformance が clean か（C1 の判定）。 */
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
 * 系統B project_profile.md の ref_resolution をパースし ref→resolved(boolean) を返す（C5）。
 */
export function parseSystemB(text) {
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
