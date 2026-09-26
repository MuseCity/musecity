import { z } from "zod";
import type { Profile } from "./contracts";

// Explicit timezone keeps SSR and browsers consistent, including after a reload.
export const governanceDate = (value: string) =>
  new Date(value).toISOString().slice(0, 16).replace("T", " ") + " UTC";

export const governanceRules = {
  chainId: 4663,
  tokenAddress: "0x0379E228F6887c6F18bf394042ECAF81B308cb2e",
  tokenSymbol: "MUSEGOD",
  tokenDecimals: 18,
  threshold: "100000000000000000000000",
  ordinaryWeight: 1,
  memberWeight: 10,
  quorum: 5,
  announcementHours: 24,
  votingHours: 72,
} as const;
export type GovernanceRules = typeof governanceRules;
export const voteChoices = ["for", "against", "abstain"] as const;
export type VoteChoice = (typeof voteChoices)[number];
export const voteSchema = z.object({ choice: z.enum(voteChoices) }).strict();
export const proposalSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(10).max(10000),
  })
  .strict();
export const cancelProposalSchema = z
  .object({
    reason: z.string().trim().min(5).max(1000),
    confirmed: z.literal(true),
  })
  .strict();
export const executionSchema = z
  .object({
    result: z.string().trim().min(5).max(5000),
    confirmed: z.literal(true),
  })
  .strict();
export type Membership = {
  wallet: { id: string; address: string } | null;
  balance: string | null;
  formalMember: boolean;
  weight: number;
  checkedAt: string;
  rules: GovernanceRules;
};
export type Vote = {
  choice: VoteChoice;
  weight: number;
  checkedAt: string;
};
export type Proposal = {
  id: string;
  title: string;
  body: string;
  owner: Profile;
  createdAt: string;
  startsAt: string;
  endsAt: string;
  serverTime: string;
  rules: GovernanceRules;
  status: "announcement" | "voting" | "passed" | "failed" | "cancelled";
  cancellation: { reason: string; at: string } | null;
  execution: { result: string; at: string } | null;
  results: {
    participants: number;
    for: number;
    against: number;
    abstain: number;
  };
  myVote: Vote | null;
  canCancel: boolean;
  canRecordExecution: boolean;
};
