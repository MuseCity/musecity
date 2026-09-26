import { z } from "zod";
import { postSchema, type PostView, type Profile } from "./contracts";

export const onboardingActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }).strict(),
  z.object({ action: z.literal("finish") }).strict(),
  z
    .object({
      action: z.enum(["skip", "resume"]),
      step: z.enum(["hello", "muse"]),
    })
    .strict(),
]);
export type OnboardingAction = z.infer<typeof onboardingActionSchema>;
export const introductionSchema = z
  .object({ text: postSchema.shape.text })
  .strict();
export type MoveInStep = "profile" | "hello" | "muse" | "done";
export type OnboardingState = {
  profile: Profile;
  startedAt: string | null;
  finishedAt: string | null;
  introduction: {
    status: "pending" | "skipped" | "complete";
    post: PostView | null;
  };
  muse: {
    status:
      "pending" | "invited" | "awaiting_activation" | "expired" | "activated";
    deferred: boolean;
    agent: { id: string; name: string } | null;
    pending: {
      id: string;
      kind: "invitation" | "registration";
      name: string;
      expiresAt: string;
    } | null;
  };
};
export function nextMoveInStep(state: OnboardingState): MoveInStep {
  if (!state.profile.joinedAt) return "profile";
  if (state.finishedAt) return "done";
  return state.introduction.status === "pending" ? "hello" : "muse";
}
