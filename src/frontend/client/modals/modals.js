export const MODALS_SCRIPT = `
// ---------------------------------------------------------------------
// MODALS
// ---------------------------------------------------------------------
// Grows a textarea to fit its text, so a long source shows in full and the box never scrolls. The height is reset to
// auto first (the rows height, which is also the smallest the box can be) and then set to the content height. The box
// uses border-box sizing, so the border is added to scrollHeight. A box that is not on screen measures 0, so it is
// left alone; render() (client/app/root-render.js) sizes the boxes once the popup is shown.
function autoGrow(el) {
  if (!el) return;
  el.style.height = "auto";
  if (!el.offsetHeight) { el.style.height = ""; return; }
  el.style.height = el.scrollHeight + (el.offsetHeight - el.clientHeight) + "px";
}

// Sizes every textarea of the popup layer; also on a window resize, because the text wraps differently at a new width.
function autoGrowAll() {
  document.querySelectorAll("#md textarea").forEach(autoGrow);
}
window.addEventListener("resize", autoGrowAll);
function closeModal() {
  state.modal = null;
  state.mergeResult = null;
  state.editingUser = null;
  state.editingUserSources = null;
  state.editingUserSourcesAdded = null;
  state.editingUserSourcesBackup = null;
  state.editingUserNodeIds = null;
  state.editingUserName = "";
  state.editingUserUuidRandom = true;
  state.editingUserUuid = "";
  state.editingUserSubscriptionTitle = "";
  state.editingNode = null;
  state.editingNodeSource = "";
  state.editingNodeUsers = null;
  state.editingNodeUserIds = null;
  state.confirmDelete = null;
  state.changePwValues = null;
  render();
}

// Writes into the delete popup's error line; the popup stays open.
function showDeleteError(msg) {
  const el = document.getElementById("deleteError");
  if (el) el.textContent = msg;
}

// Each modal is a dialog card inside #md. Only Cancel/Close and Escape close it.
function renderModal() {
  if (state.modal === "userEditor") {
    const u = state.editingUser;
    const isEdit = u && u.id;
    // Added sources fill a dense table (type, source, Edit and Delete). Sources not added yet (the empty input and any
    // source being edited) stay below it as composer rows. Both keep their index into state.editingUserSources.
    // The type comes from sourcePreview() and goes into data-type (link, subscription, json, yaml or source).
    const addedRows = [];
    const composerRows = [];
    // While an editor box is open (openSourceEditIndex() in user-editor.js) every other source and the new-source
    // input is dimmed and inert, so the focus stays on the source being edited.
    const editing = openSourceEditIndex();
    state.editingUserSources.forEach((val, i) => {
      const dimmed = editing !== -1 && i !== editing;
      const dimCls = dimmed ? " source-dim" : "";
      const dimAttr = dimmed ? " inert" : "";
      if (state.editingUserSourcesAdded[i]) {
        const preview = sourcePreview(val);
        addedRows.push(\`
          <div class="source-table-row\${dimCls}" data-type="\${preview.type.toLowerCase()}"\${dimAttr}>
            <span class="source-table-type"><i class="source-table-dot"></i>\${escapeHtml(preview.type)}</span>
            <span class="source-table-text" title="\${escapeHtml(preview.text)}">\${escapeHtml(preview.text)}</span>
            <span class="source-table-actions">
              <button type="button" class="icon-btn" data-tip="Edit source" aria-label="Edit source \${i + 1}" onclick="editSourceRow(\${i})">\${icon("pencil")}</button>
              <button type="button" class="icon-btn" data-tip="Delete source" aria-label="Delete source \${i + 1}" onclick="removeSourceRow(\${i})">\${icon("trash")}</button>
            </span>
          </div>
        \`);
        // The editor box of the source being edited sits right under its row: the textarea, then Cancel (left) and
        // Save (right) at the same size. The three nested divs let it open by height without clipping its shadow.
        if (i === editing) {
          addedRows.push(\`
            <div class="source-edit" role="group" aria-label="Edit source \${i + 1}">
              <div class="source-edit-inner">
                <div class="source-edit-box">
                  <textarea id="sourceInput\${i}" class="source-row-input" rows="1" placeholder="Paste a source here" aria-label="Source \${i + 1}" oninput="updateSourceRow(\${i}, this.value); autoGrow(this)">\${escapeHtml(val)}</textarea>
                  <div class="source-edit-actions">
                    <button type="button" class="btn-secondary btn-sm" onclick="cancelSourceRow(\${i})">Cancel</button>
                    <button type="button" class="btn-primary btn-sm" onclick="confirmSourceRow(\${i})">Save</button>
                  </div>
                </div>
              </div>
            </div>
          \`);
        }
      } else {
        composerRows.push(\`
          <div class="source-row\${dimCls}"\${dimAttr}>
            <textarea id="sourceInput\${i}" class="source-row-input" rows="1" placeholder="Paste a source here" aria-label="Source \${i + 1}" oninput="updateSourceRow(\${i}, this.value); autoGrow(this)">\${escapeHtml(val)}</textarea>
            <button type="button" class="btn-secondary btn-sm" aria-label="Save source \${i + 1}" onclick="confirmSourceRow(\${i})">Save</button>
          </div>
        \`);
      }
    });
    // Count the added sources, not addedRows: while a box is open that array also holds the editor box.
    const addedCount = state.editingUserSourcesAdded.filter(Boolean).length;
    const headClass = editing !== -1 ? "source-table-head source-dim" : "source-table-head";
    const headInert = editing !== -1 ? " inert" : "";
    const sourceTable = addedCount ? \`<div class="source-table"><div class="\${headClass}"\${headInert}><span>Type</span><span>Source</span><span></span></div>\${addedRows.join("")}</div>\` : "";
    return \`
      <div class="card modal-card editor-card" role="dialog" aria-modal="true" aria-label="\${isEdit ? "Edit user" : "Add user"}">
        <div class="modal-title">\${isEdit ? "Edit user" : "Add user"}</div>
        <div class="field-group">
          <label><span class="field-label">Name</span><input id="userNameInput" placeholder="User name" value="\${escapeHtml(state.editingUserName)}" oninput="updateUserName(this.value)" /></label>
        </div>
        <div class="field-group">
          <div class="field-head">
            <span class="field-label" id="uuidLabel">UUID</span>
            \${infoTip(state.editingUserUuidRandom ? "A random id in the link. Turn the switch on to use the username as the UUID instead. Regenerate replaces the link." : "The id in the link is the username, with spaces turned into _. Letters, digits, - and _ only. Turn the switch off to use a random UUID.", "below")}
            <button type="button" class="btn-secondary btn-sm" \${state.editingUserUuidRandom ? "" : "disabled"} onclick="regenerateUuid()">\${icon("arrowPath")}Regenerate</button>
            <button type="button" class="switch" role="switch" aria-checked="\${state.editingUserUuidRandom ? "false" : "true"}" aria-label="Use the username as UUID" onclick="toggleUuidMode()"><span class="switch-knob"></span></button>
          </div>
          <input id="userUuidInput" disabled aria-labelledby="uuidLabel" placeholder="\${state.editingUserUuidRandom ? "Generated when you save" : "Set from the name when you save"}" value="\${escapeHtml(uuidFieldValue())}" />
        </div>
        <div class="field-group">
          <div class="field-head">
            <label class="field-label" for="userSubTitleInput">Subscription Title</label>
            \${infoTip("The default title is Vexa - {username}. You can enter your own title, and {username} is replaced with the name of the user. Leave it empty to use the default.", "below")}
          </div>
          <input id="userSubTitleInput" placeholder="Vexa - {username}" value="\${escapeHtml(state.editingUserSubscriptionTitle)}" oninput="updateSubscriptionTitle(this.value)" />
        </div>
        \${renderNodePicker()}
        <div class="field-group">
          <div class="field-head">
            <span class="field-label">Sources</span>
            \${infoTip("A link, a subscription URL, JSON or Clash YAML. One source per box.", "below")}
          </div>
          <div class="source-repeater">
            \${sourceTable}
            \${composerRows.join("")}
          </div>
        </div>
        <div class="error-text" id="userEditorError" role="alert"></div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn-primary" onclick="saveUser()">Save</button>
        </div>
      </div>
    \`;
  }

  if (state.modal === "nodeEditor") {
    const n = state.editingNode;
    const isEdit = n && n.id;
    return \`
      <div class="card modal-card editor-card" role="dialog" aria-modal="true" aria-label="\${isEdit ? "Edit node" : "Add node"}">
        <div class="modal-title">\${isEdit ? "Edit node" : "Add node"}</div>
        <div class="field-group">
          <label><span class="field-label">Name</span><input id="nodeNameInput" placeholder="Node name" value="\${isEdit ? escapeHtml(n.name) : ""}" /></label>
        </div>
        <div class="field-group">
          <div class="field-head"><label class="field-label" for="nodeSourceInput">Source</label>\${infoTip("A link, a subscription URL, JSON or Clash YAML. A node holds one source.", "below")}</div>
          <textarea id="nodeSourceInput" rows="3" placeholder="Paste a source here" oninput="autoGrow(this)">\${escapeHtml(state.editingNodeSource)}</textarea>
        </div>
        \${renderUserPicker()}
        <div class="error-text" id="nodeEditorError" role="alert"></div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn-primary" id="nodeSaveBtn" onclick="saveNode()">Save</button>
        </div>
      </div>
    \`;
  }

  if (state.modal === "merge") {
    const r = state.mergeResult;
    // The link and QR modal: a title and the blocks that apply. The Normal block (QR, hint,
    // link field, Copy) shows when the output has links or no JSON; the JSON block (JSON heading,
    // QR, hint, link field, Copy, Download) shows when it has JSON configs; a plus icon sits between
    // them when both show. In the Normal block the link field spans the whole row and the full-width Copy button sits
    // below it, level with the JSON block's Download button (both rows are 42px + 14px margin, buttons 40px). It has no lead, counts or
    // Close button; a click outside the card or Escape closes it (init.js), and
    // .modal-card-static (styles/modals.js) turns off scrolling.
    const header = \`
      <h2 style="font-size:var(--text-h3);margin-bottom:var(--space-lg);">Subscription \${infoTip("Scan the QR code or copy the link below", "below end")}</h2>
    \`;
    const fullUrl = location.origin + r.subUrl;
    const hasJson = r.jsonCount > 0;
    // Both blocks show: each gets a title of the same height (.sub-block-title) so the QR codes line up.
    const bothBlocks = r.totalNodes > 0 && hasJson;
    const normalBlock = (r.totalNodes > 0 || !hasJson) ? \`
        <div class="sub-block">
          \${bothBlocks ? '<h3 class="sub-block-title">Normal</h3>' : ""}
          <div class="qr-box" id="qrContainer"></div>
          <div class="link-row">
            <input id="subLinkInput" readonly value="\${fullUrl}" />
          </div>
          <button class="btn-secondary btn-full" onclick="copyLink('subLinkInput')">Copy</button>
        </div>
    \` : "";
    const jsonBlock = hasJson ? \`
        <div class="sub-block">
          <h3 class="sub-block-title">JSON</h3>
          <div class="qr-box" id="qrContainerJson"></div>
          <div class="link-row">
            <input id="subLinkInputJson" readonly value="\${location.origin + r.jsonUrl}" />
            <button class="btn-secondary" onclick="copyLink('subLinkInputJson')">Copy</button>
          </div>
          <button class="btn-primary btn-full" onclick="downloadLink()">Download</button>
        </div>
    \` : "";
    const plusIcon = (normalBlock && jsonBlock) ? \`<div class="sub-plus" aria-hidden="true">\${icon("plus")}</div>\` : "";
    return \`
      <div class="card modal-card modal-card-static" role="dialog" aria-modal="true" aria-label="Subscription" style="text-align:center;">
        \${header}
        <div class="sub-blocks">\${normalBlock}\${plusIcon}\${jsonBlock}</div>
      </div>
    \`;
  }

  if (state.modal === "confirmDelete") {
    const d = state.confirmDelete;
    const what = d.kind === "user" ? "user" : "node";
    const performFn = d.kind === "user" ? "performDeleteUser" : "performDeleteNode";
    return \`
      <div class="card modal-card" role="dialog" aria-modal="true" aria-label="Delete this \${what}?">
        <div class="modal-title">Delete this \${what}?</div>
        <div class="helper-text">This can't be undone.</div>
        <div class="error-text" id="deleteError" role="alert"></div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn-primary" onclick="\${performFn}('\${d.id}')">\${icon("trash")}Delete</button>
        </div>
      </div>
    \`;
  }

  if (state.modal === "changePassword") {
    const values = state.changePwValues;
    // Secrets-backed install: the Worker cannot write its own Secret, so the new
    // value is shown here for the admin to paste into Cloudflare.
    if (values) {
      return \`
        <div class="card modal-card login-card" role="dialog" aria-modal="true" aria-label="Change password">
          <div class="login-logo">\${logoMark()}Vexa Panel</div>
          <h1>Copy the new value</h1>
          <div class="brand-sub">
            Copy this value now. The plaintext password is not stored anywhere and cannot be
            recovered after you close this popup. ADMIN_SALT and JWT_SECRET are unchanged, so
            existing sessions stay valid.
          </div>
          <div class="field-group">
            <label><span class="field-label">ADMIN_PASSWORD_HASH</span><input id="changePwValue" readonly value="\${escapeHtml(values.ADMIN_PASSWORD_HASH)}" onclick="this.select()" /></label>
          </div>
          <div class="helper-text" style="margin-bottom:var(--space-lg);">
            In <strong>Cloudflare Dashboard → Workers → Settings → Variables and Secrets</strong>,
            update <strong>ADMIN_PASSWORD_HASH</strong> with this value. Set its type to
            <strong>Secret</strong> (not the default Text), then save and redeploy.
          </div>
          <button class="btn-primary btn-full" onclick="finishChangePassword()">Done</button>
          <button class="btn-secondary btn-full" onclick="copyChangePwValue()">Copy value</button>
        </div>
      \`;
    }
    return \`
      <div class="card modal-card login-card" role="dialog" aria-modal="true" aria-label="Change password">
        <div class="login-logo">\${logoMark()}Vexa Panel</div>
        <h1>Change password</h1>
        <div class="brand-sub">You will be signed out and must sign in again with the new password.</div>
        <div class="field-group">
          <label><span class="field-label">New admin password</span><input type="password" id="newPwInput" autocomplete="new-password" onkeydown="if (event.key === 'Enter') submitChangePassword()" /></label>
        </div>
        <div class="field-group">
          <label><span class="field-label">Confirm password</span><input type="password" id="confirmPwInput" autocomplete="new-password" onkeydown="if (event.key === 'Enter') submitChangePassword()" /></label>
        </div>
        <div class="error-text" id="changePwError" role="alert"></div>
        <button class="btn-primary btn-full" id="changePwBtn" onclick="submitChangePassword()">Change password</button>
        <button class="btn-secondary btn-full" onclick="closeModal()">Cancel</button>
      </div>
    \`;
  }

  return "";
}
`;
