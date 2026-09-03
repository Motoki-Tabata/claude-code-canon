/**
 * 生成物カスタマイズファイル（.md）の共通パーサ（依存ゼロ）。
 *
 * G3〜G6 は全員これを使って「1ファイル → { kind, path, frontmatter, body, errors }」に
 * 分解してから判定する。ここでの責務は構文分解のみ（意味判断はしない・§1.3）。
 *
 * 設計方針:
 * - frontmatter は正典が実際に使う範囲だけをパースする: スカラ・配列 `[a, b]`・
 *   ブール・クォート文字列。複数行ブロック（YAML の `key:\n  - a\n  - b` 形）は
 *   正典の frontmatter 完全リファレンスに一度も現れないため非対応でよい。
 * - パース不能な行は黙って捨てない。`errors` に積んで呼び出し側へ伝える
 *   （§11.5 vacuous pass と同型の事故を、抽出器側で起こさないため）。
 * - 「スペース/カンマ区切りのリストか、ただの文章か」はキーの意味論に依存し
 *   構文だけでは決まらない（例: `tools: Read Grep Bash` は空白区切りリストだが
 *   `description: What this agent does` は空白区切りの文章）。ゆえに
 *   parseFrontmatter は解釈を強制せず raw 文字列を保持し、リスト化が要る
 *   キーだけ呼び出し側が `splitListValue()` を明示的に呼ぶ。
 */

import { readFileSync, existsSync } from 'node:fs';
import { posix } from './canon.js';

/** 判定違反1件の共通シェイプ。全ゲートはこの形で配列を返す。 */
export function violation(gate, path, message, source, severity = 'error') {
  return { gate, severity, path, message, source };
}

// ---------------------------------------------------------------------------
// kind 判定（パスの慣用形から）
// ---------------------------------------------------------------------------

/**
 * `.claude/skills/` 配下のパスがパッケージ内で果たす役割を返す（純関数・パス形状のみで判定）。
 *
 * 正典 `docs/L2_SKILLS.md §2.1`「ディレクトリ構造」は、skill パッケージが **SKILL.md（必須）**
 * のほかに supporting files（`template.md`・`examples/sample.md`・`scripts/validate.sh` 等・任意）
 * を持つと明記する。`gates/conformance_tables/paths.json` の `kinds.skill.package_layout` が
 * この許可の SSoT。ゆえに「skill ディレクトリ配下の非 SKILL.md」は違反ではなく supporting file
 * であり、スキーマ系ゲート（G3/G4）の対象でもない。
 *
 * @returns {'definition'|'supporting'|'orphan'|null}
 *   - `definition` … `.claude/skills/<name>/SKILL.md`（スキル定義ファイル）
 *   - `supporting` … 同パッケージ配下のそれ以外（`template.md`・`examples/x.md`・`scripts/x.mjs`）
 *   - `orphan`     … `.claude/skills/` 直下のファイル（パッケージディレクトリが無い＝配置逸脱）
 *   - `null`       … `.claude/skills/` 配下ではない（plugin スコープ `<plugin>/skills/**` を含む。
 *                    plugin スコープは G3 の既知の対象外・g3_path_convention.js 冒頭の注記参照）
 */
export function skillPathRole(p) {
  const m = /(^|\/)\.claude\/skills\/(.+)$/.exec(posix(p));
  if (!m) return null;
  const rest = m[2].split('/');
  if (rest.length < 2) return 'orphan';
  if (rest.length === 2 && rest[1] === 'SKILL.md') return 'definition';
  return 'supporting';
}

/**
 * パスから種別を推定する。paths.json の既知配置形（agents/ skills/ rules/、
 * および廃止予定の commands/）に現れるディレクトリ慣用句のみで判定する。
 * G3 側で「配置パスとして正しいか」はさらに厳密照合するので、ここでの判定は
 * 「どのスキーマ（G4/G5）を適用すべきか」を決めるためのラフな一次分類でよい。
 */
export function detectKind(p) {
  const posixPath = posix(p);
  const base = posixPath.split('/').pop() ?? '';
  const segs = posixPath.split('/');
  if (base === 'SKILL.md') return 'skill';
  // skills 配下の .md はスキル系として一次分類する。supporting file（`examples/x.md` 等）も
  // ここでは skill になるが、スキーマ検査の対象から外す判定は gates/lib/non-schema.js が持つ
  // （skillPathRole が SSoT）。`.claude/skills/foo.md` のようなパッケージ無し配置は G3 が弾く。
  if (segs.includes('skills') && base.endsWith('.md')) return 'skill';
  if (segs.includes('commands') && base.endsWith('.md')) return 'skill'; // 廃止予定の Custom Commands 配置。スキーマは skill と同じ。
  if (segs.includes('rules') && base.endsWith('.md')) return 'rule';
  if (segs.includes('agents') && base.endsWith('.md')) return 'agent';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// frontmatter パーサ
// ---------------------------------------------------------------------------

function unquote(s) {
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return s.slice(1, -1);
    }
  }
  return s;
}

