#!/usr/bin/env node
/**
 * tools/token-usage.js（npm run tokens -- <session-id | session.jsonl のパス> [--json | --turns [--agent <id>]]）。
 *
 * `--turns` は、ターンごとの総入力・増分・ツール呼び出しの要約・tool_result の字数・持ち越し（字数×残りターン数）を
 * 1ターン1行で出す（`--agent <id の先頭>` でサブエージェント1体のターン表）。jsonl の生の行を読む前に読む。
 *
 * セッション transcript（`~/.claude/projects/<slug>/<sid>.jsonl` と
 * `<sid>/subagents/agent-*.jsonl` ＋ `.meta.json`）から、トークン消費を **メイン／agentType ×
 * model** 別に集計する。claude-canon の改修前後で「何がトークンを使ったか」を実測比較するための計測器で、
 * 5時間枠の消費主因（メイン履歴の再読込・長時間稼働 agent・差し戻し）を
 * 数字で確かめるために使う。読み取り専用（何も書かない）。
 *
 * 集計の規律:
 *   - usage は `message.id` ごとに **最後の** レコードを採る（ストリーミング途中値が同 id で
 *     重複し、先頭を採ると output が過小になる）。
 *   - model が `<synthetic>`（上限到達メッセージ等）のレコードは 0 トークンなので除外する。
 *   - 「総入力」= input + cache_creation + cache_read。
 *
 * 純関数（aggregateRecords・formatMarkdown）は tests/token_usage.test.js が検証する。
 */

import path from 'node:path';
import os from 'node:os';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { CANON_ROOT } from '../lib/canon.js';
import { projectSlug } from '../lib/claude-session.js';
import { isMainModule } from '../lib/run.js';

/** JSONL 文字列を壊れた行を飛ばしてレコード配列にする。 */
export function parseJsonl(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // 書込途中の末尾行など。集計には使わない。
    }
  }
  return out;
}

/**
 * レコード列を model 別に集計する。同一 message.id は最後のレコードだけを採る。
 * @returns {{ byModel: Record<string, {calls:number,input:number,cacheCreation:number,cacheRead:number,output:number}>, turns:number }}
 */
export function aggregateRecords(records) {
  const last = new Map();
  for (const r of records) {
    if (r?.type !== 'assistant' || !r.message?.usage || !r.message.id) continue;
    if (r.message.model === '<synthetic>') continue;
    last.set(r.message.id, r.message);
  }
  const byModel = {};
  for (const m of last.values()) {
    const u = m.usage;
    const key = m.model || 'unknown';
    const a = (byModel[key] ??= { calls: 0, input: 0, cacheCreation: 0, cacheRead: 0, output: 0 });
    a.calls += 1;
    a.input += u.input_tokens || 0;
    a.cacheCreation += u.cache_creation_input_tokens || 0;
    a.cacheRead += u.cache_read_input_tokens || 0;
    a.output += u.output_tokens || 0;
  }
  return { byModel, turns: last.size };
}

/** tool_result の content（文字列か text ブロックの配列）の字数。 */
function resultChars(content) {
  if (typeof content === 'string') return content.length;
  if (!Array.isArray(content)) return 0;
  return content.reduce((n, b) => n + (typeof b?.text === 'string' ? b.text.length : 0), 0);
}

/** tool_use 1件の短い要約（名前と、対象の手がかり）。 */
function toolLabel(b) {
  const i = b.input ?? {};
  const short = (v, n) => String(v ?? '').replace(/\s+/g, ' ').replace(/\|/g, '/').slice(0, n); // 表のセルを壊さないよう | は / にする
  if (b.name === 'Read' || b.name === 'Write' || b.name === 'Edit') return `${b.name} ${path.basename(String(i.file_path ?? ''))}`;
  if (b.name === 'Grep') return `Grep ${short(i.pattern, 24)}`;
  if (b.name === 'Glob') return `Glob ${short(i.pattern, 24)}`;
  if (b.name === 'Bash') return `Bash ${short(i.command, 32)}`;
  if (b.name === 'Agent' || b.name === 'Task') return `Agent ${short(i.subagent_type, 24)}`;
  return b.name;
}

/**
 * ターンごとの行を作る。ターン＝1回の API 呼び出し（同じ message.id のレコードをまとめる）。
 * 持ち越し＝そのターンの tool_result の字数 × 残りのターン数（以降のターンの入力に載り続けた字数の見積もり）。
 * @returns {Array<{n:number,total:number,delta:number,output:number,tools:string[],resultChars:number,carry:number}>}
 */
