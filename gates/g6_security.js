/**
 * G6 セキュリティ（per-file・§11.2）。
 *
 * G3〜G5 と異なり、G6 には gates/conformance_tables/*.json の専用照合表が無い
 * （index.json の not_yet_built."G6（セキュリティ）" が明示。secret ハードコードの
 * パターン定義・experimental 機能の構造化一覧は正典に無い）。
 * そのため本モジュールは正典 docs/ の該当行を直接引用し、コード内で出典を明示する
 * （build-conformance-tables.js を介さない小さな出典引用は、G6 単体では表を作るほどの
 * 分量が無いための判断。将来 secret パターンや experimental 一覧が正典側で構造化されたら
 * 専用の conformance table へ移すべき）。
 *
 * 実装する検査（正典に根拠がある範囲のみ）:
 *   1. `.mcp.json`（または frontmatter 内のインライン mcpServers 定義）の
 *      command/args/env/url/headers における ${VAR} 展開遵守
 *      （出典: docs/L4_AUTOMATION.md:551-556 環境変数展開 / docs/BEST_PRACTICES.md:451
 *       「.mcp.json に API key を直書きしない → ${VAR} 環境変数展開」）。
 *      「資格情報らしいキー名か」は KEY/TOKEN/SECRET/PASSWORD/CREDENTIAL の語を含むかで
 *      判定する簡易ヒューリスティック（正典はキー名の具体的な判定パターンまでは定義していない。
 *      これは「直書き禁止」という正典の方針をコード化する際に避けられない最小限の推定であり、
 *      正典に無い判断の「捏造」と区別するため、ここに明示する）。
 *   2. Authorization ヘッダのリテラル Bearer トークン直書き
 *      （出典: docs/BEST_PRACTICES.md:451 の例 `"Authorization": "Bearer ${API_KEY}"` そのものが
 *       正典の「良い例」。その否定形＝`${` を伴わないリテラルを違反とする）。
 *   3. Agent Teams（`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`）依存の experimental 明示
 *      （出典: docs/L3_AGENTS.md:23,51,385,403,693。正典自身がこの機能を言及するたび
 *       一貫して「実験機能」と明示している一次観察に基づく）。
 *
 * 実装しない検査（正典に根拠が無い・index.json known_limitations 相当）:
 *   - 汎用の secret 正規表現スキャン（AWS key・sk- 系トークン等の一般的パターンマッチ）。
 *     BEST_PRACTICES.md §7.2 は方針のみでパターン定義が無いため、実装すると
 *     「正典に無い判断の捏造」になる。
 *   - experimental 機能の網羅的検出。正典に構造化された一覧が無く、Agent Teams 以外は
 *     散文に散在するのみ（Themes/Monitors は plugin.json 由来で対象ファイル種別が異なる）。
 *
 * 純関数。副作用なし。
 */

import { loadArtifact, violation } from './lib/artifact.js';

const GATE = 'G6';

const VAR_SOURCE = 'docs/L4_AUTOMATION.md:551-556（環境変数展開） / docs/BEST_PRACTICES.md:451（直書き禁止）';
const CREDENTIAL_KEY_RE = /(key|token|secret|password|credential)/i;
const AGENT_TEAMS_ENV = 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS';
const EXPERIMENTAL_DISCLOSURE_RE = /実験機能|experimental/i;
const AGENT_TEAMS_SOURCE = 'docs/L3_AGENTS.md:23,51,385,403,693';

function hasVarExpansion(v) {
  return typeof v === 'string' && v.includes('${');
}

function walkMcpServerEntry(serverName, cfg, artifactPath, violations) {
  if (!cfg || typeof cfg !== 'object') return;

  if (cfg.env && typeof cfg.env === 'object') {
    for (const [k, v] of Object.entries(cfg.env)) {
      if (typeof v === 'string' && !hasVarExpansion(v) && CREDENTIAL_KEY_RE.test(k)) {
        violations.push(
          violation(
            GATE,
            artifactPath,
            `mcpServers.${serverName}.env.${k} が資格情報らしきキー名だが \${VAR} 展開を使っていない（直書きの疑い）。`,
            VAR_SOURCE
          )
        );
      }
    }
  }

  if (cfg.headers && typeof cfg.headers === 'object') {
    for (const [k, v] of Object.entries(cfg.headers)) {
      if (typeof v === 'string' && !hasVarExpansion(v) && (k.toLowerCase() === 'authorization' || CREDENTIAL_KEY_RE.test(k))) {
        violations.push(
          violation(
            GATE,
            artifactPath,
            `mcpServers.${serverName}.headers.${k} が認証ヘッダらしきキー名だが \${VAR} 展開を使っていない` +
              `（直書きの疑い。正典の良い例: "Authorization": "Bearer \${API_KEY}"）。`,
            VAR_SOURCE
          )
        );
      }
    }
  }

  if (typeof cfg.url === 'string' && !hasVarExpansion(cfg.url) && /:\/\/[^/@]+:[^/@]+@/.test(cfg.url)) {
    violations.push(
      violation(GATE, artifactPath, `mcpServers.${serverName}.url に basic-auth 資格情報が直書きされている疑い。`, VAR_SOURCE)
    );
  }
}

