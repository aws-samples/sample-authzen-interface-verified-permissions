// https://authzen-interop.net/docs/scenarios/todo-1.1/#post-todos
permit (
  principal,
  action == Action::"can_create_todo",
  resource
)
when { principal.roles.containsAny(["admin", "editor"]) };