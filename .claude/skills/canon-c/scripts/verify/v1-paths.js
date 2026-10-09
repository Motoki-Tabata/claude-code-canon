/**
 * V1 配置パス（per-file・artifacts.md §8.2）。
 *
 * 出典: 正典リファレンス canon-reference の検証ルールと `paths:files`（lib/reference-data.js）。
 *
 * 検査内容:
 *   - Skill の定義ファイルは `.claude/skills/<name>/SKILL.md`（V-skills-01）。パッケージ内の
 *     補助ファイル（`template.md`・`examples/*.md`・`scripts/*`）は違反にしない（skills.md §3 と
 *     V-skills-18 が、SKILL.md から相対パスで指す補助ファイルをディレクトリ内に置くことを前提にする）
 *   - ルールは `.claude/rules/` の下の `.md`（サブディレクトリ可・V-rules-01）
 *   - サブエージェントは `.claude/agents/` の下の `.md`（ディレクトリは再帰的に走査される・subagents.md §3）
 *   - コマンドファイル（`.claude/commands/*.md`）は Skill に統合された古い形式。補助ファイルを持てない
 *     ので warning にする（skills.md §1）
 *   - 出力スタイルは `.claude/output-styles/*.md`、plugin では `output-styles/*.md`（V-output-styles-05）
 *   - skill ディレクトリ名＝name 一致 ※これだけは正典由来でなく設計由来（artifacts.md §8.3）
 *
 * 機能ファイルに確定の配置規則が無いもの（サブエージェント・出力スタイル・既知の機能に属さないパス）は、
 * `paths:files` の形との照合（V-common-02）になる。`paths:files` は `complete: false` なので、
 * 一致しなければ違反でなく未判定にする（V-common-01）。
 *
 * 純関数。副作用（fs 書込・process.exit）なし。
 */

import { cite } from '../../../../../lib/reference-data.js';
import { skillPathRole, violation } from '../../../../../lib/artifact.js';
import { DESIGN_DOC_ARTIFACTS } from '../../../../../lib/canon.js';

const CHECK = 'V1';

const AGENT_FORM = /(^|\/)\.claude\/agents\/(.+\/)?[^/]+\.md$/;
const SKILL_FORM = /(^|\/)\.claude\/skills\/([^/]+)\/SKILL\.md$/;
const RULE_FORM = /(^|\/)(\.claude|~\/\.claude)\/rules\/(.+\/)?[^/]+\.md$/;
const OUTPUT_STYLE_FORM = /^(\.claude|plugin)\/output-styles\/[^/]+\.md$/;

const AGENT_SOURCE = cite('V-common-02', 'paths:files/project:.claude/agents/*.md');
const SKILL_SOURCE = cite('V-skills-01', 'paths:files/project:.claude/skills/<name>/SKILL.md');
const RULE_SOURCE = cite('V-rules-01', 'paths:files/project:.claude/rules/*.md');
const OUTPUT_STYLE_SOURCE = cite('V-output-styles-05', 'paths:files/project:.claude/output-styles/*.md・paths:files/plugin:output-styles/*.md');
const COMMAND_SOURCE = 'canon-reference references/features/skills.md §1（コマンドファイル）';

/** パスに含まれるファミリー語（agents/skills/commands/rules/output-styles）から所属先を大まかに当てる。 */
function classifyPathFamily(p) {
  const segs = p.split('/');
  if (segs.includes('agents')) return 'agent';
  if (segs.includes('skills')) return 'skill';
  if (segs.includes('commands')) return 'command';
  if (segs.includes('rules')) return 'rule';
  if (segs.includes('output-styles')) return 'output-style';
  return null;
}

/**
 * 1件の artifact に対して V1 を判定する。
 * @param {ReturnType<typeof import('../../../../../lib/artifact.js').artifactFromText>} artifact
 */
