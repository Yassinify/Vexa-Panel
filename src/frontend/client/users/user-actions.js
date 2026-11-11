export const USER_ACTIONS_SCRIPT = `
// Opens the delete popup (modals.js); the delete itself runs from the popup's Delete button.
function askDeleteUser(id) {
  state.modal = "confirmDelete";
  state.confirmDelete = { kind: "user", id };
  render();
}

// Waits for the server with the popup open; the popup closes only on success,
// and a failure shows its message in the popup's error line (R117).
async function performDeleteUser(id) {
  try {
    const result = await apiFetch("/api/users/" + id, { method: "DELETE" });
    if (result.error) throw new Error(result.error);
    state.users = state.users.filter(u => u.id !== id);
    closeModal();
    showToast("User deleted");
  } catch (e) {
    showDeleteError(e.message);
  }
}

// Enable / Disable from the row menu. toggleRow() (helpers.js) spins a border around the row while the
// server answers (nothing is optimistic) and then redraws only that row from renderUserRow(), so
// the page keeps its scroll position. A failed request shows its message as a toast and leaves the row.
async function toggleUserEnabled(id) {
  const user = state.users.find(u => u.id === id);
  if (!user) return;
  const nextEnabled = !user.enabled;
  await toggleRow(id, nextEnabled, async () => {
    const result = await apiFetch("/api/users/" + id, { method: "PUT", body: JSON.stringify({ enabled: nextEnabled }) });
    if (result.error) throw new Error(result.error);
    const idx = state.users.findIndex(u => u.id === id);
    if (idx !== -1) state.users[idx] = { ...state.users[idx], enabled: result.user.enabled, editedAt: result.user.editedAt };
  }, () => {
    const updated = state.users.find(u => u.id === id);
    return updated ? renderUserRow(updated) : "";
  });
}
`;
