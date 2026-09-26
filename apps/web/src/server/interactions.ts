import type { Database } from "./database";
import { audit, type Actor } from "./auth";
import type {
  InteractionInput,
  InteractionKind,
  Interactions,
} from "../shared/interactions";

export async function interactionSummaries(
  db: Database,
  targets: { kind: InteractionKind; id: string }[],
  viewer?: Actor,
): Promise<Map<string, Interactions>> {
  if (!targets.length) return new Map();
  // Agent credentials may read totals, never their owner's personal choices.
  const accountId = viewer && !viewer.agent ? viewer.account.id : null;
  const rows = await db.query<
    Interactions & { kind: InteractionKind; id: string }
  >(
    `SELECT t.kind,t.id,
     count(*) FILTER (WHERE i.vote=1 AND a.status='active')::integer AS up,
     count(*) FILTER (WHERE i.vote=-1 AND a.status='active')::integer AS down,
     count(*) FILTER (WHERE i.liked AND a.status='active')::integer AS likes,
     CASE WHEN $3::text IS NULL THEN NULL ELSE jsonb_build_object(
       'vote',CASE max(i.vote) FILTER (WHERE i.account_id=$3) WHEN 1 THEN 'up' WHEN -1 THEN 'down' ELSE NULL END,
       'liked',COALESCE(bool_or(i.liked) FILTER (WHERE i.account_id=$3),false),
       'saved',COALESCE(bool_or(i.saved_at IS NOT NULL) FILTER (WHERE i.account_id=$3),false)
     ) END AS viewer
     FROM unnest($1::text[],$2::text[]) AS t(kind,id)
     LEFT JOIN musecity.content_interactions i ON i.target_kind=t.kind AND i.target_id=t.id
     LEFT JOIN musecity.accounts a ON a.id=i.account_id
     GROUP BY t.kind,t.id`,
    [targets.map((t) => t.kind), targets.map((t) => t.id), accountId],
  );
  return new Map(
    rows.map(({ kind, id, ...summary }) => [kind + ":" + id, summary]),
  );
}

// Call only after human authentication and current target visibility, in the social-write transaction.
export async function setInteraction(
  db: Database,
  actor: Actor,
  kind: InteractionKind,
  targetId: string,
  input: InteractionInput,
) {
  const column =
    input.action === "vote"
      ? "vote"
      : input.action === "like"
        ? "liked"
        : "saved_at";
  const value =
    input.action === "vote"
      ? input.value === "up"
        ? 1
        : input.value === "down"
          ? -1
          : 0
      : input.value;
  const insertValue =
    input.action === "save"
      ? "CASE WHEN $3::boolean THEN date_trunc('milliseconds',clock_timestamp()) ELSE NULL END"
      : "$3";
  const updateValue =
    input.action === "save"
      ? "CASE WHEN $3::boolean THEN COALESCE(musecity.content_interactions.saved_at,EXCLUDED.saved_at) ELSE NULL END"
      : "EXCLUDED." + column;
  await db.query(
    `INSERT INTO musecity.content_interactions(account_id,${kind}_id,${column}) VALUES($1,$2,${insertValue})
     ON CONFLICT(target_kind,target_id,account_id) DO UPDATE SET ${column}=${updateValue}`,
    [actor.account.id, targetId, value],
  );
  await audit(db, actor, "content." + input.action, targetId);
  return { updated: true };
}