/**
 * 標準の JSON `.mcp.json` ファイルを検査する。artifact.js の対象（.md）とは別系統
 * （純粋な JSON なので独自パーサ不要・JSON.parse で足りる）。
 * @param {string} jsonText
 * @param {string} artifactPath 出典表記用のパス（posix 化済みが望ましい）
 */
export function checkMcpJsonText(jsonText, artifactPath) {
  const violations = [];
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (e) {
    violations.push(violation(GATE, artifactPath, `.mcp.json が正当な JSON として解析できない: ${e.message}`, 'JSON.parse'));
    return violations;
  }
  const servers = data.mcpServers && typeof data.mcpServers === 'object' ? data.mcpServers : {};
  for (const [name, cfg] of Object.entries(servers)) {
    walkMcpServerEntry(name, cfg, artifactPath, violations);
  }
  return violations;
}

/** ファイルパスから .mcp.json を読み込んで検査する便宜関数。 */
export function checkMcpJsonFile(absPath) {
  const artifact = loadArtifact(absPath); // .md 前提のパーサだが、ここでは rawText の読取のみ流用
  return checkMcpJsonText(artifact.rawText, artifact.path);
}

/**
 * 1件の .md artifact（agent/skill/rule）に対して G6 を判定する。
 */
export function checkG6(artifact) {
  const violations = [];
  const text = artifact.rawText ?? '';

  // 1. frontmatter の mcpServers がインラインオブジェクト定義の場合は未対応範囲を明示する。
  //    `mcpServers: [server-name]`（既存サーバー名参照の配列）は対象外（資格情報を含み得ない）。
  const mcpEntry = artifact.frontmatter?.mcpServers;
  if (mcpEntry && typeof mcpEntry.raw === 'string' && /^\{/.test(mcpEntry.raw.trim())) {
    violations.push(
      violation(
        GATE,
        artifact.path,
        'frontmatter の mcpServers がインラインオブジェクト定義の可能性があるが、本ゲートは単一行 ' +
          'frontmatter 値内の JSON 風構造までは解析しない（未対応スコープ）。実体は独立した .mcp.json ' +
          'として生成させ、checkMcpJsonFile で検査すること。',
        'gates/g6_security.js（実装範囲の明示・vacuous pass 防止のため黙って通さない）',
        'info'
      )
    );
  }

  // 2. Authorization ヘッダへのリテラル Bearer トークン直書き（本文・frontmatter 双方の生テキストを対象）
  const bearerRe = /["']?Authorization["']?\s*[:=]\s*["']Bearer\s+([^"'$][^"']*)["']/g;
  let m;
  while ((m = bearerRe.exec(text)) !== null) {
    violations.push(
      violation(
        GATE,
        artifact.path,
        `Authorization ヘッダに \${VAR} 展開を使わないリテラルの Bearer トークンが直書きされている疑い: ${JSON.stringify(m[0])}`,
        VAR_SOURCE
      )
    );
  }

  // 3. Agent Teams 依存の experimental 明示
  //    注意: AGENT_TEAMS_ENV 自体の文字列に "EXPERIMENTAL" が含まれるため、開示検査は
  //    env var の出現箇所を除いた残りのテキストに対して行う。除かずに検査すると
  //    env var を書いた時点で常に自己一致してしまい、検査が恒真になって沈黙する
  //    （vacuous pass。テストで実際にこの形で踏んだ）。
  const textWithoutEnvMentions = text.split(AGENT_TEAMS_ENV).join('');
  if (text.includes(AGENT_TEAMS_ENV) && !EXPERIMENTAL_DISCLOSURE_RE.test(textWithoutEnvMentions)) {
    violations.push(
      violation(
        GATE,
        artifact.path,
        `${AGENT_TEAMS_ENV} への依存が見つかったが、実験機能である旨（「実験機能」/「experimental」の記載）が本文に無い。`,
        AGENT_TEAMS_SOURCE
      )
    );
  }

  return violations;
}

export function checkG6File(absPath) {
  return checkG6(loadArtifact(absPath));
}
