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
 */

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
