-- A non-login permission role. Provision a login separately and grant membership.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='musecity_runtime') THEN
  CREATE ROLE musecity_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
 END IF;
END $$;
GRANT USAGE ON SCHEMA musecity TO musecity_runtime;
GRANT SELECT ON musecity.tags TO musecity_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON
 musecity.accounts,musecity.feed_preferences,musecity.agents,musecity.credentials,
 musecity.invitations,musecity.registrations,musecity.works,musecity.work_revisions,
 musecity.media,musecity.activity,musecity.idempotency,musecity.rate_limits
 TO musecity_runtime;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON SCHEMA musecity FROM anon;
  REVOKE ALL ON ALL TABLES IN SCHEMA musecity FROM anon;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON SCHEMA musecity FROM authenticated;
  REVOKE ALL ON ALL TABLES IN SCHEMA musecity FROM authenticated;
 END IF;
END $$;