export function turnRows(records) {
  const order = [];
  const turns = new Map();
  const turnOfToolUse = new Map();
  for (const r of records) {
    if (r?.type === 'assistant' && r.message?.id && r.message.usage && r.message.model !== '<synthetic>') {
      const id = r.message.id;
      let t = turns.get(id);
      if (!t) {
        t = { usage: null, tools: [], resultChars: 0 };
        turns.set(id, t);
        order.push(id);
      }
      t.usage = r.message.usage;
      for (const b of r.message.content ?? []) {
        if (b?.type === 'tool_use' && !turnOfToolUse.has(b.id)) {
          turnOfToolUse.set(b.id, id);
          t.tools.push(toolLabel(b));
        }
      }
    } else if (r?.type === 'user' && Array.isArray(r.message?.content)) {
      for (const b of r.message.content) {
        if (b?.type !== 'tool_result') continue;
        const t = turns.get(turnOfToolUse.get(b.tool_use_id));
        if (t) t.resultChars += resultChars(b.content);
      }
    }
  }
  let prev = 0;
  return order.map((id, idx) => {
    const t = turns.get(id);
    const u = t.usage;
    const total = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    const row = { n: idx + 1, total, delta: total - prev, output: u.output_tokens || 0, tools: t.tools, resultChars: t.resultChars, carry: t.resultChars * (order.length - idx - 1) };
    prev = total;
    return row;
  });
}

/** ターンごとの行を、1ターン1行の表にする。 */
export function formatTurns(label, rows) {
  const lines = [`## ${label}（${rows.length} ターン）`, '| ターン | 総入力 | 増分 | output | ツール | 結果の字数 | 持ち越し |', '|---|---|---|---|---|---|---|'];
  for (const r of rows) {
    const tools = r.tools.length > 3 ? `${r.tools.slice(0, 3).join('、')} ほか${r.tools.length - 3}件` : r.tools.join('、') || '（なし）';
    lines.push(`| ${r.n} | ${fmt(r.total)} | ${r.delta >= 0 ? '+' : ''}${fmt(r.delta)} | ${fmt(r.output)} | ${tools} | ${fmt(r.resultChars)} | ${fmt(r.carry)} |`);
  }
  lines.push('', `持ち越しの合計: ${fmt(rows.reduce((n, r) => n + r.carry, 0))}（字×ターン）`);
  return lines.join('\n');
}

/**
 * `--turns` の出力。メインのターン表と、サブエージェントごとの1行の要約。`agentPrefix` があれば、
 * その id（`agent-` の後ろ）で始まる1体のターン表だけを返す。
 */
export function turnsReport(jsonlPath, agentPrefix = null) {
  const sid = path.basename(jsonlPath, '.jsonl');
  const subDir = path.join(path.dirname(jsonlPath), sid, 'subagents');
  const subs = existsSync(subDir)
    ? readdirSync(subDir)
        .filter((n) => n.endsWith('.jsonl'))
        .sort()
        .map((f) => {
          const id = f.replace(/^agent-/, '').replace(/\.jsonl$/, '');
          let type = 'unknown';
          try {
            type = JSON.parse(readFileSync(path.join(subDir, f.replace(/\.jsonl$/, '.meta.json')), 'utf8')).agentType || type;
          } catch {
            // meta が無くても続ける。
          }
          return { id, type, file: path.join(subDir, f) };
        })
    : [];
  if (agentPrefix) {
    const hits = subs.filter((s) => s.id.startsWith(agentPrefix));
    if (hits.length !== 1) throw new Error(hits.length === 0 ? `その id のサブエージェントが無い: ${agentPrefix}` : `id が複数に当たる: ${hits.map((h) => h.id).join('・')}`);
    return formatTurns(`${hits[0].type} ${hits[0].id}`, turnRows(parseJsonl(readFileSync(hits[0].file, 'utf8'))));
  }
  const out = [formatTurns('main', turnRows(parseJsonl(readFileSync(jsonlPath, 'utf8'))))];
  if (subs.length > 0) {
    out.push('', `## サブエージェント（${subs.length} 体。ターン表は --turns --agent <id の先頭>）`, '| id | 区分 | ターン | 総入力 |', '|---|---|---|---|');
    for (const s of subs) {
      const rows = turnRows(parseJsonl(readFileSync(s.file, 'utf8')));
      out.push(`| ${s.id} | ${s.type} | ${rows.length} | ${fmt(rows.reduce((n, r) => n + r.total, 0))} |`);
    }
  }
  return out.join('\n');
}

/** 総入力（input + cache_creation + cache_read）。 */
export function totalInput(a) {
  return a.input + a.cacheCreation + a.cacheRead;
}

