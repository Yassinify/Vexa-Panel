export const USER_LINKS_SCRIPT = `
// The per-user subscription link is /sub/user/:id (the API returns it as subUrl).
// One link works for every client — the server auto-detects sing-box/Clash/plain
// from the requesting client's User-Agent (see detectFormatFromUserAgent in
// output-formats.js), so there's no format to pick here.

// ---------------------------------------------------------------------
// LINK, QR AND MERGE PREVIEW — one combined modal (R111)
// ---------------------------------------------------------------------
function openMerge(id) {
  // The popup only needs the link, which is built from the user id, so it opens
  // at once. No request is made: /api/merge-preview runs a full merge that
  // fetches every source, and nothing from that result is shown here.
  const subUrl = "/sub/user/" + id;
  state.modal = "merge";
  state.mergeResult = { subUrl };
  render();
  setTimeout(() => {
    const qrEl = document.getElementById("qrContainer");
    if (qrEl && window.qrcodegen) {
      const qr = qrcodegen.QrCode.encodeText(location.origin + subUrl, qrcodegen.QrCode.Ecc.MEDIUM);
      qrEl.innerHTML = qr.toSvgString(4);
    }
  }, 0);
}

// Selects the link field and copies it. The Clipboard API is tried first; if it is missing or refuses,
// execCommand("copy") on the selected field is the fallback. The toast reports the real result.
async function copyLink() {
  const input = document.getElementById("subLinkInput");
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

// Downloads the user's JSON configs (the ?format=json content of the public link) as a .json file.
// The server answers 404 when the user has no JSON configs.
async function downloadLink() {
  const subUrl = state.mergeResult && state.mergeResult.subUrl;
  if (!subUrl) return;
  try {
    const res = await fetch(subUrl + "?format=json");
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
