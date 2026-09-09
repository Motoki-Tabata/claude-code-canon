/**
 * gates/lib/requirements.js — `work/<ts>/requirements.md`（§6.3）の決定論パーサ。
 *
 * G11（制約遵守）が判定入力に使う。書式は「章立て Markdown 内の入れ子リスト」であり
 * 正典 frontmatter ではないため artifact.js の parseFrontmatter は使えない（ネスト非対応）。
 * markdown.js の共有プリミティブ（findHeading / sectionSlice / parseBulletRecords）を土台に、
 * constraints / conflicts 固有の形だけを本ファイルで扱う（依存ゼロ・§14「不変土台」）。
 *
 * G1 も requirements.md を読むが、見るのは `## 確定要件` の enum のみ（strength_needed・
 * priority）。本パーサは同じ節を含む全体を構造化する。将来 G1 を移行できるよう、要件
 * レコードの抽出は G1 と同じ parseBulletRecords を使い、判定は一切しない（構文分解のみ）。
 *
 * 「見つからない／0件」は黙って空を返さず throw する（design-map.js と同じ規律・§11.5）。
 * 呼び出し側が「制約が書かれていない」を「制約なし＝合格」と読む経路を作らないため。
 */

import {
  findHeading,
  sectionSlice,
  parseBulletRecords,
  stripInlineComment,
  unwrapValue,
} from './markdown.js';

export class RequirementsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RequirementsError';
  }
}

/** `{ allowed: false, reason: "..." }` のインライン形から key: value を拾う。 */
function parseInlineMapping(inner) {
  const out = {};
  // 値がクォート内にカンマを含みうる（reason: "a, b"）ので、単純 split をしない。
  const re = /([A-Za-z_][\w-]*)\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^,}]*)/g;
  let m;
  while ((m = re.exec(inner)) !== null) {
    out[m[1]] = unwrapValue(m[2]) ?? '';
  }
  return out;
}

/** true / false 以外は null（＝不正。呼び出し側が違反にする）。 */
function toBool(raw) {
  if (raw === undefined || raw === null) return null;
  const t = String(raw).trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  return null;
}

/**
 * `constraints:` ブロックをパースする。
 * インライン形（`hooks: { allowed: false, reason: "..." }`）と複数行形
 *   hooks:
 *     allowed: false
 *     reason: "..."
 * の双方を読む。allowed を持たないキー（organization_policy 等の自由文）は
 * `allowed: undefined` を持つ freeform エントリとして返す（違反にするかは呼び出し側の判断）。
 *
 * @returns {{key,allowed,allowedRaw,reason,freeform,line}[]}
 */
