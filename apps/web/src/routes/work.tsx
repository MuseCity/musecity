import { workSeo, seoMeta } from "../shared/seo";
import { publicRead, publicComments } from "../route-data";
import type { MetaFunction } from "react-router";
import { ContentActions } from "../components/content-actions";
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
export async function loader(args: LoaderFunctionArgs) {
  const content = await publicRead<WorkView>(args, "/works/" + args.params.id);
  const comments = await publicComments(args, "works", args.params.id!);
  return {
    ...content,
    comments,
    seo: workSeo(
      args.context.get(servicesContext).origin,
      args.url,
      content,
      comments,
    ),
  };
}
export const meta: MetaFunction<typeof loader> = ({ loaderData, error }) =>
  seoMeta(loaderData?.seo, error);
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
          <div className="detail-content-actions">
            <ContentActions
              kind="work"
              id={work.workId}
              initial={work.interactions}
              path={"/works/" + work.workId}
            />
            <ReportButton kind="work" id={work.workId} />
          </div>
          <Conversation
            kind="work"
            id={work.workId}
            initial={initial.comments}
          />
        </>
      )}
    </div>
  );
}
