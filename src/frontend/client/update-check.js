// The Version file in the repository root holds the latest released version ("x.y.z", one line).
const VERSION_FILE_URL = "https://raw.githubusercontent.com/Yassinify/Vexa-Panel/main/Version";

export const UPDATE_CHECK_SCRIPT = `
// ---------------------------------------------------------------------
// UPDATE NOTICE
// ---------------------------------------------------------------------
// While someone is signed in, the browser compares the version of the running Worker (GET /api/version) with the
// Version file on GitHub. When the file is higher, the version label shows an orange "Update" notice that links to
// the latest release page. updateAvailable is the one state: versionLink() (client/shell.js) reads it when it draws the
// label, and setUpdateNotice() redraws the labels that are already on the page.
const UPDATE_VERSION_URL = "${VERSION_FILE_URL}";
const UPDATE_WORD = "Update";
const UPDATE_CHECK_EVERY_MS = 3600000;
const UPDATE_FETCH_TIMEOUT_MS = 10000;
// The word is typed once when the notice appears and then once per minute; between runs it stays fully visible.
const UPDATE_TYPE_EVERY_MS = 60000;
// The notice box has a fixed size, so a word that does not fit gets a smaller font, from the max down to the min.
const UPDATE_FONT_MAX = 10;
const UPDATE_FONT_MIN = 7;

let updateAvailable = false;
let updateCheckTimer = null;
let updateCheckRunning = false;
let updateTypingTimer = null;
// Each typing run has a number, so a newer run (or the notice going away) stops the older one.
let updateTypingRun = 0;

// [major, minor, patch] of an "x.y.z" text, or null when the text has any other shape.
function parseVersion(text) {
  const match = /^(\\d+)\\.(\\d+)\\.(\\d+)$/.exec(String(text == null ? "" : text).trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

// 1 when a is higher than b, -1 when lower, 0 when equal; compared number by number.
function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

// The word as one span per letter, so the typing run can show the letters one after another. The spans stay laid
// out while hidden (class "untyped"), so the word never changes size. Used by versionLink().
function updateWordMarkup() {
  return '<span class="update-word" aria-hidden="true">' +
    UPDATE_WORD.split("").map((ch, i) => '<span class="update-char" data-i="' + i + '">' + ch + "</span>").join("") +
    "</span>";
}

// The version the running Worker reports, as parts, or null on any failure.
async function fetchInstalledVersion() {
  const res = await fetch("/api/version");
  if (!res.ok) return null;
  const data = await res.json();
  return parseVersion(data && data.version);
}

// The version in the Version file on GitHub, as parts, or null on any failure or when the text is not "x.y.z".
async function fetchLatestVersion() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPDATE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(UPDATE_VERSION_URL, { cache: "no-store", credentials: "omit", signal: controller.signal });
    if (!res.ok) return null;
    return parseVersion(await res.text());
  } finally {
    clearTimeout(timer);
  }
}

// One check. It does nothing without a session or while another check runs. A failed or malformed answer keeps the
// current state, so a network error never shows or hides the notice.
async function checkForUpdate() {
  if (!state.token || updateCheckRunning) return;
  updateCheckRunning = true;
  try {
    const installed = await fetchInstalledVersion();
    const latest = await fetchLatestVersion();
    if (!installed || !latest || !state.token) return;
    setUpdateNotice(compareVersions(latest, installed) > 0);
    fitUpdateWords();
  } catch (e) {
    // Offline, blocked or a bad answer: keep the current state.
  } finally {
    updateCheckRunning = false;
  }
}

// Starts the checks for a signed-in session: one at once, then one per hour. A tick without a session does nothing
// (checkForUpdate()). Calling it again after a new sign-in checks at once and keeps the single timer.
function startUpdateChecks() {
  if (!updateCheckTimer) updateCheckTimer = setInterval(checkForUpdate, UPDATE_CHECK_EVERY_MS);
  requestAnimationFrame(fitUpdateWords);
  checkForUpdate();
}

// Shows or hides the notice. A real change redraws the labels on the page from versionLink() (one source of markup),
// then starts or stops the typing. The local preview calls this directly for its Update notice button.
function setUpdateNotice(on) {
  on = Boolean(on);
  if (on === updateAvailable) return;
  updateAvailable = on;
  document.querySelectorAll(".brand-version").forEach(old => {
    const holder = document.createElement("template");
    holder.innerHTML = versionLink().trim();
    old.replaceWith(holder.content.firstElementChild);
  });
  stopUpdateTyping();
  if (!on) return;
  fitUpdateWords();
  runUpdateTyping();
  updateTypingTimer = setInterval(runUpdateTyping, UPDATE_TYPE_EVERY_MS);
}

// Types the word letter by letter at a keyboard-like pace. The letters are looked up again at every step, so a
// redrawn label is picked up. Reduced motion shows the word at once with no typing.
function runUpdateTyping() {
  if (!updateAvailable || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const run = ++updateTypingRun;
  const step = count => {
    if (run !== updateTypingRun) return;
    document.querySelectorAll(".brand-version .update-char").forEach(ch => {
      ch.classList.toggle("untyped", Number(ch.dataset.i) >= count);
    });
    if (count < UPDATE_WORD.length) setTimeout(() => step(count + 1), 90 + Math.random() * 90);
  };
  step(0);
}

// Ends the typing loop and shows the whole word.
function stopUpdateTyping() {
  updateTypingRun++;
  clearInterval(updateTypingTimer);
  updateTypingTimer = null;
  document.querySelectorAll(".brand-version .update-char").forEach(ch => ch.classList.remove("untyped"));
}

// Fits the word into the fixed notice box: the font starts at the maximum and shrinks one pixel at a time until the
// word fits the room inside the padding, down to the minimum. A label that is hidden by the layout (the sidebar copy
// on a phone, the header copy on desktop) has no width and is skipped; it is fitted when a resize shows it.
function fitUpdateWords() {
  document.querySelectorAll(".brand-version.update-notice").forEach(box => {
    const word = box.querySelector(".update-word");
    if (!word || !box.clientWidth) return;
    const style = getComputedStyle(box);
    const room = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    let size = UPDATE_FONT_MAX;
    box.style.fontSize = size + "px";
    while (word.offsetWidth > room && size > UPDATE_FONT_MIN) {
      size -= 1;
      box.style.fontSize = size + "px";
    }
  });
}
window.addEventListener("resize", fitUpdateWords);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitUpdateWords);
`;
