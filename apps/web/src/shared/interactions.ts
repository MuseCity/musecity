import { z } from "zod";
import type { Attribution, Profile } from "./contracts";

export type InteractionKind = "work" | "post" | "comment";
export const interactionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("vote"),
      value: z.enum(["up", "down"]).nullable(),
    })
    .strict(),
  z.object({ action: z.literal("like"), value: z.boolean() }).strict(),
  z.object({ action: z.literal("save"), value: z.boolean() }).strict(),
]);
export type InteractionInput = z.infer<typeof interactionSchema>;
export type Interactions = {
  up: number;
  down: number;
  likes: number;
  viewer: { vote: "up" | "down" | null; liked: boolean; saved: boolean } | null;
};
export type SavedItem = {
  id: string;
  kind: InteractionKind;
  title: string;
  excerpt: string;
  path: string;
  owner: Profile;
  agent: Attribution;
  savedAt: string;
  interactions: Interactions;
};
