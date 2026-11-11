// =====================================================================
// VEXA — /D1 SETUP GUIDE page: shown for every route when the D1
// database isn't bound yet. Nothing in this Worker (sessions, users,
// their subscription sources, secrets, rate limiting) can function
// without it, so this takes priority over every other page, including
// the secret setup flow.
// =====================================================================

import { STYLES } from "../frontend/styles.js";
import { LOGO_MARK_PATHS, FAVICON_LINK } from "../favicon-assets.js";

// Shared attributes for the small inline line icons used on this page.
const ICON_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

// Platform logos for the mock headers: inline SVG, so the guide works offline.
// GitHub: the Octicons "mark-github" mark. Cloudflare: the Simple Icons cloud, in Cloudflare orange (viewBox cropped to the cloud).
// The GitHub mark path is exported: the version popup in the panel shell reuses it.
export const GITHUB_MARK_PATH = '<path fill="currentColor" fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>';
const GITHUB_LOGO = '<svg class="setup-mock-logo" viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">' + GITHUB_MARK_PATH + '</svg>';
const CLOUDFLARE_LOGO = '<svg class="setup-mock-logo" viewBox="0 6.5 24 11" width="26" height="12" aria-hidden="true"><path fill="#F38020" d="M16.509 16.845c.147-.507.09-.971-.155-1.316-.225-.316-.605-.499-1.062-.52l-8.66-.113a.156.156 0 01-.133-.07.194.194 0 01-.02-.156.24.24 0 01.203-.156l8.736-.113c1.035-.049 2.16-.886 2.554-1.913l.499-1.302a.27.27 0 00.014-.168 5.689 5.689 0 00-10.938-.584 2.584 2.584 0 00-1.793-.498 2.561 2.561 0 00-2.223 3.18A3.634 3.634 0 000 16.751c0 .175.014.351.035.527a.174.174 0 00.17.148h15.98a.22.22 0 00.204-.155l.12-.427zm2.757-5.564c-.077 0-.161 0-.239.011-.056 0-.105.042-.127.098l-.337 1.174c-.148.507-.092.971.154 1.317.225.316.605.498 1.062.52l1.844.113c.056 0 .105.026.133.07a.203.203 0 01.021.156.24.24 0 01-.204.156l-1.92.112c-1.042.049-2.159.887-2.553 1.914l-.141.358c-.028.072.021.142.099.142h6.597a.174.174 0 00.17-.126 4.87 4.87 0 00.175-1.28 4.74 4.74 0 00-4.734-4.727"/></svg>';

// Vexa Panel: the project's own V mark (same paths as the login logo), 40:34 ratio.
const VEXA_LOGO = '<svg class="setup-mock-logo" viewBox="0 0 40 34" width="21" height="18" aria-hidden="true">' + LOGO_MARK_PATHS + '</svg>';

// Brand headers that look like their platform: brand text -> [CSS modifier, logo]. Any other brand stays plain text.
const PLATFORM_BRANDS = {
  "GITHUB RELEASE": ["github", GITHUB_LOGO],
  "CLOUDFLARE": ["cloudflare", CLOUDFLARE_LOGO],
  "VEXA PANEL": ["vexa", VEXA_LOGO]
};

// Simplified, decorative Cloudflare-style sidebar for one step.
// rows: [text, extra classes] pairs; "is-current" and "is-target" mark the item to look at.
function mock(brand, rows) {
  const platform = PLATFORM_BRANDS[brand];
  const brandHtml = platform
    ? '<div class="setup-mock-brand setup-mock-brand-' + platform[0] + '">' + platform[1] + brand + '</div>'
    : '<div class="setup-mock-brand">' + brand + '</div>';
  return '<div class="setup-mock" aria-hidden="true">' + brandHtml +
    rows.map(function (r) { return '<div class="setup-mock-item ' + r[1] + '">' + r[0] + '</div>'; }).join("") +
    '</div>';
}

// The guide follows the README section "Deploy With the Cloudflare Dashboard".
// This page only appears while D1 is not bound, so the Worker is already running:
// steps 1 to 3 are done and the guide opens on step 4 (index 3).
const START_STEP = 3;

