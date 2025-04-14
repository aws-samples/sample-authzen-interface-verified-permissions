// https://authzen-interop.net/docs/scenarios/todo-1.1/#put-todosid
permit (
  principal,
  action == Action::"can_update_todo",
  resource
)
when
{
  (principal.roles.contains("editor") && principal.id == resource.ownerID) ||
  principal.roles.contains("evil_genius")
};