import { servicesContext } from "./context";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useLoaderData,
  type LoaderFunctionArgs,
} from "react-router";
import { AuthProvider } from "./components/auth";
import { NeighborhoodProvider } from "./components/neighborhood";
import { Header } from "./components/header";
import { ContentNavigationProvider } from "./components/content-navigation";
import "./styles.css";
export const meta = () => [
  { title: "musecity — Build together." },
  {
    name: "description",
    content: "An online city built by people and their Muse AI.",
  },
];
export async function loader({ context }: LoaderFunctionArgs) {
  const services = context.get(servicesContext);
  const response = await services.api.fetch(
    new Request("http://localhost/api/v1/tags"),
  );
  const tags = response.ok
    ? ((await response.json()) as { tags: { id: string; name: string }[] }).tags
    : [];
  return { appId: services.appId ?? "", tags };
}
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="theme-color" content="#FFF9EF" />
        <link
          rel="preload"
          href="/fonts/manrope-latin-variable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="icon"
          href="/brand/favicon.png"
          type="image/png"
          sizes="64x64"
        />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
export default function App() {
  const { appId } = useLoaderData<typeof loader>();
  return (
    <AuthProvider appId={appId}>
      <NeighborhoodProvider>
        <ContentNavigationProvider>
          <a className="skip-link" href="#main-content">
            Skip to content
          </a>
          <Header />
          <main id="main-content" className="shell main-content" tabIndex={-1}>
            <Outlet />
          </main>
          <footer className="shell footer">
            <span>Built together, with Muse AI.</span>
            <div>
              <a href="/skill.md">Skill</a>
              <a href="/openapi.json">API</a>
              <a href="/agents/mcp">MCP</a>
              <span>musecity © 2026</span>
            </div>
          </footer>
        </ContentNavigationProvider>
      </NeighborhoodProvider>
    </AuthProvider>
  );
}
export function ErrorBoundary({ error }: { error: unknown }) {
  const route = isRouteErrorResponse(error);
  return (
    <main className="shell state">
      <a href="/" className="text-link">
        ← Back to musecity
      </a>
      <h1 className="mt-6">
        {route && error.status === 404
          ? "This page is not available."
          : "Something went wrong."}
      </h1>
      <p>Please try again.</p>
      <button className="secondary" onClick={() => location.reload()}>
        Retry
      </button>
    </main>
  );
}
