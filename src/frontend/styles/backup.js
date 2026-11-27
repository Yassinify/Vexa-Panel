export const BACKUP_CSS = String.raw`
/* --- Backup and Restore popups --- */
/* The Backup and Restore popups (client/backup/backup-flow.js, restore-flow.js) reuse .modal-card, .node-card, .modal-title,
   .helper-text, .error-text and .modal-footer. This file only adds what they do not have. Restore is a little wider than the
   400px default so the summary and the conflict questions have room. */
.restore-modal { max-width: 440px; }
/* Section cards: the badge holds an icon here, not a letter. */
.backup-card .node-card-badge .ui-icon { width: 18px; height: 18px; }
.backup-privacy { margin-top: var(--space-sm); }
/* Progress bar of the Backup and Restore runs: a track, a bar whose width is set inline in percent, and a line with the
   stage text on the left and the percentage on the right. */
.backup-progress {
  height: 8px; margin: var(--space-lg) 0 var(--space-sm); overflow: hidden;
  border: 1px solid var(--color-border); border-radius: 999px; background: var(--color-surface-alt);
}
.backup-progress-bar { height: 100%; border-radius: 999px; background: var(--color-primary); transition: width .2s ease; }
.backup-progress-meta {
  display: flex; justify-content: space-between; gap: var(--space-md);
  color: var(--color-muted); font-size: var(--text-caption); font-variant-numeric: tabular-nums;
}
/* Bar on the bottom border of the Restore card while a conflict question is on screen (restoreOverallPercent() and
   renderRestoreModal() in restore-flow.js set .restore-asking and --restore-progress, the progress of the whole restore).
   It is a background image of the card, not a child, so it stays on the border while a tall card scrolls and the card's
   rounded corners clip it. The three-class selector beats the background shorthand of .card. The card is redrawn for every
   question, so the width is set, not animated. */
.modal-card.restore-modal.restore-asking {
  background-image: linear-gradient(var(--color-primary), var(--color-primary));
  background-repeat: no-repeat;
  background-position: left bottom;
  background-size: var(--restore-progress, 0%) 3px;
}
/* Report and summary rows: a bordered list, a muted label on the left and the value on the right. */
.backup-report {
  margin: var(--space-md) 0; border: 1px solid var(--color-border); border-radius: var(--radius-md);
  background: var(--color-surface-alt);
}
.backup-report-row {
  display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-md);
  padding: var(--space-sm) var(--space-md); border-bottom: 1px solid var(--color-border);
}
.backup-report-row:last-child { border-bottom: 0; }
.backup-report-label { flex: none; color: var(--color-muted); }
.backup-report-value { min-width: 0; text-align: right; font-weight: 600; overflow-wrap: anywhere; }
/* Restore file step: a dashed drop zone that is also a button. It takes the primary border and fill while a file is dragged
   over it (.restore-drop-over, set by restoreDragOver()) and on hover or keyboard focus. */
.restore-drop {
  display: flex; flex-direction: column; align-items: center; gap: var(--space-sm); width: 100%;
  margin: var(--space-md) 0; padding: var(--space-xl) var(--space-lg); text-align: center; cursor: pointer;
  color: var(--color-text); border: 1px dashed var(--color-border-input); border-radius: var(--radius-lg);
  background: var(--color-surface-alt); transition: background .12s ease, border-color .12s ease;
}
.restore-drop:hover, .restore-drop.restore-drop-over { border-color: var(--color-primary); background: var(--color-primary-faint); }
.restore-drop:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.restore-drop:disabled { cursor: progress; opacity: .7; }
.restore-drop-icon {
  display: grid; place-items: center; width: 40px; height: 40px;
  border-radius: 50%; background: var(--color-primary-faint); color: var(--color-primary);
}
.restore-drop-icon .ui-icon { width: 20px; height: 20px; }
.restore-drop-title { font-weight: 600; }
.restore-drop-hint { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-muted); font-size: var(--text-caption); }
`;
