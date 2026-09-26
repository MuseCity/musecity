export type LocalDatabase = "musecity" | "musecity_test" | "musecity_e2e";

// Check before opening a connection, especially before migrations or TRUNCATE.
export function assertLocalTarget(
  value: string,
  database: LocalDatabase,
  role: "musecity_admin" | "musecity_app",
) {
  const url = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "65433" ||
    url.pathname !== "/" + database ||
    decodeURIComponent(url.username) !== role ||
    !url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Refusing database target: expected the isolated Musecity local database.",
    );
  }
  return value;
}