function parseConstraintsBlock(lines, start, end) {
  const idx = lines.findIndex(
    (l, i) => i >= start && i < end && /^\s*constraints\s*:\s*$/.test(stripInlineComment(l))
  );
  if (idx === -1) return null;

  const entries = [];
  const baseIndent = lines[idx].match(/^(\s*)/)[1].length;
  let cur = null;
  for (let i = idx + 1; i < end; i++) {
    const raw = lines[i];
    if (/^\s*$/.test(raw)) continue;
    if (/^\s*#/.test(raw)) continue;
    const indent = raw.match(/^(\s*)/)[1].length;
    if (indent <= baseIndent) break; // ブロック終端（次のトップレベルキー・見出し等）

    const m = stripInlineComment(raw).match(/^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, key, rest] = m;

    // 継続行（キーより深いインデント＝複数行形の子キー）
    if (cur && indent > cur.indent) {
      if (key === 'allowed') {
        cur.entry.allowedRaw = rest.trim();
        cur.entry.allowed = toBool(rest);
      } else if (key === 'reason') {
        cur.entry.reason = unwrapValue(rest) ?? '';
      }
      continue;
    }

    const inline = rest.trim().match(/^\{(.*)\}$/);
    const entry = {
      key,
      allowed: undefined,
      allowedRaw: undefined,
      reason: null,
      freeform: false,
      line: i + 1,
    };
    if (inline) {
      const fields = parseInlineMapping(inline[1]);
      entry.allowedRaw = fields.allowed;
      entry.allowed = toBool(fields.allowed);
      if (fields.allowed === undefined) entry.freeform = true;
      entry.reason = fields.reason ?? null;
    } else if (rest.trim() === '') {
      // 複数行形の見出し行。子キーは次のループで拾う。
    } else {
      // `organization_policy: "自由文"` のように allowed を持たない自由文キー。
      entry.freeform = true;
      entry.reason = unwrapValue(rest) ?? '';
    }
    entries.push(entry);
    cur = { entry, indent };
  }

  // 複数行形で allowed が最後まで現れなかったキーは自由文扱いにする（判断は呼び出し側）。
  for (const e of entries) {
    if (e.allowed === undefined && e.allowedRaw === undefined && !e.freeform) e.freeform = true;
  }
  return entries;
}

/**
 * ブロック（`key:` に続く、より深いインデントの本体）の終端行を返す。
 * 見出し行・同レベル以下のキー行で閉じる。閉じないと後続節の bullet まで
 * 取り込んでしまい、無関係なレコードが conflicts として数えられる。
 */
function blockEnd(lines, headIdx, end) {
  const baseIndent = lines[headIdx].match(/^(\s*)/)[1].length;
  for (let i = headIdx + 1; i < end; i++) {
    const raw = lines[i];
    if (/^\s*$/.test(raw)) continue;
    if (/^#{1,6}\s/.test(raw)) return i;
    const indent = raw.match(/^(\s*)/)[1].length;
    if (indent <= baseIndent && !/^\s*-\s/.test(raw)) return i;
  }
  return end;
}

/** `conflicts:` の `- requirement: ... / constraint: ... / note: ...` を読む。 */
function parseConflictsBlock(lines, start, end) {
  const idx = lines.findIndex(
    (l, i) => i >= start && i < end && /^\s*conflicts\s*:\s*$/.test(stripInlineComment(l))
  );
  if (idx === -1) return null;
  const records = parseBulletRecords(lines, idx + 1, blockEnd(lines, idx, end));
  return records.map((r) => ({
    requirement: r.fields.requirement ?? null,
    constraint: r.fields.constraint ?? null,
    note: r.fields.note ?? null,
    line: r.line,
  }));
}

/**
 * requirements.md 全体を構造化する。
 * @returns {{requirements:Array, constraints:Array, conflicts:Array|null, constraintsFound:boolean}}
 * @throws {RequirementsError} 必須の節が無い／要件0件のとき（0件を黙って通さない・§11.5）
 */
export function parseRequirementsDoc(text) {
  const lines = text.split(/\r?\n/);

  // ## 確定要件（§6.3）
  const hReq = findHeading(lines, '確定要件');
  if (hReq === -1) {
    throw new RequirementsError('requirements.md に「## 確定要件」節が無い（§6.3）。空を黙って通さない（§11.5）。');
  }
  const reqRange = sectionSlice(lines, hReq);
  const requirements = parseBulletRecords(lines, reqRange.start + 1, reqRange.end).map((r) => ({
    id: r.fields.id ?? null,
    want: r.fields.want ?? null,
    strength_needed: r.fields.strength_needed ?? null,
    priority: r.fields.priority ?? null,
    line: r.line,
  }));
  if (requirements.length === 0) {
    throw new RequirementsError('「## 確定要件」に1件もレコードが無い（要件0件は requirements.md として不正・§6.3）。');
  }

  // constraints / conflicts は節見出しの文言が揺れうる（「## 使用可能なカスタマイズ機能」など）ため、
  // 見出しでなく**キー行**（`constraints:` / `conflicts:`）を文書全体から探す。見出し名に依存すると
  // 表記揺れで検査が沈黙する（§11.5）。
  const constraints = parseConstraintsBlock(lines, 0, lines.length);
  const conflicts = parseConflictsBlock(lines, 0, lines.length);

  return {
    requirements,
    constraints: constraints ?? [],
    constraintsFound: constraints !== null,
    conflicts, // null＝conflicts ブロック自体が無い（空リストとは区別する）
  };
}

/**
 * conflicts の整合検査（要件 id・constraints キー・禁止済みであること）。
 *
 * 【なぜ requirements ステージへ移したか】この検査は元々 G11（SubagentStop@generation）に
 * あった。ライブ run `20260909_003820` では工程7の生成が**全て終わったあと**の gen-guard で、
 * 生成物ではなく `requirements.md` の書式が落ちた。生成物には一切問題が無いのに generation が
 * ブロックされ、しかも `requirements.md` は工程2で**承認済み**の成果物なので、承認済み成果物を
 * 後から書き換える羽目になった（gate 規律として望ましくない）。検査の**内容**は正しかった
 * （「experimental は allowed: true なので衝突が成立しない」の指摘は事実）——誤っていたのは
 * 発火する工程だけ。記録直後の G1 で落ちれば承認前に直せる。
 *
 * 呼び出し側がゲート名を前置できるよう、メッセージにゲート接頭辞は付けない。
 *
 * @param {object} doc parseRequirementsDoc の戻り値
 * @param {Set<string>} prohibitedKeys allowed:false の constraints キー
 * @param {Set<string>} knownKeys constraints に実在するキー全部
 * @param {(a:string,b:string)=>boolean} mentions 識別子境界の照合器（markdown.js の SSoT を注入）
 * @returns {string[]} 違反メッセージ（ゲート接頭辞なし）
 */
export function checkConflictsIntegrity(doc, prohibitedKeys, knownKeys, mentions) {
  const violations = [];
  for (const c of doc.conflicts ?? []) {
    const reqOk = doc.requirements.some((r) => r.id && mentions(c.requirement ?? '', r.id));
    if (!reqOk) {
      violations.push(
        `conflicts（${c.line}行目）の requirement "${c.requirement}" が「## 確定要件」の実在 id を指していない` +
          `（虚偽・陳腐化した conflicts。id 一覧: ${doc.requirements.map((r) => r.id).join(', ')}）。`
      );
    }
    const key = [...knownKeys].find((k) => mentions(c.constraint ?? '', k));
    if (!key) {
      violations.push(
        `conflicts（${c.line}行目）の constraint "${c.constraint}" が constraints の実在キーを指していない` +
          `（キー一覧: ${[...knownKeys].join(', ')}）。解消済みの経緯・方針の相違・配置後メモは` +
          `conflicts ではなく散文の小節へ書く（§6.3）。`
      );
    } else if (!prohibitedKeys.has(key)) {
      violations.push(
        `conflicts（${c.line}行目）は constraint "${c.constraint}" との衝突を主張するが、` +
          `constraints の "${key}" は allowed: true（禁止されていない）。衝突が成立しない。`
      );
    }
  }
  return violations;
}
