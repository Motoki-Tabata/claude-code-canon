/**
 * 配線テスト（詳細設計書 §11.5・§15.3）— 配線の生存検証の二段のうち run 前を担う側
 * （もう一段はランタイム・カナリア）。
 *
 * ## なぜ帯域外に要るか
 *
 * `.claude/settings.json` が壊れれば hooks が発火せず、**全ゲートが沈黙して
 * vacuous pass** する。G12 の「output ツリー不在は違反」はゲートが走った場合の話で、
 * 走らない場合を救わない。SessionStart による自己点検も、settings.json が壊れていれば
 * SessionStart 自体が発火しないので無効。**settings.json の自己検証は原理的に不可能**。
 *
 * ゆえに検証は帯域外（run の外・npm test）に置くしかない。本テストがそれである。
 * §15.3 は当初これを「別タスクへ繰り延べ」ていたが、**npm test 必須化**へ格上げした。
 *
 * ## 本テストが担保しないこと
 *
 * 「テスト後に settings.json が壊れた場合」は救えない（run 外で走るため）。そこは
 * ランタイム・カナリア（§11.5・run 内）が補完する。両者は代替でなく補完関係にある。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers/paths.js';

const SETTINGS_PATH = path.join(ROOT, '.claude', 'settings.json');
const HOOKS_TABLE = path.join(ROOT, 'gates', 'conformance_tables', 'hooks.json');

/** settings.json の $comment キーを除いた実配線を返す。 */
function loadSettings() {
  const raw = readFileSync(SETTINGS_PATH, 'utf8');
  return JSON.parse(raw); // 壊れていればここで落ちる（それが目的）
}

function loadHooksTable() {
  return JSON.parse(readFileSync(HOOKS_TABLE, 'utf8'));
}

/** 配線から (event, matcher, command) を平坦に列挙する。 */
function wiredEntries(settings) {
  const out = [];
  for (const [event, groups] of Object.entries(settings.hooks || {})) {
    if (event.startsWith('$')) continue;
    for (const g of groups) {
      for (const h of g.hooks || []) {
        out.push({ event, matcher: g.matcher, command: h.command, timeout: h.timeout, type: h.type });
      }
    }
  }
  return out;
}

test('settings.json が妥当な JSON である（壊れていたら全ゲートが沈黙する）', () => {
  const s = loadSettings();
  assert.ok(s.hooks, 'hooks キーが在ること');
});

