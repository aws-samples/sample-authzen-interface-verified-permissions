// https://authzen-interop.net/docs/scenarios/todo-1.1/#get-usersuserid
permit (
  principal,
  action == Action::"can_read_user",
  resource
);