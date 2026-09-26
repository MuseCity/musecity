CREATE TABLE musecity.qualification_wallets (
 account_id text PRIMARY KEY REFERENCES musecity.accounts(id),
 privy_wallet_id text NOT NULL UNIQUE,
 address text NOT NULL UNIQUE CHECK(address ~ '^0x[0-9a-f]{40}$'),
 verified_at timestamptz NOT NULL
);
CREATE TABLE musecity.proposals (
 id text PRIMARY KEY,
 owner_account_id text NOT NULL REFERENCES musecity.accounts(id),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
 body text NOT NULL CHECK(length(body) BETWEEN 10 AND 10000),
 rules jsonb NOT NULL,
 created_at timestamptz NOT NULL,
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL CHECK(ends_at > starts_at),
 blocked boolean NOT NULL DEFAULT false,
 cancelled_at timestamptz,
 cancelled_by text REFERENCES musecity.accounts(id),
 cancellation_reason text,
 execution_result text,
 executed_at timestamptz,
 executed_by text REFERENCES musecity.accounts(id)
);
CREATE INDEX proposals_created ON musecity.proposals(created_at DESC,id DESC);
CREATE TABLE musecity.proposal_votes (
 proposal_id text NOT NULL REFERENCES musecity.proposals(id),
 account_id text NOT NULL REFERENCES musecity.accounts(id),
 choice text NOT NULL CHECK(choice IN ('for','against','abstain')),
 weight smallint NOT NULL CHECK(weight IN (1,10)),
 checked_at timestamptz NOT NULL,
 wallet_address text,
 balance numeric(78,0) CHECK(balance >= 0),
 PRIMARY KEY(proposal_id,account_id)
);
ALTER TABLE musecity.reports DROP CONSTRAINT reports_target_kind_check;
ALTER TABLE musecity.reports ADD CONSTRAINT reports_target_kind_check
 CHECK(target_kind IN ('work','post','comment','account','proposal'));
REVOKE ALL ON musecity.qualification_wallets,musecity.proposals,musecity.proposal_votes FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON musecity.qualification_wallets TO musecity_runtime;
GRANT SELECT,INSERT,UPDATE ON musecity.proposals,musecity.proposal_votes TO musecity_runtime;
