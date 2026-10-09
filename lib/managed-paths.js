/**
 * lib/managed-paths.js — 管理パス集合（artifacts.md §10.1）の Single Source of Truth。
 *
 * V8・V9（生成物の集合内包検査）と canon-d の pre-deploy-check・deploy（退避スワップ）が共有する。
 * 列挙の網羅性は単一障害点である（漏れたパターン経由で集合外が混入すれば、退避スワップが
 * 集合外を壊しうる）。ゆえにパターン定義は本ファイル1箇所に集約し、全員が同じ定義を import する。
 */

import path from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

// 管理パス集合（artifacts.md §10.1）。generated/ または対象リポジトリからの相対パスがこの集合に収まること。
/**
 * plugin（Plugin 配布物）のパターン。MANAGED_PATTERNS の一要素であると同時に、
 * V9（制約遵守）が「plugins 禁止なのに plugin 配布物を生成していないか」を
 * 判定するのにも使う。定義を2箇所に書くと片方だけが仕様に追従するため
 * 名前を付けて共有する。
 */
export const PLUGIN_PATTERN = /^plugin\/.+/;

/**
 * hooks のハンドラ実体。canon-reference `features/hooks.md` の公式の例が
 * `${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.sh` をこの位置に置く。
 * V9 の hooks 検出経路③も「hook スクリプトの実体配置（`.claude/hooks/**`）」を前提にしている。
 *
 * ここに含めないと、正典の公式例どおりに hook スクリプトを生成した瞬間 V8 が
 * 「管理パス集合外のファイル」として弾き、canon は自分の正典が示す形を生成できない。
 * さらに `.claude/settings.json` だけが管理対象だと、hook を宣言した settings.json は
 * 配置されるのに参照先スクリプトは配置されないという壊れた配線を deploy が作る。
 *
 * トレードオフ（列挙の網羅性が単一障害点であることの裏面）: 集合へ加えることは、
 * 退避スワップが `.claude/hooks/**` を **管理（＝廃止もできる）** ようになることを意味する。
 * 対象側に canon 管理外の hook スクリプトが既にあれば、退避後に output が持たない分は
 * 復元されない。この危険は pre-deploy-check（artifacts.md §10.2）が引き受ける——調査で捕捉していない
 * ファイルは uncaptured として exit 2 で配置を止める（P5 の最終防波堤）。集合に入っていない
 * 現状はそもそも走査対象外＝取りこぼしを検出する機会すら無い、という点も併せて weigh した。
 */
export const HOOKS_PATTERN = /^\.claude\/hooks\/.+/;

export const MANAGED_PATTERNS = [
  /^CLAUDE\.md$/,
  /^AGENTS\.md$/,
  /^\.claude\/rules\/.+/,
  /^\.claude\/skills\/.+/,
  /^\.claude\/commands\/.+/,
  /^\.claude\/output-styles\/.+/,
  /^\.claude\/agents\/.+/,
  /^\.claude\/settings\.json$/,
  /^\.claude\/README\.md$/,
  HOOKS_PATTERN, // hook ハンドラ実体（canon-reference features/hooks.md）
  /^\.mcp\.json$/,
  PLUGIN_PATTERN,
];

/**
 * 相対パスが「正規化済みで、リポジトリの外へ出ない」表記か。`..`・`.`・空のセグメント（`//`）・
 * 絶対パス・ドライブ文字・バックスラッシュを含む表記は false。パターンの `.+` は `/` も `..` も
 * 受けるので、`.claude/rules/../../x` のような表記は所属判定の前にここで弾く。
 */
