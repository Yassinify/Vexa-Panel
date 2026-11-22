export const SPINNER_CSS = `/* --- Spinner (the loading ring of a button) ---
   A button swaps its label for a ring while it works. The label (.btn-swap-label) and the ring (.btn-spinner) share one
   grid cell (.btn-swap), so the cell keeps the width of the label and the button never changes size. .btn-loading on
   the button fades the label up and out and scales the ring in; removing it plays the swap backwards. The ring is a
   16px SVG with its own SMIL animation; its markup comes from spinnerRing() in client/spinner.js, which also builds the
   whole swap cell (buttonSwap()) and sets or clears .btn-loading (setButtonLoading()). The ring takes the brand color
   from --color-primary. Under reduced motion the swap is instant. */
.btn-swap { display: inline-grid; place-items: center; }
.btn-swap > * { grid-area: 1 / 1; }
.btn-spinner { width: 16px; height: 16px; color: var(--color-primary); opacity: 0; transform: scale(.5); pointer-events: none; }
.btn-loading .btn-swap-label { opacity: 0; transform: translateY(-6px) scale(.92); filter: blur(2px); }
.btn-loading .btn-spinner { opacity: 1; transform: none; }
@media (prefers-reduced-motion: no-preference) {
  .btn-swap-label { transition: opacity 200ms ease, transform 320ms cubic-bezier(.22, 1, .36, 1), filter 200ms ease; }
  .btn-spinner { transition: opacity 200ms ease 60ms, transform 400ms cubic-bezier(.34, 1.56, .64, 1) 60ms; }
}`;
