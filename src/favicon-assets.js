// =====================================================================
// VEXA — Favicon asset: single SVG favicon, served directly (no .ico/.png
// set — see src/router.js for the /favicon.svg route).
// =====================================================================

// The "V" below is a pre-traced outline of the Leckerli One glyph
// (extracted from LeckerliOne-Regular.ttf via fontTools), not live text in
// a web font. This SVG is used as <link rel="icon"> and <img src=...>;
// browsers block external resource fetches (including @import'd fonts)
// inside those contexts, so a text-based "V" styled with a Google Font
// would silently fall back to a generic font instead. Baking in the traced
// shape removes that dependency entirely.
export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">
  <!-- Background: Rounded Rectangle -->
  <rect width="200" height="200" rx="40" ry="40" fill="#0B0B0E" />

  <!-- Centered Letter V (Leckerli One glyph outline) -->
  <path fill="#E11D48" transform="matrix(0.11,0,0,-0.11,61.06,141.45)" d="M0 624Q0 679 51 714Q100 750 168.0 750.0Q236 750 270 694Q296 653 296.0 601.5Q296 550 285.0 501.5Q274 453 261.5 402.0Q249 351 238.0 298.5Q227 246 227.0 212.5Q227 179 230 168Q244 124 306 124Q353 124 394 151Q507 225 538 444Q457 449 413.5 495.5Q370 542 370 621Q370 678 407.0 717.0Q444 756 508.0 756.5Q572 757 604.0 712.0Q636 667 636 590V567Q636 555 635 544Q652 552 664.0 560.5Q676 569 688 569Q708 569 708 552Q708 519 687.5 494.5Q667 470 632 457Q622 328 599.5 260.0Q577 192 551.5 147.0Q526 102 486 68Q402 -3 269 -3Q180 -3 127.5 41.5Q75 86 75 182Q75 205 100.5 303.5Q126 402 141.0 465.5Q156 529 156 566Q156 647 115 647Q101 647 89.5 639.0Q78 631 66.5 622.0Q55 613 43.0 605.0Q31 597 15.5 597.0Q0 597 0 624ZM547 547Q549 575 549 604Q549 669 519 669Q498 670 498 636Q498 574 547 547Z" />
</svg>`;