export function isCleanRel(rel) {
  if (typeof rel !== 'string' || rel === '') return false;
  if (rel.startsWith('/') || /^[A-Za-z]:/.test(rel) || rel.includes('\\')) return false;
  return rel.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

/** 相対パス（posix 正規化済み）が管理パス集合に属するか。`..` 等を含む表記は集合外。 */
export function isManaged(rel) {
  return isCleanRel(rel) && MANAGED_PATTERNS.some((re) => re.test(rel));
}

/** リスト行のうち、集合に属さないもの（集合外・`..`・絶対パス・未正規化）を返す。deploy と pre-deploy-check が共有する。 */
export function findUnmanagedEntries(entries) {
  return entries.filter((rel) => !isManaged(rel));
}

/** リスト行の正規化: バックスラッシュ→スラッシュ、先頭 ./ 除去、trim。 */
export function normalizeRel(entry) {
  return entry.trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * managed-paths.list / retired.list の本文をパースする。
 * # コメント行と空行を除去し、各パスを posix 正規化する。
 */
export function parseListText(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map(normalizeRel);
}

/**
 * リストファイルを読む。存在しなければ null を返す（retired.list は任意ゆえ、
 * 「不在」と「空リスト」を呼び出し側で区別できるようにする）。
 */
export function readList(abs) {
  if (!existsSync(abs)) return null;
  return parseListText(readFileSync(abs, 'utf8'));
}

/**
 * 管理パス集合の【走査根】＝リポジトリ直下で降りてよいエントリ名の集合
 * （`CLAUDE.md` / `.claude` / `.mcp.json` / `plugin`）。
 *
 * ハードコードせず MANAGED_PATTERNS から機械導出する。走査根を第二の手書きリストとして
 * 持つと、パターンを1本足したのに走査根を足し忘れた瞬間 walkManaged が黙って列挙漏れを
 * 起こす——列挙の網羅性が単一障害点になる。導出は「先頭アンカー ^ の直後から最初の `/` まで」を取り、
 * `\.` `\/` のエスケープだけを解く。リテラルでない先頭セグメント（`^(a|b)/` 等）は
 * 機械導出できないので静かに握りつぶさず throw する。
 */
let managedRootsCache = null;

/**
 * plugin の走査根 `plugin/` を管理対象に数える条件＝マニフェストの実在（canon-reference `plugin-manifest:components`: plugin は
 * `.claude-plugin/plugin.json` を持つディレクトリ）。所属判定（isManaged）は静的パターンのまま、
 * 走査だけを実体で絞る——対象プロジェクトが別の用途で持つ `plugin/` を管理対象と誤認しない。
 */
export const PLUGIN_ROOT = 'plugin';
export const PLUGIN_MANIFEST_REL = `${PLUGIN_ROOT}/.claude-plugin/plugin.json`;

export function managedRoots() {
  if (managedRootsCache) return managedRootsCache;
  const roots = new Set();
  for (const re of MANAGED_PATTERNS) {
    if (!re.source.startsWith('^')) {
      throw new Error(`managed-paths: 先頭アンカー ^ の無いパターンからは走査根を導出できない: ${re.source}`);
    }
    const head = re.source
      .replace(/^\^/, '')
      .replace(/\$$/, '')
      .replace(/\\([./])/g, '$1')
      .split('/')[0];
    if (!/^[A-Za-z0-9._-]+$/.test(head)) {
      throw new Error(
        `managed-paths: 走査根を機械導出できないパターン: ${re.source}（先頭セグメントがリテラルでない）`
      );
    }
    roots.add(head);
  }
  managedRootsCache = roots;
  return roots;
}

/**
 * root 配下で管理パス集合に属する実ファイルを列挙し、走査中に種別判定できなかった
 * エントリも併せて返す。pre-deploy-check の「対象の【実】管理パス集合 全ファイル」の走査（artifacts.md §10.2）。
 *
 * 【真実の源をどれに置いたか】ディスクの物理実在（走査根の直下のみ）を採る。git は採らない。
 *   - pre-deploy-check の入力定義が「パターンを <target> に適用して**実在するファイル全部**」で
 *     あり、この列挙は破壊操作（deploy step1 の退避 mv・step2 の全置換）の入力そのものだから。
 *     `git ls-files` に切り替えると【過少報告】になる: 配置直後でまだ commit されていない
 *     `.claude/` は untracked なので消え、pre-deploy-check は uncaptured を見落とし（P5 の
 *     最終防波堤が黙って素通り）、deploy step1 は退避しないまま step2 で上書きする＝.bak の
 *     無いデータ消失。対象が git リポジトリでない場合も同様に全滅する。過少報告は
 *     過剰報告より高くつく。
 *   - では .claude/rules/gates-and-tests.md の「readdirSync 手書き再帰でなく git ls-files」に
 *     反するのか——あの規律の狙いは「追跡外の物理実在物（git worktree・退避ディレクトリ・
 *     gitignore 済みのゴミ）を誤って拾わない」ことで、手段としての git はその代理でしかない。
 *     ここでは同じ狙いを【走査根を管理パス集合の根に絞る】ことで満たす。実際、今回の事故で
 *     踏んだ `backend/socket_*` 14件は .gitignore 済みだったが、走査根の外なので git に
 *     頼らずとも最初から視界に入らない。node_modules/・build/・docker/volumes/ も同様。
 *
 * 【なぜ statSync を止めたか】旧実装は「ディレクトリか否か」を知るためだけに全エントリへ
 * statSync していた。readdir の Dirent が既に種別を持っているので、その stat は不要であり、
 * かつ socket・FIFO・権限拒否・走査中に消えたファイルで例外を投げて【走査全体】を落とす。
 * 現に対象リポジトリの socket 1件で配置前照合が起動不能になった。stat が要るのは
 * シンボリックリンクの解決時だけで、そこは try/catch で当該エントリのみ捨てる。
 *
 * 【落としたものは黙殺しない】種別判定に失敗したエントリは unreadable に積んで返す。
 * 走査根の内側で読めないものが在るということは、管理パス集合の一部を列挙できていない＝
 * 防波堤に盲点があるということなので、pre-deploy-report で人間（P5）に見せる。
 *
 * 【V8 との一貫性】集合の【所属判定】は isManaged/MANAGED_PATTERNS 一本で、V8 と共有する。
 * 違うのは走査の【範囲と手段】だけ。V8 が output/<ts>/generated/ を全ファイル走査するのは
 * 「集合外を生成していないか」を検出するのが目的で、走査根に絞ると検出できなくなるため
 * そちらは全走査のままが正しい（同じ関数にしてはいけない対）。
 *
 * @param {string} root 走査の起点（対象リポジトリのルート）
 * @param {{readdir?:Function, stat?:Function}} [io] fs 注入口（テストで stat/readdir を
 *   意図的に失敗させ、走査が生き残ることを示すための seam。本番は既定の node:fs）
 * @returns {{files: string[], unreadable: {rel:string, code:string}[]}}
 *   files は posix 相対パス・ソート済み。
 */
export function walkManagedDetailed(root, { readdir = readdirSync, stat = statSync } = {}) {
  const files = [];
  const unreadable = [];
  if (!existsSync(root)) return { files, unreadable };

  const roots = managedRoots();

  const visit = (dirent, parentAbs, rel) => {
    const abs = path.join(parentAbs, dirent.name);
    let isDir = dirent.isDirectory();
    if (dirent.isSymbolicLink()) {
      // 旧実装の statSync はリンクを辿っていた。その挙動は保つが、
      // 切れたリンク・権限拒否は当該エントリだけを捨てる。
      try {
        isDir = stat(abs).isDirectory();
      } catch (err) {
        unreadable.push({ rel, code: err?.code ?? 'EUNKNOWN' });
        return;
      }
    }
    if (isDir) {
      // 依存の展開先は配置の対象でも調査の対象でもない（plugin/ や skill の scripts/ に置かれうる）。
      // 降りると巨大な木を走査し、退避スワップ（step1）が依存ごと動かしてしまう。
      if (dirent.name === 'node_modules') return;
      let entries;
      try {
        entries = readdir(abs, { withFileTypes: true });
      } catch (err) {
        unreadable.push({ rel, code: err?.code ?? 'EUNKNOWN' });
        return;
      }
      for (const e of entries) visit(e, abs, `${rel}/${e.name}`);
      return;
    }
    // ディレクトリ以外（通常ファイル・socket・FIFO 等）は集合の所属判定にかける。
    // socket が管理パスの位置に在れば退避スワップで実際に壊れるので、隠さず載せる。
    if (isManaged(rel)) files.push(rel);
  };

  // リポジトリ直下の readdir 1回で走査根の実在と種別が分かる（走査根ごとの stat が要らない）。
  let top;
  try {
    top = readdir(root, { withFileTypes: true });
  } catch (err) {
    unreadable.push({ rel: '.', code: err?.code ?? 'EUNKNOWN' });
    return { files, unreadable };
  }
  for (const d of top) {
    if (!roots.has(d.name)) continue;
    if (d.name === PLUGIN_ROOT && !hasPluginManifest(root, stat)) continue;
    visit(d, root, d.name);
  }

  return { files: files.sort(), unreadable };
}

function hasPluginManifest(root, stat) {
  try {
    return stat(path.join(root, PLUGIN_MANIFEST_REL)).isFile();
  } catch {
    return false;
  }
}

/**
 * root 配下で管理パス集合に属する実ファイルの相対パス（posix・ソート済み）を全列挙する。
 * walkManagedDetailed の薄いラッパ（判定ロジックは複製しない）。
 */
export function walkManaged(root, io) {
  return walkManagedDetailed(root, io).files;
}

/** ファイルの sha256（hex）。V7 の keep 非回帰・deploy の事後確認のバイト同一照合に使う。 */
export function sha256File(abs) {
  return createHash('sha256').update(readFileSync(abs)).digest('hex');
}

// ---------------------------------------------------------------------------
// リスト行の具体性検査（glob 禁止・実在照合）
// ---------------------------------------------------------------------------

/**
 * glob メタ文字。`managed-paths.list` / `retired.list` の行に現れてはならない。
 *
 * 【なぜ必要か】実際に配置が失敗したことがある。`deploy.js` は list の各行を `copyFileSync(src, dst)` の src/dst として
 * **具体パスのまま**使う（glob 展開は一切しない）。一方 design-map の「生成上の制約」と
 * README・MANIFEST の慣行は集合を glob で書くため、`.claude/rules/**` のような行が list に
 * 混入した。結果は `配置失敗のため配置前状態へ復帰した（rolled-back）: output に配置対象が
 * 無い: .claude/rules/**`——自動 restore が働いて対象は無傷だったが、配置は `--confirm` を
 * 打って初めて落ちた。
 *
 * 【なぜ isManaged では止まらないか】`MANAGED_PATTERNS` の `/^\.claude\/rules\/.+/` は
 * `.claude/rules/**` の `**` を `.+` として**マッチさせてしまう**。集合内包検査（isManaged）は
 * 「集合の外に出ていないか」しか見ないので、glob 行は所属判定を素通りする。具体性は
 * 所属とは独立の性質であり、別の検査が要る。
 */
const GLOB_META_RE = /[*?[\]]/;

/** リスト行が glob メタ文字を含むか（＝集合の表記であって1ファイルを指していない）。 */
export function hasGlobMeta(rel) {
  return GLOB_META_RE.test(rel);
}

/**
 * リスト行が「具体的な1ファイル」を指しているかを検査する。V8（生成時）と
 * pre-deploy-check（P5 の配置前照合）が共有する（判定ロジックの複製禁止）。
 *
 * `genRoot` を渡した場合のみ実在照合も行う。`retired.list` は「もう generated/ に無い」
 * ことを宣言するリストなので実在照合の対象ではなく、glob 禁止だけを課す（genRoot 省略）。
 * glob 行は実在照合をスキップする——同じ1行について「glob である」と「実在しない」を
 * 二重に報告しても情報が増えないため。
 *
 * @param {string[]} entries parseListText 済みの行
 * @param {{genRoot?: string|null}} [opts]
 * @returns {{glob: string[], missing: string[]}}
 */
export function checkConcreteEntries(entries, { genRoot = null } = {}) {
  const glob = [];
  const missing = [];
  for (const rel of entries) {
    if (hasGlobMeta(rel)) {
      glob.push(rel);
      continue;
    }
    if (genRoot && !existsSync(path.join(genRoot, rel))) missing.push(rel);
  }
  return { glob, missing };
}
