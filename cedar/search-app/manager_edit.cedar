// a manager can edit a record in their department
permit (
  principal is user,
  action == Action::"edit",
  resource is record
)
when
{ principal.role == "manager" && principal.department == resource.department };