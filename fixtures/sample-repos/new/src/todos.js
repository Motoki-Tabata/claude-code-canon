// In-memory todo store. Deliberately simple — this is a fixture, not a real app.
let nextId = 1;
const todos = new Map();

export function createTodo(title) {
  const todo = { id: String(nextId++), title, done: false };
  todos.set(todo.id, todo);
  return todo;
}

export function listTodos() {
  return [...todos.values()];
}

export function getTodo(id) {
  return todos.get(id) ?? null;
}
