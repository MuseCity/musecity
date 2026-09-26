import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { draftScopes, scopes, type Scope } from "../src/shared/contracts";
import { article, fixture, reset } from "./helpers";

const clients: Client[] = [];
beforeEach(reset);
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});
async function activate(
  f: ReturnType<typeof fixture>,
  permissions: Scope[] = draftScopes,
  owner = "alice",
) {
  const invitation = await f.call("/me/agent-invitations", {
    token: "fixture:" + owner,
    method: "POST",
    body: { name: "MCP assistant", scopes: permissions, confirmed: true },
  });
  expect(invitation.status).toBe(201);
  const registration = await f.call("/agent-registrations", {
    token: null,
    method: "POST",
    body: {
      name: "MCP assistant",
      requestedScopes: permissions,
      invitationToken: invitation.data.invitationToken,
    },
  });
  const active = await f.call(
    "/agent-registrations/" + registration.data.registrationId + "/activate",
    {
      token: registration.data.registrationToken,
      method: "POST",
    },
  );
  expect(active.status).toBe(201);
  return {
    id: active.data.agentId as string,
    token: active.data.credential.token as string,
  };
}
async function connect(
  f: ReturnType<typeof fixture>,
  token: string,
  modern = false,
) {
  const client = new Client(
    { name: "musecity-local-acceptance", version: "1.0.0" },
    {
      versionNegotiation: { mode: modern ? { pin: "2026-07-28" } : "legacy" },
    },
  );
  clients.push(client);
  await client.connect(
    new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      requestInit: { headers: { Authorization: "Bearer " + token } },
      fetch: async (url, init) => f.app.fetch(new Request(url, init)),
    }),
  );
  return client;
}
async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
) {
  const response = await client.callTool({ name, arguments: args });
  const text = response.content?.find((part) => part.type === "text");
  if (!text || text.type !== "text") throw new Error("Missing tool result");
  return { response, data: JSON.parse(text.text) };
}
async function control(
  f: ReturnType<typeof fixture>,
  id: string,
  action: string,
) {
  expect(
    (
      await f.call(`/me/agents/${id}/${action}`, {
        method: "POST",
        body: { confirmed: true },
      })
    ).status,
  ).toBe(200);
}

