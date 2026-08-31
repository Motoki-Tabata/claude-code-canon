#!/usr/bin/env node
/**
 * G13 ワーカー権限ポリシー（自己・preflight）。詳細設計書 §11.2・§11.3(b)・§11.4・§11.5。
 *
 * 対象は **claude-canon 自身** の `<canon_root>/.claude/agents/**\/*.md` の frontmatter
 * `tools:` のみ。生成物（`output/<ts>/generated/.claude/agents/**` や配置後の対象プロジェクト
 * `.claude/agents/**`）には絶対に適用しない（§11.2・§11.4「G13 だけは向きが逆」）。
 * この分離はパスの構造そのもので成り立つ: `checkG13()` は `<canon_root>/.claude/agents/`
 * 配下しか歩かないため、`output/` 配下は最初からスコープに入らない（別ツリー）。
 *
 * 発火系統: **preflight**（`UserPromptExpansion@/canon`）。G3〜G6 のような per-file 系統に
 * 相乗りできない理由は詳細設計書 §11.2 に明記されている: write-scope-guard が `.claude/` を
 * 保護しているため、対象ファイルは run 中に一度も書かれず、per-file 系統では発火機会が
 * 構造的にゼロになる（vacuous pass・§11.5）。ゆえに run 開始前＝preflight で検査する。
 *
 * 発火契機が `UserPromptExpansion` であるため、判定は `.gate/processed.log` へ記録しない
 * （<ts> がまだ採番されていない段階で発火するため、記録先の run が存在しない。順序は
 * 詳細設計書 §11.5: G13 →（<ts> 採番）→ カナリア → 工程1）。
 *
 * ## 禁止ツール集合の判断根拠（実装時に確定・オーケストレータからの指摘を受けて拡張）
 *
 * 設計書の原文は「`tools:` に Bash が含まれていたら違反」だが、これは Bash **単体**を
 * 名指ししているに過ぎない。シェル経路の封鎖の実質的な主張は「ワーカーがコマンド実行系ツールを
 * 持たないこと」（§11.3(b) (i)）であり、Bash はその代表例の1つに過ぎない。
 * 正典 `docs/TOOLS.md` の全ツールのうち、write-scope-guard の Write/Edit/MultiEdit/
 * NotebookEdit 経路（tool_input のファイルパスで判定）を経由せず、かつ Bash と同様の
 * コマンド文字列ベースで動く——つまり write-scope-guard の (ii) Bash 文字列検査を
 * 実装時に見落とすと素通りしうる——ツールを洗い出した:
 *
 *   - **Bash**: 設計書が直接名指しする対象（§11.2・§11.3(b)）。
 *   - **PowerShell**: `docs/TOOLS.md:61` に正規ツールとして掲載される別のシェル実行系
 *     ツール。本環境（Windows）では既定シェルになり得る。write-scope-guard を Bash 単体
 *     しか見ないまま実装すると、`tools: Read PowerShell` を持つワーカーが Bash 剥奪の
 *     機械強制を素通りする（オーケストレータが write-scope-guard の実測で確認・
 *     2026-07-16）。docs/TOOLS.md 自体はツール名と permission_required の2列のみで
 *     機能説明を持たない（`docs/TOOLS.md:39`「説明の複製は行わない」）ため、
 *     「PowerShell がコマンド実行系である」という判断は正典単体からは機械抽出できず、
 *     一次ソース（https://code.claude.com/docs/en/tools-reference）の実際の記述
 *     （"Executes PowerShell commands natively"）に基づく。
 *   - **Monitor**: 一見ログ監視ツールだが、一次ソースの permission rule 対応表
 *     （https://code.claude.com/docs/en/tools-reference の rule format 表）は
 *     `Bash(npm run *)` 形式のルールが **"Bash, Monitor" の両方に適用される**と明記する。
 *     Monitor は「バックグラウンドでコマンドを実行し、Bash と同一の許可/拒否ルールで
 *     駆動される」ツールであり、実体はコマンド実行系である。write-scope-guard の
 *     Bash 文字列検査（(ii)）は tool_name === 'Bash' の場合のみ tool_input.command を
 *     見る設計になりやすく、Monitor 経由のコマンド実行はその検査を素通りしうる。
 *
 * 検討して**除外した**ツール（根拠つき）:
 *   - **Agent**: 別の Subagent を spawn するだけで、呼び出し元に直接の書込/実行手段を
 *     与えない。spawn された Subagent 自身の Write/Edit/Bash 呼出は、同一セッション内の
 *     PreToolUse フックに独立して掛かる（バイパスにならない）。加えて、それが
 *     claude-canon 自身の `.claude/agents/**` 定義であれば G13 自身がその定義の
 *     `tools:` も検査する（再帰的に閉じている）。
 *   - **Workflow**: 「多数の Subagent をバックグラウンドで束ねて1つの結果に集約する
 *     スクリプト」（一次ソース）。Agent と同型で、実際の書込/実行は束ねられた
 *     Subagent 側の個別ツール呼出として行われ、それぞれ独立して PreToolUse に掛かる。
 *     生の任意コード実行プリミティブを持つとは一次ソースからは読めない。
 *   - **LSP**: 定義ジャンプ・参照検索・型検査など読取専用の機能のみ（一次ソース）。
 *     書込/実行手段を持たない。
 *   - **RemoteTrigger**: claude.ai 上の Routine（`/schedule`）の作成/実行に留まり、
 *     ローカルファイルへの書込手段ではない。ワーカーの正当な用途も無い。命令実行の
 *     定義（「コマンド実行・任意コード実行」）には該当しないため除外するが、将来
 *     Routine がローカル書込権限を持つよう変更されたら再検討が要る。
 *   - **Skill**: 別の懸念を発見したが対象外（下記「別ホールとして報告」参照）。
 *
 * ## 別ホールとして報告（本ゲートのスコープ外）
 *
 * `docs/L2_SKILLS.md` の「Dynamic Context Injection」（`` !`command` `` 構文）は、
 * SKILL.md 本文内でシェルコマンドを実行できる別の経路である。これは呼び出し元
 * ワーカーの `tools:`（Bash/PowerShell/Monitor の有無）に依存せず、**SKILL.md 自身の
 * `allowed-tools: Bash(...)` 宣言**と `settings.json` の `disableSkillShellExecution`
 * で制御される。G13 のスコープは `<canon_root>/.claude/agents/**\/*.md` の `tools:` に
 * 限定される（§11.2）ため、`.claude/skills/**` のこの経路は本ゲートの対象外。
 * 現状 claude-canon 自身は `.claude/skills/canon/` 以外に worker 向け Skill を持たず
 * `!`command`` 構文の使用も確認されていないが、将来 worker が `Skill` ツールを持ち、
 * かつ preload/呼出対象の SKILL.md が `!`command`` を含む場合は別途対策が要る
 * （新設ゲート、または settings.json 側の `disableSkillShellExecution: true` 固定）。
 * 本実装ではこの経路への対策は行っていない。
 *
 * ## 出典の位置づけ（§11.4 との関係）
 *
 * 上記の禁止ツール集合は `gates/conformance_tables/tools.json` からは機械抽出できない
 * （同表はツール名と permission_required のみを持ち、機能説明を持たない
 * ＝ `docs/TOOLS.md` 自体が意図的に説明を複製していないため）。ゆえに正典を書き換える
 * のではなく、G13 は既存の2つの例外（G11: requirements.md 由来／G3 の1項目: 設計書
 * §11.2 由来）と同じ枠組みで、**本ファイル内の自己規律**として禁止集合を保持する。
 * 実機の一次ソースが変われば（新しいコマンド実行系ツールの追加等）、このコメントと
 * 配列を人手で更新すること（自動追従はできない）。
 */

