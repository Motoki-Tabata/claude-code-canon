/**
 * gates/lib/shell-write.js — シェル経由の「書込操作らしさ」判定の Single Source of Truth。
 *
 * write-scope-guard・canon-update-scope-guard・self-optimize-scope-guard の3ガードは、
 * すべて「コマンド実行系ツール（Bash/PowerShell/Monitor）の command 文字列が保護パスへの
 * 書込を示唆するか」を同じロジックで判定する。従来は SHELL_TOOLS と WRITE_OP_RE が
 * 3ファイルへリテラルに重複しており、列挙漏れが単一障害点になる構造だった
 * （§11.4・L005「代表例で仕様を書くと列挙漏れが単一障害点になる」と同型）。
 * ここへ集約し、3ガードは import して使う。
 *
 * L023 の修正（2026-08-22 機能Y ライブ e2e で発見）: 従来の WRITE_OP_RE は `>>?` を
 * 単純にマッチさせていたため、fd 複製（`2>&1`・`>&2`・`1>&2` 等・書込を伴わない）を
 * 書込操作と誤検知していた。looksLikeWriteCommand() は判定前にコマンド文字列から
 * fd 複製トークンを除去する。`1>out.txt`（実ファイル書込）は fd 複製と字面が異なる
 * （`&` を伴わない）ため除去されず、検出力は落ちない。
 *
 * 宛先ベース判定（analyzeShellWrite・2026-09-04）: 上記までの判定は「コマンド文字列の
 * どこかに書込操作がある」×「どこかに保護パス文字列がある」という**出現ベース**の AND で、
 * 位置関係（その保護パス文字列が実際に書込の宛先か）を見ていなかった。ライブ run
 * `20260903_091044` で2種の偽陽性を実測した:
 *   (a) heredoc 本文に保護パス文字列を含む sanctioned への書込
 *       （`cat > work/<ts>/x.md <<'EOF'` の本文に `.claude/rules/*.md` 等）
 *   (b) `2>/dev/null` を伴う読取専用コマンド（`grep -rn ... docs/ .claude/ 2>/dev/null`）
 * §11.4「判定対象の識別子自身への自己一致を疑う」（`WRITE_OP_RE` が `2>&1` の `>` に
 * 誤反応した L023）と同系統の変種。analyzeShellWrite() はコマンド文字列から**書込宛先**を
 * 具体的に同定し、宛先が保護パスかどうかで判定する。同定できない書込構文（`node -e` 等の
 * 不透明な実行・`$VAR` 等の動的パス）が1つでもあれば `unresolved: true` を返し、呼び出し側は
 * 従来どおりの出現ベース広域スキャンへフォールバックする——網羅性は一切落ちない
 * （設計根拠は design/detailed-design.md §11.3 の該当追記を参照）。
 */

import path from 'node:path';
import { CANON_ROOT, posix } from './canon.js';

// コマンド実行系ツール。正典 docs/TOOLS.md の全ツールのうち任意コマンドを実行できるもの。
// ここに漏れがあると、そのツール経由で全ガードを迂回できる（シェル経路の封鎖）。列挙の網羅性が
// 単一障害点であるため、正典にツールが追加されたら必ず再確認すること。
//
// - Bash        : 詳細設計書 §11.3(b) が名指し
// - PowerShell  : 正典に実在（権限要）。Windows の主シェル。実測で素通りを確認し追加
// - Monitor     : 公式 tools-reference が「Runs a command in the background」と定義し、
//                 permission rule 対応表で `Bash(npm run *)` ルールが **Bash と Monitor の
//                 両方に適用される**と明記する。公式自身が Bash と同じコマンド実行系として
//                 扱っており、除外する理由が無い
export const SHELL_TOOLS = new Set(['Bash', 'PowerShell', 'Monitor']);

// fd 複製形（読取専用）: `2>&1`・`>&2`・`1>&2`・`2>&-` 等。`\d*>&\d*` の形はファイルへの
// 書込を伴わないため、書込操作の判定対象から除去する（L023）。
const FD_DUP_RE = /\d*>&\d*/g;

