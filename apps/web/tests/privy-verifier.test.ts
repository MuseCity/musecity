import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { privyVerifier } from "../src/server/auth";

const signingKey = generateKeyPairSync("ec", { namedCurve: "P-256" });
const otherKey = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = {
  ...signingKey.publicKey.export({ format: "jwk" }),
  kid: "current",
};
function token(
  appId: string,
  claims: Record<string, unknown> = {},
  key = signingKey.privateKey,
) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const body =
    encode({ alg: "ES256", typ: "JWT", kid: jwk.kid }) +
    "." +
    encode({
      aud: appId,
      iss: "privy.io",
      sub: "did:privy:local-verifier-test",
      sid: "local-test-session",
      iat: now,
      exp: now + 3600,
      ...claims,
    });
  return (
    body +
    "." +
    sign("sha256", Buffer.from(body), {
      key,
      dsaEncoding: "ieee-p1363",
    }).toString("base64url")
  );
}
function jwks() {
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    expect(new URL(url).pathname).toMatch(/\/apps\/[^/]+\/jwks\.json$/);
    return Response.json({ keys: [jwk] });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());

describe("Privy verification key reuse", () => {
  it("shares the SDK key cache across request-scoped verifiers and concurrent reads", async () => {
    const fetch = jwks();
    const appId = "local-cache-reuse";
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        privyVerifier(
          appId,
          "local-secret",
        )(token(appId, { sub: `did:privy:local-${i}` })),
      ),
    );
    expect(results).toEqual(
      Array.from({ length: 5 }, (_, i) => `did:privy:local-${i}`),
    );
    await privyVerifier(appId, "local-secret")(token(appId));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rebuilds the key cache when either app configuration value changes", async () => {
    const fetch = jwks();
    for (const [appId, secret] of [
      ["local-config-first", "first"],
      ["local-config-first", "second"],
      ["local-config-second", "second"],
    ])
      await privyVerifier(appId, secret)(token(appId));
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("still verifies each token's signature, expiry, issuer and audience with warm keys", async () => {
    const fetch = jwks();
    const appId = "local-every-token";
    const verify = privyVerifier(appId, "local-secret");
    await verify(token(appId));
    for (const invalid of [
      token(appId, { exp: 1 }),
      token(appId, { iss: "wrong-issuer" }),
      token("wrong-audience"),
      token(appId, {}, otherKey.privateKey),
    ])
      await expect(verify(invalid)).rejects.toMatchObject({
        status: 401,
        code: "INVALID_CREDENTIAL",
      });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retains the unavailable-auth response without making a key request", async () => {
    const fetch = jwks();
    await expect(privyVerifier("", "")("anything")).rejects.toMatchObject({
      status: 503,
      code: "AUTH_UNAVAILABLE",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