export function checkV1(artifact) {
  const violations = [];
  const p = artifact.path;
  const family = classifyPathFamily(p);

  if (family === 'agent') {
    if (!AGENT_FORM.test(p)) {
      violations.push(
        violation(
          CHECK,
          p,
          'サブエージェントの配置が `paths:files` の形（.claude/agents/ の下の .md）に一致しない。`paths:files` は全件を収めていないので未判定とする。公式ページで確かめること。',
          `${AGENT_SOURCE}・${cite('V-common-01')}`,
          'undetermined'
        )
      );
    }
  } else if (family === 'skill') {
    const base = p.split('/').pop();
    const role = skillPathRole(p);

    if (role === 'supporting') {
      // 補助ファイル。パッケージの必須エントリ（SKILL.md）の実在は per-file では判定できないので V6 が持つ。
    } else if (base !== 'SKILL.md') {
      violations.push(
        violation(CHECK, p, `Skill の定義ファイルの名前は "SKILL.md" でなければならない（実際: "${base}"）。`, SKILL_SOURCE)
      );
    } else if (!SKILL_FORM.test(p)) {
      violations.push(
        violation(CHECK, p, 'Skill の配置が .claude/skills/<skill-name>/SKILL.md の形に一致しない。', SKILL_SOURCE)
      );
    }

    // skill ディレクトリ名 = frontmatter name 一致（設計由来。正典由来ではない・artifacts.md §8.3）。
    // 対象はスキル定義ファイル（role: definition）のみ。supporting file の `examples/SKILL.md`
    // のような例示ファイルへ適用すると、正典が許可した配置を設計由来の規律で塞ぐことになる。
    if (role === 'definition' && artifact.frontmatter?.name) {
      const dirName = p.split('/').slice(-2, -1)[0];
      const nameValue = artifact.frontmatter.name.value;
      if (typeof nameValue === 'string' && nameValue !== '' && nameValue !== dirName) {
        violations.push(
          violation(
            CHECK,
            p,
            `skill ディレクトリ名 "${dirName}" が frontmatter の name "${nameValue}" と一致しない。` +
              `これは正典由来の要件ではなく設計由来の要件（${DESIGN_DOC_ARTIFACTS} §8.3・accepted_by_human）。`,
            `${DESIGN_DOC_ARTIFACTS} §8.3（設計由来、正典由来ではない）`
          )
        );
      }
    }
  } else if (family === 'command') {
    violations.push(
      violation(
        CHECK,
        p,
        '.claude/commands/ は Skill に統合された古い形式で、補助ファイルを持てない。.claude/skills/<skill-name>/SKILL.md を使うこと。',
        COMMAND_SOURCE,
        'warning'
      )
    );
  } else if (family === 'rule') {
    if (!RULE_FORM.test(p)) {
      violations.push(
        violation(
          CHECK,
          p,
          'ルールの配置が .claude/rules/ の下の .md（サブディレクトリ可）の形に一致しない。',
          RULE_SOURCE
        )
      );
    }
  } else if (family === 'output-style') {
    if (!OUTPUT_STYLE_FORM.test(p)) {
      violations.push(
        violation(
          CHECK,
          p,
          '出力スタイルの配置が `paths:files` の形（.claude/output-styles/ 直下の .md）に一致しない。`paths:files` は全件を収めていないので未判定とする。公式ページで確かめること。',
          `${OUTPUT_STYLE_SOURCE}・${cite('V-common-01')}`,
          'undetermined'
        )
      );
    }
  } else {
    // agents/skills/commands/rules/output-styles のどのファミリー語も含まないパス。`paths:files` は全件を収めて
    // いないので、ここで「置けない場所」とは断定しない。
    violations.push(
      violation(
        CHECK,
        p,
        '既知の配置（.claude/agents/・.claude/skills/・.claude/rules/・.claude/output-styles/）のどれにも属さない。`paths:files` は全件を収めていないので未判定とする。公式ページで確かめること。',
        `${cite('V-common-02', 'paths:files')}・${cite('V-common-01')}`,
        'undetermined'
      )
    );
  }

  return violations;
}
