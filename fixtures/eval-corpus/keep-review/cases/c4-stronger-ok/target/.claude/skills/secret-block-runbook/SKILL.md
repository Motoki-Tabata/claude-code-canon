---
name: secret-block-runbook
description: Operate the secret-blocking commit guard. Use when the pre-commit guard fires or needs maintenance.
---

# secret-block-runbook

認証情報を含む変更を PreToolUse hook で機械的に阻止する機構の運用手順。

## 仕組み
`.claude/settings.json` の PreToolUse が、コミット差分に API キー・トークン様の文字列を
検出したら **deny する**（advisory な注意でなく、機械的な阻止）。

## 誤検出のとき
テスト用のダミー値で誤検出したら、`fixtures/` 配下に置き allowlist の記法で除外する。

## 復旧
hook が壊れて素通りし始めたら、settings.json の matcher を確認する。