// The 10 guide steps: stepper label (keep it short, the slots are narrow), panel title, panel text, mock and optional extra HTML.
const STEPS = [
  {
    label: "Get worker.js",
    title: "Get worker.js from the GitHub Release",
    text: "<p>Download the attached <code>worker.js</code> file from the latest release of this project on GitHub.</p>" +
      "<p>It is the complete, already-built application. Do not open or edit it; you copy its contents in step 3.</p>",
    mock: mock("GITHUB RELEASE", [["Releases", ""], ["Latest release", "is-current"], ["Assets", "setup-mock-sub"], ["worker.js", "setup-mock-sub is-target"]])
  },
  {
    label: "Create Worker",
    title: "Create the Worker",
    text: "<p>In the Cloudflare dashboard go to <strong>Workers &amp; Pages</strong> → <strong>Create</strong> and start from scratch (a \"Hello World\" starter is fine).</p>" +
      "<p>The Worker name is yours to choose. It becomes part of your address, <code>&lt;name&gt;.<wbr>&lt;subdomain&gt;.<wbr>workers.dev</code>.</p>",
    mock: mock("CLOUDFLARE", [["Compute (Workers)", ""], ["Workers &amp; Pages", "is-current"], ["Create", "setup-mock-sub is-target"], ["Hello World", "setup-mock-sub"]])
  },
  {
    label: "Paste Code",
    title: "Paste worker.js into the Worker",
    text: "<p>Open your Worker and choose <strong>Edit code</strong>. Replace the starter code completely with the contents of <code>worker.js</code>, then save and deploy.</p>" +
      "<p>Open <code>worker.js</code> in any plain text editor, select everything and copy it.</p>",
    mock: mock("CLOUDFLARE", [["Edit code", "is-current"], ["Select all starter code", "setup-mock-sub"], ["Paste worker.js", "setup-mock-sub is-target"], ["Save and deploy", ""]])
  },
  {
    label: "Create D1",
    title: "Create the D1 database",
    text: "<p>Go to <strong>Storage &amp; Databases</strong> → <strong>D1 SQL Database</strong> → <strong>Create</strong>.</p>" +
      "<p>The database name is yours to choose, for example <code>vexa-panel-db</code>. Creating the database does not connect it to your Worker; that is the next step.</p>" +
      "<p><strong>Two different names:</strong> <code>vexa-panel-db</code> is the database name, only a label for you. <code>DB</code> is the binding name, fixed by Vexa Panel, and it is entered in step 5.</p>",
    mock: mock("CLOUDFLARE", [["Account Home", ""], ["Storage &amp; Databases", "is-current"], ["D1 SQL Database", "setup-mock-sub"], ["Create", "setup-mock-sub is-target"]]),
    extra: '<div class="setup-actions"><a class="btn-secondary" href="https://dash.cloudflare.com/" target="_blank" rel="noopener noreferrer">Open Cloudflare Dashboard <svg ' + ICON_ATTRS + ' width="16" height="16"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a></div>'
  },
  {
    label: "Bind as DB",
    title: "Bind the D1 database as DB",
    text: "<p>Open your Worker, then <strong>Settings</strong> → <strong>Bindings</strong> (it may be shown as <strong>Variables and Bindings</strong>) → <strong>Add</strong> → <strong>D1 database</strong>.</p>" +
      "<p>Set the <strong>Variable name</strong> to exactly <code>DB</code> (uppercase, no spaces), select the database from step 4, then save and deploy.</p>",
    mock: mock("CLOUDFLARE", [["Settings", "is-current"], ["Bindings", "setup-mock-sub"], ["Add → D1 database", "setup-mock-sub is-target"], ["DB → vexa-panel-db", "setup-mock-sub is-target"]])
  },
  {
    label: "Deploy",
    title: "Deploy",
    text: "<p>Deploy the Worker again so the binding is live. Your Worker address is at the top of its page: <code>https://&lt;name&gt;.<wbr>&lt;subdomain&gt;.<wbr>workers.dev</code>.</p>" +
      "<p>Then reload this page. Once the binding is live, it opens the Vexa Panel Login page, where steps 7 to 10 continue.</p>",
    mock: mock("CLOUDFLARE", [["Bindings", ""], ["DB → vexa-panel-db", "setup-mock-sub"], ["Deploy", "is-target"], ["Worker address", "is-current"]])
  },
  {
    label: "Initial Setup",
    title: "Complete initial setup",
    text: "<p>Open your Worker address. The Login page shows a first-run form: <strong>Password</strong>, <strong>Confirm password</strong> and <strong>Create account</strong>.</p>" +
      "<p>Enter the admin password you want twice, then select <strong>Create account</strong>. You are logged out once afterwards; that is expected.</p>",
    mock: mock("VEXA PANEL", [["First-run setup", "is-current"], ["Password", "setup-mock-sub"], ["Confirm password", "setup-mock-sub"], ["Create account", "setup-mock-sub is-target"]])
  },
  {
    label: "Log In",
    title: "Log in",
    text: "<p>Sign in with the admin password you just chose. The <strong>Dashboard</strong> opens and setup is complete.</p>",
    mock: mock("VEXA PANEL", [["Login", "is-current"], ["Password", "setup-mock-sub"], ["Sign in", "setup-mock-sub is-target"], ["Dashboard", ""]])
  },
  {
    label: "First User",
    title: "Create your first User",
    text: "<p>Go to <strong>Users</strong> and add a User; a name is all that is required. Paste that User's proxy links, subscription URLs, Xray JSON or Clash YAML as sources.</p>" +
      "<p>Optionally, create a shared source under <strong>Nodes</strong> and assign it to the User.</p>",
    mock: mock("VEXA PANEL", [["Dashboard", ""], ["Users", "is-current"], ["+ Add user", "setup-mock-sub is-target"], ["Nodes (optional)", ""]])
  },
  {
    label: "Sub URL",
    title: "Use the public subscription URL",
    text: "<p>Each User has one public link, <code>/sub/user/&lt;id&gt;</code> on your Worker address. Select <strong>Link</strong> on the User's row to open it, its QR code and a Copy button.</p>" +
      "<p>Paste this URL into your VPN client app.</p>",
    mock: mock("VEXA PANEL", [["Users", "is-current"], ["Link", "setup-mock-sub is-target"], ["/sub/user/&lt;id&gt;", "setup-mock-sub"]])
  }
];

