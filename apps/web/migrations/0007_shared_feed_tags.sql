-- Human-created tags are shared; their creator does not own the publishing space.
CREATE UNIQUE INDEX tags_name_unique ON musecity.tags (lower(name));
GRANT INSERT (id,name) ON musecity.tags TO musecity_runtime;

ALTER TABLE musecity.posts ADD COLUMN tag_ids text[] NOT NULL DEFAULT '{}',
 ADD CONSTRAINT posts_tag_limit CHECK (cardinality(tag_ids)<=5);
CREATE INDEX posts_tags ON musecity.posts USING gin(tag_ids) WHERE NOT deleted AND NOT blocked;

-- Keep each account's chosen topics and their order; formats are secondary filters.
UPDATE musecity.feed_preferences p
SET tabs='["latest","following"]'::jsonb || COALESCE((
 SELECT jsonb_agg(tab ORDER BY position) FROM (
  SELECT tab,position FROM jsonb_array_elements_text(p.tabs) WITH ORDINALITY AS old(tab,position)
  WHERE tab LIKE 'tag:%' ORDER BY position LIMIT 18
 ) kept
),'[]'::jsonb),updated_at=now();
