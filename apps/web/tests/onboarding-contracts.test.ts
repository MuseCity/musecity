import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { openapi } from "../src/server/discovery";
import { draftScopes } from "../src/shared/contracts";
import { withDatabase } from "../src/server/database";
import { config, fixture, reset } from "./helpers";

const doc = openapi("http://127.0.0.1:5190");
function responseSchema(path: string, method: string, status: number) {
  const operation = (doc.paths[path] as any)[method];
  const schema = operation.responses[status].content["application/json"].schema;
  return z.fromJSONSchema(
    JSON.parse(
      JSON.stringify({ ...schema, $defs: doc.components.schemas }).replaceAll(
        "#/components/schemas/",
        "#/$defs/",
      ),
    ),
  );
}
function check(
  path: string,
  method: string,
  result: { status: number; data: unknown },
  status: number,
) {
  expect(result.status).toBe(status);
  expect(
    responseSchema(path, method, status).safeParse(result.data).success,
  ).toBe(true);
}
beforeEach(reset);
describe("onboarding OpenAPI against real local API responses", () => {
  it("describes human Move-in progress and atomic introduction responses", async () => {
    const f = fixture();
    check("/me/onboarding", "get", await f.call("/me/onboarding"), 200);
    await f.call("/me", {
      method: "PATCH",
      body: {
        name: "Contract owner",
        bio: "",
        avatarMediaId: null,
        join: true,
      },
    });
    check(
      "/me/onboarding",
      "patch",
      await f.call("/me/onboarding", {
        method: "PATCH",
        body: { action: "start" },
      }),
      200,
    );
    check(
      "/me/onboarding/posts",
      "post",
      await f.call("/me/onboarding/posts", {
        method: "POST",
        body: { text: "Hello from the owner" },
      }),
      201,
    );
    check("/me/onboarding", "get", await f.call("/me/onboarding"), 200);
    for (const [path, method] of [
      ["/me/onboarding", "patch"],
      ["/me/onboarding/posts", "post"],
    ]) {
      const operation = (doc.paths[path!] as any)[method!];
      expect(
        operation.parameters.some(
          (parameter: any) =>
            parameter.name === "Idempotency-Key" && parameter.required,
        ),
      ).toBe(true);
      expect(operation.requestBody.required).toBe(true);
    }
  });
  it("validates both examples and rejects an inconsistent registration branch", () => {
    const response = (doc.paths["/agent-registrations"] as any).post
      .responses[201];
    const schema = responseSchema("/agent-registrations", "post", 201);
    for (const example of Object.values(
      response.content["application/json"].examples,
    ) as any[])
      expect(schema.safeParse(example.value).success).toBe(true);
    const invited = response.content["application/json"].examples.invited.value;
    expect(
      schema.safeParse({ ...invited, status: "pending_claim" }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ ...invited, registrationToken: undefined }).success,
    ).toBe(false);
  });
  it("describes the complete self-service claim, activation and diagnostic lifecycle", async () => {
    const f = fixture();
    const reg = await f.call("/agent-registrations", {
      token: null,
      method: "POST",
      body: { name: "Contract agent", requestedScopes: draftScopes },
    });
    check("/agent-registrations", "post", reg, 201);
    expect(reg.data.status).toBe("pending_claim");
    const token = reg.data.registrationToken;
    const claimToken = new URL(
      "http://127.0.0.1:5190" + reg.data.claimPath,
    ).hash.slice(7);
    const path = "/agent-registrations/" + reg.data.registrationId;
    check(
      "/agent-registrations/claim-preview",
      "post",
      await f.call("/agent-registrations/claim-preview", {
        token: null,
        method: "POST",
        body: { claimToken },
      }),
      200,
    );
    const pending = await f.call(path, { token });
    check("/agent-registrations/{id}", "get", pending, 200);
    expect(pending.data).toMatchObject({
      status: "pending_claim",
      approvedScopes: null,
      agentId: null,
    });
    check(
      "/agent-registrations/{id}/activate",
      "post",
      await f.call(path + "/activate", { token, method: "POST" }),
      403,
    );
    check(
      "/agent-registrations/{id}/claim",
      "post",
      await f.call(path + "/claim", {
        method: "POST",
        body: { claimToken, approvedScopes: draftScopes, confirmed: true },
      }),
      200,
    );
    const approved = await f.call(path, { token });
    check("/agent-registrations/{id}", "get", approved, 200);
    expect(approved.data.status).toBe("approved");
    const active = await f.call(path + "/activate", { token, method: "POST" });
    check("/agent-registrations/{id}/activate", "post", active, 201);
    const activated = await f.call(path, { token });
    check("/agent-registrations/{id}", "get", activated, 200);
    expect(activated.data).toMatchObject({
      status: "activated",
      agentId: active.data.agentId,
    });
    check(
      "/agent-registrations/{id}/activate",
      "post",
      await f.call(path + "/activate", { token, method: "POST" }),
      409,
    );
    check(
      "/agent",
      "get",
      await f.call("/agent", { token: active.data.credential.token }),
      200,
    );
    await f.call("/me/agents/" + active.data.agentId + "/pause", {
      method: "POST",
      body: { confirmed: true },
    });
    const paused = await f.call("/agent", {
      token: active.data.credential.token,
    });
    check("/agent", "get", paused, 200);
    expect(paused.data.status).toBe("paused");
  });
  it("describes invited approval, scope denial, cancellation and expiration", async () => {
    const f = fixture();
    const inv = await f.call("/me/agent-invitations", {
      method: "POST",
      body: {
        name: "Invited contract agent",
        scopes: draftScopes,
        confirmed: true,
      },
    });
    check("/me/agent-invitations", "post", inv, 201);
    const body = {
      name: "Invited contract agent",
      requestedScopes: draftScopes,
      invitationToken: inv.data.invitationToken,
    };
    check(
      "/agent-registrations",
      "post",
      await f.call("/agent-registrations", {
        token: null,
        method: "POST",
        body: { ...body, requestedScopes: [...draftScopes, "content:publish"] },
      }),
      422,
    );
    const reg = await f.call("/agent-registrations", {
      token: null,
      method: "POST",
      body,
    });
    check("/agent-registrations", "post", reg, 201);
    expect(reg.data).toMatchObject({ status: "approved", claimPath: null });
    await f.call("/me/agent-registrations/" + reg.data.registrationId, {
      method: "DELETE",
    });
    const cancelled = await f.call(
      "/agent-registrations/" + reg.data.registrationId,
      { token: reg.data.registrationToken },
    );
    check("/agent-registrations/{id}", "get", cancelled, 200);
    expect(cancelled.data.status).toBe("cancelled");
    await withDatabase(config.testAdminUrl, (d) =>
      d.query(
        "UPDATE musecity.registrations SET expires_at=now()-interval '1 second' WHERE id=$1",
        [reg.data.registrationId],
      ),
    );
    check(
      "/agent-registrations/{id}",
      "get",
      await f.call("/agent-registrations/" + reg.data.registrationId, {
        token: reg.data.registrationToken,
      }),
      410,
    );
  });
});