/** `key: value  # comment` からコメントを剥がす。クォート内の # は無視する。 */
function stripInlineComment(s) {
  let inQuote = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuote) {
      if (c === inQuote) inQuote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inQuote = c;
      continue;
    }
    if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) {
      return { value: s.slice(0, i), comment: s.slice(i + 1).trim() };
    }
  }
  return { value: s, comment: null };
}

/**
 * 値の構文だけから決まる範囲でスカラ化する。
 * - `true`/`false` → boolean
 * - `[a, b]` → 配列（要素はさらに unquote）
 * - クォート済み文字列 → クォートを剥がした文字列
 * - それ以外 → raw のまま（意味論はキー依存なので呼び出し側に委ねる）
 */
function coerceScalar(raw) {
  const s = raw.trim();
  if (s === '') return '';
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^\[.*\]$/.test(s)) {
    const inner = s.slice(1, -1).trim();
    if (inner === '') return [];
    return inner
      .split(',')
      .map((t) => unquote(t.trim()))
      .filter((t) => t !== '');
  }
  if (/^".*"$/.test(s) || /^'.*'$/.test(s)) return unquote(s);
  return s;
}

/**
 * frontmatter YAML ブロックを解析する。
 * @returns {{present:boolean, frontmatter:Object, body:string, rawBlock:string|null, errors:Array}}
 */
export function parseFrontmatter(text) {
  const errors = [];
  const lines = text.split(/\r?\n/);

  if ((lines[0] ?? '').trim() !== '---') {
    return { present: false, frontmatter: {}, body: text, rawBlock: null, errors };
  }

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) {
    errors.push({
      type: 'unterminated_block',
      line: 1,
      message: 'frontmatter 開始行 "---" はあるが終端 "---" が見つからない。ファイル全体を本文として扱う。',
    });
    return { present: true, frontmatter: {}, body: text, rawBlock: null, errors };
  }

  const blockLines = lines.slice(1, end);
  const frontmatter = {};
  for (let i = 0; i < blockLines.length; i++) {
    const raw = blockLines[i];
    const lineNo = i + 2; // 1-based。先頭の `---` 行を1とする
    if (raw.trim() === '') continue;
    if (/^\s*#/.test(raw)) continue; // 全行コメント（`# === グループ ===` を含む）

    const m = raw.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s?(.*)$/);
    if (!m) {
      errors.push({
        type: 'unparsed_line',
        line: lineNo,
        message:
          `"key: value" 形に一致しない行（複数行/インデント値は本パーサ非対応。正典の frontmatter ` +
          `完全リファレンスは常に単一行値のため対応不要という設計判断）: ${JSON.stringify(raw)}`,
      });
      continue;
    }
    const [, key, restRaw] = m;
    if (Object.prototype.hasOwnProperty.call(frontmatter, key)) {
      errors.push({ type: 'duplicate_key', line: lineNo, message: `キー重複: ${key}` });
    }
    const { value: stripped, comment } = stripInlineComment(restRaw);
    frontmatter[key] = {
      raw: stripped.trim(),
      value: coerceScalar(stripped),
      line: lineNo,
      comment,
    };
  }

  const body = lines.slice(end + 1).join('\n');
  return { present: true, frontmatter, body, rawBlock: blockLines.join('\n'), errors };
}

/** frontmatter エントリをリスト化する（キーの意味論を知っている呼び出し側専用）。 */
export function splitListValue(entry) {
  if (!entry) return [];
  const v = entry.value;
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string') return [];
  if (v === '') return [];
  return v
    .split(/[\s,]+/)
    .map((t) => unquote(t.trim()))
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// artifact 組み立て
// ---------------------------------------------------------------------------

/**
 * 既に読み込んだテキストから artifact を組み立てる（ファイル I/O なし・純粋）。
 * ユニットテストや違反注入テストで実ファイルを介さず使える。
 */
export function artifactFromText(pathForKind, rawText) {
  const p = posix(pathForKind);
  const kind = detectKind(p);
  const fm = parseFrontmatter(rawText);
  return {
    kind,
    path: p,
    frontmatterPresent: fm.present,
    frontmatter: fm.frontmatter,
    body: fm.body,
    rawBlock: fm.rawBlock,
    rawText,
    errors: fm.errors,
  };
}

/** ファイルから artifact を読み込む。存在しなければ kind:'unknown' + errors で返す（黙って null にしない）。 */
export function loadArtifact(absPath) {
  const p = posix(absPath);
  if (!existsSync(absPath)) {
    return {
      kind: 'unknown',
      path: p,
      frontmatterPresent: false,
      frontmatter: {},
      body: '',
      rawBlock: null,
      rawText: '',
      errors: [{ type: 'missing_file', message: `ファイルが存在しない: ${p}` }],
    };
  }
  const rawText = readFileSync(absPath, 'utf8');
  return artifactFromText(absPath, rawText);
}
