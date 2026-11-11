import { LOGO_MARK_PATHS } from "../favicon-assets.js";

export const ICONS_SCRIPT = `
// Inline SVG icons: the dashboard, users, globe and log symbols are copied
// from reference/reference.html (stroke 1.8); settings is the Heroicons
// cog-6-tooth outline (MIT, Tailwind Labs). Stroke uses
// currentColor, so each icon inherits the color of its wrapping element.
// icon() wraps the markup in a consistently-sized <svg class="ui-icon">
// shell; logoMark() draws the V logo, which is filled, not stroked.
const ICONS = {
  dashboard: '<path d="M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" />',
  users: '<circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" />',
  globe: '<circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />',
  settings: '<path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />',
  log: '<path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h7" />',
  // Not in the reference: three horizontal dots for the More menu (filled).
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" />',
  // Not in the reference: a down chevron for dropdown buttons (stroked, round ends).
  chevron: '<path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />',
  // Not in the reference: a door with an arrow for the Sign out button (stroked, round ends).
  logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke-linecap="round" stroke-linejoin="round" /><path d="M16 17l5-5-5-5M21 12H9" stroke-linecap="round" stroke-linejoin="round" />',
  // Heroicons arrow-up and arrow-down outline (MIT, Tailwind Labs): sort arrows in the Users table header.
  arrowUp: '<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />',
  arrowDown: '<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />',
  // Heroicons outline (MIT, Tailwind Labs, @heroicons/react 2.2.0): the Link, Edit, Enable, Disable
  // and Delete buttons in the Users and Nodes tables.
  link: '<path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />',
  pencilSquare: '<path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />',
  checkCircle: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />',
  noSymbol: '<path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />',
  trash: '<path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />',
  // Heroicons outline (MIT, Tailwind Labs, @heroicons/react 2.2.0): plus and x-mark for the Add and
  // Remove buttons in the User and Node editor popups.
  plus: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />',
  xMark: '<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />',
};
function icon(name, extraClass) {
  const paths = ICONS[name] || "";
  return '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="ui-icon' + (extraClass ? " " + extraClass : "") + '" aria-hidden="true">' + paths + '</svg>';
}
// The V logo mark from the reference, drawn at 30x26. The two filled paths
// come from favicon-assets.js, the only place they are defined.
function logoMark() {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 34" width="30" height="26" class="logo-mark" aria-hidden="true">${LOGO_MARK_PATHS}</svg>';
}
`;
