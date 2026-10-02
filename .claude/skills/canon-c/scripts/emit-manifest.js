#!/usr/bin/env node
/**
 * emit-manifest.js（npm run manifest -- <ts>）— MANIFEST・README・配置リストの生成（artifacts.md §7）。
 *
 * 工程6の最後に、design-map の existing_disposition と generated/ の frontmatter から**決定論で**次を書く。
 * LLM に書かせない（作文すると起動方式の誤案内や、検証していない実績の主張が紛れ込む）。
 *
 *   output/<ts>/generated/.claude/README.md   どう使うか（§7.3・§7.4）
 *   output/<ts>/MANIFEST.md                   何が変わるか（§7.2）
 *   output/<ts>/deploy/managed-paths.list     配置するファイル（§7.5）
 *   output/<ts>/deploy/retired.list           意図して消えるファイル（§7.5）
 *
 * README を先に書き、その後で generated/ を列挙して MANIFEST と managed-paths.list を作る
 * （README 自身を列挙から漏らさない）。
 *
 * README の規則（§7.3 の起動方式の導出表）:
 *   - 利用者向けの一覧に載せる Skill は `/名前` を必ず書く。`disable-model-invocation: true` は
 *     「`/名前` で起動する（自動では動かない）」、それ以外は「頼むと自動で使われる。`/名前` でも起動できる」。
 *   - `user-invocable: false` の Skill は一覧（見出し・表の第1セル・箇条書きの先頭）に載せず、
 *     `/名前` も書かない。散文の1文で「内部で参照される知識」として触れるだけにする。
 *   - Subagent は「〜のときメインが自動で使う」。Rule は「常に／<paths> を扱うとき読み込まれる」。
 *     どちらにも `/名前` を書かない。Hook は起動ではなく挙動の予告として書く。
 *   - 使用例は、一覧に載る Skill の `/名前 <argument-hint>` の起動行を並べる（説明は「できること」の表に任せる）。
 *     spec の受入基準は写さない（run の道具で、配置後の README に置くと旧パスや旧番号を指したまま腐る）。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseFrontmatter, splitListValue, skillPathRole } from '../../../../lib/artifact.js';
import { parseExistingDisposition, DesignMapError, h2SectionText, GENERATED_README_REL } from '../../../../lib/design-map.js';
import { MANIFEST_FILES_HEADING } from '../../../../lib/manifest.js';
import { parseRequirementsDoc, RequirementsError } from '../../../../lib/requirements.js';
import { isMainModule, outputDir, readTsArg, workDir } from '../../../../lib/run.js';
import { parseOutsideChanges, OUTSIDE_CHANGES_HEADING, OUTSIDE_CHANGE_FIELDS } from '../../../../lib/design-map.js';
import { isManaged } from '../../../../lib/managed-paths.js';

export const README_REL = GENERATED_README_REL;
export const SETUP_HEADING = '前提セットアップと配置後の手作業';
export const DEPLOY_STEPS_HEADING = '配置時の追加手順';

export class ManifestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ManifestError';
  }
}

function readIfExists(p) {
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

/** generated/ 配下の全ファイル（posix 相対・バイト順）。 */
function listFiles(root) {
  const out = [];
  const walk = (abs, rel) => {
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(abs, e.name), r);
      else if (e.isFile()) out.push(r);
    }
  };
  walk(root, '');
  return out.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
}

function fval(fm, key) {
  const v = fm[key]?.value;
  return v === undefined || v === '' ? undefined : v;
}

// ---------------------------------------------------------------------------
// コンポーネントの棚卸し（frontmatter と設定ファイルから）
// ---------------------------------------------------------------------------

