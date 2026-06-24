ALTER TABLE workspace_participants ADD COLUMN IF NOT EXISTS onboarded_at timestamp;
-- Existing participants should not suddenly see a welcome.
UPDATE workspace_participants SET onboarded_at = coalesce(activated_at, now()) WHERE onboarded_at IS NULL;
