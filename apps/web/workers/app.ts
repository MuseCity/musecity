import { servicesContext } from "../src/context";
import { createRequestHandler, RouterContextProvider } from "react-router";
import { createApi, productionServices } from "../src/server/api";
const handler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);
export default {
  async fetch(request, env, ctx) {
    const api = createApi(productionServices(env, ctx));
    const path = new URL(request.url).pathname;
    if (
      path.startsWith("/api/") ||
      path.startsWith("/media/") ||
      ["/skill.md", "/openapi.json", "/mcp"].includes(path)
    )
      return api.fetch(request);
    const context = new RouterContextProvider();
    context.set(servicesContext, { appId: env.PRIVY_APP_ID, api });
    const response = await handler(request, context);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    return response;
  },
} satisfies ExportedHandler<Env>;