/** generated/ からコンポーネントを種別ごとに集める。 */
export function collectComponents(genRoot, files) {
  const read = (rel) => readFileSync(path.join(genRoot, rel), 'utf8');
  const skills = [];
  const agents = [];
  const rules = [];
  const hookScripts = [];
  let hooks = [];
  let mcpServers = [];
  let plugin = null;

  for (const rel of files) {
    if (skillPathRole(rel) === 'definition') {
      const fm = parseFrontmatter(read(rel)).frontmatter;
      skills.push({
        name: String(fval(fm, 'name') ?? path.posix.basename(path.posix.dirname(rel))),
        rel,
        description: String(fval(fm, 'description') ?? ''),
        manualOnly: fval(fm, 'disable-model-invocation') === true,
        internal: fval(fm, 'user-invocable') === false,
        argumentHint: fval(fm, 'argument-hint'),
        fork: String(fval(fm, 'context') ?? '') === 'fork',
        agent: fval(fm, 'agent'),
      });
    } else if (/^\.claude\/agents\/.+\.md$/.test(rel)) {
      const fm = parseFrontmatter(read(rel)).frontmatter;
      const tools = splitListValue(fm.tools);
      agents.push({
        name: String(fval(fm, 'name') ?? path.posix.basename(rel, '.md')),
        rel,
        description: String(fval(fm, 'description') ?? ''),
        delegates: tools.includes('Agent'),
      });
    } else if (/^\.claude\/rules\/.+\.md$/.test(rel)) {
      const fm = parseFrontmatter(read(rel)).frontmatter;
      const p = fm.paths?.value;
      rules.push({
        name: path.posix.basename(rel, '.md'),
        rel,
        paths: p === undefined || p === '' ? [] : (Array.isArray(p) ? p : [p]).map(String),
      });
    } else if (rel.startsWith('.claude/hooks/')) {
      hookScripts.push(rel);
    } else if (rel === '.claude/settings.json') {
      hooks = collectHooks(parseJson(read(rel), rel));
    } else if (rel === '.mcp.json') {
      mcpServers = collectMcpServers(parseJson(read(rel), rel));
    } else if (rel === 'plugin/.claude-plugin/plugin.json') {
      plugin = String(parseJson(read(rel), rel).name ?? 'plugin');
    }
  }
  const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return { skills: skills.sort(byName), agents: agents.sort(byName), rules: rules.sort(byName), hooks, hookScripts, mcpServers, plugin };
}

function parseJson(text, rel) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new ManifestError(`generated/${rel} が JSON として読めない: ${e.message}`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new ManifestError(`generated/${rel} のトップレベルが JSON object でない。`);
  }
  return data;
}

/** settings.json の hooks を（イベント・matcher・command）の一覧にする。 */
function collectHooks(settings) {
  const out = [];
  for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
    for (const g of Array.isArray(groups) ? groups : []) {
      for (const h of Array.isArray(g.hooks) ? g.hooks : []) {
        out.push({ event, matcher: g.matcher ?? null, command: String(h.command ?? h.type ?? '') });
      }
    }
  }
  return out;
}

/** .mcp.json のサーバーと、参照している `${VAR}`・OAuth の有無。 */
function collectMcpServers(mcp) {
  return Object.entries(mcp.mcpServers ?? {}).map(([name, cfg]) => {
    const vars = new Set();
    for (const m of JSON.stringify(cfg).matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-[^}]*)?\}/g)) vars.add(m[1]);
    return { name, vars: [...vars].sort(), oauth: cfg && typeof cfg === 'object' && 'oauth' in cfg };
  });
}

// ---------------------------------------------------------------------------
// README（§7.3・§7.4）
// ---------------------------------------------------------------------------

