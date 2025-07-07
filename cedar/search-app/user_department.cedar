// a user can view any record in their department
permit (
  principal is user,
  action == Action::"view",
  resource is record
)
when { principal.department == resource.department };