const WRITE_OP_RE =
  /(>>?|[|]\s*tee\b|\btee\s|\bcp\s|\bmv\s|\brm\s|\brmdir\b|\bmkdir\b|\bsed\s+-i|\bSet-Content\b|\bOut-File\b|\bNew-Item\b|\bRemove-Item\b|\bAdd-Content\b|\bnode\s+-e\b|writeFileSync|appendFileSync)/i;

/** コマンド文字列が書込操作らしいかを判定する（fd 複製形を誤検知しない・L023）。 */
export function looksLikeWriteCommand(command) {
  const withoutFdDup = String(command || '').replace(FD_DUP_RE, ' ');
  return WRITE_OP_RE.test(withoutFdDup);
}

// ---------------------------------------------------------------------------
// 宛先ベース判定（analyzeShellWrite）
// ---------------------------------------------------------------------------

// 不透明な実行構文: 中身を静的にパースできない（文字列として渡されたコードが実行される・
// 動的に生成された宛先が使われる等）。検出したら unresolved とし、出現ベースの広域スキャンへ
// フォールバックする（検出力を落とさないための安全弁）。
const OPAQUE_EXEC_RE =
  /\bnode\s+(-e|--eval)\b|\bpython[0-9.]*\s+(-c)\b|\b(bash|sh|zsh|powershell|pwsh)\s+(-c|-Command)\b|\bInvoke-Expression\b|\biex\b|\beval\b|\bxargs\b|\bfind\b.*-exec\b|writeFileSync|appendFileSync/i;

