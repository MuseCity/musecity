import {
  ContentKinds,
  CreationFormats,
  useContentSource,
} from "../components/content-navigation";
import {
  contentKind,
  publicContentParams,
  retiredEcosystemPath,
} from "../shared/content-navigation";
import { Bot } from "lucide-react";
import {
  Link,
  replace,
  useLoaderData,
  useLocation,
  useNavigate,
  type LoaderFunctionArgs,
} from "react-router";
import { servicesContext } from "../context";
import type {
  NeighborProfile,
  Page,
  CommunityItem,
  Profile,
} from "../shared/contracts";
import {
  useNeighborhoodData,
  useNeighborhoodPage,
  Avatar,
  RelationshipActions,
  CommunityCard,
  QueryState,
  LoadMore,
} from "../components/neighborhood";
import { Empty } from "../components/ui";
export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const cleaned = retiredEcosystemPath(new URL(request.url));
  if (cleaned) throw replace(cleaned);
  const api = context.get(servicesContext).api;
  const [p, f] = await Promise.all([
    api.fetch(
      new Request(new URL("/api/v1/neighbors/" + params.handle, request.url)),
    ),
    api.fetch(
      new Request(
        new URL(
          "/api/v1/feed?" +
            publicContentParams(new URL(request.url).search, params.handle),
          request.url,
        ),
      ),
    ),
  ]);
  if (!p.ok) throw new Response("Neighbor unavailable", { status: p.status });
  return {
    profile: (await p.json()) as NeighborProfile,
    page: f.ok ? ((await f.json()) as Page<CommunityItem>) : undefined,
  };
}
export default function ProfilePage() {
  const location = useLocation();
  return <Home key={location.key} />;
}
function Home() {
  const initial = useLoaderData<typeof loader>(),
    navigate = useNavigate(),
    location = useLocation(),
    state = useContentSource(),
    profile = useNeighborhoodData<NeighborProfile>(
      "/neighbors/" + initial.profile.handle,
      initial.profile,
    ),
    feed = useNeighborhoodPage<CommunityItem>(
      "/feed?" + publicContentParams(location.search, initial.profile.handle),
      initial.page,
    ),
    me = useNeighborhoodData<Profile>("/me", undefined, true);
  const p = profile.data;
  return (
    <>
      <QueryState
        busy={profile.busy}
        error={profile.error}
        retry={profile.reload}
      />
      {!profile.busy && p && (
        <>
          <section className="resident-home">
            <div className="home-cover">
              <span>AT HOME IN MUSECITY</span>
            </div>
            <div className="home-profile">
              <Avatar person={p} large />
              <div className="home-identity">
                <div>
                  <h1>{p.name}</h1>
                  <p className="text-muted">@{p.handle}</p>
                </div>
              </div>
              <p className="home-bio">
                {p.bio || "Getting settled in musecity."}
              </p>
              <div className="home-actions">
                <RelationshipActions
                  person={p}
                  onBlock={() => void navigate("/neighbors")}
                />
                {me.data?.id === p.id && (
                  <>
                    <Link className="text-link" to="/me/content">
                      Manage content
                    </Link>
                    <Link className="text-link" to="/me/agents">
                      Manage agents
                    </Link>
                  </>
                )}
              </div>
              {!p.joinedAt && me.data?.id === p.id && (
                <div className="welcome-note">
                  <p>Introduce yourself to join the neighbor directory.</p>
                  <Link className="text-link" to="/move-in">
                    Move in →
                  </Link>
                </div>
              )}
              {(p.workingOn || p.canHelp) && (
                <div className="home-details">
                  {p.workingOn && (
                    <div>
                      <span>Currently working on</span>
                      <p>{p.workingOn}</p>
                    </div>
                  )}
                  {p.canHelp && (
                    <div>
                      <span>Happy to help with</span>
                      <p>{p.canHelp}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
          {p.agents.length > 0 && (
            <section className="household-agents">
              <div className="section-heading">
                <h2>Agents in this household</h2>
                <span>Always connected to {p.name}</span>
              </div>
              <div className="agent-mini-grid">
                {p.agents.map((a) => (
                  <article key={a.id} className="public-agent">
                    <Bot size={22} />
                    <div>
                      <h3>{a.name}</h3>
                      <span>{p.name}’s Agent</span>
                      <p>
                        {a.description ||
                          "Helping their person make good things."}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
          <div className="section-heading">
            <h2>From this household</h2>
            <span>Public creations, updates, and help requests</span>
          </div>
          <ContentKinds />
          {contentKind(new URLSearchParams(location.search)) === "work" && (
            <CreationFormats />
          )}
          <QueryState busy={feed.busy} error={feed.error} retry={feed.reload} />
          {!feed.busy &&
            !feed.error &&
            (feed.data?.items.length ? (
              <div className="home-stream">
                {feed.data.items.map((item) => (
                  <CommunityCard item={item} key={item.id} />
                ))}
              </div>
            ) : (
              <Empty title="A home with things to come.">
                <p>Public content in this category will appear here.</p>
                {me.data?.id === p.id && (
                  <Link
                    className="text-link inline-block mt-4"
                    state={state}
                    to="/share"
                  >
                    Share something →
                  </Link>
                )}
              </Empty>
            ))}
          <LoadMore
            next={feed.data?.nextCursor}
            busy={feed.moreBusy}
            error={feed.moreError}
            onClick={() => void feed.more()}
          />
        </>
      )}
    </>
  );
}
