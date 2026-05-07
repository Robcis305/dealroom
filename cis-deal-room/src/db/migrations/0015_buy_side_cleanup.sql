-- One-time cleanup: remove canonical-overlay checklist_items rows on workspaces
-- with cisAdvisorySide = 'buyer_side'. Custom items (playbook_item_id IS NULL)
-- are preserved. Buy-side workspaces will use the new import-only flow from
-- v1.6 onward.
--
-- Idempotent: re-running on already-cleaned workspaces is a no-op since the
-- rows aren't there.

DELETE FROM checklist_items
WHERE playbook_item_id IS NOT NULL
  AND checklist_id IN (
    SELECT c.id FROM checklists c
    JOIN workspaces w ON w.id = c.workspace_id
    WHERE w.cis_advisory_side = 'buyer_side'
  );
