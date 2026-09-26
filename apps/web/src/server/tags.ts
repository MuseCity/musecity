import type { Database } from "./database";
import { audit, type Actor } from "./auth";
import { id } from "./crypto";
import { requireValue } from "./errors";
import type { Topic } from "../shared/contracts";

export function catalog(db: Database): Promise<Topic[]> {
  return db.query(
    "SELECT id,name FROM musecity.tags WHERE enabled ORDER BY lower(name),id",
  );
}

export async function validateTags(db: Database, tagIds: string[]) {
  if (!tagIds.length) return;
  const enabled = await db.query<Topic>(
    "SELECT id,name FROM musecity.tags WHERE enabled AND id=ANY($1::text[])",
    [tagIds],
  );
  requireValue(
    enabled.length === tagIds.length,
    400,
    "VALIDATION_ERROR",
    "Choose existing, enabled tags.",
  );
}

export async function createTag(
  db: Database,
  actor: Actor,
  name: string,
): Promise<Topic> {
  const rows = await db.query<Topic>(
    "INSERT INTO musecity.tags(id,name) VALUES($1,$2) ON CONFLICT (lower(name)) DO NOTHING RETURNING id,name",
    [id("tag"), name],
  );
  if (rows[0]) {
    await audit(db, actor, "tag.create", rows[0].id);
    return rows[0];
  }
  // A concurrent creator or another spelling joins the same shared tag.
  const existing = await db.one<Topic>(
    "SELECT id,name FROM musecity.tags WHERE lower(name)=lower($1) AND enabled",
    [name],
  );
  requireValue(
    existing,
    409,
    "TAG_UNAVAILABLE",
    "This tag is unavailable. Choose another name.",
  );
  return existing;
}