test('配線が参照する全スクリプトが実在する（不在なら hook は黙って失敗する）', () => {
  const entries = wiredEntries(loadSettings());
  assert.ok(entries.length > 0, '配線が1件も無いなら、この検査自体が vacuous');

  for (const e of entries) {
    // command から ${CLAUDE_PROJECT_DIR}/... のパスを取り出す
    const m = e.command.match(/\$\{CLAUDE_PROJECT_DIR\}\/([^"']+)/);
    assert.ok(m, `command が \${CLAUDE_PROJECT_DIR} 相対でない: ${e.command}`);
    const abs = path.join(ROOT, m[1]);
    assert.ok(existsSync(abs), `配線が参照するスクリプトが不在: ${m[1]}（${e.event}）`);
  }
});

test('配線が使うイベント名が全て正典に実在する（誤記は黙って無発火になる）', () => {
  const table = loadHooksTable();
  const canonical = new Set(table.events.map((x) => x.event));
  const used = new Set(wiredEntries(loadSettings()).map((e) => e.event));

  for (const e of used) {
    assert.ok(canonical.has(e), `正典 docs/L4_AUTOMATION.md §2.1 に存在しないイベント名: ${e}`);
  }
});

test('ブロックを期待するイベントが正典で Block可であること（§11.1 の発火系統）', () => {
  const table = loadHooksTable();
  const blockable = new Set(table.blockable_events);

  // 設計がブロックを前提にしている系統。ここが Block不可なら設計の前提が崩れる。
  for (const ev of ['UserPromptExpansion', 'PreToolUse', 'SubagentStop', 'Stop']) {
    assert.ok(
      blockable.has(ev),
      `${ev} は Block可でなければ設計 §11.1 が成立しない（正典が変わった可能性）`
    );
  }
});

test('PostToolUse をブロック手段として使っていないこと（正典で Block不可）', () => {
  const table = loadHooksTable();
  assert.ok(
    table.non_blockable_events.includes('PostToolUse'),
    'PostToolUse が Block可に変わったなら §11.1 の設計を見直す必要がある'
  );
  // PostToolUse に配線されるのは助言（転写）担当の advance-guard のみであること。
  const post = wiredEntries(loadSettings()).filter((e) => e.event === 'PostToolUse');
  for (const e of post) {
    assert.match(
      e.command,
      /advance-guard\.js/,
      'PostToolUse はブロック不可。per-file 違反はラッチへ転写し、権威判定は G12（停止時）が行う'
    );
  }
});

test('PreToolUse の matcher がコマンド実行系ツールを漏れなく含む（シェル経路の封鎖）', () => {
  // 列挙の網羅性が単一障害点。matcher から漏れたツールは hook すら発火せず、
  // ガードのロジックが正しくても素通りする。
  const pre = wiredEntries(loadSettings()).filter((e) => e.event === 'PreToolUse');
  assert.ok(pre.length > 0, 'PreToolUse の配線が在ること');

  for (const shell of ['Bash', 'PowerShell', 'Monitor']) {
    assert.ok(
      pre.some((e) => String(e.matcher).split('|').includes(shell)),
      `PreToolUse の matcher に ${shell} が無い。このツール経由で全ガードを迂回できる（§11.3(b)）`
    );
  }
  // 書込ツールも
  for (const w of ['Write', 'Edit']) {
    assert.ok(
      pre.some((e) => String(e.matcher).split('|').includes(w)),
      `PreToolUse の matcher に ${w} が無い`
    );
  }
});

test('3ガードが全て PreToolUse に配線されていること', () => {
  const pre = wiredEntries(loadSettings())
    .filter((e) => e.event === 'PreToolUse')
    .map((e) => e.command);
  for (const g of ['write-scope-guard.js', 'approval-guard.js', 'advance-guard.js']) {
    assert.ok(pre.some((c) => c.includes(g)), `3ガードの ${g} が PreToolUse に配線されていない（§11.3）`);
  }
});

test('§13.2.1: self-optimize-scope-guard（第3の極性ガード）が PreToolUse に配線されていること', () => {
  const pre = wiredEntries(loadSettings())
    .filter((e) => e.event === 'PreToolUse')
    .map((e) => e.command);
  assert.ok(
    pre.some((c) => c.includes('self-optimize-scope-guard.js')),
    '自己再生成専用ガードが PreToolUse に配線されていない（§11.3「ガードの3系統」）'
  );
});

test('G13 が UserPromptExpansion に配線されていること（preflight・§11.1）', () => {
  const pre = wiredEntries(loadSettings()).filter((e) => e.event === 'UserPromptExpansion');
  assert.ok(
    pre.some((e) => e.command.includes('g13_worker_privilege.js')),
    'G13 は run 開始前に発火しなければ意味がない。per-file に置くと .claude/agents/** が ' +
      'run 中に書かれないため発火機会が構造的にゼロになる（§11.2）'
  );
});

test('G13 preflight の matcher が self-optimize を含むこと（§13.2.1）', () => {
  const pre = wiredEntries(loadSettings()).filter(
    (e) => e.event === 'UserPromptExpansion' && e.command.includes('g13_worker_privilege.js')
  );
  assert.ok(
    pre.some((e) => String(e.matcher).split('|').includes('self-optimize')),
    '/self-optimize 展開時に G13 が発火しなければ、次世代候補を生成する run の開始自体をブロックできない'
  );
});

test('stage-guard と gen-guard が停止イベントに配線されていること（§4.3）', () => {
  const entries = wiredEntries(loadSettings());
  for (const ev of ['SubagentStop', 'Stop']) {
    const cmds = entries.filter((e) => e.event === ev).map((e) => e.command);
    assert.ok(cmds.some((c) => c.includes('stage-guard.js')), `${ev} に stage-guard が無い`);
    assert.ok(cmds.some((c) => c.includes('gen-guard.js')), `${ev} に gen-guard が無い`);
  }
});

test('シェル経路の封鎖・第3経路: disableSkillShellExecution が有効であること', () => {
  // 正典 L2_SKILLS.md:219 — SKILL.md 内の !`command` 構文は「Skill 注入前にシェルで
  // コマンドを実行」する。Bash ツール呼出ではないため PreToolUse が発火せず、
  // write-scope-guard が原理的に見えない。ワーカーから Bash/PowerShell/Monitor を
  // 剥奪しても（G13）この経路は残る。正典 L2_SKILLS.md:240 の全体禁止で塞ぐ。
  const s = loadSettings();
  assert.equal(
    s.disableSkillShellExecution,
    true,
    'Skill 本文の !`command` 経由でシェルが動くと、Bash 剥奪（G13）と write-scope-guard を ' +
      '同時に迂回できる。PreToolUse が発火しないためガードでは塞げない'
  );
});

test('SessionStart が <ts> を採番する配線になっていないこと（ガードの有効条件の再発防止）', () => {
  // SessionStart は無条件発火する。ここで採番すると保守セッションが即座に
  // run in-flight と誤判定され、ガードの有効条件（run in-flight 限定）が無効化される（§11.3 注）。
  const ss = wiredEntries(loadSettings()).filter((e) => e.event === 'SessionStart');
  for (const e of ss) {
    assert.ok(
      !e.command.includes('new-ts.js'),
      'SessionStart が採番してはならない。採番の契機は「セッションの開始」でなく「run の開始」'
    );
  }
  // session-init 側の実装も採番しないこと
  const src = readFileSync(path.join(ROOT, 'gates', 'session-init.js'), 'utf8');
  assert.ok(
    !/writeSessionTs\s*\(/.test(src),
    'session-init.js は .session-ts を書いてはならない（§11.3 注・ガードの有効条件）'
  );
});

test('照合表の canon_version が正典と一致していること（stale 検出）', () => {
  const table = loadHooksTable();
  assert.match(table.canon_version, /^v\d+\.\d+\.\d+$/, 'canon_version が記録されていること');
  // 全正典ファイルでバージョンが揃っていることは build:tables が強制するが、
  // 照合表が古いまま放置されていないかをここでも見る。
  assert.ok(table.events.length > 0, '照合表が空でないこと');
});
