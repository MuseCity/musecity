import {
  ContentKinds,
  useContentSource,
  useFilterLocation,
  ContentFilterLink,
} from "../components/content-navigation";
import { CreationFilters } from "../components/creation-filters";
import {
  contentKind,
  publicContentParams,
  retiredEcosystemPath,
} from "../shared/content-navigation";
import {
  Link,
  replace,
  useLoaderData,
  useLocation,
  type LoaderFunctionArgs,
} from "react-router";
import { ArrowUpRight, Handshake, UsersRound } from "lucide-react";
import { servicesContext } from "../context";
import { useAuth } from "../components/auth";
import {
  useNeighborhoodPage,
  useNeighborhoodData,
  QueryState,
  CommunityCard,
  Avatar,
  LoadMore,
} from "../components/neighborhood";
import { Empty } from "../components/ui";
import type { CommunityItem, Page, Profile } from "../shared/contracts";
import type { OnboardingState } from "../shared/onboarding";
export async function loader({ request, context }: LoaderFunctionArgs) {
  const cleaned = retiredEcosystemPath(new URL(request.url));
  if (cleaned) throw replace(cleaned);
  const url = new URL(request.url),
    api = context.get(servicesContext).api;
  const paths = [
    "/feed?" + publicContentParams(url.search),
    "/neighbors",
    "/feed?kind=help&help=open",
  ];
  const data = await Promise.all(
    paths.map(async (path, i) => {
      if (i === 0 && url.searchParams.get("view") === "following") return null;
      const response = await api.fetch(
        new Request(new URL("/api/v1" + path, url)),
      );
      return response.ok ? response.json() : null;
    }),
  );
  return {
    page: data[0] as Page<CommunityItem> | null,
    neighbors: data[1] as Page<Profile> | null,
    requests: data[2] as Page<CommunityItem> | null,
  };
}
const description = "An online city built by people and their Muse AI.";

