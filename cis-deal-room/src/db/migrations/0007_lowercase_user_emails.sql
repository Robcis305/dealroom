-- Canonicalize stored user emails to lowercase. Application code now writes
-- lowercase, but pre-existing rows may have mixed case from earlier invites.
-- Aborts loudly if lowering would collide with the unique constraint, since
-- we never expect that in production.
DO $$
DECLARE collisions int;
BEGIN
  SELECT count(*) - count(DISTINCT lower(email)) INTO collisions FROM users;
  IF collisions > 0 THEN
    RAISE EXCEPTION 'Refusing to lowercase users.email: % case-collision(s) — resolve duplicates manually first', collisions;
  END IF;
END $$;
--> statement-breakpoint
UPDATE users SET email = lower(email) WHERE email <> lower(email);
