import test from 'node:test';
import assert from 'node:assert/strict';
import { createTodo, listTodos, getTodo } from '../src/todos.js';

test('createTodo assigns an id and defaults done to false', () => {
  const t = createTodo('write docs');
  assert.equal(t.title, 'write docs');
  assert.equal(t.done, false);
  assert.ok(t.id);
});

test('getTodo returns null for unknown id', () => {
  assert.equal(getTodo('does-not-exist'), null);
});

test('listTodos includes created todos', () => {
  const before = listTodos().length;
  createTodo('another');
  assert.equal(listTodos().length, before + 1);
});
