CREATE SCHEMA IF NOT EXISTS musecity;
REVOKE ALL ON SCHEMA musecity FROM PUBLIC;

CREATE TABLE musecity.accounts (
 id text PRIMARY KEY, privy_user_id text NOT NULL UNIQUE, handle text NOT NULL UNIQUE,
 name text NOT NULL, bio text NOT NULL DEFAULT '', avatar_media_id text,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','restricted')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE musecity.tags (id text PRIMARY KEY, name text NOT NULL, enabled boolean NOT NULL DEFAULT true);
INSERT INTO musecity.tags(id,name) VALUES
 ('ai-tools','AI tools'),('development','Development'),('design','Design'),
 ('tutorials','Tutorials'),('games','Games'),('experiments','Experiments');
CREATE TABLE musecity.feed_preferences (
 account_id text PRIMARY KEY REFERENCES musecity.accounts(id), tabs jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE musecity.agents (
 id text PRIMARY KEY, owner_account_id text NOT NULL REFERENCES musecity.accounts(id), name text NOT NULL,
 scopes jsonb NOT NULL, status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','revoked')),
 created_at timestamptz NOT NULL DEFAULT now(), last_active_at timestamptz
);
CREATE INDEX agents_owner ON musecity.agents(owner_account_id);
CREATE TABLE musecity.credentials (
 id text PRIMARY KEY, agent_id text NOT NULL REFERENCES musecity.agents(id), token_hash text NOT NULL UNIQUE,
 prefix text NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX credentials_agent ON musecity.credentials(agent_id);
CREATE TABLE musecity.invitations (
 id text PRIMARY KEY, owner_account_id text NOT NULL REFERENCES musecity.accounts(id), name text NOT NULL,
 scopes jsonb NOT NULL, token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
 used_at timestamptz, cancelled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE musecity.registrations (
 id text PRIMARY KEY, name text NOT NULL, requested_scopes jsonb NOT NULL, approved_scopes jsonb,
 owner_account_id text REFERENCES musecity.accounts(id), token_hash text NOT NULL UNIQUE, claim_hash text UNIQUE,
 status text NOT NULL CHECK (status IN ('pending_claim','approved','activated','cancelled')),
 expires_at timestamptz NOT NULL, agent_id text REFERENCES musecity.agents(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE musecity.works (
 id text PRIMARY KEY, owner_account_id text NOT NULL REFERENCES musecity.accounts(id),
 created_by_agent_id text REFERENCES musecity.agents(id), published_by_agent_id text REFERENCES musecity.agents(id),
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','unpublished','deleted')),
 blocked boolean NOT NULL DEFAULT false, draft_revision_id text, published_revision_id text,
 published_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX works_owner ON musecity.works(owner_account_id,updated_at DESC,id DESC);
CREATE INDEX works_public ON musecity.works(published_at DESC,id DESC) WHERE status='published' AND NOT blocked;
CREATE TABLE musecity.work_revisions (
 id text PRIMARY KEY, work_id text NOT NULL REFERENCES musecity.works(id), payload jsonb NOT NULL,
 tag_ids text[] NOT NULL, media_ids text[] NOT NULL, editor_agent_id text REFERENCES musecity.agents(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(work_id,id)
);
ALTER TABLE musecity.works ADD CONSTRAINT work_draft_reference FOREIGN KEY (id,draft_revision_id) REFERENCES musecity.work_revisions(work_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE musecity.works ADD CONSTRAINT work_public_reference FOREIGN KEY (id,published_revision_id) REFERENCES musecity.work_revisions(work_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX revision_tags ON musecity.work_revisions USING gin(tag_ids);
CREATE INDEX revision_media ON musecity.work_revisions USING gin(media_ids);
CREATE TABLE musecity.media (
 id text PRIMARY KEY, owner_account_id text NOT NULL REFERENCES musecity.accounts(id), agent_id text REFERENCES musecity.agents(id),
 object_key text NOT NULL UNIQUE, mime_type text NOT NULL, byte_size integer NOT NULL CHECK (byte_size>0 AND byte_size<=20971520),
 status text NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading','uploaded','ready','rejected')),
 upload_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, etag text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_owner ON musecity.media(owner_account_id);
ALTER TABLE musecity.accounts ADD CONSTRAINT account_avatar FOREIGN KEY(avatar_media_id) REFERENCES musecity.media(id);
CREATE TABLE musecity.activity (
 id text PRIMARY KEY, owner_account_id text NOT NULL REFERENCES musecity.accounts(id), agent_id text REFERENCES musecity.agents(id),
 action text NOT NULL, resource_id text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_agent ON musecity.activity(agent_id,created_at DESC);
CREATE TABLE musecity.idempotency (
 actor_key text NOT NULL, operation text NOT NULL, key text NOT NULL, request_hash text NOT NULL,
 response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_key,operation,key)
);
CREATE TABLE musecity.rate_limits (key text PRIMARY KEY, counter integer NOT NULL, expires_at timestamptz NOT NULL);

-- The application uses the private schema via Hyperdrive, never the Supabase Data API.
-- Apply as the migration owner. Provision the runtime login separately, then grant it
-- USAGE on this schema and SELECT/INSERT/UPDATE/DELETE on these tables only.
REVOKE ALL ON ALL TABLES IN SCHEMA musecity FROM PUBLIC;
