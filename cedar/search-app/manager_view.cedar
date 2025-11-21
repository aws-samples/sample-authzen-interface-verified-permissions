// a manager can view any record
permit (
  principal is user,
  action == Action::"view",
  resource is record
)
when { principal.role == "manager" };