// 動的トークン: 変数展開・コマンド置換・グロブを含む宛先は静的に解決できない。
const DYNAMIC_TOKEN_RE = /[$`*?[\]{}]|%[A-Za-z_][A-Za-z0-9_]*%/;

// null シンク（実質的な書込ではない）。大小・スラッシュ表記ゆれを吸収するため小文字比較する。
const NULL_SINKS = new Set(['/dev/null', 'nul', '$null']);

const CD_RE = /^(?:cd|Set-Location|sl|pushd)\s+(.+)$/i;

// コマンド名 → 引数中の「宛先」の抽出規則。
//   all-args : 非フラグ引数すべてが宛先（複数ファイルを同時に操作しうる）
//   last-arg : 非フラグ引数の最後の1つだけが宛先（コピー/移動先。先頭側は読取元でしかない）
//   first-arg: 非フラグ引数の最初の1つだけが宛先（残りはデータ・値であり宛先ではない）
// 既存 WRITE_OP_RE の語彙（gates-and-tests.md「代表例でなく能力で書く」の対象）と同じ集合。
const ALL_ARGS_ARE_TARGETS = new Set(['rm', 'rmdir', 'mkdir', 'remove-item', 'tee', 'truncate']);
const LAST_ARG_IS_TARGET = new Set(['cp', 'mv', 'copy-item', 'move-item', 'install']);
const FIRST_ARG_IS_TARGET = new Set(['set-content', 'out-file', 'new-item', 'add-content']);
// PowerShell の名前付きパラメータで宛先が渡される呼出し形（位置引数を使わない場合の取りこぼし防止）。
const NAMED_DEST_FLAG_RE = /^-(Path|LiteralPath|Destination)$/i;

function stripQuotes(tok) {
  if (tok.length >= 2) {
    const a = tok[0];
    const b = tok[tok.length - 1];
    if ((a === "'" && b === "'") || (a === '"' && b === '"')) return tok.slice(1, -1);
  }
  return tok;
}

/** クォートを尊重した簡易トークナイズ（フルシェル文法パーサではない・保険的検査の範囲）。 */
function tokenize(segment) {
  const re = /'[^']*'|"[^"]*"|\S+/g;
  return (segment.match(re) || []).map(stripQuotes);
}

/**
 * heredoc の opener 行（`<<` より前のテキスト）が実ファイルへのリダイレクトを
 * 持つか（`cat > file <<EOF` の形）。持てば本文はデータ、持たなければ本文は
 * 実行されるコードと判定する。
 */
function openerHasFileRedirect(openerText) {
  return />{1,2}(?!\|)/.test(openerText.replace(FD_DUP_RE, ' '));
}

/**
 * データ heredoc の本文を判定対象から除去する。opener 行が実ファイルへの
 * リダイレクトを持つ heredoc（`cat > f <<EOF` ＝ 本文はデータであり、行き先は
 * リダイレクト先。リダイレクト先は別途 analyzeShellWrite 本体が抽出する）のみ
 * 本文を除去する。リダイレクト先を持たない heredoc（`bash <<EOF` ＝ 本文は
 * 即実行されるコード）は本文を残し、通常どおり走査対象にする。
 */
function stripDataHeredocBodies(command) {
  const lines = String(command || '').split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/<<-?\s*(['"]?)([A-Za-z_][\w]*)\1/);
    if (!m) {
      out.push(line);
      i++;
      continue;
    }
    const delim = m[2];
    const opener = line.slice(0, m.index);
    out.push(line); // opener 行自体は残す（リダイレクト先の抽出対象のため）
    i++;
    const bodyLines = [];
    while (i < lines.length && lines[i].trim() !== delim) {
      bodyLines.push(lines[i]);
      i++;
    }
    if (!openerHasFileRedirect(opener)) {
      out.push(...bodyLines); // 実行されるコード → 走査対象に残す
    }
    if (i < lines.length) {
      out.push(lines[i]); // delimiter 行自体は無害なので残す
      i++;
    }
  }
  return out.join('\n');
}

/** `;` `&&` `||` `|`（`>|` の一部は除く） 改行 で区切る（cd 追跡・宛先抽出の単位）。 */
function splitSegments(text) {
  return text
    .split(/\r?\n|&&|\|\||;|(?<!>)\|(?!\|)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveRel(baseDir, token, cwd) {
  const abs = path.resolve(baseDir || cwd || CANON_ROOT, token);
  return posix(path.relative(CANON_ROOT, abs));
}

/**
 * コマンド文字列を解析し、書込宛先の集合を「出現」でなく「宛先」として同定する。
 *
 * @param {string} command
 * @param {string} [cwd] 未指定時は CANON_ROOT を基準にする。
 * @returns {{ targets: string[], unresolved: boolean, scanText: string }}
 *   targets    : リポジトリ相対 posix パスへ正規化済みの書込宛先（重複除去）。
 *   unresolved : 静的に解決できない書込構文が1つ以上あったか。true のとき呼び出し側は
 *                従来どおりの出現ベース広域スキャン（PROTECTED_TOKEN_RE 等）へフォール
 *                バックすること——検出力を落とさないための安全弁。
 *   scanText   : データ heredoc 本文を除去した後のコマンド文字列（フォールバック走査に使う）。
 */
export function analyzeShellWrite(command, cwd) {
  const original = String(command || '');
  const scanText = stripDataHeredocBodies(original);

  // 不透明な実行構文はデータ heredoc 除去後のテキストに対して判定する（除去前の生テキストに
  // 対して判定すると、heredoc 本文の自然文中の語（"node -e for quick testing" 等）を実行構文と
  // 誤認しうるため）。
  if (OPAQUE_EXEC_RE.test(scanText)) {
    return { targets: [], unresolved: true, scanText };
  }

  const withoutFdDup = scanText.replace(FD_DUP_RE, ' ');
  const targets = [];
  let unresolved = false;
  let currentDir = null; // null = cwd 基準（未 cd）

  for (const segment of splitSegments(withoutFdDup)) {
    const cdMatch = segment.match(CD_RE);
    if (cdMatch) {
      const arg = stripQuotes(cdMatch[1].trim());
      if (!arg || DYNAMIC_TOKEN_RE.test(arg)) {
        unresolved = true;
      } else {
        currentDir = path.resolve(currentDir || cwd || CANON_ROOT, arg);
      }
      continue;
    }

    // リダイレクト宛先: `>` `>>` `N>` `&>` `&>>` `>|`（長い演算子を先に試す）。
    const redirectRe = /(?:^|\s)\d*(&>>|&>|>>|>\||>)\s*(\S+)/g;
    let rm;
    while ((rm = redirectRe.exec(segment))) {
      const raw = stripQuotes(rm[2]);
      if (!raw || raw.startsWith('&')) continue;
      if (NULL_SINKS.has(raw.toLowerCase())) continue; // 実質的な書込ではない
      if (DYNAMIC_TOKEN_RE.test(raw)) {
        unresolved = true;
        continue;
      }
      targets.push(resolveRel(currentDir, raw, cwd));
    }

    // 書込コマンドの引数からの宛先抽出。
    const tokens = tokenize(segment);
    if (tokens.length === 0) continue;
    const cmdIdx = tokens.findIndex((t) => /^[A-Za-z-]+$/.test(t));
    if (cmdIdx === -1) continue;
    const cmdLower = tokens[cmdIdx].toLowerCase();

    // コマンド自身の引数のみを見る（リダイレクト演算子以降は上のリダイレクト処理の管轄）。
    const argsRaw = [];
    for (let k = cmdIdx + 1; k < tokens.length; k++) {
      if (/[<>]/.test(tokens[k])) break;
      argsRaw.push(tokens[k]);
    }
    const args = argsRaw.filter((t) => !t.startsWith('-'));

    if (cmdLower === 'sed') {
      // WRITE_OP_RE と同じく `-i`（in-place）が無い sed は書込ではない（読取専用）。
      const hasInPlace = argsRaw.some((t) => /^-i/.test(t));
      if (!hasInPlace) continue;
      // sed の最初の非フラグ引数は式（データ）であり宛先ではない。残りがファイル。
      const files = args.slice(1);
      if (files.length === 0) unresolved = true;
      for (const f of files) {
        if (DYNAMIC_TOKEN_RE.test(f)) {
          unresolved = true;
          continue;
        }
        targets.push(resolveRel(currentDir, f, cwd));
      }
      continue;
    }

    if (ALL_ARGS_ARE_TARGETS.has(cmdLower)) {
      if (args.length === 0) unresolved = true;
      for (const a of args) {
        if (DYNAMIC_TOKEN_RE.test(a)) {
          unresolved = true;
          continue;
        }
        targets.push(resolveRel(currentDir, a, cwd));
      }
      continue;
    }

    if (LAST_ARG_IS_TARGET.has(cmdLower)) {
      if (args.length === 0) {
        unresolved = true;
        continue;
      }
      const dest = args[args.length - 1];
      if (DYNAMIC_TOKEN_RE.test(dest)) {
        unresolved = true;
        continue;
      }
      targets.push(resolveRel(currentDir, dest, cwd));
      continue;
    }

    if (FIRST_ARG_IS_TARGET.has(cmdLower)) {
      let dest = args[0];
      const namedIdx = argsRaw.findIndex((t) => NAMED_DEST_FLAG_RE.test(t));
      if (namedIdx !== -1 && argsRaw[namedIdx + 1]) dest = stripQuotes(argsRaw[namedIdx + 1]);
      if (!dest) {
        unresolved = true;
        continue;
      }
      if (DYNAMIC_TOKEN_RE.test(dest)) {
        unresolved = true;
        continue;
      }
      targets.push(resolveRel(currentDir, dest, cwd));
      continue;
    }
  }

  return { targets: [...new Set(targets)], unresolved, scanText };
}

/** rel が dirs のいずれかの配下（またはそのもの）かを判定する（dirs は末尾スラッシュ無し）。 */
export function underAnyDir(rel, dirs) {
  return dirs.some((d) => rel === d || rel.startsWith(`${d}/`));
}

/** rel が output/<ts>/.gate/** に相当するセグメントを含むか（3ガード共通の deny-all 対象）。 */
export function containsGateSegment(rel) {
  return /(^|\/)\.gate\//.test(rel);
}
