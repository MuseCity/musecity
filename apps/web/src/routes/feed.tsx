import {
  ContentKinds,
  useContentSource,
  useFilterLocation,
  CreationFormats,
} from "../components/content-navigation";
import { FeedTabs } from "../components/feed-tabs";
import { useTopics } from "../components/catalog";
import {
  contentKind,
  publicContentParams,
  retiredEcosystemPath,
  shareHref,
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
  const sites = view === "sites";
  const tag = useTopics().find((topic) => topic.id === params.get("tag"));
  const state = useContentSource();
  return (
    <>
      <h1 className="sr-only">Community Square</h1>
      <div className="neighborhood-layout">
        <section className="square-main" aria-label="Community square">
          <FeedTabs />
          {auth.userId &&
            setup &&
            (!setup.profile.joinedAt ||
              (setup.startedAt && !setup.finishedAt)) && (
              <div className="welcome-note mt-3">
                <div>
                  <strong>
                    {setup.profile.joinedAt
                      ? "You’re in. Make yourself at home."
                      : "Your home is waiting, " + setup.profile.name + "."}
                  </strong>
                  <p>Set up your home, then explore at your own pace.</p>
                </div>
                <Link to="/move-in" className="text-link">
                  {setup.startedAt ? "Continue setting up" : "Move in"}{" "}
                  <ArrowUpRight size={15} />
                </Link>
              </div>
            )}
          {sites ? (
            <div className="shared-tag-heading mb-3">
              <div>
                <h2>Built with AI</h2>
                <p>Websites from the community.</p>
              </div>
              <Link
                className="secondary compact"
                state={state}
                to={shareHref("sites", tag?.id)}
              >
                Share a site <ArrowUpRight size={15} />
              </Link>
            </div>
          ) : tag ? (
            <div className="shared-tag-heading">
              <div>
                <h2>{tag.name}</h2>
                <p>Everyone can share here.</p>
              </div>
              <Link
                className="secondary compact"
                state={state}
                to={shareHref(kind, tag.id)}
              >
                Share here <ArrowUpRight size={15} />
              </Link>
            </div>
          ) : null}
          {!sites && <ContentKinds />}
          {!sites && kind === "work" && <CreationFormats />}
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
                        : sites
                          ? "Share your first AI-built website."
                          : tag
                            ? `Start a conversation in ${tag.name}.`
                            : "The square is yours to start."
                    }
                  >
                    <p>
                      {view === "following"
                        ? "Find a few neighbors to follow. Their creations, updates, and help requests will appear here."
                        : sites
                          ? "Add a link, a cover, and a few words about what you made."
                          : "Share an idea, show something you made, or ask your neighbors for a hand."}
                    </p>
                    <Link
                      className="text-link inline-block mt-4"
                      state={state}
                      to={
                        view === "following"
                          ? "/neighbors"
                          : shareHref(sites ? "sites" : kind, tag?.id)
                      }
                    >
                      {view === "following"
                        ? "Meet your neighbors →"
                        : sites
                          ? "Share a site →"
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