/** 表のセルに入れられる1行にする（改行と `|` を潰す）。 */
function cell(s) {
  return String(s).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

/** requirements.md で experimental が許可されているか（読めなければ false）。 */
function experimentalAllowed(requirementsText) {
  if (!requirementsText) return false;
  try {
    const doc = parseRequirementsDoc(requirementsText);
    return doc.constraints.some((c) => c.key === 'experimental' && c.allowed === true);
  } catch (e) {
    if (e instanceof RequirementsError) return false;
    throw e;
  }
}

/** §7.4 のセットアップ欄を frontmatter・設定から機械的に拾う。 */
function setupItems(comp, { genRoot, files, requirementsText }) {
  const items = [];
  for (const s of comp.skills.filter((x) => x.fork)) {
    items.push(
      s.agent
        ? `Skill \`${s.name}\` は context: fork で動く。frontmatter の agent: に指定した \`${s.agent}\` が使えること。`
        : `Skill \`${s.name}\` は context: fork で動くが、frontmatter に agent: の指定が無い。`
    );
  }
  for (const a of comp.agents.filter((x) => x.delegates)) {
    items.push(
      `Subagent \`${a.name}\` は別の Subagent を起動する。委譲の深さが既定の上限に収まること` +
        '（上限は CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH で変えられる）。'
    );
  }
  for (const m of comp.mcpServers) {
    for (const v of m.vars) items.push(`環境変数 \`${v}\` を設定する（.mcp.json の MCP サーバー \`${m.name}\` が参照する）。`);
    if (m.oauth) items.push(`MCP サーバー \`${m.name}\` は OAuth を使う。初回の接続時にブラウザで認可する。`);
  }
  if (comp.hooks.length > 0) {
    items.push('`.claude/settings.json` の hooks が配線されていること（配置で置き換わる）。');
  }
  for (const rel of comp.hookScripts) items.push(`Hook のスクリプト \`${rel}\` に実行権限を付ける（\`chmod +x ${rel}\`）。`);
  if (experimentalAllowed(requirementsText)) {
    const envs = new Set();
    for (const rel of files) {
      const text = readFileSync(path.join(genRoot, rel), 'utf8');
      for (const m of text.matchAll(/CLAUDE_CODE_EXPERIMENTAL_[A-Z0-9_]+/g)) envs.add(m[0]);
    }
    for (const e of [...envs].sort()) items.push(`実験機能の環境変数 \`${e}\` を設定する（requirements.md で experimental を許可している）。`);
  }
  return items;
}

/** 注意と制約（副作用・ブロックする挙動・適用範囲）。 */
function cautionItems(comp) {
  const items = [];
  for (const r of comp.rules.filter((x) => x.paths.length > 0)) {
    items.push(`Rule \`${r.name}\` は ${r.paths.map((p) => `\`${p}\``).join('・')} を扱うときだけ効く。`);
  }
  for (const h of comp.hooks) {
    items.push(
      `${h.event}${h.matcher ? `（matcher: \`${h.matcher}\`）` : ''} のとき Hook が自動で走る。` +
        'Hook が終了コード 2 を返すと、その操作はブロックされる。'
    );
  }
  return items;
}

/** README の本文を規則の適用で組み立てる。 */
export function renderReadme(comp, { genRoot, files, requirementsText }) {
  const out = [
    '# このプロジェクトの Claude Code カスタマイズ',
    '',
    'この README は claude-canon の emit-manifest.js が、生成物の frontmatter と設定から規則で導いたものです。',
    '手で直しても次の配置で置き換わります。',
    '',
    '## できること',
  ];

  const listed = comp.skills.filter((s) => !s.internal);
  const internal = comp.skills.filter((s) => s.internal);
  if (listed.length > 0) {
    out.push('', '### Skill', '', '| Skill | 起動のしかた | できること |', '|---|---|---|');
    for (const s of listed) {
      const hint = s.argumentHint ? ` ${s.argumentHint}` : '';
      const how = s.manualOnly
        ? `\`/${s.name}${hint}\` で起動する（自動では動かない）`
        : `頼むと自動で使われる。\`/${s.name}${hint}\` でも起動できる`;
      out.push(`| \`${s.name}\` | ${cell(how)} | ${cell(s.description)} |`);
    }
  }
  if (internal.length > 0) {
    out.push('', `このほかに、内部で参照される知識として ${internal.map((s) => `\`${s.name}\``).join('・')} がある（利用者が起動するものではない）。`);
  }
  if (comp.agents.length > 0) {
    out.push('', '### Subagent', '', '| Subagent | 使われ方 |', '|---|---|');
    for (const a of comp.agents) out.push(`| \`${a.name}\` | 次のときメインが自動で使う: ${cell(a.description)} |`);
  }
  if (comp.rules.length > 0) {
    out.push('', '### Rule', '', '| Rule | 読み込まれる条件 |', '|---|---|');
    for (const r of comp.rules) {
      const when = r.paths.length > 0 ? `${r.paths.map((p) => `\`${p}\``).join('・')} を扱うときに読み込まれる` : '常に読み込まれる';
      out.push(`| \`${r.name}\` | ${cell(when)} |`);
    }
  }
  if (comp.hooks.length > 0) {
    out.push('', '### Hook', '', '| イベント | 挙動 |', '|---|---|');
    for (const h of comp.hooks) {
      out.push(`| ${h.event}${h.matcher ? `（matcher: \`${cell(h.matcher)}\`）` : ''} | このとき自動で \`${cell(h.command)}\` が走る |`);
    }
  }
  if (comp.mcpServers.length > 0) {
    out.push('', '### MCP サーバー', '', '| サーバー | 接続 |', '|---|---|');
    for (const m of comp.mcpServers) {
      const need = [...(m.vars.length > 0 ? ['環境変数の設定'] : []), ...(m.oauth ? ['ブラウザでの認可'] : [])];
      out.push(`| \`${m.name}\` | ${need.length > 0 ? `初回は${need.join('と')}が要る（下の手順）` : '追加の設定なしで接続する'} |`);
    }
  }
  if (comp.plugin) out.push('', `plugin \`${comp.plugin}\` を \`plugin/\` に同梱している。`);
  if (listed.length + internal.length + comp.agents.length + comp.rules.length + comp.hooks.length + comp.mcpServers.length === 0) {
    out.push('', 'Skill・Subagent・Rule・Hook・MCP サーバーは生成していない（CLAUDE.md だけが読み込まれる）。');
  }

  const setup = setupItems(comp, { genRoot, files, requirementsText });
  out.push('', `## ${SETUP_HEADING}`, '', ...(setup.length > 0 ? setup.map((s) => `- ${s}`) : ['なし']));

  out.push('', '## 使用例', '');
  if (listed.length === 0) out.push('利用者が起動する Skill は無い。');
  else {
    out.push('次の形で起動する（それぞれが何をするかは「できること」の表）。', '', '```text');
    for (const s of listed) out.push(`/${s.name}${s.argumentHint ? ` ${s.argumentHint}` : ''}`);
    out.push('```');
  }

  const cautions = cautionItems(comp);
  out.push('', '## 注意と制約', '', ...(cautions.length > 0 ? cautions.map((s) => `- ${s}`) : ['特になし']));
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// MANIFEST（§7.2）と配置リスト（§7.5）
// ---------------------------------------------------------------------------

