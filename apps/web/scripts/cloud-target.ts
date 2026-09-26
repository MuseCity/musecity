// Verified against the Musecity dashboard, 2026-09-25. This is public routing metadata.
export const cloudProject = "vlvhfnhmcpeuyoyiapuk";
export const sessionPooler = "aws-0-ap-northeast-2.pooler.supabase.com";

export function assertCloudTarget(
  value: string,
  role: "postgres" | "musecity_worker",
) {
  const url = new URL(value);
  const direct =
    url.hostname === `db.${cloudProject}.supabase.co` && url.username === role;
  const pooled =
    url.hostname === sessionPooler &&
    url.username === `${role}.${cloudProject}`;
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    (!direct && !pooled) ||
    (url.port && url.port !== "5432") ||
    url.pathname !== "/postgres" ||
    !url.password ||
    url.hash ||
    [...url.searchParams.keys()].some((key) => key !== "sslmode") ||
    (url.searchParams.has("sslmode") &&
      url.searchParams.get("sslmode") !== "verify-full")
  )
    throw new Error(
      "Refusing connection outside the verified Musecity project or role.",
    );
  url.searchParams.set("sslmode", "verify-full");
  return url;
}
