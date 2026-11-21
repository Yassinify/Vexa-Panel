export const MODALS_SCRIPT = `
// ---------------------------------------------------------------------
// MODALS
// ---------------------------------------------------------------------
function closeModal() {
  state.modal = null;
  state.mergeResult = null;
  state.editingUser = null;
  state.editingUserSources = null;
  state.editingUserSourcesAdded = null;
  state.editingUserNodeIds = null;
  state.editingUserName = "";
  state.editingUserUuidRandom = true;
  state.editingNode = null;
  state.editingNodeSource = "";
  state.confirmDelete = null;
  state.confirmUuid = null;
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
    const sourceCount = state.editingUserSources.length;
    return \`
      <div class="card modal-card editor-card" role="dialog" aria-modal="true" aria-label="\${isEdit ? "Edit user" : "Add user"}">
        <div class="modal-title">\${isEdit ? "Edit user" : "Add user"}</div>
        <div class="field-group">
          <label><span class="field-label">Name</span><input id="userNameInput" placeholder="User name" value="\${escapeHtml(state.editingUserName)}" oninput="updateUserName(this.value)" /></label>
        </div>
        <div class="field-group">
          <div class="field-head">
            <span class="field-label" id="uuidLabel">UUID</span>
            <button type="button" class="btn-secondary btn-sm" \${isEdit && state.editingUserUuidRandom ? "" : "disabled"} onclick="askRegenerateUuid()">\${icon("arrowPath")}Regenerate</button>
          </div>
          <input id="userUuidInput" readonly aria-labelledby="uuidLabel" placeholder="\${state.editingUserUuidRandom ? "Generated when you save" : "Set from the name when you save"}" value="\${isEdit ? escapeHtml(u.id) : ""}" />
          <div class="switch-row">
            <span class="switch-label" id="uuidSwitchLabel">Use the username as UUID</span>
            <button type="button" class="switch" role="switch" aria-checked="\${state.editingUserUuidRandom ? "false" : "true"}" aria-labelledby="uuidSwitchLabel" onclick="toggleUuidMode()"><span class="switch-knob"></span></button>
          </div>
          <div class="field-hint">\${state.editingUserUuidRandom ? "A random id in the link. Regenerate it to replace the link." : "The id in the link is the name, with spaces turned into _. Letters, digits, - and _ only."}</div>
        </div>
        \${renderNodePicker()}
        <div class="field-group">
          <div class="field-head">
            <span class="field-label">Sources</span>
            <span class="field-count">\${sourceCount} \${sourceCount === 1 ? "source" : "sources"}</span>
            <button type="button" class="btn-secondary btn-sm" onclick="addSourceRow()">\${icon("plus")}Add source</button>
          </div>
          <div class="source-repeater">
            \${state.editingUserSources.map((val, i) => {
              // An added source is a preview with Edit and Delete; an unadded one is an input with Add only.
              if (state.editingUserSourcesAdded[i]) {
                const preview = sourcePreview(val);
                return \`
              <div class="source-row source-row-added">
                <div class="source-preview"><span class="source-type">\${escapeHtml(preview.type)}</span><span class="source-preview-text">\${escapeHtml(preview.text)}</span></div>
                <button type="button" class="icon-btn" data-tip="Edit source" aria-label="Edit source \${i + 1}" onclick="editSourceRow(\${i})">\${icon("pencilSquare")}</button>
                <button type="button" class="icon-btn" data-tip="Delete source" aria-label="Delete source \${i + 1}" onclick="removeSourceRow(\${i})">\${icon("trash")}</button>
              </div>
            \`;
              }
              return \`
              <div class="source-row">
                <textarea id="sourceInput\${i}" class="source-row-input" rows="2" placeholder="Paste a source here" aria-label="Source \${i + 1}" oninput="updateSourceRow(\${i}, this.value)">\${escapeHtml(val)}</textarea>
                <button type="button" class="btn-secondary btn-sm" aria-label="Add source \${i + 1}" onclick="confirmSourceRow(\${i})">\${icon("plus")}Add</button>
              </div>
            \`;
            }).join("")}
          </div>
          <div class="field-hint">A link, a subscription URL, JSON or Clash YAML. One source per box.</div>
        </div>
        <div class="error-text" id="userEditorError" role="alert"></div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn-primary" onclick="saveUser()">Save</button>
        </div>
      </div>
    \`;
  }

  // The UUID confirm popup: opened from the User editor's UUID section, because the change takes effect at
  // once and the old link stops working. Cancel (and Escape, init.js) return to the editor; its data is still in state.
  if (state.modal === "confirmUuid") {
    const c = state.confirmUuid;
    if (!c) return "";
    const isRegenerate = c.kind === "regenerate";
    const toUsername = !isRegenerate && !c.uuidRandom;
    const title = isRegenerate ? "Regenerate the UUID?" : toUsername ? "Use the username as UUID?" : "Switch to a random UUID?";
    const text = toUsername
      ? "The link changes to the username at once. The old link stops working."
      : "The user gets a new random link at once. The old link stops working.";
    return \`
      <div class="card modal-card" role="dialog" aria-modal="true" aria-label="\${title}">
        <div class="modal-title">\${title}</div>
        <div class="helper-text">\${text}</div>
        <div class="error-text" id="uuidConfirmError" role="alert"></div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="cancelUuidConfirm()">Cancel</button>
          <button class="btn-primary" onclick="performUuidChange()">\${isRegenerate ? icon("arrowPath") : ""}\${isRegenerate ? "Regenerate" : "Switch"}</button>
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
          <label><span class="field-label">Source</span><textarea id="nodeSourceInput" rows="3" placeholder="Paste a source here">\${escapeHtml(state.editingNodeSource)}</textarea></label>
          <div class="field-hint">A link, a subscription URL, JSON or Clash YAML. A node holds one source.</div>
        </div>
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
    // them when both show. It has no lead, counts or
    // Close button; a click outside the card or Escape closes it (init.js), and
    // .modal-card-static (styles/modals.js) turns off scrolling.
    const header = \`
      <h2 style="font-size:var(--text-h3);margin-bottom:var(--space-lg);">Subscription</h2>
    \`;
    const fullUrl = location.origin + r.subUrl;
    const hasJson = r.jsonCount > 0;
    // Both blocks show: each gets a title of the same height (.sub-block-title) so the QR codes line up.
    const bothBlocks = r.totalNodes > 0 && hasJson;
    const normalBlock = (r.totalNodes > 0 || !hasJson) ? \`
        <div class="sub-block">
          \${bothBlocks ? '<h3 class="sub-block-title">Normal</h3>' : ""}
          <div class="qr-box" id="qrContainer"></div>
          <small style="color:var(--color-muted);">Scan the QR code or copy the link below</small>
          <div class="link-row">
            <input id="subLinkInput" readonly value="\${fullUrl}" />
            <button class="btn-secondary" onclick="copyLink('subLinkInput')">Copy</button>
          </div>
        </div>
    \` : "";
    const jsonBlock = hasJson ? \`
        <div class="sub-block">
          <h3 class="sub-block-title">JSON</h3>
          <div class="qr-box" id="qrContainerJson"></div>
          <small style="color:var(--color-muted);">Scan the QR code or copy the link below</small>
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
