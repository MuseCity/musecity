import type { Database } from "./database";
import { audit, type Actor } from "./auth";
import { requireValue } from "./errors";
import { ownedWork, validateContent } from "./works";
import type { RevisionRow } from "./schema";
import type { OriginalityCheck } from "../shared/originality";
import type { WebsiteInput, WebsiteResult } from "./website-verification";

export type OriginalityAttempt = WebsiteInput & {
  workId: string;
  revisionId: string;
  attempt: number;
};
export async function websiteRevision(
  db: Database,
  a: Actor,
  workId: string,
  revisionId: string,
  publishing: boolean,
) {
  const work = await ownedWork(db, a, workId);
  requireValue(
    !work.blocked,
    423,
    "CONTENT_BLOCKED",
    "This creation is restricted.",
  );
  requireValue(
    revisionId === work.draft_revision_id ||
      (!publishing && revisionId === work.published_revision_id),
    409,
    "REVISION_CONFLICT",
    "Verify the current draft or public revision.",
  );
  const revision = await db.one<RevisionRow>(
    "SELECT * FROM musecity.work_revisions WHERE work_id=$1 AND id=$2",
    [workId, revisionId],
  );
  requireValue(revision, 404, "NOT_FOUND", "Revision not found.");
  if (publishing) await validateContent(db, a, revision.payload, true);
  return { work, revision };
}
export async function prepareOriginality(
  db: Database,
  a: Actor,
  workId: string,
  revisionId: string,
  publishing: boolean,
) {
  const { work, revision } = await websiteRevision(
    db,
    a,
    workId,
    revisionId,
    publishing,
  );
  if (revision.payload.type !== "website") {
    requireValue(
      publishing,
      400,
      "VALIDATION_ERROR",
      "Only websites have creator markers.",
    );
    return null;
  }
  const url = revision.payload.websiteUrl!;
  const row = await db.one<{ attempt: number }>(
    `INSERT INTO musecity.work_originality(work_id,revision_id,requested_url,next_attempt)
    VALUES($1,$2,$3,1) ON CONFLICT(revision_id) DO UPDATE SET next_attempt=musecity.work_originality.next_attempt+1
    RETURNING next_attempt AS attempt`,
    [workId, revisionId, url],
  );
  const subjects: WebsiteInput["subjects"] = [];
  if (work.created_by_agent_id) {
    const agent = await db.one<{
      id: string;
      name: string;
      website_marker: string;
    }>(
      "SELECT id,name,website_marker FROM musecity.agents WHERE id=$1 AND owner_account_id=$2",
      [work.created_by_agent_id, a.account.id],
    );
    if (agent)
      subjects.push({
        kind: "agent",
        id: agent.id,
        name: agent.name,
        marker: agent.website_marker,
      });
  }
  subjects.push({
    kind: "account",
    id: a.account.id,
    name: a.account.name,
    marker: a.account.website_marker,
  });
  return {
    workId,
    revisionId,
    url,
    subjects,
    attempt: row!.attempt,
  } satisfies OriginalityAttempt;
}
// Increment in the short preflight transaction. Throwing would roll back the
// counter, so a rejected manual check is reported after this transaction commits.
export async function originalityBudget(db: Database, a: Actor) {
  const slot = Math.floor(Date.now() / 60000);
  const row = await db.one<{ counter: number }>(
    `INSERT INTO musecity.rate_limits(key,counter,expires_at) VALUES($1,1,now()+interval '2 minutes')
    ON CONFLICT(key) DO UPDATE SET counter=musecity.rate_limits.counter+1 RETURNING counter`,
    [`originality:${a.account.id}:${slot}`],
  );
  return row!.counter <= 10;
}
export async function applyOriginality(
  db: Database,
  a: Actor,
  input: OriginalityAttempt,
  result: WebsiteResult,
  publishing: boolean,
) {
  const { work, revision } = await websiteRevision(
    db,
    a,
    input.workId,
    input.revisionId,
    publishing,
  );
  requireValue(
    revision.payload.websiteUrl === input.url &&
      a.account.id === input.subjects.find((s) => s.kind === "account")?.id,
    409,
    "REVISION_CONFLICT",
    "The website being verified changed.",
  );
  requireValue(
    !result.subject ||
      result.subject.id === a.account.id ||
      result.subject.id === work.created_by_agent_id,
    409,
    "REVISION_CONFLICT",
    "The creator being verified changed.",
  );
  await db.query(
    `UPDATE musecity.work_originality SET applied_attempt=$3,status=$4,reason=$5,final_url=$6,subject_kind=$7,subject_agent_id=$8,checked_at=$9
    WHERE work_id=$1 AND revision_id=$2 AND applied_attempt<$3`,
    [
      input.workId,
      input.revisionId,
      input.attempt,
      result.status,
      result.reason,
      result.finalUrl,
      result.subject?.kind ?? null,
      result.subject?.kind === "agent" ? result.subject.id : null,
      result.checkedAt,
    ],
  );
  await audit(db, a, "work.verify-originality", input.workId);
}
export async function originalityCheck(
  db: Database,
  revisionId: string,
): Promise<OriginalityCheck | null> {
  const result = await db.one<{
    status: "verified" | "failed";
    reason: OriginalityCheck["reason"];
    checked_at: Date;
  }>(
    "SELECT status,reason,checked_at FROM musecity.work_originality WHERE revision_id=$1 AND checked_at IS NOT NULL",
    [revisionId],
  );
  return result
    ? {
        status: result.status,
        reason: result.reason,
        checkedAt: result.checked_at.toISOString(),
      }
    : null;
}
