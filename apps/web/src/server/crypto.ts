export const id = (prefix: string) => prefix + "_" + crypto.randomUUID();
export function secret(prefix: string) {
  return (
    prefix +
    "_" +
    Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("")
  );
}
export async function digest(value: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export const future = (seconds: number) =>
  new Date(Date.now() + seconds * 1000);
