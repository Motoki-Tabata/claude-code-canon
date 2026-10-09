/**
 * lib/features.js — 機能（canon-reference の 12 機能）と builder の担当（unit）の対応。
 *
 * design-map の節の見出しは `## <機能>`（機能は `canon-reference/references/features/*.md` のファイル名）。
 * builder は機能ごとでなく「ファイルの持ち主」で束ねた担当（8通り）で起動する。
 * パスから機能を引くときは `data/paths.json` の `feature` を先に引き、data に無い canon の管理パスだけ
 * 補完表（EXTRA_PATHS）で引く。
 */

import { collection } from './tables.js';

export const FEATURES = [
  'claude-md',
  'rules',
  'skills',
  'subagents',
  'hooks',
  'mcp',
  'settings',
  'permissions',
  'statusline',
  'plugins',
  'plugin-mods',
  'output-styles',
];

/** builder の担当（`slice.js --unit` と builder の `unit`）→ 受け持つ機能。 */
export const UNITS = {
  'claude-md': ['claude-md'],
  rules: ['rules'],
  skills: ['skills'],
  subagents: ['subagents'],
  settings: ['settings', 'hooks', 'permissions', 'statusline'],
  mcp: ['mcp'],
  plugins: ['plugins', 'plugin-mods'],
  'output-styles': ['output-styles'],
};

export const UNIT_NAMES = Object.keys(UNITS);

/** 担当に属さないパスの区分（`.claude/README.md` など）。 */
export const OTHER_UNIT = 'other';

export function unitOfFeature(feature) {
  return UNIT_NAMES.find((u) => UNITS[u].includes(feature)) ?? null;
}

/**
 * data/paths.json に無い canon の管理パス。上から順に最初に合うものを採る。
 * 値が null のパスは機能に属さない（emit-manifest が書く文書）。
 */
const EXTRA_PATHS = [
  [/^\.claude\/README\.md$/, null],
  [/^\.claude\/hooks\/.+/, 'hooks'],
  [/^\.claude\/rules\/.+/, 'rules'], // サブディレクトリに置ける（V-rules-01）
  [/^\.claude\/agents\/.+/, 'subagents'], // サブディレクトリに置ける（subagents.md §3）
  [/^\.claude\/skills\/.+/, 'skills'], // SKILL.md 以外の supporting files
  [/^plugin\/.+/, 'plugins'],
];

let projectPatterns = null;

/** `paths:files` の project スコープを正規表現にする（`<name>`＝1セグメント、`*`＝セグメント内の任意）。 */
function patterns() {
  if (projectPatterns) return projectPatterns;
  projectPatterns = collection('paths:files')
    .items.filter((it) => it.scope === 'project' && it.feature)
    .map((it) => {
      const src = it.path
        .split(/(<[^>]+>|\*)/)
        .map((s) => (s === '*' ? '[^/]*' : /^<.+>$/.test(s) ? '[^/]+' : s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')))
        .join('');
      // 末尾が `/` のパスはディレクトリ（配下すべて）
      return { re: new RegExp(`^${src}${it.path.endsWith('/') ? '.*' : '$'}`), feature: it.feature };
    });
  return projectPatterns;
}

/** 管理パス（リポジトリ相対・posix）が属する機能。どの機能にも属さなければ null。 */
export function featureOfPath(rel) {
  const hit = patterns().find((p) => p.re.test(rel));
  if (hit && FEATURES.includes(hit.feature)) return hit.feature;
  for (const [re, feature] of EXTRA_PATHS) if (re.test(rel)) return feature;
  return null;
}

/** パスを担当に引く。機能に属さない（または担当の無い機能の）パスは 'other'。 */
export function unitOfPath(rel) {
  const f = featureOfPath(rel);
  return (f && unitOfFeature(f)) || OTHER_UNIT;
}
