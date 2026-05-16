# Phase 3I.1 — Orders stabilization

- Fully wired edit-mode line deletion tracking using `originalLineIds` and `removedLineIds`.
- Existing saved line deleted in edit mode now asks confirmation and is archived on save via `archiveProductsForRemovedOrderLines`.
- New unsaved lines deleted during edit are not archive candidates.
- Removed dead toolbar view wiring (`setView={() => {}}`) and replaced with focused history-search + New Order reset controls.
- Kept clean workspace + history behavior, product sync, Cloudinary uploads, and no Orders Firebase migration.