/** design-map の existing_disposition（new モードで節が無ければ空）。 */
function loadRecords(designMapText) {
  try {
    return parseExistingDisposition(designMapText);
  } catch (e) {
    if (e instanceof DesignMapError) return [];
    throw e;
  }
}

/** MANIFEST の本文。 */
/** design-map の `## <heading>` 節の本文（見出し行を除く・無ければ空文字）。 */
function sectionBody(designMapText, heading) {
  const sec = h2SectionText(designMapText.split(/\r?\n/), heading);
  return sec ? sec.split('\n').slice(1).join('\n').trim() : '';
}

/**
 * `## 管理パス外の変更` の各項目を確かめ、問題の一覧を返す（artifacts.md §5.6）。
 * 対象パスが無い・管理パス集合の中にある（generated/ に置くべき）・必須の欄が欠けている・根拠が「試行待ち」のまま、を問題にする。
 */
export function checkOutsideChanges(designMapText) {
  const problems = [];
  for (const it of parseOutsideChanges(designMapText)) {
    const where = `「${OUTSIDE_CHANGES_HEADING}」の ${it.line} 行目（${it.heading}）`;
    if (!it.path) problems.push(`${where}: 見出しに対象パスがバッククォートで書かれていない`);
    else if (isManaged(it.path)) problems.push(`${where}: \`${it.path}\` は管理パス集合の中にある。generated/ に生成物として置く`);
    if (it.missing.length > 0) problems.push(`${where}: 欄が無い: ${it.missing.join('・')}（必須: ${OUTSIDE_CHANGE_FIELDS.join('・')}）`);
    if (/^\s*-\s+根拠\s*[:：]\s*試行待ち/m.test(it.body)) problems.push(`${where}: 根拠が「試行待ち」のまま（canon-b 工程5 で対象に試して書き換える）`);
  }
  return problems;
}

