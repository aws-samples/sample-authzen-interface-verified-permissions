permit (
  principal,
  action == Action::"PUT",
  resource == route::"/todos/{todoId}"
)
when { principal.roles.containsAny(["editor", "evil_genius"]) };