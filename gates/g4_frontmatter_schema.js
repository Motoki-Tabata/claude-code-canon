/**
 * G4 frontmatter スキーマ準拠（per-file・§11.2）。
 *
 * 出典: gates/conformance_tables/frontmatter.json（正典 docs/L3_AGENTS.md §2.1・
 * L2_SKILLS.md §2.1・L1_CONTEXT_MANAGEMENT.md §2.2 から生成）。
 *
 * 検査内容（詳細設計書 §11.2 G4 行）:
 *   - 必須キー存在（Subagent: name＋description）
 *   - 未知キー検出
 *   - 型・語彙照合
 *
 * 照合表が「できない」と自己申告している検査は実装しない（frontmatter.json の
 * known_limitations・各 kind の unknown_key_detection.supported / types.available を厳守）:
 *   - agent の型照合: types.available === false のため未実装
 *   - rule の未知キー検出: unknown_key_detection.supported === false のため未実装
 *   - model 語彙の closed 照合: agent/skill とも closed === false（full ID 許容）のため未実装
 *     （open な語彙は「既知の値集合に含まれること」の判定を放棄する。含まれない値を
 *     誤って拒否しないため）
 *
 * 純関数。副作用なし。
 */

import frontmatterTable from './conformance_tables/frontmatter.json' with { type: 'json' };
import { loadArtifact, violation } from './lib/artifact.js';

const KINDS = frontmatterTable.kinds;

/** agent の disallowedTools ⇔ disallowed-tools のような、正典が明言する互換キー名。 */
function aliasSetFor(kindTable) {
  const set = new Map(); // alias -> canonical
  for (const a of kindTable.aliases ?? []) {
    set.set(a.alias, a.key);
  }
  return set;
}

function knownKeySet(kindTable) {
  return new Set((kindTable.known_keys ?? []).map((k) => k.key));
}

function checkRequiredKeys(artifact, kindTable, gate) {
  const violations = [];
  for (const req of kindTable.required_keys ?? []) {
    if (!artifact.frontmatterPresent || !(req.key in artifact.frontmatter)) {
      violations.push(
        violation(
          gate,
          artifact.path,
          `必須キー "${req.key}" が frontmatter に無い。`,
          req.source ?? kindTable.canon_section
        )
      );
    }
  }
  return violations;
}

function checkUnknownKeys(artifact, kindTable, gate) {
  const violations = [];
  if (kindTable.unknown_key_detection?.supported !== true) return violations;
  const known = knownKeySet(kindTable);
  const aliases = aliasSetFor(kindTable);
  for (const key of Object.keys(artifact.frontmatter)) {
    if (known.has(key)) continue;
    if (aliases.has(key)) continue; // 正典が明言する互換キー名
    violations.push(
      violation(
        gate,
        artifact.path,
        `未知の frontmatter キー "${key}"（正典の frontmatter 完全リファレンスに無い）。`,
        kindTable.canon_section
      )
    );
  }
  return violations;
}

function checkClosedVocab(artifact, kindTable, gate) {
  const violations = [];
  for (const [key, vocab] of Object.entries(kindTable.vocabularies ?? {})) {
    if (vocab.closed !== true) continue; // open 語彙は判定不可（frontmatter.json 自身がそう申告）
    const entry = artifact.frontmatter[key];
    if (!entry) continue;
    const allowed = new Set(vocab.values);
    if (vocab.alias) allowed.add(vocab.alias.value);
    const value = entry.value;
    const candidates = Array.isArray(value) ? value : [value];
    for (const v of candidates) {
      if (typeof v === 'string' && !allowed.has(v)) {
        violations.push(
          violation(
            gate,
            artifact.path,
            `frontmatter "${key}" の値 "${v}" が既知語彙 ${JSON.stringify(vocab.values)} に無い。`,
            vocab.source
          )
        );
      }
    }
  }
  return violations;
}

function checkTypes(artifact, kindTable, gate) {
  const violations = [];
  if (kindTable.types?.available === false) return violations; // 正典に型情報なし（agent）
  const types = kindTable.types;
  if (!types || typeof types !== 'object') return violations;
  for (const [key, spec] of Object.entries(types)) {
    if (!spec || typeof spec.type !== 'string') continue;
    const entry = artifact.frontmatter[key];
    if (!entry) continue;
    if (spec.type === 'bool') {
      if (typeof entry.value !== 'boolean') {
        violations.push(
          violation(
            gate,
            artifact.path,
            `frontmatter "${key}" は bool 型のはずが実際の値は "${entry.raw}"（真偽値でない）。`,
            spec.source
          )
        );
      }
    }
    // string / list / fork / bash・powershell 等は語彙側 or リスト検査で別途扱うため、
    // ここでは bool のみ判定する（型が構文的に一意に決まるのは bool だけ。
    // それ以外は agent 同様「型情報が構文だけでは決定論的に確定しない」ため見送る）。
  }
  return violations;
}

const GATE = 'G4';

/**
 * 1件の artifact に対して G4 を判定する。kind が agent/skill/rule 以外（unknown）は
 * どのスキーマも適用できないため検査自体をスキップせず「種別不明」を1件返す
 * （黙って何もしないと vacuous pass になる）。
 */
export function checkG4(artifact) {
  const kindTable = KINDS[artifact.kind];
  if (!kindTable) {
    return [
      violation(
        GATE,
        artifact.path,
        `種別（agent/skill/rule）を判定できないため frontmatter スキーマを適用できない。`,
        'gates/lib/artifact.js detectKind()'
      ),
    ];
  }

  return [
    ...checkRequiredKeys(artifact, kindTable, GATE),
    ...checkUnknownKeys(artifact, kindTable, GATE),
    ...checkClosedVocab(artifact, kindTable, GATE),
    ...checkTypes(artifact, kindTable, GATE),
  ];
}

export function checkG4File(absPath) {
  return checkG4(loadArtifact(absPath));
}
