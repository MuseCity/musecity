import {
  ContentBack,
  useContentSource,
} from "../components/content-navigation";
import { Conversation } from "../components/conversation";
import {
  useNeighborhoodData,
  QueryState,
  ReportButton,
} from "../components/neighborhood";
import { servicesContext } from "../context";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import type { WorkView, Profile } from "../shared/contracts";
import { WorkDetail } from "../components/work-detail";
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const response = await context
    .get(servicesContext)
    .api.fetch(new Request(new URL("/api/v1/works/" + params.id, request.url)));
  if (!response.ok)
    throw new Response("Creation unavailable", { status: response.status });
  return response.json() as Promise<WorkView>;
}
export const meta = ({ data }: { data?: WorkView }) => [
  { title: data ? data.body.title + " — musecity" : "Creation — musecity" },
];
export default function Work() {
  const initial = useLoaderData<typeof loader>();
  const query = useNeighborhoodData<WorkView>(
    "/works/" + initial.workId,
    initial,
  );
  const me = useNeighborhoodData<Profile>("/me", undefined, true);
  const state = useContentSource();
  const work = query.data;
  return (
    <div className="detail">
      <ContentBack />
      <QueryState busy={query.busy} error={query.error} retry={query.reload} />
      {!query.busy && work && (
        <>
          {me.data?.id === work.owner.id && (
            <div className="detail-management">
              <Link
                className="secondary"
                to={"/me/works/" + work.workId + "/edit"}
                state={state}
              >
                Edit creation
              </Link>
              <Link className="text-link" to="/me/content">
                My content
              </Link>
            </div>
          )}
          <WorkDetail work={work} />
          <div className="mt-5">
            <ReportButton kind="work" id={work.workId} />
          </div>
          <Conversation kind="work" id={work.workId} />
        </>
      )}
    </div>
  );
}
