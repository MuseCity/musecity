import type { LoaderFunctionArgs } from "react-router";
import { servicesContext } from "./context";
import type { CommentView, Page } from "./shared/contracts";

export async function publicRead<T>(
  { context, request }: LoaderFunctionArgs,
  path: string,
): Promise<T> {
  const response = await context
    .get(servicesContext)
    .api.fetch(new Request(new URL("/api/v1" + path, request.url)));
  if (!response.ok)
    throw new Response("Content unavailable", { status: response.status });
  return response.json() as Promise<T>;
}
export function publicComments(
  args: LoaderFunctionArgs,
  kind: "works" | "posts",
  id: string,
) {
  const url = args.url,
    params = new URLSearchParams();
  const cursor = url.searchParams.get("commentCursor"),
    focus = url.searchParams.get("comment");
  if (cursor) params.set("cursor", cursor);
  else if (focus) params.set("focus", focus);
  return publicRead<Page<CommentView>>(
    args,
    `/${kind}/${id}/comments?${params}`,
  );
}
