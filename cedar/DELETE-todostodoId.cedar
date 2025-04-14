permit (
  principal,
  action == Action::"DELETE",
  resource == route::"/todos/{todoId}"
)
when { principal.roles.containsAny(["admin", "editor"]) };