/** セッションディレクトリ（`<sid>.jsonl` と `<sid>/subagents/`）を読み、メイン＋各 agent の集計を返す。 */
export function analyzeSession(jsonlPath) {
  const main = parseJsonl(readFileSync(jsonlPath, 'utf8'));
  const sid = path.basename(jsonlPath, '.jsonl');
  const subDir = path.join(path.dirname(jsonlPath), sid, 'subagents');
  const groups = [{ label: 'main', agg: aggregateRecords(main), agents: 1 }];

  const byType = new Map();
  if (existsSync(subDir)) {
    for (const f of readdirSync(subDir).filter((n) => n.endsWith('.jsonl'))) {
      const metaPath = path.join(subDir, f.replace(/\.jsonl$/, '.meta.json'));
      let agentType = 'unknown';
      if (existsSync(metaPath)) {
        try {
          agentType = JSON.parse(readFileSync(metaPath, 'utf8')).agentType || agentType;
        } catch {
          // meta が壊れていても agent 単位の集計は続ける。
        }
      }
      const recs = parseJsonl(readFileSync(path.join(subDir, f), 'utf8'));
      const g = byType.get(agentType) ?? { label: agentType, agg: { byModel: {}, turns: 0 }, agents: 0 };
      const a = aggregateRecords(recs);
      for (const [model, v] of Object.entries(a.byModel)) {
        const t = (g.agg.byModel[model] ??= { calls: 0, input: 0, cacheCreation: 0, cacheRead: 0, output: 0 });
        for (const k of Object.keys(t)) t[k] += v[k];
      }
      g.agg.turns += a.turns;
      g.agents += 1;
      byType.set(agentType, g);
    }
  }
  return [...groups, ...byType.values()];
}

function fmt(n) {
  return n.toLocaleString('en-US');
}

/** 集計結果を Markdown 表にする（総入力の多い順。main は先頭固定）。 */
export function formatMarkdown(groups) {
  const rows = [];
  for (const g of groups) {
    for (const [model, a] of Object.entries(g.agg.byModel)) {
      rows.push({ g, model, a, total: totalInput(a) });
    }
  }
  const [main, rest] = [rows.filter((r) => r.g.label === 'main'), rows.filter((r) => r.g.label !== 'main')];
  rest.sort((x, y) => y.total - x.total);
  const grand = [...main, ...rest].reduce((s, r) => s + r.total, 0) || 1;
  const lines = [
    '| 区分 | model | 起動数 | ターン | 総入力 | (cache_read) | output | 全体比 |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const { g, model, a, total } of [...main, ...rest]) {
    lines.push(
      `| ${g.label} | ${model} | ${g.agents} | ${a.calls} | ${fmt(total)} | ${fmt(a.cacheRead)} | ${fmt(a.output)} | ${((total / grand) * 100).toFixed(1)}% |`
    );
  }
  lines.push('', `総入力の合計: ${fmt(grand)}`);
  return lines.join('\n');
}

/**
 * セッション ID／パスから jsonl の絶対パスを解決する。
 * ID は canon の projects ディレクトリを先に探し、無ければ `~/.claude/projects/*` を横断する
 * （対象プロジェクトで起動したセッションの transcript は対象側のディレクトリにある）。
 * 見つからない・複数のディレクトリにあるときは、候補を挙げて throw する。
 */
export function resolveSessionPath(arg, projectsRoot = path.join(os.homedir(), '.claude', 'projects')) {
  if (arg.endsWith('.jsonl')) return path.resolve(arg);
  const own = path.join(projectsRoot, projectSlug(CANON_ROOT), `${arg}.jsonl`);
  if (existsSync(own)) return own;
  const hits = existsSync(projectsRoot)
    ? readdirSync(projectsRoot)
        .sort()
        .map((d) => path.join(projectsRoot, d, `${arg}.jsonl`))
        .filter((p) => existsSync(p))
    : [];
  if (hits.length === 1) return hits[0];
  if (hits.length === 0) throw new Error(`transcript が無い: ${projectsRoot}/*/${arg}.jsonl`);
  throw new Error(`transcript が複数のプロジェクトにある（jsonl のパスで指定する）:\n${hits.map((h) => `  ${h}`).join('\n')}`);
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2);
  const agentIdx = argv.indexOf('--agent');
  const agentPrefix = agentIdx >= 0 ? argv[agentIdx + 1] : null;
  const turns = argv.includes('--turns');
  const args = argv.filter((a, i) => !a.startsWith('--') && !(agentIdx >= 0 && i === agentIdx + 1));
  if (args.length !== 1 || (agentIdx >= 0 && (!agentPrefix || agentPrefix.startsWith('--') || !turns))) {
    process.stderr.write('使い方: npm run tokens -- <session-id | session.jsonl のパス> [--json | --turns [--agent <サブエージェント id の先頭>]]\n');
    process.exit(2);
  }
  let p;
  try {
    p = resolveSessionPath(args[0]);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
  if (!existsSync(p)) {
    process.stderr.write(`transcript が無い: ${p}\n`);
    process.exit(1);
  }
  if (turns) {
    try {
      process.stdout.write(`${turnsReport(p, agentPrefix)}\n`);
    } catch (err) {
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    }
  } else {
    const groups = analyzeSession(p);
    process.stdout.write(argv.includes('--json') ? JSON.stringify(groups, null, 2) + '\n' : formatMarkdown(groups) + '\n');
  }
}
