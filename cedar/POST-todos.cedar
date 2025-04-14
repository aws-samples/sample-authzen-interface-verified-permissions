permit (
  principal,
  action == Action::"POST",
  resource == route::"/todos"
)
when { principal.roles.containsAny(["editor", "evil_genius"]) };