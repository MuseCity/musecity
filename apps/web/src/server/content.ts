import type { Database } from "./database";
import type { Actor } from "./auth";
import { requireValue } from "./errors";
import { decodeCursor, page } from "./community";
import {
  workTypes,
  helpStatuses,
  type ManagedContent,
  type Page,
} from "../shared/contracts";

// This household-wide view is deliberately unavailable to Agent credentials.
export async function myContent(
  db: Database,
  actor: Actor,
  params: URLSearchParams,
): Promise<Page<ManagedContent>> {
  requireValue(
    !actor.agent,
    403,
    "HUMAN_REQUIRED",
    "Only the account owner can manage all content.",
  );
  const kind = params.get("kind"),
    status = params.get("status"),
    help = params.get("help"),
    type = params.get("type");
  requireValue(
    [...params.keys()].every((key) =>
      ["kind", "status", "help", "type", "cursor"].includes(key),
    ) &&
      (!kind || ["work", "update", "help"].includes(kind)) &&
      (!status ||
        (kind === "work" &&
          ["draft", "published", "unpublished"].includes(status))) &&
      (!type ||
        (kind === "work" &&
          workTypes.includes(type as (typeof workTypes)[number]))) &&
      (!help ||
        (kind === "help" &&
          helpStatuses.includes(help as (typeof helpStatuses)[number]))),
    400,
    "INVALID_FILTER",
    "Choose filters for the selected content category.",
  );
  const filter = JSON.stringify([
    "my-content",
    actor.account.id,
    kind,
    status,
    help,
    type,
  ]);
  const cursor = decodeCursor(params.get("cursor"), filter);
  const rows = await db.query<{ item: ManagedContent }>(
    `
    WITH entries AS (
      SELECT w.id,'work' AS kind,w.updated_at,w.created_by_agent_id AS agent_id,w.blocked,
        jsonb_build_object('status',w.status,'format',r.payload->>'type','title',r.payload->>'title',
          'excerpt',left(COALESCE(r.payload->>'description',''),240),'revisionId',r.id,
          'publishedRevisionId',w.published_revision_id,
          'pendingChanges',w.status='published' AND r.id IS DISTINCT FROM w.published_revision_id) AS detail
      FROM musecity.works w JOIN musecity.work_revisions r ON r.id=w.draft_revision_id
      WHERE w.owner_account_id=$1 AND w.status<>'deleted' AND ($2::text IS NULL OR $2='work')
        AND ($3::text IS NULL OR w.status=$3) AND ($5::text IS NULL OR r.payload->>'type'=$5)
      UNION ALL
      SELECT p.id,p.kind,p.updated_at,p.agent_id,p.blocked,
        jsonb_build_object('status','published','title',CASE WHEN p.kind='help' THEN p.title ELSE left(p.text,100) END,
          'excerpt',left(p.text,240),'revision',p.revision,'helpStatus',p.help_status)
      FROM musecity.posts p WHERE p.owner_account_id=$1 AND NOT p.deleted
        AND ($2::text IS NULL OR p.kind=$2) AND ($4::text IS NULL OR p.help_status=$4)
    ) SELECT e.detail || jsonb_build_object('id',e.id,'kind',e.kind,'updatedAt',e.updated_at,'restricted',e.blocked,
      'agent',CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('id',a.id,'name',a.name) END) AS item
    FROM entries e LEFT JOIN musecity.agents a ON a.id=e.agent_id
    WHERE ($6::timestamptz IS NULL OR (e.updated_at,e.id)<($6,$7))
    ORDER BY e.updated_at DESC,e.id DESC LIMIT 21`,
    [
      actor.account.id,
      kind,
      status,
      help,
      type,
      cursor?.time ?? null,
      cursor?.id ?? null,
    ],
  );
  return page(
    rows.map((row) => row.item),
    filter,
    (item) => item.updatedAt,
  );
}