export function renderManifest({ ts, files, records, designMapText }) {
  const byDisp = (d) => records.filter((r) => r.disposition === d).map((r) => r.path);
  const kept = byDisp('keep');
  const modified = byDisp('modify');
  const existing = new Set([...kept, ...modified]);
  const added = files.filter((f) => !existing.has(f));
  const gone = records.filter((r) => r.disposition === 'retire' || r.disposition === 'merge');

  const list = (paths) => (paths.length > 0 ? paths.map((p) => `- \`${p}\``) : ['なし']);
  const deploySteps = h2SectionText(designMapText.split(/\r?\n/), DEPLOY_STEPS_HEADING);
  const deployBody = deploySteps ? deploySteps.split('\n').slice(1).join('\n').trim() : '';

  return [
    `# MANIFEST（${ts}）`,
    '',
    'emit-manifest.js が design-map と generated/ から生成した。手で編集しない。',
    '',
    '## 差分の要約',
    '',
    '| 区分 | 件数 |',
    '|---|---|',
    `| 新規 | ${added.length} |`,
    `| 改修 | ${modified.length} |`,
    `| 維持 | ${kept.length} |`,
    `| 廃止 | ${gone.length} |`,
    '',
    '## 新規',
    '',
    ...list(added),
    '',
    '## 改修',
    '',
    ...list(modified),
    '',
    '## 維持',
    '',
    ...list(kept),
    '',
    '## 廃止',
    '',
    ...(gone.length > 0
      ? gone.map(
          (r) =>
            `- \`${r.path}\`（${r.disposition}${r.superseded_by ? ` → \`${r.superseded_by}\`` : ''}）: ${r.manifest_note ?? ''}`
        )
      : ['なし']),
    '',
    `## ${MANIFEST_FILES_HEADING}`,
    '',
    ...files.map((f) => `- \`${f}\``),
    '',
    `## ${DEPLOY_STEPS_HEADING}`,
    '',
    deployBody === '' ? 'なし' : deployBody,
    '',
    `## ${OUTSIDE_CHANGES_HEADING}`,
    '',
    sectionBody(designMapText, OUTSIDE_CHANGES_HEADING) || 'なし',
  ].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// エントリポイント
// ---------------------------------------------------------------------------

/** <ts> の MANIFEST・README・配置リストを書き、書いたものの要約を返す。 */
export function emitManifest(ts) {
  const out = outputDir(ts);
  const genRoot = path.join(out, 'generated');
  const designMapText = readIfExists(path.join(out, 'design-map.md'));
  if (designMapText === null) throw new ManifestError(`output/${ts}/design-map.md が無い。`);
  if (!existsSync(genRoot) || listFiles(genRoot).length === 0) {
    throw new ManifestError(`output/${ts}/generated/ が無いか空（生成の前に MANIFEST は作れない）。`);
  }
  const records = loadRecords(designMapText);
  const readmeRecord = records.find((r) => r.path === README_REL && r.disposition !== 'out_of_scope');
  if (readmeRecord && readmeRecord.disposition !== 'modify') {
    throw new ManifestError(
      `design-map が ${README_REL} を ${readmeRecord.disposition} にしている。README は配置のたびに` +
        ' emit-manifest.js が作り直すので、既存の README は modify として扱うこと（artifacts.md §7.3）。'
    );
  }

  const outsideProblems = checkOutsideChanges(designMapText);
  if (outsideProblems.length > 0) {
    throw new ManifestError(`design-map の「${OUTSIDE_CHANGES_HEADING}」に不備がある:\n${outsideProblems.map((p) => `  - ${p}`).join('\n')}`);
  }

  // 1. README（README 自身は棚卸しの対象外）
  const before = listFiles(genRoot).filter((f) => f !== README_REL);
  const comp = collectComponents(genRoot, before);
  const readme = renderReadme(comp, {
    genRoot,
    files: before,
    requirementsText: readIfExists(path.join(workDir(ts), 'requirements.md')),
  });
  const readmeAbs = path.join(genRoot, README_REL);
  mkdirSync(path.dirname(readmeAbs), { recursive: true });
  writeFileSync(readmeAbs, readme);

  // 2. MANIFEST と配置リスト（README を書いた後の generated/ を列挙する）
  const files = listFiles(genRoot);
  writeFileSync(path.join(out, 'MANIFEST.md'), renderManifest({ ts, files, records, designMapText }));
  const deployDir = path.join(out, 'deploy');
  mkdirSync(deployDir, { recursive: true });
  const retired = records.filter((r) => r.disposition === 'retire' || r.disposition === 'merge').map((r) => r.path).sort();
  writeFileSync(path.join(deployDir, 'managed-paths.list'), files.map((f) => `${f}\n`).join(''));
  writeFileSync(path.join(deployDir, 'retired.list'), retired.map((f) => `${f}\n`).join(''));

  return {
    files: files.length,
    retired: retired.length,
    skills: comp.skills.length,
    agents: comp.agents.length,
    rules: comp.rules.length,
    hooks: comp.hooks.length,
    mcpServers: comp.mcpServers.length,
  };
}

if (isMainModule(import.meta.url)) {
  const ts = readTsArg('npm run manifest -- <ts>');
  try {
    const r = emitManifest(ts);
    process.stdout.write(
      `[manifest] generated/ ${r.files} 件・廃止 ${r.retired} 件（Skill ${r.skills}・Subagent ${r.agents}・Rule ${r.rules}・` +
        `Hook ${r.hooks}・MCP ${r.mcpServers}）\n` +
        `[manifest] output/${ts}/MANIFEST.md・generated/${README_REL}・deploy/managed-paths.list・deploy/retired.list を書いた。\n`
    );
  } catch (e) {
    if (!(e instanceof ManifestError)) throw e;
    process.stderr.write(`[manifest] ${e.message}\n`);
    process.exit(1);
  }
}
