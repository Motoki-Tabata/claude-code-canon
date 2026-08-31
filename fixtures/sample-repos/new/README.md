# todo-api

A small REST API for managing todos, built with Express.

This is a **fixture target project** for claude-canon's acceptance scenario (1):
a greenfield project with **no existing `.claude/` customization**. Running `/canon`
against this directory should produce a from-scratch customization set.

## Endpoints

- `GET /todos` — list all todos
- `GET /todos/:id` — fetch one todo
- `POST /todos` — create a todo (`{ "title": "..." }`)

## Development

```
npm install
npm test      # node --test
npm run lint  # eslint src
npm start     # node src/server.js
```

## Conventions

- ES modules (`"type": "module"`)
- Tests colocated under `tests/`, run with the built-in Node test runner
- Lint with ESLint (flat config)
