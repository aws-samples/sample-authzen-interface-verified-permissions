// https://authzen-interop.net/docs/scenarios/todo-1.1/#delete-todosid
permit (
  principal,
  action == Action::"can_delete_todo",
  resource
)
when
{
  (principal.roles.contains("editor") && principal.id == resource.ownerID) ||
  principal.roles.contains("admin")
};