import { useCallback, useRef } from "react";
import { useAuth } from "./auth";
export class ClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, options);
  const data = (await response.json()) as T & {
    error?: { message?: string; code?: string };
  };
  if (!response.ok)
    throw new ClientError(
      data.error?.message ?? "Something went wrong.",
      response.status,
      data.error?.code ?? "UNKNOWN",
    );
  return data;
}
export function useApi() {
  const auth = useAuth();
  const pending = useRef({
    user: auth.userId,
    keys: new Map<string, string>(),
  });
  if (pending.current.user !== auth.userId)
    pending.current = { user: auth.userId, keys: new Map() };
  return useCallback(
    async <T>(path: string, body?: unknown, method?: string): Promise<T> => {
      const token = await auth.token();
      if (!token)
        throw new ClientError("Please sign in again.", 401, "AUTH_REQUIRED");
      const headers: Record<string, string> = {
        Authorization: "Bearer " + token,
      };
      const verb = method ?? (body === undefined ? "GET" : "POST");
      const operation = verb + path + JSON.stringify(body);
      if (verb !== "GET") {
        const key = pending.current.keys.get(operation) ?? crypto.randomUUID();
        pending.current.keys.set(operation, key);
        if (pending.current.keys.size > 20)
          pending.current.keys.delete(
            pending.current.keys.keys().next().value!,
          );
        headers["Idempotency-Key"] = key;
      }
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const result = await request<T>("/api/v1" + path, {
        method: verb,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (verb !== "GET") {
        pending.current.keys.delete(operation);
        window.dispatchEvent(new Event("neighborhood-change"));
      }
      return result;
    },
    [auth.token, auth.userId],
  );
}
export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please retry.";
