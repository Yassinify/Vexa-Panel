export const USER_LINKS_SCRIPT = `
// The per-user subscription link is /sub/user/:id (the API returns it as subUrl).
// One link works for every client - the server auto-detects sing-box/Clash/plain
// from the requesting client's User-Agent (see detectFormatFromUserAgent in
// output-formats.js), so there's no format to pick here.

// ---------------------------------------------------------------------
// LINK, QR AND MERGE PREVIEW - one combined modal (R111)
// ---------------------------------------------------------------------
// True while an openMerge() request runs, so another click on a Link button is ignored.
let openMergePending = false;

// Finds the Link button of this user's row. It is looked up on every call, because the table may have been redrawn in
// the meantime; null when the row is not on screen.
function linkButtonOf(id) {
  return document.querySelector('#view tr[data-row-id="' + id + '"] .link-btn');
}

// Shows the spinner ring in place of the word "Link" on the Link button of this user's row, or the word again
// (setButtonLoading() in client/spinner.js); a missing button is ignored.
function setLinkLoading(id, on) {
  setButtonLoading(linkButtonOf(id), on);
}

async function openMerge(id) {
  if (openMergePending) return;
  openMergePending = true;
  // The Link button shows the ring until the popup is open or the request has failed.
  setLinkLoading(id, true);
  // The popup shows what the user's output contains, so it opens only after
  // /api/merge-preview succeeds. The preview runs a full merge that fetches every
  // source, so the answer can take a while. A failed request shows a toast and opens nothing.
  let result;
  try {
    result = await apiFetch("/api/merge-preview", { method: "POST", body: JSON.stringify({ userId: id }) });
  } catch (e) {
    // A 401 already switched to the login view inside apiFetch().
    if (e.message !== "unauthorized") showToast("Could not load the link - try again");
    setLinkLoading(id, false);
    return;
  } finally {
    openMergePending = false;
  }
  if (!result || result.error) {
    setLinkLoading(id, false);
    showToast("Could not load the link - try again");
    return;
  }
  state.modal = "merge";
  state.mergeResult = result;
  render();
  // render() rebuilt the table, so this is a new button in its label state: play the ring out and the label in on it.
  playButtonSwapBack(linkButtonOf(id));
  setTimeout(() => {
    if (!window.qrcodegen) return;
    // One QR code per block the popup shows: the Normal block when the output has
    // links or no JSON, the JSON block when it has JSON configs (same rule as the markup).
    const hasJson = result.jsonCount > 0;
    const blocks = [];
    if (result.totalNodes > 0 || !hasJson) blocks.push({ boxId: "qrContainer", path: result.subUrl });
    if (hasJson) blocks.push({ boxId: "qrContainerJson", path: result.jsonUrl });
    for (const block of blocks) {
      const qrEl = document.getElementById(block.boxId);
      if (!qrEl) continue;
      const qr = qrcodegen.QrCode.encodeText(location.origin + block.path, qrcodegen.QrCode.Ecc.MEDIUM);
      qrEl.innerHTML = qr.toSvgString(4);
    }
  }, 0);
}

// Selects a link field and copies it. inputId is the field of the block whose Copy button was
// pressed ("subLinkInput" for the Normal block, "subLinkInputJson" for the JSON block).
// The Clipboard API is tried first; if it is missing or refuses,
// execCommand("copy") on the selected field is the fallback. The toast reports the real result.
async function copyLink(inputId = "subLinkInput") {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.select();
  let copied = false;
  try {
    await navigator.clipboard.writeText(input.value);
    copied = true;
  } catch (e) {
    try { copied = document.execCommand("copy"); } catch (e2) {}
  }
  showToast(copied ? "Link copied" : "Could not copy - select the link and copy it");
}

// Downloads the user's JSON configs as a .json file, from the JSON link the merge preview returned (jsonUrl).
// The server answers 404 when the user has no JSON configs.
async function downloadLink() {
  const jsonUrl = state.mergeResult && state.mergeResult.jsonUrl;
  if (!jsonUrl) return;
  try {
    const res = await fetch(jsonUrl);
    if (res.status === 404) {
      showToast("No JSON configs to download");
      return;
    }
    if (!res.ok) {
      showToast("Could not download the file");
      return;
    }
    const blobUrl = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = "vexa-config.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
    showToast("Download started");
  } catch (e) {
    showToast("Could not download the file");
  }
}
`;
