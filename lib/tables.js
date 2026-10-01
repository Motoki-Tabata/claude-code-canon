/**
 * lib/tables.js — docs/ から生成した判定表（`gates/conformance_tables/*.json`）の読み口。
 *
 * 判定表は `npm run build:tables` が正典から生成し、手で編集しない（architecture.md §10）。
 * 検査モジュールは判定表をここから import し、置き場所への相対パスを各自で書かない。
 */

import pathsTable from '../gates/conformance_tables/paths.json' with { type: 'json' };
import frontmatterTable from '../gates/conformance_tables/frontmatter.json' with { type: 'json' };
import toolsTable from '../gates/conformance_tables/tools.json' with { type: 'json' };
import hooksTable from '../gates/conformance_tables/hooks.json' with { type: 'json' };

export { pathsTable, frontmatterTable, toolsTable, hooksTable };