describe("MCP over Streamable HTTP with the real local PostgreSQL API", () => {
  for (const modern of [false, true])
    it(`connects a ${modern ? "2026" : "2025"} SDK client and discovers usable tools and resources`, async () => {
      const f = fixture();
      const agent = await activate(f);
      const client = await connect(f, agent.token, modern);
      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(19);
      expect(tools.tools.map((t) => t.name)).toContain("create_creation");
      for (const name of ["list_feed", "list_neighbors"]) {
        const tool = tools.tools.find((t) => t.name === name)!;
        expect(tool.inputSchema.properties).not.toHaveProperty("ecosystem");
        expect((await call(client, name)).data.httpStatus).toBe(200);
        const invalid = await client.callTool({
          name,
          arguments: { ecosystem: "base" },
        });
        expect(invalid.isError).toBe(true);
      }
      expect(tools.tools.map((t) => t.name)).not.toEqual(
        expect.arrayContaining(["delete_creation", "manage_agent", "request"]),
      );
      expect(JSON.stringify(tools)).not.toContain(agent.token);
      const identity = await call(client, "get_agent");
      expect(identity.data).toMatchObject({
        id: agent.id,
        status: "active",
        scopes: draftScopes,
      });
      expect((await call(client, "list_tags")).data.tags).toHaveLength(6);
      const resources = await client.listResources();
      expect(resources.resources.map((r) => r.uri)).toEqual([
        "http://localhost/skill.md",
        "http://localhost/openapi.json",
      ]);
      const guide = await client.readResource({
        uri: "http://localhost/skill.md",
      });
      expect(guide.contents[0]).toHaveProperty(
        "text",
        expect.stringContaining("/mcp"),
      );
      const schema = await client.readResource({
        uri: "http://localhost/openapi.json",
      });
      expect(schema.contents[0]).toHaveProperty(
        "text",
        expect.stringContaining('"openapi":"3.1.0"'),
      );
    });

  it("creates, reads and edits a private draft with REST-shared idempotency and publication permissions", async () => {
    const f = fixture();
    const agent = await activate(f);
    const client = await connect(f, agent.token);
    const args = { content: article, idempotencyKey: crypto.randomUUID() };
    const created = await call(client, "create_creation", args);
    expect(created.data).toMatchObject({
      status: "draft",
      submittedBy: { id: agent.id },
    });
    const id = created.data.workId;
    expect(
      (await call(client, "get_creation", { id, draft: true })).data.workId,
    ).toBe(id);
    expect((await f.call(`/works/${id}`, { token: null })).status).toBe(404);
    expect(
      (await call(client, "list_my_creations")).data.items.map(
        (w: { workId: string }) => w.workId,
      ),
    ).toEqual([id]);
    expect((await call(client, "create_creation", args)).data.workId).toBe(id);
    expect(
      (
        await f.call("/works", {
          token: agent.token,
          method: "POST",
          body: article,
          key: args.idempotencyKey,
        })
      ).data.workId,
    ).toBe(id);
    expect(
      (
        await call(client, "create_creation", {
          ...args,
          content: { ...article, title: "Different" },
        })
      ).data.error.code,
    ).toBe("IDEMPOTENCY_CONFLICT");
    const publication = await call(client, "publish_creation", {
      id,
      revisionId: created.data.revisionId,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(publication.response.isError).toBe(true);
    expect(publication.data.error.code).toBe("SCOPE_DENIED");
    const editArgs = {
      id,
      baseRevisionId: created.data.revisionId,
      content: { ...article, title: "Updated" },
      idempotencyKey: crypto.randomUUID(),
    };
    expect(
      (await call(client, "edit_creation", editArgs)).data.body.title,
    ).toBe("Updated");
    expect(
      (
        await call(client, "edit_creation", {
          ...editArgs,
          idempotencyKey: crypto.randomUUID(),
        })
      ).data.error.code,
    ).toBe("REVISION_CONFLICT");
    const invalid = await client.callTool({
      name: "create_creation",
      arguments: { ...args, ownerAccountId: "someone-else" },
    });
    expect(invalid.isError).toBe(true);
    const badArticle = await call(client, "create_creation", {
      content: {
        ...article,
        articleDocument: {
          type: "doc",
          content: [{ type: "script", text: "bad" }],
        },
      },
      idempotencyKey: crypto.randomUUID(),
    });
    expect(badArticle.data.error.code).toBe("VALIDATION_ERROR");
    expect(
      (
        await call(client, "create_post", {
          content: { kind: "update", text: "Unapproved" },
          idempotencyKey: crypto.randomUUID(),
        })
      ).data.error.code,
    ).toBe("SCOPE_DENIED");
  });

  it("isolates simultaneous clients, including peer Agents owned by the same person", async () => {
    const f = fixture();
    const agents = [
      await activate(f),
      await activate(f),
      await activate(f, draftScopes, "bob"),
    ];
    const connected = await Promise.all(agents.map((a) => connect(f, a.token)));
    const saved = await Promise.all(
      connected.map((c, i) =>
        call(c, "create_creation", {
          content: { ...article, title: `Private ${i}` },
          idempotencyKey: "shared-test-key",
        }),
      ),
    );
    expect(new Set(saved.map((r) => r.data.workId)).size).toBe(3);
    for (let i = 0; i < connected.length; i++) {
      expect((await call(connected[i], "get_agent")).data.id).toBe(
        agents[i].id,
      );
      expect(
        (
          await call(connected[i], "get_creation", {
            id: saved[(i + 1) % 3].data.workId,
            draft: true,
          })
        ).data.error.code,
      ).toBe("NOT_FOUND");
      expect(
        (await call(connected[i], "list_my_creations")).data.items,
      ).toHaveLength(1);
    }
  });

  it("enforces pause, permission reduction, credential rotation and revocation after connection", async () => {
    const f = fixture();
    const agent = await activate(f, [...scopes]);
    const client = await connect(f, agent.token, true);
    const draft = await call(client, "create_creation", {
      content: article,
      idempotencyKey: crypto.randomUUID(),
    });
    const publish = {
      id: draft.data.workId,
      revisionId: draft.data.revisionId,
      idempotencyKey: crypto.randomUUID(),
    };
    expect((await call(client, "publish_creation", publish)).data.status).toBe(
      "published",
    );
    await control(f, agent.id, "pause");
    expect((await call(client, "get_agent")).data.status).toBe("paused");
    expect((await call(client, "list_tags")).data.error.code).toBe(
      "AGENT_PAUSED",
    );
    await control(f, agent.id, "resume");
    expect((await call(client, "list_tags")).data.tags).toHaveLength(6);
    expect(
      (
        await f.call(`/me/agents/${agent.id}`, {
          method: "PATCH",
          body: { scopes: draftScopes, confirmed: true },
        })
      ).status,
    ).toBe(200);
    expect(
      (await call(client, "publish_creation", publish)).data.error.code,
    ).toBe("SCOPE_DENIED");
    const rotated = await f.call(`/me/agents/${agent.id}/credentials/rotate`, {
      method: "POST",
      body: { confirmed: true },
    });
    expect(rotated.status).toBe(200);
    await expect(call(client, "get_agent")).rejects.toThrow();
    const next = await connect(f, rotated.data.credential.token);
    expect((await call(next, "get_agent")).data.id).toBe(agent.id);
    await control(f, agent.id, "revoke");
    await expect(call(next, "get_agent")).rejects.toThrow();
    await expect(connect(f, rotated.data.credential.token)).rejects.toThrow();
  });

  it("uses real community writes and image validation through the shared API", async () => {
    const f = fixture();
    expect(
      (
        await f.call("/me", {
          method: "PATCH",
          body: { name: "Alice", bio: "", avatarMediaId: null, join: true },
        })
      ).status,
    ).toBe(200);
    const agent = await activate(f, [...scopes]);
    const client = await connect(f, agent.token);
    const post = await call(client, "create_post", {
      content: { kind: "update", text: "Hello" },
      idempotencyKey: crypto.randomUUID(),
    });
    expect(post.response.isError).not.toBe(true);
    expect(post.data.owner).not.toHaveProperty("ecosystems");
    for (const name of ["list_feed", "list_neighbors"]) {
      const page = await call(client, name);
      expect(page.data.items).toHaveLength(1);
      expect(JSON.stringify(page.data)).not.toContain('"ecosystems":');
    }
    const edited = await call(client, "edit_post", {
      id: post.data.id,
      revision: post.data.revision,
      content: { kind: "update", text: "Hello again" },
      idempotencyKey: crypto.randomUUID(),
    });
    expect(edited.data.text).toBe("Hello again");
    expect(
      (await call(client, "get_post", { id: post.data.id })).data.text,
    ).toBe("Hello again");
    const reply = await call(client, "reply", {
      kind: "post",
      id: post.data.id,
      text: "A reply",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(reply.response.isError).not.toBe(true);
    expect(
      (await call(client, "list_comments", { kind: "post", id: post.data.id }))
        .data.items,
    ).toHaveLength(1);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DQAAAEgQGADgLFJAAAAABJRU5ErkJggg==",
      "base64",
    );
    const upload = await call(client, "create_media_upload", {
      mimeType: "image/png",
      byteSize: png.length,
      purpose: "avatar",
    });
    expect(upload.response.isError).not.toBe(true);
    const uploaded = await f.app.request(
      "http://localhost" + upload.data.uploadUrl,
      {
        method: "PUT",
        headers: {
          "Content-Type": "image/png",
          "X-Upload-Token": upload.data.uploadToken,
        },
        body: png,
      },
    );
    expect(uploaded.status).toBe(200);
    expect(
      (
        await call(client, "complete_media_upload", {
          id: upload.data.mediaId,
          idempotencyKey: crypto.randomUUID(),
        })
      ).response.isError,
    ).not.toBe(true);
    expect(
      (await call(client, "get_media", { id: upload.data.mediaId })).data
        .status,
    ).toBe("ready");
    expect(
      (await call(client, "get_media", { id: upload.data.mediaId })).data,
    ).toMatchObject({
      purpose: "avatar",
      width: 1,
      height: 1,
      mimeType: "image/webp",
    });
  });

  it("rejects unsupported origins, hosts, credentials, oversized bodies and invalid protocol requests", async () => {
    const f = fixture();
    const agent = await activate(f);
    const headers = {
      Authorization: "Bearer " + agent.token,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });
    const request = (
      extra: Record<string, string> = {},
      url = "http://localhost/mcp",
      payload = body,
    ) =>
      f.app.request(url, {
        method: "POST",
        headers: { ...headers, ...extra },
        body: payload,
      });
    expect((await request({ Origin: "https://evil.example" })).status).toBe(
      403,
    );
    expect((await request({}, "http://evil.example/mcp")).status).toBe(403);
    expect(
      (await request({ Authorization: "Bearer fixture:alice" })).status,
    ).toBe(403);
    expect(
      (await request({ Authorization: "Bearer mcr_not-active" })).status,
    ).toBe(403);
    expect(
      (await request({ Authorization: "Bearer mca_invalid" })).status,
    ).toBe(401);
    const anonymous = await f.app.request("http://localhost/mcp", {
      method: "POST",
      headers: { Cookie: "privy-token=fixture:alice" },
      body,
    });
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("www-authenticate")).toContain("Bearer");
    expect(
      (await request({}, undefined, "x".repeat(1024 * 1024 + 1))).status,
    ).toBe(413);
    expect((await request({}, undefined, "{")).status).toBe(400);
    expect(
      (await request({ "MCP-Protocol-Version": "not-supported" })).status,
    ).toBe(400);
    const get = await f.app.request("http://localhost/mcp", {
      headers: { Accept: "text/event-stream" },
    });
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
    const valid = await request();
    expect(valid.status).toBe(200);
    expect(valid.headers.has("mcp-session-id")).toBe(false);
    for (const response of [anonymous, get, valid]) {
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("x-request-id")).toMatch(/^req_/);
    }
  });
});
