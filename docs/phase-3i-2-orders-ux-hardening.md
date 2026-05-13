# Phase 3I.2 — Orders UX hardening

- Moved edit-mode persisted-line delete confirmation to pre-remove path.
- If user cancels confirm, line remains in draft.
- If user confirms, line is removed and tracked in `removedLineIds` for archive-on-save.
- New unsaved lines delete without archive confirmation.
- Added footer save button cue: `Save Changes` while editing existing order.

No Firebase migration or product identity changes were made in this phase.
