-- Public identifiers, never authentication credentials. Defaults also support old Workers.
ALTER TABLE musecity.accounts ADD COLUMN website_marker text NOT NULL
 DEFAULT ('mc_u_' || pg_catalog.gen_random_uuid()::text) UNIQUE;
ALTER TABLE musecity.agents ADD COLUMN website_marker text NOT NULL
 DEFAULT ('mc_a_' || pg_catalog.gen_random_uuid()::text) UNIQUE;

CREATE TABLE musecity.work_originality (
 work_id text NOT NULL,
 revision_id text PRIMARY KEY,
 requested_url text NOT NULL,
 next_attempt integer NOT NULL DEFAULT 0 CHECK (next_attempt >= 0),
 applied_attempt integer NOT NULL DEFAULT 0 CHECK (applied_attempt >= 0 AND applied_attempt <= next_attempt),
 status text NOT NULL DEFAULT 'unchecked' CHECK (status IN ('unchecked','verified','failed')),
 reason text,
 final_url text,
 subject_kind text CHECK (subject_kind IN ('account','agent')),
 subject_agent_id text REFERENCES musecity.agents(id),
 checked_at timestamptz,
 FOREIGN KEY (work_id,revision_id) REFERENCES musecity.work_revisions(work_id,id),
 CHECK (status <> 'verified' OR (checked_at IS NOT NULL AND final_url IS NOT NULL AND subject_kind IS NOT NULL)),
 CHECK ((subject_kind = 'agent') = (subject_agent_id IS NOT NULL))
);
REVOKE ALL ON musecity.work_originality FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON musecity.work_originality TO musecity_runtime;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON musecity.work_originality FROM anon;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON musecity.work_originality FROM authenticated;
 END IF;
END $$;
