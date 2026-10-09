/**
 * V4 secret と展開（per-file・artifacts.md §8.2）。
 *
 * V1〜V3 と異なり、V4 には data の専用コレクションが無い（secret のパターンの定義や experimental
 * 機能の一覧は canon-reference に構造化されていない）。そのため本モジュールは canon-reference の
 * 該当節を出典に挙げ、判定の根拠が canon 側の推定である部分はコードにその旨を書く。
 *
 * 実装する検査:
 *   1. `.mcp.json`（または frontmatter 内のインライン mcpServers 定義）の
 *      command/args/env/url/headers における ${VAR} 展開遵守
 *      （出典: canon-reference features/mcp.md「資格情報」——秘密の値は `.mcp.json` に直接書かず
 *       `${VAR}` で読む。置ける位置は V-mcp-06 の `expands_env` が `true` のフィールド）。
 *      「資格情報らしいキー名か」は KEY/TOKEN/SECRET/PASSWORD/CREDENTIAL の語を含むかで
 *      判定する簡易ヒューリスティック（canon-reference はキー名の判定パターンまでは定義していない。
 *      これは「直書き禁止」という方針をコード化する際に避けられない最小限の推定であり、
 *      canon-reference に無い判断の「捏造」と区別するため、ここに明示する）。
 *   2. Authorization ヘッダのリテラル Bearer トークン直書き
 *      （出典: 1 と同じ。`"Authorization": "Bearer ${API_KEY}"` の形が良い例で、その否定形＝
 *       `${` を伴わないリテラルを違反とする）。
 *   3. Agent Teams（`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`）依存の experimental 明示
 *      （canon 独自の規則。canon-reference selection.md は agent teams を「実験的な機能で、既定では
 *       無効」と書くが、この環境変数の名前は `env-vars` に無い。名前はコードに残している）。
 *
 * 実装しない検査（canon-reference に根拠が無い）:
 *   - 汎用の secret 正規表現スキャン（AWS key・sk- 系トークン等の一般的パターンマッチ）。
 *     canon-reference は方針（秘密の値を直接書かない）のみでパターン定義が無いため、実装すると
 *     「canon-reference に無い判断の捏造」になる。
 *   - experimental 機能の網羅的検出。canon-reference に構造化された一覧が無く、Agent Teams 以外は
 *     散文に散在するのみ（Themes/Monitors は plugin.json 由来で対象ファイル種別が異なる）。
 *
 * 純関数。副作用なし。
 */

import { violation } from '../../../../../lib/artifact.js';
import { cite } from '../../../../../lib/tables.js';

const CHECK = 'V4';

const VAR_SOURCE = `canon-reference features/mcp.md「資格情報」/ ${cite('V-mcp-06', 'mcp:mcp-json-fields')}`;
const CREDENTIAL_KEY_RE = /(key|token|secret|password|credential)/i;
const AGENT_TEAMS_ENV = 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS';
const EXPERIMENTAL_DISCLOSURE_RE = /実験機能|experimental/i;
const AGENT_TEAMS_SOURCE = 'canon 独自の規則（canon-reference selection.md: agent teams は実験的な機能）';

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
            CHECK,
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
            CHECK,
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
      violation(CHECK, artifactPath, `mcpServers.${serverName}.url に basic-auth 資格情報が直書きされている疑い。`, VAR_SOURCE)
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
    violations.push(violation(CHECK, artifactPath, `.mcp.json が正当な JSON として解析できない: ${e.message}`, 'JSON.parse'));
    return violations;
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    violations.push(violation(CHECK, artifactPath, '.mcp.json のトップレベルが JSON object でない（`{ "mcpServers": { … } }` の形でなければ読み込まれない）。', 'JSON.parse'));
    return violations;
  }
  const servers = data.mcpServers && typeof data.mcpServers === 'object' ? data.mcpServers : {};
  for (const [name, cfg] of Object.entries(servers)) {
    walkMcpServerEntry(name, cfg, artifactPath, violations);
  }
  return violations;
}


/**
 * 1件の .md artifact（agent/skill/rule）に対して V4 を判定する。
 */
export function checkV4(artifact) {
  const violations = [];
  const text = artifact.rawText ?? '';

  // 1. frontmatter の mcpServers がインラインオブジェクト定義の場合は未対応範囲を明示する。
  //    `mcpServers: [server-name]`（既存サーバー名参照の配列）は対象外（資格情報を含み得ない）。
  const mcpEntry = artifact.frontmatter?.mcpServers;
  if (mcpEntry && typeof mcpEntry.raw === 'string' && /^\{/.test(mcpEntry.raw.trim())) {
    violations.push(
      violation(
        CHECK,
        artifact.path,
        'frontmatter の mcpServers がインラインオブジェクト定義の可能性があるが、本検査は単一行 ' +
          'frontmatter 値内の JSON 風構造までは解析しない（未対応スコープ）。実体は独立した .mcp.json ' +
          'として生成させること（V4 が .mcp.json を検査する）。',
        'verify/v4-security.js（実装範囲の明示・vacuous pass 防止のため黙って通さない）',
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
        CHECK,
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
        CHECK,
        artifact.path,
        `${AGENT_TEAMS_ENV} への依存が見つかったが、実験機能である旨（「実験機能」/「experimental」の記載）が本文に無い。`,
        AGENT_TEAMS_SOURCE
      )
    );
  }

  return violations;
}

