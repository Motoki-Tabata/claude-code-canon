/**
 * V2 frontmatter（per-file・artifacts.md §8.2）。
 *
 * 出典: 正典リファレンス canon-reference の `frontmatter:*`（lib/tables.js）と、各機能ファイル §6 の
 * 検証ルール。
 *
 * 検査内容:
 *   - 必須キー存在（`required: true` の要素。サブエージェントは name・description・V-subagents-02）
 *   - 未知キー検出（キーがコレクションのどの `id` とも一致しない・V-subagents-04・V-skills-04・
 *     V-skills-05・V-rules-03）。コレクションが `complete: false` なら違反でなく未判定（V-common-01）
 *   - 閉じた語彙（`allowed_values` を持つキー・V-subagents-05・V-skills-06）
 *   - 真偽値の型（`type: boolean` のキー・V-skills-07）
 *
 * 開いた語彙: サブエージェントの `model` は `allowed_values` にエイリアスと `inherit` を持つが、
 * 完全なモデル ID も取る（subagents.md §3）。値の集合との照合はしない。
 *
 * 純関数。副作用なし。
 */

import { collection, cite, plain } from '../../../../../lib/tables.js';
import { violation } from '../../../../../lib/artifact.js';

const CHECK = 'V2';

/**
 * artifact の種別とパスから、当てる `frontmatter:*` のコレクションと検証ルールの ID を決める。
 * コマンドファイル（`.claude/commands/`）は artifact の種別では skill だが、受け付けるキーが違う
 * （`name`・`paths` を含まない）ので `frontmatter:command` を当てる。
 */
function schemaFor(artifact) {
  if (artifact.kind === 'agent') return { ref: 'frontmatter:subagent', unknownRule: 'V-subagents-04', vocabRule: 'V-subagents-05', requiredRule: 'V-subagents-02' };
  if (artifact.kind === 'skill') {
    if (artifact.path.split('/').includes('commands')) {
      return { ref: 'frontmatter:command', unknownRule: 'V-skills-05', vocabRule: 'V-skills-06', requiredRule: 'V-skills-05' };
    }
    return { ref: 'frontmatter:skill', unknownRule: 'V-skills-04', vocabRule: 'V-skills-06', requiredRule: 'V-skills-04' };
  }
  if (artifact.kind === 'rule') return { ref: 'frontmatter:rule', unknownRule: 'V-rules-03', vocabRule: 'V-rules-03', requiredRule: 'V-rules-03' };
  return null;
}

/** 値の集合との照合をしないキー（`<コレクション>/<キー>`）。理由は冒頭のコメント。 */
const OPEN_VOCAB = new Set(['frontmatter:subagent/model']);

/** V-skills-07 が真偽値として受け付ける書き方（大文字小文字を問わない）。 */
const BOOLEAN_RAW = /^(true|false|yes|no|on|off|1|0)$/i;

function isBooleanType(item) {
  return plain(item.type) === 'boolean';
}

function checkRequiredKeys(artifact, schema, col) {
  const violations = [];
  for (const item of col.items) {
    if (plain(item.required) !== true) continue;
    if (!artifact.frontmatterPresent || !(item.id in artifact.frontmatter)) {
      violations.push(
        violation(CHECK, artifact.path, `必須キー "${item.id}" が frontmatter に無い。`, cite(schema.requiredRule, `${col.ref}/${item.id}`))
      );
    }
  }
  return violations;
}

function checkUnknownKeys(artifact, schema, col) {
  const violations = [];
  for (const key of Object.keys(artifact.frontmatter)) {
    if (col.byId.has(key)) continue;
    if (col.complete) {
      violations.push(
        violation(CHECK, artifact.path, `未知の frontmatter キー "${key}"（${col.ref} に無い）。`, cite(schema.unknownRule, col.ref))
      );
    } else {
      violations.push(
        violation(
          CHECK,
          artifact.path,
          `frontmatter キー "${key}" が ${col.ref} に無い。${col.ref} は全件を収めていないので未判定とする。公式ページで確かめること。`,
          `${cite(schema.unknownRule, col.ref)}・${cite('V-common-01')}`,
          'undetermined'
        )
      );
    }
  }
  return violations;
}

function checkClosedVocab(artifact, schema, col) {
  const violations = [];
  for (const item of col.items) {
    const allowedValues = plain(item.allowed_values);
    if (!Array.isArray(allowedValues) || allowedValues.length === 0) continue;
    if (isBooleanType(item)) continue; // 真偽値は checkTypes が見る
    if (OPEN_VOCAB.has(`${col.ref}/${item.id}`)) continue;
    const entry = artifact.frontmatter[item.id];
    if (!entry) continue;
    const allowed = new Set(allowedValues.map((v) => String(plain(v))));
    const candidates = Array.isArray(entry.value) ? entry.value : [entry.value];
    for (const v of candidates) {
      if (typeof v === 'string' && !allowed.has(v)) {
        violations.push(
          violation(
            CHECK,
            artifact.path,
            `frontmatter "${item.id}" の値 "${v}" が allowed_values ${JSON.stringify([...allowed])} に無い。`,
            cite(schema.vocabRule, `${col.ref}/${item.id}`)
          )
        );
      }
    }
  }
  return violations;
}

function checkTypes(artifact, col) {
  const violations = [];
  for (const item of col.items) {
    if (!isBooleanType(item)) continue;
    const entry = artifact.frontmatter[item.id];
    if (!entry || entry.nested) continue;
    if (typeof entry.value === 'boolean') continue;
    if (BOOLEAN_RAW.test(String(entry.value).trim())) continue;
    violations.push(
      violation(
        CHECK,
        artifact.path,
        `frontmatter "${item.id}" は真偽値のはずが実際の値は "${entry.raw}"（true・false・yes・no・on・off・1・0 のどれでもない）。`,
        cite('V-skills-07', `${col.ref}/${item.id}`)
      )
    );
  }
  return violations;
}

/** parseFrontmatter が積んだ構文エラー（unparsed_line・duplicate_key・unterminated_block）を違反にする。 */
function checkParseErrors(artifact) {
  return (artifact.errors ?? [])
    .filter((e) => e.type !== 'missing_file') // 欠落は呼び出し側（loadArtifact の利用者）の領分
    .map((e) =>
      violation(
        CHECK,
        artifact.path,
        `frontmatter の構文エラー（${e.type}${e.line ? `・${e.line}行目` : ''}）: ${e.message}`,
        'lib/artifact.js parseFrontmatter()'
      )
    );
}

/**
 * 1件の artifact に対して V2 を判定する。kind が agent/skill/rule 以外（unknown）は
 * どのスキーマも適用できないため検査自体をスキップせず「種別不明」を1件返す
 * （黙って何もしないと vacuous pass になる）。
 */
export function checkV2(artifact) {
  const schema = schemaFor(artifact);
  if (!schema) {
    return [
      violation(
        CHECK,
        artifact.path,
        `種別（agent/skill/rule）を判定できないため frontmatter スキーマを適用できない。`,
        'lib/artifact.js detectKind()'
      ),
    ];
  }
  const col = collection(schema.ref);

  return [
    ...checkParseErrors(artifact),
    ...checkRequiredKeys(artifact, schema, col),
    ...checkUnknownKeys(artifact, schema, col),
    ...checkClosedVocab(artifact, schema, col),
    ...checkTypes(artifact, col),
  ];
}