import path from 'node:path';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { CANON_ROOT, posix } from './lib/canon.js';
import { loadArtifact, violation, splitListValue } from './lib/artifact.js';
import { blockStop, passStop, readHookInput, isMainModule } from './lib/run.js';

const GATE = 'G13';

/** コマンド実行系ツール（G13 の禁止集合）。根拠はファイル冒頭コメントを参照。 */
export const COMMAND_EXECUTION_TOOLS = ['Bash', 'PowerShell', 'Monitor'];

/** G13 のスコープ: claude-canon 自身のワーカー定義ディレクトリ（生成物には絶対適用しない）。 */
export function agentsRootFor(canonRoot) {
  return path.join(canonRoot, '.claude', 'agents');
}

/** `<root>/**\/*.md` を再帰的に収集する。root が存在しなければ空配列（正当な不在・後述）。 */
function walkMd(root) {
  if (!existsSync(root)) return [];
  let out = [];
  for (const name of readdirSync(root)) {
    const p = path.join(root, name);
    const st = statSync(p);
    if (st.isDirectory()) out = out.concat(walkMd(p));
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

/**
 * G13 本体。純関数（ファイル読取はするが、書込・プロセス終了などの副作用は一切ない）。
 *
 * @param {{canonRoot?: string}} opts canonRoot はテスト時にのみ差し替える
 *   （本番は既定の CANON_ROOT を使う。実リポジトリの `.claude/agents/` を汚さずに
 *   スクラッチ fixture で違反注入テストができるようにするための注入口）。
 * @returns {{ok:boolean, violations:Array, checked:number, scanned:string[], agentsRootExists:boolean}}
 */
export function checkG13({ canonRoot = CANON_ROOT } = {}) {
  const agentsRoot = agentsRootFor(canonRoot);
  const agentsRootExists = existsSync(agentsRoot);
  const files = walkMd(agentsRoot);
  const violations = [];

  for (const f of files) {
    const artifact = loadArtifact(f);

    // frontmatter が無い、またはパース失敗 → tools: を安全に判定できない。
    // 黙って pass にすると「読めなかったから何も言わなかった」が「合格」と区別できず
    // vacuous pass になる（§11.5 と同型の事故）。ゆえに違反とする。
    if (!artifact.frontmatterPresent) {
      violations.push(
        violation(
          GATE,
          artifact.path,
          'agent 定義ファイルに frontmatter（--- ブロック）が無い。tools: の有無・内容を安全に判定できないため違反（vacuous pass 防止・§11.2）。',
          '§11.2 G13'
        )
      );
      continue;
    }
    if (artifact.errors.length > 0) {
      violations.push(
        violation(
          GATE,
          artifact.path,
          `frontmatter の解析に失敗した箇所がある（${artifact.errors.map((e) => e.type).join(', ')}）。` +
            'tools: を安全に判定できないため違反（vacuous pass 防止・§11.2）。',
          '§11.2 G13'
        )
      );
      continue;
    }

    const toolsEntry = artifact.frontmatter.tools;
    if (!toolsEntry) {
      // tools: 省略 = 全ツール継承 = Bash を含む（docs/TOOLS.md §2.3 "Inherits all
      // tools if omitted."）。省略を黙って通すと Bash 剥奪の機械強制が骨抜きになる
      // ため違反とする（判断に迷う場合は安全側＝違反、という方針を適用）。
      violations.push(
        violation(
          GATE,
          artifact.path,
          'frontmatter に tools: が無い（省略）。省略時は全ツールを継承しコマンド実行系ツールを含むため違反。' +
            '最小権限で明示列挙すること（disallowedTools での除外ではなく tools: の allowlist を使うこと）。',
          'docs/TOOLS.md §2.3「Inherits all tools if omitted.」・§11.3(b)'
        )
      );
      continue;
    }

    const tokens = splitListValue(toolsEntry);
    const found = tokens.filter((t) => COMMAND_EXECUTION_TOOLS.includes(t));
    if (found.length > 0) {
      violations.push(
        violation(
          GATE,
          artifact.path,
          `tools: にコマンド実行系ツール（${found.join(', ')}）が含まれる。claude-canon 自身のワーカーは` +
            'コマンド実行系ツールを保持してはならない（§11.3(b) の機械強制）。execute を要する処理は gates/ と tools/ CLI が持つ。',
          '§11.2 G13・§11.3(b)'
        )
      );
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    checked: files.length,
    scanned: files.map((f) => posix(path.relative(canonRoot, f))),
    agentsRootExists,
  };
}

// ---------------------------------------------------------------------------
// CLI（preflight hook・UserPromptExpansion@/canon）
// ---------------------------------------------------------------------------

function main() {
  readHookInput(); // UserPromptExpansion の入力を読み切る（内容は使わない・hook 契約上の作法）

  const canonRoot = process.env.G13_CANON_ROOT_OVERRIDE
    ? path.resolve(process.env.G13_CANON_ROOT_OVERRIDE)
    : CANON_ROOT; // テスト専用オーバーライド。本番では未設定（既定の CANON_ROOT を使う）。

  const result = checkG13({ canonRoot });

  if (result.checked === 0) {
    // 対象0件は「まだ agent が無い」正当な状態でありうる（開発初期にエージェント定義を
    // 作る前）。ここで違反にすると、正当なブートストラップ前の run が一切開始できなく
    // なる。しかし「0件だから pass」を検査済みと区別なく返すのも危険（§11.5）なので、
    // 通す場合でも「0件しか見ていない」ことを stderr に明示し、黙って合格扱いにしない。
    // 実装側の防御は別層で担う: このスキャナが将来壊れて常に0件を返し続ける退行は、
    // 本ファイルの単体テスト（tests/g13_worker_privilege.test.js）が fixture を使って
    // 「非0件で違反を検出できること」を固定で検証することで検出する
    // （§11.5 の「配線テスト」と同型の二段防御・npm test が帯域外でこれを保証する）。
    passStop(
      `G13: 検査対象0件（${posix(path.relative(canonRoot, agentsRootFor(canonRoot)))} が空または未作成）。` +
        'まだワーカー定義が無い正当な状態として run を許可する。この run では G13 は実質何も検証していない（可視化のため明示）。'
    );
    return;
  }

  if (!result.ok) {
    const detail = result.violations.map((v) => `  ${v.path}: ${v.message}`).join('\n');
    blockStop(`G13: 違反を検出（${result.violations.length}件）。run の開始をブロックする。\n${detail}`);
    return;
  }

  passStop(`G13: 通過（${result.checked}件検査・違反0件）`);
}

if (isMainModule(import.meta.url)) main();
