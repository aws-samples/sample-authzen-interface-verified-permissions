// https://authzen-interop.net/docs/scenarios/todo-1.1/#get-todos
permit (
  principal,
  action == Action::"can_read_todos",
  resource
);