// Numbered step buttons; the numbers stay visible on narrow screens, the labels do not.
// Steps before START_STEP start as done, START_STEP as active.
function renderStepper() {
  return STEPS.map(function (s, i) {
    const state = i === START_STEP ? ' class="is-active"' : (i < START_STEP ? ' class="is-done"' : '');
    return '<li' + state + '><button type="button" class="setup-step-btn" aria-label="Step ' + (i + 1) + ': ' + s.label + '"' + (i === START_STEP ? ' aria-current="step"' : '') + '>' +
      '<span class="setup-step-num">' + (i + 1) + '</span><span class="setup-step-label">' + s.label + '</span></button></li>';
  }).join("");
}

// One panel per step; only the active one is displayed (CSS), switched by the inline script.
function renderPanes() {
  return STEPS.map(function (s, i) {
    return '<div class="setup-pane' + (i === START_STEP ? ' is-active' : '') + '">' + s.mock +
      '<div class="setup-body"><h2>' + (i + 1) + '. ' + s.title + '</h2>' + s.text + (s.extra || "") + '</div></div>';
  }).join("");
}

export function renderD1SetupGuide() {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Vexa Panel — D1 Database Setup Required</title>
${FAVICON_LINK}
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<!-- Apply the saved theme before first paint so the page does not flash dark. -->
<script>try { const t = localStorage.getItem("vexa_theme"); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; } catch (e) {}</script>
<style>${STYLES}</style>
</head>
<body>
<div class="login-wrap">
  <div class="card setup-card">
    <!-- Same logo block as the login screen (logoMark() in icons.js). -->
    <div class="setup-brand"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 34" width="30" height="26" class="logo-mark" aria-hidden="true">${LOGO_MARK_PATHS}</svg>Vexa Panel</div>
    <div class="setup-inner">
      <div class="setup-head">
        <div class="setup-head-icon"><svg ${ICON_ATTRS}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/></svg></div>
        <div>
          <h1>D1 database required</h1>
          <div class="setup-sub">This Worker needs a D1 database bound before it can run.</div>
        </div>
      </div>
      <p class="setup-intro">Steps 1 to 3 are already done, because this Worker is running. Continue with step 4:</p>
      <ol class="setup-stepper" aria-label="Setup steps">${renderStepper()}</ol>
      <!-- Back / Next sit between the stepper and the detail panel, at the right. -->
      <div class="setup-actions setup-actions-nav">
        <button type="button" class="btn-secondary" id="setup-back">Back</button>
        <button type="button" class="btn-secondary" id="setup-next">Next</button>
      </div>
      <div class="setup-detail" aria-live="polite">
        ${renderPanes()}
      </div>
      <div class="setup-footer">
        <div class="setup-note"><svg ${ICON_ATTRS}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>After step 6 (Deploy), reload this page. Steps 7 to 10 happen in the panel, after the reload.</div>
        <button class="btn-primary" onclick="location.reload()"><svg ${ICON_ATTRS} width="16" height="16"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>Reload</button>
      </div>
    </div>
  </div>
</div>
<!-- Step switching: stepper buttons and Back/Next show one panel at a time. -->
<script>
(function () {
  var steps = document.querySelectorAll(".setup-stepper li");
  var panes = document.querySelectorAll(".setup-pane");
  var back = document.getElementById("setup-back");
  var next = document.getElementById("setup-next");
  var current = 0;
  var ready = false;
  function show(index) {
    var changed = index !== current;
    current = index;
    for (var k = 0; k < steps.length; k++) {
      steps[k].classList.toggle("is-active", k === index);
      steps[k].classList.toggle("is-done", k < index);
      panes[k].classList.toggle("is-active", k === index);
      if (k === index) steps[k].firstElementChild.setAttribute("aria-current", "step");
      else steps[k].firstElementChild.removeAttribute("aria-current");
    }
    back.style.display = index === 0 ? "none" : "";
    next.style.display = index === steps.length - 1 ? "none" : "";
    // A step change fades the new panel in with a 6px slide up (the same motion as the panel's
    // tabs and popups). Not on the first call, for the same step, or under reduced motion.
    if (ready && changed && panes[index].animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      panes[index].animate(
        [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
        { duration: 200, easing: "ease-out" }
      );
    }
  }
  for (var i = 0; i < steps.length; i++) {
    (function (index) {
      steps[index].firstElementChild.addEventListener("click", function () { show(index); });
    })(i);
  }
  back.addEventListener("click", function () { if (current > 0) show(current - 1); });
  next.addEventListener("click", function () { if (current < steps.length - 1) show(current + 1); });
  show(${START_STEP});
  ready = true;
})();
</script>
</body>
</html>`;
}
