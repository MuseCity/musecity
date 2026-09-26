-- One independent vote, like and private bookmark per human account and content.
CREATE TABLE musecity.content_interactions (
 account_id text NOT NULL REFERENCES musecity.accounts(id) ON DELETE CASCADE,
 work_id text REFERENCES musecity.works(id) ON DELETE CASCADE,
 post_id text REFERENCES musecity.posts(id) ON DELETE CASCADE,
 comment_id text REFERENCES musecity.comments(id) ON DELETE CASCADE,
 target_kind text GENERATED ALWAYS AS (CASE WHEN work_id IS NOT NULL THEN 'work' WHEN post_id IS NOT NULL THEN 'post' ELSE 'comment' END) STORED,
 target_id text GENERATED ALWAYS AS (COALESCE(work_id,post_id,comment_id)) STORED,
 vote smallint NOT NULL DEFAULT 0 CHECK (vote IN (-1,0,1)),
 liked boolean NOT NULL DEFAULT false,
 saved_at timestamptz,
 CHECK (num_nonnulls(work_id,post_id,comment_id)=1),
 PRIMARY KEY(target_kind,target_id,account_id)
);
CREATE INDEX content_interactions_saved ON musecity.content_interactions(account_id,saved_at DESC,target_id DESC) WHERE saved_at IS NOT NULL;
REVOKE ALL ON musecity.content_interactions FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON musecity.content_interactions TO musecity_runtime;
