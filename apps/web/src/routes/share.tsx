import type { LoaderFunctionArgs } from "react-router";
import { RequireAuth } from "../components/auth";
import { PostEditor } from "../components/post-editor";
import { ShareOptions } from "../components/content-navigation";
export function loader({ url }: LoaderFunctionArgs) {
  const kind = url.searchParams.get("kind");
  if ((kind && kind !== "update") || url.searchParams.has("help"))
    throw new Response("Unsupported content category", { status: 400 });
  return null;
}
export default function Share() {
  return (
    <RequireAuth>
      <div className="composer-page">
        <div className="page-top">
          <div className="eyebrow">A LITTLE SOMETHING FROM YOU</div>
          <h1>Share with your neighbors.</h1>
          <p>Big ideas and small updates all belong here.</p>
        </div>
        <ShareOptions kind="update" />
        <PostEditor />
      </div>
    </RequireAuth>
  );
}
