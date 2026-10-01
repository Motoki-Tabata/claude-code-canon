/**
 * サンプルリポジトリ3件（new・existing・constrained）の全ファイル。{ リポジトリ名: { 相対パス: 内容 } }。
 *
 * - new: 既存カスタマイズの無いプロジェクト（新規モード）
 * - existing: keep・merge・retire を含む既存カスタマイズのあるプロジェクト（改修モード）
 * - constrained: hooks・mcp・plugins・experimental を禁止した制約強めのプロジェクト
 *
 * 各リポジトリの expected-output/ は output/<ts>/ に、expected-work/ は work/<ts>/ に置く想定の成果物。
 * それ以外は対象リポジトリ本体（keep の原本・配置先）。書き出しは tests/helpers/fixtures.js が行う。
 */

export const SAMPLE_REPOS = {
  "new": {
    "README.md": `# todo-api

A small REST API for managing todos, built with Express.

This is a **fixture target project** for claude-canon's acceptance scenario (1):
a greenfield project with **no existing \`.claude/\` customization**. Running a claude-canon run
against this directory should produce a from-scratch customization set.

## Endpoints

- \`GET /todos\` — list all todos
- \`GET /todos/:id\` — fetch one todo
- \`POST /todos\` — create a todo (\`{ "title": "..." }\`)

## Development

\`\`\`
npm install
npm test      # node --test
npm run lint  # eslint src
npm start     # node src/server.js
\`\`\`

## Conventions

- ES modules (\`"type": "module"\`)
- Tests colocated under \`tests/\`, run with the built-in Node test runner
- Lint with ESLint (flat config)
`,
    "expected-output/deploy/managed-paths.list": `# 管理パス集合。1行1パス・対象リポジトリルートからの相対。
# greenfield: 既存管理ファイルは無く、下記が新規配置される。
CLAUDE.md
.claude/skills/todo-helper/SKILL.md
`,
    "expected-output/deploy/retired.list": `# retire 対象（disposition:retire を対象相対パスへ）。greenfield では無し。
`,
    "expected-output/generated/.claude/skills/todo-helper/SKILL.md": `---
name: todo-helper
description: todo-api の CRUD 実装補助（deploy テスト用の最小 fixture）
---

# todo-helper

todo-api のエンドポイント追加を補助する最小スキル。
`,
    "expected-output/generated/CLAUDE.md": `# todo-api

Claude Code カスタマイズ（claude-canon 生成・greenfield シナリオ(1)）。
このファイルは deploy テストの期待生成物であり、実プロジェクト運用物ではない。
`,
    "package.json": `{
  "name": "todo-api",
  "version": "0.1.0",
  "description": "A small REST API for managing todos. Fixture target project for claude-canon scenario (1): greenfield, no existing .claude/ customization.",
  "type": "module",
  "scripts": {
    "test": "node --test",
    "lint": "eslint src",
    "start": "node src/server.js"
  },
  "dependencies": {
    "express": "^4.19.0"
  },
  "devDependencies": {
    "eslint": "^9.0.0"
  }
}
`,
    "src/server.js": `import express from 'express';
import { createTodo, listTodos, getTodo } from './todos.js';

const app = express();
app.use(express.json());

app.get('/todos', (req, res) => {
  res.json(listTodos());
});

app.get('/todos/:id', (req, res) => {
  const todo = getTodo(req.params.id);
  if (!todo) return res.status(404).json({ error: 'not found' });
  res.json(todo);
});

app.post('/todos', (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  res.status(201).json(createTodo(title));
});

const port = process.env.PORT ?? 3000;
app.listen(port, () => console.log(\`todo-api listening on \${port}\`));
`,
    "src/todos.js": `// In-memory todo store. Deliberately simple — this is a fixture, not a real app.
let nextId = 1;
const todos = new Map();

export function createTodo(title) {
  const todo = { id: String(nextId++), title, done: false };
  todos.set(todo.id, todo);
  return todo;
}

export function listTodos() {
  return [...todos.values()];
}

export function getTodo(id) {
  return todos.get(id) ?? null;
}
`,
    "tests/todos.test.js": `import test from 'node:test';
import assert from 'node:assert/strict';
import { createTodo, listTodos, getTodo } from '../src/todos.js';

test('createTodo assigns an id and defaults done to false', () => {
  const t = createTodo('write docs');
  assert.equal(t.title, 'write docs');
  assert.equal(t.done, false);
  assert.ok(t.id);
});

test('getTodo returns null for unknown id', () => {
  assert.equal(getTodo('does-not-exist'), null);
});

test('listTodos includes created todos', () => {
  const before = listTodos().length;
  createTodo('another');
  assert.equal(listTodos().length, before + 1);
});
`,
  },
  "existing": {
    ".claude/skills/kept-skill/SKILL.md": `---
name: kept-skill
description: 維持されるスキル（keep・sha256 バイト同一で verbatim コピーされる）
---

# kept-skill

このスキルは keep 判定され、既存実体がそのまま維持される（V7 の非回帰の対象）。
`,
    ".claude/skills/legacy-skill/SKILL.md": `---
name: legacy-skill
description: 廃止されるスキル（disposition:retire・退避スワップで対象から消える）
---

# legacy-skill

このスキルは retire 判定され、output から除外される。deploy で退避され対象から消える。
`,
    ".claude/skills/merge-a/SKILL.md": `---
name: merge-a
description: 統廃合の被統合元A（disposition:merge・merged へ統合され対象から消える）
---

# merge-a

このスキルは merge-b と共に merged へ統合される（統廃合）。
`,
    ".claude/skills/merge-b/SKILL.md": `---
name: merge-b
description: 統廃合の被統合元B（disposition:merge・merged へ統合され対象から消える）
---

# merge-b

このスキルは merge-a と共に merged へ統合される（統廃合）。
`,
    ".github/workflows/ci.yml": `# 管理パス集合【外】の不可侵ファイル。deploy は一切触れてはならない。
name: ci
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo "canon の退避スワップはこのファイルを破壊しないこと"
`,
    "CLAUDE.md": `# existing project (旧・canon 導入前)

これは既存改修シナリオ(2)の対象リポジトリ雛形。CLAUDE.md は modify 対象。
`,
    "CODEOWNERS": `# 管理パス集合【外】の不可侵ファイル。deploy は一切触れてはならない。
* @existing-team
`,
    "expected-output/deploy/managed-paths.list": `# 管理パス集合。既存改修(2): keep/modify/新規の配置対象。
CLAUDE.md
.claude/skills/kept-skill/SKILL.md
.claude/skills/new-skill/SKILL.md
.claude/skills/merged/SKILL.md
`,
    "expected-output/deploy/retired.list": `# 対象から意図的に消えるファイル（disposition:retire ＋ merge 被統合元）。
.claude/skills/legacy-skill/SKILL.md
.claude/skills/merge-a/SKILL.md
.claude/skills/merge-b/SKILL.md
`,
    "expected-output/design-map.md": `# design-map（existing シナリオ・fixture）

対象: 既存改修(2)。keep / modify / merge / retire / 新規 の5判定を網羅する。
V7 のパース対象（\`existing_disposition\`）を持つ最小 design-map。

## 既存判定

\`\`\`yaml
existing_disposition:
  - path: .claude/skills/kept-skill/SKILL.md
    disposition: keep
    keep_conditions:
      K1_canon_clean: true
      K2_no_requirement_conflict: true
      K3_dependency_healthy: true
      K4_strength_consistent: true
      K5_project_refs_resolved: true
    rationale: "既存のまま維持（keep・verbatim コピー）"
  - path: CLAUDE.md
    disposition: modify
    manifest_note: "canon により CLAUDE.md を更新"
  - path: .claude/skills/legacy-skill/SKILL.md
    disposition: retire
    reason_code: superseded_by_new
    superseded_by: .claude/skills/new-skill/SKILL.md
    manifest_note: "legacy-skill は廃止し new-skill へ移行"
  - path: .claude/skills/merge-a/SKILL.md
    disposition: merge
    superseded_by: .claude/skills/merged/SKILL.md
    manifest_note: "merge-a は merged へ統合"
  - path: .claude/skills/merge-b/SKILL.md
    disposition: merge
    superseded_by: .claude/skills/merged/SKILL.md
    manifest_note: "merge-b は merged へ統合"
\`\`\`
`,
    "expected-output/generated/.claude/skills/kept-skill/SKILL.md": `---
name: kept-skill
description: 維持されるスキル（keep・sha256 バイト同一で verbatim コピーされる）
---

# kept-skill

このスキルは keep 判定され、既存実体がそのまま維持される（V7 の非回帰の対象）。
`,
    "expected-output/generated/.claude/skills/merged/SKILL.md": `---
name: merged
description: merge-a と merge-b を統合した後継スキル（統合先・新規生成）
---

# merged

merge-a / merge-b を統廃合した後継スキル。
`,
    "expected-output/generated/.claude/skills/new-skill/SKILL.md": `---
name: new-skill
description: 新規追加されるスキル（disposition:新規・deploy で対象へ配置される）
---

# new-skill

このスキルは canon が新規生成し、対象へ配置される。
`,
    "expected-output/generated/CLAUDE.md": `# existing project (canon により更新)

これは既存改修シナリオ(2)の期待生成物。CLAUDE.md は modify で内容が更新される。
`,
    "expected-work/investigation/existing.md": `# existing.md（fixture）

## サマリ
総数 4 / L2 4 / 正典逸脱の疑い: なし

## レコード（1ファイル1件）
- path: .claude/skills/kept-skill/SKILL.md
  layer: L2
  kind: skill
  strength: medium
  depends_on:
    customization_refs: []
    project_refs:
      - kind: paths_glob  value: "src/**/*.js"
  canon_conformance:
    frontmatter_keys_valid: true
    unknown_frontmatter_keys: []
    tool_names_valid: true
    deprecated_notation: []
- path: .claude/skills/legacy-skill/SKILL.md
  layer: L2
  kind: skill
  strength: low
  depends_on:
    customization_refs: []
    project_refs: []
  canon_conformance:
    frontmatter_keys_valid: true
    unknown_frontmatter_keys: []
    tool_names_valid: true
    deprecated_notation: []
- path: .claude/skills/merge-a/SKILL.md
  layer: L2
  kind: skill
  strength: low
  depends_on:
    customization_refs: []
    project_refs: []
  canon_conformance:
    frontmatter_keys_valid: true
    unknown_frontmatter_keys: []
    tool_names_valid: true
    deprecated_notation: []
- path: .claude/skills/merge-b/SKILL.md
  layer: L2
  kind: skill
  strength: low
  depends_on:
    customization_refs: []
    project_refs: []
  canon_conformance:
    frontmatter_keys_valid: true
    unknown_frontmatter_keys: []
    tool_names_valid: true
    deprecated_notation: []
`,
    "expected-work/investigation/profile.md": `# profile.md（fixture）

## profile
languages: [javascript]
frameworks: []
test: { frameworks: [node:test], test_dirs: [tests] }
`,
    "expected-work/investigation/focused.md": `# focused.md（fixture）

## focused
requirement_ref: R1
scope: existing 改修
findings:
  - topic: 既存スキル構成
    evidence_paths: [.claude/skills/kept-skill/SKILL.md]
    summary: kept-skill は維持対象
ref_resolution:
  - ref: "src/**/*.js"  kind: paths_glob  resolved: true  match_count: 1  sample: "src/app.js"
`,
    "src/app.js": `// 集合外のプロジェクトソース。deploy の退避スワップ対象ではない（不可侵）。
export function app() {
  return 'existing app';
}
`,
  },
  "constrained": {
    ".claude/settings.json": `{
  "_comment": "既存の Hooks 設定。組織ポリシーで Hooks が禁止されたため canon では retire される（生成物に持ち越さない）。",
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{ "type": "command", "command": "node scripts/check-schema.js" }]
      }
    ]
  }
}
`,
    ".claude/skills/fork-runner/SKILL.md": `---
name: fork-runner
description: 大きな調査を別コンテキストで実行する。実験機能 context:fork に依存する。
context: fork
---

# fork-runner

調査結果をメイン文脈に残さないために \`context: fork\`（実験機能）を使っている。

experimental が禁止された環境では維持できないため、canon では retire される。
`,
    ".claude/skills/style-guide/SKILL.md": `---
name: style-guide
description: このリポジトリのコーディング規約を参照する。命名・エラー処理・ESM の書き分けで迷ったときに使う。
---

# style-guide

- ESM のみ。CommonJS を新規に足さない。
- エラーは例外で伝え、戻り値の null で表現しない。
- 公開関数には JSDoc の1行説明を付ける。

この Skill は canon 導入後も keep 判定される（制約に触れず、新要件とも重複しない）。
`,
    "expected-output/deploy/managed-paths.list": `# 管理パス集合。代表シナリオ(3): 新規＋keep の配置対象。
CLAUDE.md
.claude/README.md
.claude/rules/schema-review.md
.claude/skills/style-guide/SKILL.md
`,
    "expected-output/deploy/retired.list": `# 対象から意図的に消えるファイル（disposition:retire ＋ merge 被統合元）。
# 制約強め: hooks / experimental が禁止されたことで維持できなくなった既存2件。
.claude/settings.json
.claude/skills/fork-runner/SKILL.md
`,
    "expected-output/MANIFEST.md": `# MANIFEST（constrained シナリオ・fixture）

## 新規
- CLAUDE.md（L1・プロジェクト規約）
- .claude/rules/schema-review.md（L1 Rules・R1 の advisory 縮退先）
- .claude/README.md（使い方）

## 維持（keep）
- .claude/skills/style-guide/SKILL.md（verbatim・V7 で sha256 照合）

## 廃止（retire）
- .claude/settings.json — hooks 禁止により Hooks 設定を廃止。R1 は Rules(advisory) へ縮退
- .claude/skills/fork-runner/SKILL.md — experimental 禁止により context:fork 依存を廃止

## 全ファイル
- \`.claude/README.md\`
- \`.claude/rules/schema-review.md\`
- \`.claude/skills/style-guide/SKILL.md\`
- \`CLAUDE.md\`
`,
    "expected-output/design-map.md": `# design-map（constrained シナリオ・fixture）

対象: 代表シナリオ(3)「制約強め」。constraints（hooks / mcp / plugins / experimental すべて禁止）で
機能選択を事前刈り込みした設計。R1 は deterministic を実現できないため L1 Rules（advisory）へ縮退する。

## Used Features
L1: CLAUDE.md ＋ Rules（縮退先） / L2: Skills（既存 keep）
L4 Hooks・MCP: N/A（constraints で禁止） / L5 Plugin: N/A（constraints で禁止）

## レイヤー構成
L1: CLAUDE.md（プロジェクト規約）＋ .claude/rules/schema-review.md（R1 の縮退先・paths で src へ接地）
L2: .claude/skills/style-guide/SKILL.md（既存を keep）
L4: 不使用（hooks・mcp とも constraints で禁止）
L5: 不使用（plugins は constraints で禁止）

## 既存判定

\`\`\`yaml
existing_disposition:
  - path: .claude/skills/style-guide/SKILL.md
    disposition: keep
    keep_conditions:
      K1_canon_clean: true
      K2_no_requirement_conflict: true
      K3_dependency_healthy: true
      K4_strength_consistent: true
      K5_project_refs_resolved: true
    rationale: "制約に触れず新要件とも重複しないため維持（verbatim コピー）"
  - path: .claude/settings.json
    disposition: retire
    reason_code: prohibited_by_constraints
    superseded_by: .claude/rules/schema-review.md
    manifest_note: "hooks 禁止により settings.json の Hooks 設定は廃止。R1 は Rules(advisory) へ縮退"
  - path: .claude/skills/fork-runner/SKILL.md
    disposition: retire
    reason_code: prohibited_by_constraints
    manifest_note: "experimental 禁止により context:fork 依存の fork-runner は廃止"
\`\`\`

## L1（builder）
### \`CLAUDE.md\`（新規）
プロジェクト規約。
### \`.claude/rules/schema-review.md\`（新規・R1 の縮退先）
\`paths:\` で \`src/**/*.js\` に接地する advisory rule。

## L2（keep を verbatim コピー）
### \`.claude/skills/style-guide/SKILL.md\`（keep）

## L4（不使用）
## L5（emit-manifest.js）
### \`.claude/README.md\`（新規）

## Model Assignments
N/A（本 fixture は Subagent を生成しない）

## Interface Contracts
schema-review（L1 Rules）は src/**/*.js の編集時に自動ロードされ、style-guide（L2）は必要時に参照される。

## Experimental Dependencies
なし（experimental は constraints で禁止。context:fork / Agent Teams / Channels / Monitors / Themes とも不使用）

## 依存フラグ
nesting: 1段 / isolation:worktree: 不要
`,
    "expected-output/generated/.claude/README.md": `# .claude/ の使い方（constrained-app）

本構成は Hooks / MCP / Plugin / 実験機能を使用しない（組織ポリシーによる制約）。
セットアップに必要な追加手順・環境変数・外部接続は無い。ファイルを配置するだけで有効になる。

## 生成物一覧

| コンポーネント | 層 | 起動方式 | 用途 |
|---|---|---|---|
| CLAUDE.md | L1 | 常時ロード | プロジェクト規約の入口 |
| schema-review | L1 Rules | 自動ロード（paths: src/**/*.js に一致する編集時） | スキーマ変更時のレビュー観点（R1 の縮退先） |
| style-guide | L2 Skill | 「規約に沿っているか」と依頼すると自動発動。\`/style-guide\` でも起動可 | コーディング規約の参照（既存を維持） |

## 注意

schema-review は advisory であり、Hooks のような機械強制ではない。
R1 が求めた deterministic は hooks 禁止のため実現していない（requirements.md の conflicts 参照）。
`,
    "expected-output/generated/.claude/rules/schema-review.md": `---
paths: src/**/*.js
---

# スキーマ変更時のレビュー観点（R1・advisory へ縮退）

R1 は本来 deterministic（Hooks による機械強制）を望んだが、constraints で hooks が
禁止されているため advisory（自動ロードされる Rules）へ縮退した（requirements.md の
conflicts に記録済み）。強制力は無く、以下は Claude が読む規約である。

- スキーマのフィールドを追加・改名したら、影響する呼び出し箇所を列挙してから編集する。
- 破壊的変更は必ず理由と移行手順を PR 本文に書く。
- 既存フィールドの型変更は互換性の観点から原則避ける。
`,
    "expected-output/generated/.claude/skills/style-guide/SKILL.md": `---
name: style-guide
description: このリポジトリのコーディング規約を参照する。命名・エラー処理・ESM の書き分けで迷ったときに使う。
---

# style-guide

- ESM のみ。CommonJS を新規に足さない。
- エラーは例外で伝え、戻り値の null で表現しない。
- 公開関数には JSDoc の1行説明を付ける。

この Skill は canon 導入後も keep 判定される（制約に触れず、新要件とも重複しない）。
`,
    "expected-output/generated/CLAUDE.md": `# constrained-app

ESM のみの小さな API プロジェクト。テストは \`node --test\`。

## この構成について

組織ポリシーにより Hooks / MCP / Plugin / 実験機能は使用しない。
自動実行による機械強制の代わりに、L1 Rules（自動ロードされる規約）で運用する。

- スキーマ変更時のレビュー観点は \`.claude/rules/schema-review.md\` が担う（R1 の縮退先）。
- コーディング規約は既存の style-guide Skill を維持している。
`,
    "expected-work/investigation/existing.md": `# existing.md（fixture・制約強め）

## サマリ
総数 3 / L2 2 / L4 1 / 正典逸脱の疑い: fork-runner が experimental 依存

## レコード（1ファイル1件）
- path: .claude/skills/style-guide/SKILL.md
  layer: L2
  kind: skill
  strength: medium
  depends_on:
    customization_refs: []
    project_refs:
      - kind: paths_glob  value: "src/**/*.js"
  canon_conformance:
    frontmatter_keys_valid: true
    unknown_frontmatter_keys: []
    tool_names_valid: true
    deprecated_notation: []
- path: .claude/skills/fork-runner/SKILL.md
  layer: L2
  kind: skill
  strength: low
  depends_on:
    customization_refs: []
    project_refs: []
  canon_conformance:
    frontmatter_keys_valid: true
    unknown_frontmatter_keys: []
    tool_names_valid: true
    deprecated_notation: []
- path: .claude/settings.json
  layer: L4
  kind: settings
  strength: high
  depends_on:
    customization_refs: []
    project_refs: []
  canon_conformance:
    frontmatter_keys_valid: true
    unknown_frontmatter_keys: []
    tool_names_valid: true
    deprecated_notation: []
`,
    "expected-work/investigation/profile.md": `# profile.md（fixture）

## profile
languages: [javascript]
frameworks: []
test: { frameworks: [node:test], test_dirs: [tests] }
`,
    "expected-work/investigation/focused.md": `# focused.md（fixture）

## focused
requirement_ref: R1
scope: 制約強め（hooks/mcp/plugins/experimental すべて禁止）
findings:
  - topic: 既存 Hooks 設定
    evidence_paths: [.claude/settings.json]
    summary: PostToolUse で schema チェックを機械強制していたが、hooks 禁止により維持できない
  - topic: 実験機能への依存
    evidence_paths: [.claude/skills/fork-runner/SKILL.md]
    summary: context:fork に依存しており experimental 禁止により維持できない
ref_resolution:
  - ref: "src/**/*.js"  kind: paths_glob  resolved: true  match_count: 1  sample: "src/schema.js"
`,
    "expected-work/requirements.md": `# requirements（fixture・制約強め）

## メタ
confirmed_at: 2026-07-24
confirmed_by: fixture

## 確定要件（人間が言ったこと・合意したこと）
- id: R1
  want: API スキーマ変更時にレビュー観点の確認を必ず通したい
  strength_needed: deterministic
  priority: must
- id: R2
  want: コーディング規約を Claude が参照できるようにしたい
  strength_needed: advisory
  priority: should

## 使用可能なカスタマイズ機能（環境制約・探索空間の事前刈り込み）
constraints:
  hooks:        { allowed: false, reason: "組織ポリシーで自動実行される仕組みを禁止（監査ログの対象にできない）" }
  mcp:          { allowed: false, reason: "外部接続はネットワークポリシーで不可" }
  plugins:      { allowed: false, reason: "配布基盤を持たず個別ファイル配置のみ" }
  experimental: { allowed: false, reason: "実験機能への本番依存を禁止" }
  organization_policy: "生成物は監査可能な平文ファイルに限る"

## 制約と要件の衝突（ヒアリング時点で見えたもの・方向づけまで）
conflicts:
  - requirement: R1（deterministic 希望）
    constraint: hooks 禁止
    note: Hooks が使えないため deterministic は実現できない。L1 Rules による advisory へ格下げする（P1 で合意）。
`,
    "package.json": `{
  "name": "constrained-app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "代表シナリオ(3)『制約強め』の対象リポジトリ雛形。hooks/mcp/plugins/experimental がすべて禁止された環境。",
  "scripts": {
    "test": "node --test tests/"
  }
}
`,
    "src/schema.js": `// 代表シナリオ(3) の対象コード。API スキーマ定義（レビュー規約の接地先）。
export const schema = {
  todo: { id: 'string', title: 'string', done: 'boolean' },
};
`,
  },
};

/** サンプルリポジトリごとの handoff.md の mode（existing_disposition を持つものは refactor）。 */
export const SAMPLE_MODES = { new: 'new', existing: 'refactor', constrained: 'refactor' };
