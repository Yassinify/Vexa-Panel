import { usersSection } from "./sections/users.js";
import { nodesSection } from "./sections/nodes.js";
import { settingsSection } from "./sections/settings.js";

// ---------------------------------------------------------------------
// BACKUP SECTION REGISTRY
// The one list of backup sections. The API handlers and the popup only loop over this list, so nothing else
// knows which sections exist. To add a section, write a module that follows the section contract (documented
// in sections/settings.js) and add it here; to remove one, delete it from here.
//
// The order matters: it is the order of the cards in the popup and the order in which the handlers analyze
// sections. Users must come before Nodes, because a User that appears in both is analyzed once as primary
// before a Node refers to it as linked (see resolve.js).
// ---------------------------------------------------------------------

export const BACKUP_SECTIONS = [usersSection, nodesSection, settingsSection];

// The ids of all sections, in registry order. checkEnvelope() in format.js takes this as its known ids.
export function listSectionIds() {
  return BACKUP_SECTIONS.map((section) => section.id);
}

// The section with this id, or null when this panel does not know it.
export function getSection(id) {
  return BACKUP_SECTIONS.find((section) => section.id === id) || null;
}
