// The V logo from reference/reference.html (symbol #lg, viewBox 0 0 40 34).
// This is the only place its two paths are defined; everything else reuses it.
export const LOGO_MARK_PATHS = `<path d="M0 2h11l9 17 9-17h11L26 34h-12z" fill="#E11D48" /><path d="M14 2l6 11 6-11z" fill="#BE123C" />`;

// Public path of the favicon: router.js serves FAVICON_SVG here and every page head links to it.
export const FAVICON_PATH = "/favicon.svg";

// The <link> tag used in every page head, so the tag is written only once.
export const FAVICON_LINK = `<link rel="icon" type="image/svg+xml" href="${FAVICON_PATH}">`;

// Served at FAVICON_PATH by router.js.
export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 34">${LOGO_MARK_PATHS}</svg>`;
