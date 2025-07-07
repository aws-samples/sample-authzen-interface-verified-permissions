// a manager can view a record
permit (
  principal is user,
  action == Action::"view",
  resource is record
)
when { principal.role == "manager" };