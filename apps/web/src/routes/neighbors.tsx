import {
  Form,
  Link,
  replace,
  useLoaderData,
  useLocation,
  type LoaderFunctionArgs,
} from "react-router";
import { servicesContext } from "../context";
import { retiredEcosystemPath } from "../shared/content-navigation";
import {
  Avatar,
  QueryState,
  useNeighborhoodPage,
  LoadMore,
} from "../components/neighborhood";
import { Empty } from "../components/ui";
import type { Page, Profile } from "../shared/contracts";
export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const cleaned = retiredEcosystemPath(url);
  if (cleaned) throw replace(cleaned);
  const r = await context
    .get(servicesContext)
    .api.fetch(new Request(new URL("/api/v1/neighbors" + url.search, url)));
  return r.ok ? (r.json() as Promise<Page<Profile>>) : null;
}
export const meta = () => [{ title: "Meet your neighbors — musecity" }];
export default function Neighbors() {
  const location = useLocation();
  return <Directory key={location.key} />;
}
function Directory() {
  const initial = useLoaderData<typeof loader>(),
    location = useLocation(),
    query = useNeighborhoodPage<Profile>(
      "/neighbors" + location.search,
      initial ?? undefined,
    ),
    params = new URLSearchParams(location.search);
  return (
    <>
      <div className="page-top">
        <div>
          <div className="eyebrow">GOOD COMPANY STARTS HERE</div>
          <h1>Meet your neighbors.</h1>
          <p>
            Find people with shared interests, useful skills, and something to
            make.
          </p>
        </div>
        <Link className="secondary" to="/move-in">
          Introduce yourself
        </Link>
      </div>
      <Form className="neighbor-search" method="get">
        <label className="field">
          <span className="sr-only">Search neighbors</span>
          <input
            name="q"
            placeholder="Search names, interests, or ways to help…"
            maxLength={120}
            defaultValue={params.get("q") ?? ""}
          />
        </label>
        <button className="primary">Search</button>
      </Form>
      <QueryState busy={query.busy} error={query.error} retry={query.reload} />
      {!query.busy &&
        !query.error &&
        (query.data?.items.length ? (
          <div className="neighbor-grid">
            {query.data.items.map((p) => (
              <article className="neighbor-card" key={p.id}>
                <div className="flex items-center gap-3">
                  <Avatar person={p} large />
                  <div>
                    <Link className="resident-name" to={"/u/" + p.handle}>
                      {p.name}
                    </Link>
                  </div>
                </div>
                <p className="neighbor-bio">
                  {p.bio || "A new face in musecity."}
                </p>
                {p.workingOn && (
                  <div className="neighbor-detail">
                    <span>Working on</span>
                    <p>{p.workingOn}</p>
                  </div>
                )}
                {p.canHelp && (
                  <div className="neighbor-detail">
                    <span>Can lend a hand with</span>
                    <p>{p.canHelp}</p>
                  </div>
                )}
                <Link className="text-link mt-auto" to={"/u/" + p.handle}>
                  Visit home →
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <Empty title="There’s room for your people here.">
            <p>
              {params.get("q")
                ? "Try another name or interest."
                : "Set up your public home to join Neighbors. Saying hello is optional."}
            </p>
            <Link className="text-link inline-block mt-4" to="/move-in">
              Set up my home →
            </Link>
          </Empty>
        ))}
      <LoadMore
        next={query.data?.nextCursor}
        busy={query.moreBusy}
        error={query.moreError}
        onClick={() => void query.more()}
      />
    </>
  );
}
