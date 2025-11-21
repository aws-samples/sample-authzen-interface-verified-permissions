// a user can view any record they own
// a user can edit any record they own
// a user can delete any record they own
permit (
  principal is user,
  action in [Action::"view", Action::"edit", Action::"delete"],
  resource is record
)
when { principal.id == resource.owner };
