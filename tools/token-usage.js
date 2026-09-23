#!/usr/bin/env node
/**
 * tools/token-usage.js（npm run tokens -- <session-id | session.jsonl のパス> [--json]）。
 *
 * セッション transcript（`~/.claude/projects/<slug>/<sid>.jsonl` と
 * `<sid>/subagents/agent-*.jsonl` ＋ `.meta.json`）から、トークン消費を **メイン／agentType ×
 * model** 別に集計する。/canon の改修前後で「何がトークンを使ったか」を実測比較するための計測器で、
 * 5時間枠の消費主因（メイン履歴の再読込・長時間稼働 agent・差し戻し・design-map の重複 Read）を
 * 数字で確かめるために使う。読み取り専用（何も書かない）。
 *
 * 集計の規律:
 *   - usage は `message.id` ごとに **最後の** レコードを採る（ストリーミング途中値が同 id で
 *     重複し、先頭を採ると output が過小になる）。
 *   - model が `<synthetic>`（上限到達メッセージ等）のレコードは 0 トークンなので除外する。
 *   - 「総入力」= input + cache_creation + cache_read。
 *
 * 純関数（aggregateRecords・countDesignMapReads・formatMarkdown）は tests/token_usage.test.js が検証する。
 */

import path from 'node:path';
import os from 'node:os';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { CANON_ROOT } from '../gates/lib/canon.js';
import { isMainModule } from '../gates/lib/run.js';

const DESIGN_MAP_RE = /(^|[\\/])design-map\.md$/;

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

/** 総入力（input + cache_creation + cache_read）。 */
export function totalInput(a) {
  return a.input + a.cacheCreation + a.cacheRead;
}

/** design-map.md への Read 呼び出し回数（同一成果物の重複 Read を検出する指標）。 */
export function countDesignMapReads(records) {
  let n = 0;
  const seen = new Set();
  for (const r of records) {
    if (r?.type !== 'assistant' || !Array.isArray(r.message?.content)) continue;
    for (const c of r.message.content) {
      if (c?.type !== 'tool_use' || c.name !== 'Read' || seen.has(c.id)) continue;
      seen.add(c.id);
      if (DESIGN_MAP_RE.test(String(c.input?.file_path || ''))) n += 1;
    }
  }
  return n;
}

/** セッションディレクトリ（`<sid>.jsonl` と `<sid>/subagents/`）を読み、メイン＋各 agent の集計を返す。 */
export function analyzeSession(jsonlPath) {
  const main = parseJsonl(readFileSync(jsonlPath, 'utf8'));
  const sid = path.basename(jsonlPath, '.jsonl');
  const subDir = path.join(path.dirname(jsonlPath), sid, 'subagents');
  const groups = [{ label: 'main', agg: aggregateRecords(main), designMapReads: countDesignMapReads(main), agents: 1 }];

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
      const g = byType.get(agentType) ?? { label: agentType, agg: { byModel: {}, turns: 0 }, designMapReads: 0, agents: 0 };
      const a = aggregateRecords(recs);
      for (const [model, v] of Object.entries(a.byModel)) {
        const t = (g.agg.byModel[model] ??= { calls: 0, input: 0, cacheCreation: 0, cacheRead: 0, output: 0 });
        for (const k of Object.keys(t)) t[k] += v[k];
      }
      g.agg.turns += a.turns;
      g.designMapReads += countDesignMapReads(recs);
      g.agents += 1;
      byType.set(agentType, g);
    }
  }
  return [...groups, ...byType.values()];
}

const fmt = (n) => n.toLocaleString('en-US');

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
    '| 区分 | model | 起動数 | ターン | 総入力 | (cache_read) | output | 全体比 | design-map Read |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const { g, model, a, total } of [...main, ...rest]) {
    lines.push(
      `| ${g.label} | ${model} | ${g.agents} | ${a.calls} | ${fmt(total)} | ${fmt(a.cacheRead)} | ${fmt(a.output)} | ${((total / grand) * 100).toFixed(1)}% | ${g.designMapReads} |`
    );
  }
  lines.push('', `総入力の合計: ${fmt(grand)}`);
  return lines.join('\n');
}

/** セッション ID／パスから jsonl の絶対パスを解決する（ID は canon の projects ディレクトリ配下を探す）。 */
export function resolveSessionPath(arg) {
  if (arg.endsWith('.jsonl')) return path.resolve(arg);
  const slug = CANON_ROOT.replace(/[\\/]/g, '-');
  return path.join(os.homedir(), '.claude', 'projects', slug, `${arg}.jsonl`);
}

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (args.length !== 1) {
    process.stderr.write('使い方: npm run tokens -- <session-id | session.jsonl のパス> [--json]\n');
    process.exit(1);
  }
  const p = resolveSessionPath(args[0]);
  if (!existsSync(p)) {
    process.stderr.write(`transcript が無い: ${p}\n`);
    process.exit(1);
  }
  const groups = analyzeSession(p);
  process.stdout.write(process.argv.includes('--json') ? JSON.stringify(groups, null, 2) + '\n' : formatMarkdown(groups) + '\n');
}
