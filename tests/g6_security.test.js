import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkG6, checkMcpJsonText } from '../gates/g6_security.js';
import { artifactFromText } from '../gates/lib/artifact.js';

describe('G6 セキュリティ（.md artifact 側）', () => {
  test('${VAR} 展開された Bearer トークンは違反にしない（正典の良い例そのもの）', () => {
    const a = artifactFromText(
      '.claude/agents/x/x.md',
      '---\nname: x\ndescription: d\n---\n"Authorization": "Bearer ${API_KEY}"'
    );
    assert.deepEqual(checkG6(a), []);
  });

  test('リテラルの Bearer トークン直書きは違反', () => {
    const a = artifactFromText(
      '.claude/agents/x/x.md',
      '---\nname: x\ndescription: d\n---\n"Authorization": "Bearer sk-live-hardcoded"'
    );
    const v = checkG6(a);
    assert.equal(v.length, 1);
    assert.match(v[0].message, /Bearer トークンが直書き/);
  });

  test('Agent Teams 依存を開示なしで言及すると違反', () => {
    const a = artifactFromText(
      '.claude/agents/x/x.md',
      '---\nname: x\ndescription: d\n---\nCLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 を使う。'
    );
    const v = checkG6(a);
    assert.equal(v.length, 1);
    assert.match(v[0].message, /実験機能/);
  });

  test('Agent Teams 依存を「実験機能」と明示していれば違反にしない', () => {
    const a = artifactFromText(
      '.claude/agents/x/x.md',
      '---\nname: x\ndescription: d\n---\n実験機能 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 を使う。'
    );
    assert.deepEqual(checkG6(a), []);
  });

  test('クリーンな本文は違反0件', () => {
    const a = artifactFromText('.claude/agents/x/x.md', '---\nname: x\ndescription: d\n---\n何の変哲もない本文。');
    assert.deepEqual(checkG6(a), []);
  });
});

describe('G6 セキュリティ（.mcp.json 側）', () => {
  test('${VAR} 展開済みの env/headers は違反0件', () => {
    const json = JSON.stringify({
      mcpServers: {
        clean: {
          type: 'http',
          headers: { Authorization: 'Bearer ${API_KEY}' },
          env: { API_KEY: '${API_KEY}' },
        },
      },
    });
    assert.deepEqual(checkMcpJsonText(json, '.mcp.json'), []);
  });

  test('資格情報らしきキー名の env がリテラル直書きだと違反', () => {
    const json = JSON.stringify({
      mcpServers: { leaky: { env: { API_KEY: 'hardcoded-secret-value' } } },
    });
    const v = checkMcpJsonText(json, '.mcp.json');
    assert.equal(v.length, 1);
    assert.match(v[0].message, /env\.API_KEY/);
  });

  test('資格情報に見えないキー名（CACHE_DIR 等）は違反にしない', () => {
    const json = JSON.stringify({
      mcpServers: { ok: { env: { CACHE_DIR: '/tmp' } } },
    });
    assert.deepEqual(checkMcpJsonText(json, '.mcp.json'), []);
  });

  test('Authorization ヘッダのリテラル直書きは違反', () => {
    const json = JSON.stringify({
      mcpServers: { leaky: { headers: { Authorization: 'Bearer literal-token' } } },
    });
    const v = checkMcpJsonText(json, '.mcp.json');
    assert.equal(v.length, 1);
    assert.match(v[0].message, /headers\.Authorization/);
  });

  test('不正な JSON は解析失敗として違反を返す（黙って空を返さない）', () => {
    const v = checkMcpJsonText('{ not valid json', '.mcp.json');
    assert.equal(v.length, 1);
    assert.match(v[0].message, /JSON として解析できない/);
  });
});
