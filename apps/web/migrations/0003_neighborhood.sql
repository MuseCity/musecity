ALTER TABLE musecity.accounts ADD COLUMN ecosystems text[] NOT NULL DEFAULT '{}',
 ADD COLUMN working_on text NOT NULL DEFAULT '', ADD COLUMN can_help text NOT NULL DEFAULT '', ADD COLUMN joined_at timestamptz,
 ADD CONSTRAINT known_ecosystems CHECK (ecosystems <@ ARRAY['base','robinhood']::text[] AND cardinality(ecosystems)<=2);
ALTER TABLE musecity.agents ADD COLUMN public_visible boolean NOT NULL DEFAULT false, ADD COLUMN description text NOT NULL DEFAULT '';
ALTER TABLE musecity.works ADD COLUMN first_published_at timestamptz;
-- Preserve the oldest known publication, including works currently unpublished.
UPDATE musecity.works w SET first_published_at=COALESCE((SELECT min(created_at) FROM musecity.activity a WHERE a.resource_id=w.id AND a.action='work.publish'),w.published_at);
CREATE INDEX works_first_public ON musecity.works(first_published_at DESC,id DESC) WHERE status='published' AND NOT blocked;
CREATE INDEX residents_joined ON musecity.accounts(joined_at DESC,id DESC) WHERE joined_at IS NOT NULL AND status='active';
CREATE TABLE musecity.posts (
 id text PRIMARY KEY, owner_account_id text NOT NULL REFERENCES musecity.accounts(id), agent_id text REFERENCES musecity.agents(id),
 kind text NOT NULL CHECK(kind IN ('update','help')), text text NOT NULL, title text NOT NULL DEFAULT '', expected_outcome text NOT NULL DEFAULT '',
 media_ids text[] NOT NULL DEFAULT '{}', help_status text CHECK(help_status IN ('open','in_progress','resolved')),
 revision integer NOT NULL DEFAULT 1, deleted boolean NOT NULL DEFAULT false, blocked boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds',clock_timestamp()), updated_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds',clock_timestamp()),
 CHECK ((kind='help' AND help_status IS NOT NULL) OR (kind='update' AND help_status IS NULL))
);
CREATE INDEX posts_feed ON musecity.posts(created_at DESC,id DESC) WHERE NOT deleted AND NOT blocked;
CREATE INDEX posts_owner ON musecity.posts(owner_account_id,created_at DESC,id DESC);
CREATE INDEX posts_media ON musecity.posts USING gin(media_ids);
CREATE TABLE musecity.follows (
 follower_id text NOT NULL REFERENCES musecity.accounts(id), followed_id text NOT NULL REFERENCES musecity.accounts(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(follower_id,followed_id), CHECK(follower_id<>followed_id)
);
CREATE INDEX follows_received ON musecity.follows(followed_id);
CREATE TABLE musecity.blocks (
 blocker_id text NOT NULL REFERENCES musecity.accounts(id), blocked_id text NOT NULL REFERENCES musecity.accounts(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(blocker_id,blocked_id), CHECK(blocker_id<>blocked_id)
);
CREATE INDEX blocks_received ON musecity.blocks(blocked_id,blocker_id);
CREATE TABLE musecity.comments (
 id text PRIMARY KEY, work_id text REFERENCES musecity.works(id), post_id text REFERENCES musecity.posts(id),
 owner_account_id text NOT NULL REFERENCES musecity.accounts(id), agent_id text REFERENCES musecity.agents(id),
 parent_id text REFERENCES musecity.comments(id), text text NOT NULL, deleted boolean NOT NULL DEFAULT false, blocked boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds',clock_timestamp()),
 CHECK((work_id IS NULL)<>(post_id IS NULL))
);
CREATE INDEX comments_work ON musecity.comments(work_id,created_at,id);
CREATE INDEX comments_post ON musecity.comments(post_id,created_at,id);
CREATE TABLE musecity.notifications (
 id text PRIMARY KEY, recipient_id text NOT NULL REFERENCES musecity.accounts(id), actor_account_id text NOT NULL REFERENCES musecity.accounts(id),
 actor_agent_id text REFERENCES musecity.agents(id), kind text NOT NULL CHECK(kind IN ('follow','comment','reply')),
 target_kind text NOT NULL CHECK(target_kind IN ('work','post','account')), target_id text NOT NULL, comment_id text REFERENCES musecity.comments(id),
 event_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds',clock_timestamp()), read_at timestamptz,
 UNIQUE(recipient_id,event_key)
);
CREATE INDEX notifications_recipient ON musecity.notifications(recipient_id,created_at DESC,id DESC);
CREATE TABLE musecity.reports (
 id text PRIMARY KEY, reporter_id text NOT NULL REFERENCES musecity.accounts(id),
 target_kind text NOT NULL CHECK(target_kind IN ('work','post','comment','account')), target_id text NOT NULL, reason text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','hidden','dismissed','restored')),
 created_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds',clock_timestamp()), resolved_by text REFERENCES musecity.accounts(id),
 UNIQUE(reporter_id,target_kind,target_id)
);
CREATE INDEX reports_status ON musecity.reports(status,created_at DESC,id DESC);
-- Operator membership is provisioned by a migration owner, never by an API or agent.
CREATE TABLE musecity.moderators (account_id text PRIMARY KEY REFERENCES musecity.accounts(id));
REVOKE ALL ON musecity.posts,musecity.follows,musecity.blocks,musecity.comments,musecity.notifications,musecity.reports,musecity.moderators FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON musecity.posts,musecity.follows,musecity.blocks,musecity.comments,musecity.notifications,musecity.reports TO musecity_runtime;
GRANT SELECT ON musecity.moderators TO musecity_runtime;
