import express from 'express';
import { createTodo, listTodos, getTodo } from './todos.js';

const app = express();
app.use(express.json());

app.get('/todos', (req, res) => {
  res.json(listTodos());
});

app.get('/todos/:id', (req, res) => {
  const todo = getTodo(req.params.id);
  if (!todo) return res.status(404).json({ error: 'not found' });
  res.json(todo);
});

app.post('/todos', (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  res.status(201).json(createTodo(title));
});

const port = process.env.PORT ?? 3000;
app.listen(port, () => console.log(`todo-api listening on ${port}`));
