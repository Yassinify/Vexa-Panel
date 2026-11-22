export const NODE_PICKER_SCRIPT = `
// ---------------------------------------------------------------------
// NODE PICKER - used inside the userEditor modal. A label row (the title) and a two-column grid of cards, one card per
// enabled Node: a letter badge, the name, the source type and a check in the corner. A click turns the Node on or off for
// the User (aria-pressed); the check shows only on a selected card, so the state is never shown by color alone.
// state.editingUserNodeIds only ever holds ids of Nodes that are currently enabled and still exist (filtered on load in
// openUserEditor/openUser), so a disabled Node never needs to be drawn or removed here.
// The title of the picker is "Nodes Selection". The Node editor has the same kind of picker the other way round, the
// User Selection (renderUserPicker() below): one card per enabled User, with the same card look.
// ---------------------------------------------------------------------
// The check mark inside the card's round check. Its stroke uses currentColor; styles/modals.js sets the color and shows
// it only on a selected card.
const NODE_CARD_TICK = '<svg class="node-card-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>';

function renderNodePicker() {
  // With no Nodes at all (the list is loaded) the picker is an empty container: no label and no text.
  // The container stays so recheckEditorNodes() can still redraw it in place.
  if (state.nodesLoaded && state.nodes.length === 0) return '<div class="field-group" id="nodePicker"></div>';
  const cards = state.nodes
    .filter(n => n.enabled !== false)
    .map(n => {
      const name = escapeHtml(n.name);
      // The badge is the first letter of the name, upper case; escaped like every other piece of user text.
      const letter = escapeHtml(String(n.name || "?").trim().charAt(0).toUpperCase() || "?");
      const selected = state.editingUserNodeIds.includes(n.id);
      return \`<button type="button" class="node-card" aria-pressed="\${selected}" title="\${name}" onclick="toggleNodeForUser('\${n.id}', this)"><span class="node-card-badge">\${letter}</span><span class="node-card-text"><span class="node-card-name">\${name}</span><span class="node-card-type">\${escapeHtml(nodeTypeLabel(n.source && n.source.type))}</span></span><span class="node-card-check">\${NODE_CARD_TICK}</span></button>\`;
    }).join("");
  return \`
    <div class="field-group" id="nodePicker">
      <div class="field-head"><span class="field-label">Nodes Selection</span>\${infoTip("Choose the nodes this user receives. Only enabled nodes are listed, and every selected node is added to the user's subscription.", "below")}</div>
      \${cards ? \`<div class="node-cards">\${cards}</div>\` : ""}
    </div>
  \`;
}

// Adds or removes the Node for the open User editor. Only state.editingUserNodeIds changes, so Save still sends it as
// before. The card is changed in place instead of calling render(), so the check can fade in and the typed name, the
// sources and the scroll position of the editor stay. The render() comparison string is kept in step with the markup
// (as recheckEditorNodes() does), so a later render() does not rewrite the popup for nothing. Without the button
// (not expected) the popup is redrawn.
function toggleNodeForUser(nodeId, button) {
  const i = state.editingUserNodeIds.indexOf(nodeId);
  if (i === -1) state.editingUserNodeIds.push(nodeId);
  else state.editingUserNodeIds.splice(i, 1);
  if (!button) { render(); return; }
  button.setAttribute("aria-pressed", String(i === -1));
  document.getElementById("md")._html = renderModal();
}

// The Node editor's User Selection: a title and a grid of the same cards as the Node picker, one per enabled User (a
// letter badge, the name, how many active nodes the User has, and the check). A click turns the Node on or off for that User
// (aria-pressed); the number is its count of active (enabled) Nodes, see renderUserPicker() below. The section is drawn only when state.editingNodeUsers is a list with at least one User: it is null
// while the Users could not be loaded and for a disabled Node (the editor then sends no userIds, so no link changes),
// and with no enabled User there is nothing to choose. The id #userPicker is always absent in those cases.
function renderUserPicker() {
  const users = state.editingNodeUsers;
  if (!Array.isArray(users) || users.length === 0) return "";
  const cards = users.map(u => {
    const name = escapeHtml(u.name);
    const letter = escapeHtml(String(u.name || "?").trim().charAt(0).toUpperCase() || "?");
    const selected = state.editingNodeUserIds.includes(u.id);
    // Active sources the User has through Nodes: its other enabled Nodes (loaded from the database as othersCount) plus
    // this Node when the card is selected, so the number follows the clicks.
    const count = (u.othersCount || 0) + (selected ? 1 : 0);
    return \`<button type="button" class="node-card" aria-pressed="\${selected}" title="\${name}" onclick="toggleUserForNode('\${escapeHtml(u.id)}', this)"><span class="node-card-badge">\${letter}</span><span class="node-card-text"><span class="node-card-name">\${name}</span><span class="node-card-type">\${count} \${count === 1 ? "node" : "nodes"}</span></span><span class="node-card-check">\${NODE_CARD_TICK}</span></button>\`;
  }).join("");
  return \`
    <div class="field-group" id="userPicker">
      <div class="field-head"><span class="field-label">User Selection</span>\${infoTip("Choose the users who receive this node. Only enabled users are listed. The number on a card is how many active nodes that user has, including this one when it is selected.", "below")}</div>
      <div class="node-cards">\${cards}</div>
    </div>
  \`;
}

// Adds or removes the User for the open Node editor. Only state.editingNodeUserIds changes (Save sends it), and the
// card is changed in place, as toggleNodeForUser() does, so the typed name and source stay. The node count on the card
// is rewritten too: it is the User's other enabled Nodes plus this one while the card is selected.
function toggleUserForNode(userId, button) {
  const i = state.editingNodeUserIds.indexOf(userId);
  if (i === -1) state.editingNodeUserIds.push(userId);
  else state.editingNodeUserIds.splice(i, 1);
  if (!button) { render(); return; }
  button.setAttribute("aria-pressed", String(i === -1));
  const user = (state.editingNodeUsers || []).find(u => u.id === userId);
  const label = button.querySelector(".node-card-type");
  if (user && label) {
    const count = (user.othersCount || 0) + (i === -1 ? 1 : 0);
    label.textContent = count + (count === 1 ? " node" : " nodes");
  }
  document.getElementById("md")._html = renderModal();
}
`;
