-- Additive: safe before switching the Worker. Do not run 0010 until after the switch.
CREATE FUNCTION musecity.article_search_text(node jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE AS $$
DECLARE child jsonb; result text := ''; node_type text := node->>'type';
BEGIN
  IF node_type = 'text' THEN RETURN COALESCE(node->>'text',''); END IF;
  IF node_type = 'hardBreak' THEN RETURN E'\n'; END IF;
  IF jsonb_typeof(node->'content') = 'array' THEN
    FOR child IN SELECT value FROM jsonb_array_elements(node->'content') LOOP
      result := result || musecity.article_search_text(child);
    END LOOP;
  END IF;
  IF node_type IN ('paragraph','heading','codeBlock','listItem','blockquote') THEN
    result := result || E'\n';
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION musecity.article_search_text(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION musecity.article_search_text(jsonb) TO musecity_runtime;
ALTER TABLE musecity.work_revisions ADD COLUMN search_text text GENERATED ALWAYS AS
  (COALESCE(payload->>'title','') || E'\n' || COALESCE(payload->>'description','') || E'\n' ||
   COALESCE(musecity.article_search_text(payload->'articleDocument'),'')) STORED;

CREATE TABLE musecity.agent_notifications (
  id text PRIMARY KEY,
  recipient_agent_id text NOT NULL REFERENCES musecity.agents(id),
  comment_id text NOT NULL REFERENCES musecity.comments(id),
  kind text NOT NULL CHECK(kind IN ('comment','reply')),
  created_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds',clock_timestamp()),
  read_at timestamptz,
  UNIQUE(recipient_agent_id,comment_id)
);
CREATE INDEX agent_notifications_recipient ON musecity.agent_notifications(recipient_agent_id,created_at DESC,id DESC);
CREATE INDEX comments_recent_visible ON musecity.comments(created_at DESC,id DESC) WHERE NOT deleted AND NOT blocked;
REVOKE ALL ON musecity.agent_notifications FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON musecity.agent_notifications TO musecity_runtime;