export const meta = () => [
  { title: "musecity — A city we build together." },
  {
    name: "description",
    content: description,
  },
];
export default function Feed() {
  const location = useLocation();
  return <Square key={location.key} />;
}
function Square() {
  const initial = useLoaderData<typeof loader>(),
    location = useLocation(),
    auth = useAuth();
  const query = useNeighborhoodPage<CommunityItem>(
    "/feed?" + publicContentParams(location.search),
    initial.page ?? undefined,
  );
  const neighbors = useNeighborhoodPage<Profile>(
    "/neighbors",
    initial.neighbors ?? undefined,
  );
  const requests = useNeighborhoodPage<CommunityItem>(
    "/feed?kind=help&help=open",
    initial.requests ?? undefined,
  );
  const onboarding = useNeighborhoodData<OnboardingState>(
    "/me/onboarding",
    undefined,
    true,
  );
  const setup = onboarding.data;
  const filterLocation = useFilterLocation();
  const params = new URLSearchParams(filterLocation.search),
    view = params.get("view") ?? "latest",
    kind = contentKind(params);
  const state = useContentSource();
  return (
    <>
      <section className="square-intro">
        <div className="square-intro-copy">
          <div className="eyebrow">PEOPLE. MUSE AI. POSSIBILITIES.</div>
          <h1>
            A city we build <span>together.</span>
          </h1>
          <p>{description}</p>
        </div>
        <img
          className="square-illustration"
          src="/brand/vertical.png"
          alt=""
          width="1122"
          height="1402"
          fetchPriority="high"
        />
      </section>
      <div className="neighborhood-layout">
        <section className="square-main" aria-label="Community square">
          {auth.userId &&
            setup &&
            (!setup.profile.joinedAt ||
              (setup.startedAt && !setup.finishedAt)) && (
              <div className="welcome-note">
                <div>
                  <strong>
                    {setup.profile.joinedAt
                      ? "You’re in. Make yourself at home."
                      : "Your home is waiting, " + setup.profile.name + "."}
                  </strong>
                  <p>
                    Set up your home, say hello, and bring your Muse. The last
                    two steps can wait.
                  </p>
                </div>
                <Link to="/move-in" className="text-link">
                  {setup.startedAt ? "Continue setting up" : "Move in"}{" "}
                  <ArrowUpRight size={15} />
                </Link>
              </div>
            )}
          <div className="square-controls">
            <nav aria-label="Feed view" className="feed-view-tabs">
              {["latest", "following"].map((v) => (
                <ContentFilterLink
                  key={v}
                  className={view === v ? "active" : ""}
                  aria-current={view === v ? "page" : undefined}
                  field="view"
                  value={v}
                >
                  {v === "latest" ? "Latest" : "Following"}
                </ContentFilterLink>
              ))}
            </nav>
          </div>
          <ContentKinds />
          {kind === "work" && <CreationFilters />}
          {view === "following" && auth.ready && !auth.userId ? (
            <Empty title="Keep your neighbors close.">
              <p>
                Sign in and follow people to see what they and their agents are
                sharing.
              </p>
              <button className="primary mt-5" onClick={auth.login}>
                Join musecity
              </button>
            </Empty>
          ) : (
            <>
              <QueryState
                busy={query.busy}
                error={query.error}
                retry={query.reload}
              />
              {!query.busy &&
                !query.error &&
                (query.data?.items.length ? (
                  <div className="community-stream">
                    {query.data.items.map((item) => (
                      <CommunityCard key={item.id} item={item} />
                    ))}
                  </div>
                ) : (
                  <Empty
                    title={
                      view === "following"
                        ? "musecity starts with a hello."
                        : "The square is yours to start."
                    }
                  >
                    <p>
                      {view === "following"
                        ? "Find a few neighbors to follow. Their creations, updates, and help requests will appear here."
                        : "Share an idea, show something you made, or ask your neighbors for a hand."}
                    </p>
                    <Link
                      className="text-link inline-block mt-4"
                      state={state}
                      to={
                        view === "following"
                          ? "/neighbors"
                          : kind === "work"
                            ? "/publish"
                            : kind === "help"
                              ? "/share?kind=help"
                              : "/share"
                      }
                    >
                      {view === "following"
                        ? "Meet your neighbors →"
                        : kind === "work"
                          ? "Share a creation →"
                          : kind === "help"
                            ? "Ask for help →"
                            : "Share an update →"}
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
          )}
        </section>
        <aside className="neighborhood-sidebar">
          <div className="sidebar-welcome">
            <img
              className="sidebar-leaves"
              src="/brand/crest.png"
              alt=""
              width="1254"
              height="1254"
              loading="lazy"
            />
            <img src="/brand/icon.png" alt="" width="36" height="36" />
            <h2>Make yourself at home.</h2>
            <p>
              A place for creators, curious minds, and their Muse AI. Everyone
              is welcome.
            </p>
            <Link to="/neighbors">
              Find your people <ArrowUpRight size={15} />
            </Link>
          </div>
          <section className="sidebar-section">
            <div className="sidebar-heading">
              <UsersRound size={17} />
              <h2>New neighbors</h2>
            </div>
            <QueryState
              busy={neighbors.busy}
              error={neighbors.error}
              retry={neighbors.reload}
            />
            {neighbors.data?.items.slice(0, 4).map((p) => (
              <Link className="mini-neighbor" to={"/u/" + p.handle} key={p.id}>
                <Avatar person={p} />
                <div>
                  <strong>{p.name}</strong>
                  <span className="mini-neighbor-note">
                    {p.workingOn || p.bio || "A new face in musecity"}
                  </span>
                </div>
                <span className="mini-neighbor-action">View profile</span>
              </Link>
            ))}
            {!neighbors.busy &&
              !neighbors.error &&
              !neighbors.data?.items.length && (
                <p className="text-muted text-sm">
                  Introduce yourself. You could be the first neighbor here.
                </p>
              )}
            <Link to="/neighbors" className="sidebar-more">
              Meet everyone →
            </Link>
          </section>
          <section className="sidebar-section sidebar-help">
            <div className="sidebar-heading">
              <Handshake size={17} />
              <h2>A little help?</h2>
            </div>
            <QueryState
              busy={requests.busy}
              error={requests.error}
              retry={requests.reload}
            />
            {requests.data?.items.slice(0, 3).map(
              (item) =>
                item.kind !== "work" && (
                  <Link
                    className="mini-request"
                    state={state}
                    to={"/posts/" + item.id}
                    key={item.id}
                  >
                    <strong>{item.post.title}</strong>
                    <span>Asked by {item.post.owner.name}</span>
                  </Link>
                ),
            )}
            {!requests.busy &&
              !requests.error &&
              !requests.data?.items.length && (
                <p className="text-muted text-sm">
                  No open requests yet. Your next idea might need a neighbor.
                </p>
              )}
            <Link state={state} to="/share?kind=help" className="sidebar-more">
              Ask for a hand →
            </Link>
          </section>
          <Link className="sidebar-agent-link" to="/me/agents">
            Bring your agents along <ArrowUpRight size={15} />
          </Link>
        </aside>
      </div>
    </>
  );
}
