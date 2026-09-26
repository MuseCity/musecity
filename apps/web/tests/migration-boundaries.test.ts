import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalTarget } from "../scripts/local-target";
import { identity } from "../src/server/auth";
import { fixture, reset } from "./helpers";

describe("migration isolation", () => {
  it("rejects the old port, development reset, wrong roles and remote targets", () => {
    const valid =
      "postgres://musecity_admin:test@127.0.0.1:65433/musecity_test";
    expect(assertLocalTarget(valid, "musecity_test", "musecity_admin")).toBe(
      valid,
    );
    for (const url of [
      valid.replace("65433", "65432"),
      valid.replace("/musecity_test", "/musecity"),
      valid.replace("/musecity_test", "/other_project_test"),
      valid.replace("musecity_admin", "postgres"),
      valid.replace("127.0.0.1", "db.example.supabase.co"),
      valid + "?host=elsewhere",
    ])
      expect(() =>
        assertLocalTarget(url, "musecity_test", "musecity_admin"),
      ).toThrow();
  });

  it("rejects every old token before calling Privy, even if a verifier accepts it", async () => {
    const verify = vi.fn(async () => "unexpected-owner");
    for (const prefix of ["bha", "bhr", "bhi", "bhc", "bhu"]) {
      await expect(
        identity(
          new Request("http://localhost", {
            headers: { authorization: `Bearer ${prefix}_old-secret` },
          }),
          verify,
        ),
      ).rejects.toMatchObject({ code: "INVALID_CREDENTIAL" });
    }
    expect(verify).not.toHaveBeenCalled();
  });
});

describe("new credential namespaces through PostgreSQL", () => {
  beforeEach(reset);
  it("issues all five new prefixes and rejects rewritten old credentials in REST and MCP", async () => {
    const f = fixture();
    const invitation = await f.call("/me/agent-invitations", {
      method: "POST",
      body: {
        name: "Muse",
        scopes: ["content:read", "content:write"],
        confirmed: true,
      },
    });
    expect(invitation.status).toBe(201);
    expect(invitation.data.invitationToken).toMatch(/^mci_/);
    const self = await f.call("/agent-registrations", {
      token: null,
      method: "POST",
      body: {
        name: "Self",
        requestedScopes: ["content:read", "content:write"],
      },
    });
    expect(self.data.claimPath).toContain("#token=mcc_");
    const reg = await f.call("/agent-registrations", {
      token: null,
      method: "POST",
      body: {
        name: "Muse",
        requestedScopes: ["content:read", "content:write"],
        invitationToken: invitation.data.invitationToken,
      },
    });
    expect(reg.data.registrationToken).toMatch(/^mcr_/);
    const path = "/agent-registrations/" + reg.data.registrationId;
    expect(
      (
        await f.call(path, {
          token: reg.data.registrationToken.replace("mcr_", "bhr_"),
        })
      ).status,
    ).not.toBe(200);
    const active = await f.call(path + "/activate", {
      method: "POST",
      token: reg.data.registrationToken,
    });
    const token = active.data.credential.token;
    expect(token).toMatch(/^mca_/);
    const old = token.replace("mca_", "bha_");
    expect((await f.call("/agent", { token: old })).status).toBe(401);
    const mcp = await f.app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        authorization: "Bearer " + old,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "migration-test", version: "1" },
        },
      }),
    });
    expect(mcp.status).toBe(403);
    expect(((await mcp.json()) as { error: { code: string } }).error.code).toBe(
      "SCOPE_DENIED",
    );
    const upload = await f.call("/media/uploads", {
      method: "POST",
      token,
      body: { mimeType: "image/png", byteSize: 100 },
    });
    expect(upload.data.uploadToken).toMatch(/^mcu_/);
  });
});
