/**
 * G3 パス規約準拠（per-file・§11.2）。
 *
 * 出典: gates/conformance_tables/paths.json（正典 docs/L3_AGENTS.md §2.1・L2_SKILLS.md §2.1・
 * L1_CONTEXT_MANAGEMENT.md §2.2 から生成）。
 *
 * 検査内容（詳細設計書 §11.2 G3 行）:
 *   - 許可パス合致（配置パターン一致）
 *   - 拡張子・種別整合
 *   - skill ディレクトリ名＝name 一致 ※これだけは正典由来でなく設計由来（第3の例外・§11.4 追記参照）
 *
 * 純関数。副作用（fs 書込・process.exit）なし。
 */

import pathsTable from './conformance_tables/paths.json' with { type: 'json' };
import { loadArtifact, violation } from './lib/artifact.js';
import { DESIGN_DOC_DETAIL } from './lib/canon.js';

const AGENT_SOURCE = pathsTable.kinds.agent.canon_section;
const SKILL_SOURCE = pathsTable.kinds.skill.canon_section;
const RULE_SOURCE = pathsTable.kinds.rule.canon_section;
const SKILL_DIRNAME_ITEM = pathsTable.design_derived_requirements.items.find(
  (i) => i.requirement === 'skill ディレクトリ名 = frontmatter name の一致'
);

// 配置パターンは `.claude/<family>/...` という接頭辞が Project/User 両スコープに共通して
// 現れる（paths.json の placements を参照）。plugin スコープ（`<plugin>/agents/<name>.md` 等、
// `.claude/` を前置しない）はここでは検査対象外とする（既知の限界。報告参照）。
const AGENT_DIR_FORM = /(^|\/)\.claude\/agents\/([^/]+)\/([^/]+)\.md$/;
const AGENT_FLAT_FORM = /(^|\/)\.claude\/agents\/([^/]+)\.md$/;
const SKILL_FORM = /(^|\/)\.claude\/skills\/([^/]+)\/SKILL\.md$/;
const RULE_FORM = /(^|\/)\.claude\/rules\/([^/]+)\.md$/;
const USER_RULE_FORM = /(^|\/)~\/\.claude\/rules\/([^/]+)\.md$/;

/** パスに含まれるファミリー語（agents/skills/commands/rules）から所属先を大まかに当てる。 */
function classifyPathFamily(p) {
  const segs = p.split('/');
  if (segs.includes('agents')) return 'agent';
  if (segs.includes('skills')) return 'skill';
  if (segs.includes('commands')) return 'commands-deprecated';
  if (segs.includes('rules')) return 'rule';
  return null;
}

/**
 * 1件の artifact に対して G3 を判定する。
 * @param {ReturnType<typeof import('./lib/artifact.js').loadArtifact>} artifact
 */
export function checkG3(artifact) {
  const violations = [];
  const p = artifact.path;
  const family = classifyPathFamily(p);

  if (family === 'agent') {
    if (!AGENT_DIR_FORM.test(p) && !AGENT_FLAT_FORM.test(p)) {
      violations.push(
        violation(
          'G3',
          p,
          'agent の配置パスが許可パターン（.claude/agents/<name>/<name>.md または .claude/agents/<name>.md）に合致しない。',
          AGENT_SOURCE
        )
      );
    }
    if (!p.endsWith('.md')) {
      violations.push(violation('G3', p, 'agent ファイルの拡張子は .md でなければならない。', AGENT_SOURCE));
    }
  } else if (family === 'skill') {
    const base = p.split('/').pop();
    if (base !== 'SKILL.md') {
      violations.push(
        violation(
          'G3',
          p,
          `skill ディレクトリ配下のファイル名は固定 "SKILL.md" でなければならない（実際: "${base}"）。`,
          `${SKILL_SOURCE}（filename_fixed: ${pathsTable.kinds.skill.filename_fixed}）`
        )
      );
    } else if (!SKILL_FORM.test(p)) {
      violations.push(
        violation(
          'G3',
          p,
          'skill の配置パスが許可パターン（.claude/skills/<skill-name>/SKILL.md）に合致しない。',
          SKILL_SOURCE
        )
      );
    }

    // skill ディレクトリ名 = frontmatter name 一致（設計由来。正典由来ではない・第3の例外）
    if (base === 'SKILL.md' && artifact.frontmatter?.name) {
      const dirName = p.split('/').slice(-2, -1)[0];
      const nameValue = artifact.frontmatter.name.value;
      if (typeof nameValue === 'string' && nameValue !== '' && nameValue !== dirName) {
        violations.push(
          violation(
            'G3',
            p,
            `skill ディレクトリ名 "${dirName}" が frontmatter の name "${nameValue}" と一致しない。` +
              `これは正典由来の要件ではなく設計由来の要件（${DESIGN_DOC_DETAIL} §11.2 G3・` +
              `2026-07-16 ユーザー裁定により accepted_by_human）。`,
            `${SKILL_DIRNAME_ITEM?.source ?? `${DESIGN_DOC_DETAIL} §11.2 G3`}（design_derived_requirements、正典由来ではない）`
          )
        );
      }
    }
  } else if (family === 'commands-deprecated') {
    violations.push(
      violation(
        'G3',
        p,
        '.claude/commands/ への配置は廃止予定（⚠ Custom Commands）。.claude/skills/<skill-name>/SKILL.md へ移行すること。',
        SKILL_SOURCE,
        'warning'
      )
    );
  } else if (family === 'rule') {
    if (!RULE_FORM.test(p) && !USER_RULE_FORM.test(p)) {
      violations.push(
        violation(
          'G3',
          p,
          'rule の配置パスが許可パターン（.claude/rules/<name>.md または ~/.claude/rules/<name>.md）に合致しない。',
          RULE_SOURCE
        )
      );
    }
  } else {
    // agents/skills/commands/rules いずれのファミリー語も含まないパス。
    // カスタマイズ生成物である以上、いずれかに属さねばならない。
    violations.push(
      violation(
        'G3',
        p,
        '既知の配置ファミリー（.claude/agents/ .claude/skills/ .claude/rules/）のいずれにも属さないパス。',
        `${AGENT_SOURCE} / ${SKILL_SOURCE} / ${RULE_SOURCE}`
      )
    );
  }

  return violations;
}

/** ファイルパスから artifact を読み込んで G3 を判定する便宜関数。 */
export function checkG3File(absPath) {
  return checkG3(loadArtifact(absPath));
}
