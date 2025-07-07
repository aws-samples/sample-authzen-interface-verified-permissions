// a user can view a record they own
// any user can edit a record they own
// a user can delete a record they own
permit (
  principal is user,
  action in [Action::"view", Action::"edit", Action::"delete"],
  resource is record
)
when { principal.id == resource.owner };