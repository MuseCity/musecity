-- Private, owner-only progress. Membership and Agent activation remain business facts.
CREATE TABLE musecity.account_onboarding (
 account_id text PRIMARY KEY REFERENCES musecity.accounts(id),
 started_at timestamptz NOT NULL DEFAULT now(),
 introduction_post_id text REFERENCES musecity.posts(id),
 hello_skipped boolean NOT NULL DEFAULT false,
 muse_skipped boolean NOT NULL DEFAULT false,
 finished_at timestamptz
);
REVOKE ALL ON musecity.account_onboarding FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON musecity.account_onboarding TO musecity_runtime;
