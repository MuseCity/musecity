import { useSearchParams } from "react-router";
import { RequireAuth } from "../components/auth";
import { PostEditor } from "../components/post-editor";
import { ShareOptions } from "../components/content-navigation";
export default function Share() {
  const [params] = useSearchParams();
  const kind = params.get("kind") === "help" ? "help" : "update";
  return (
    <RequireAuth>
      <div className="composer-page">
        <div className="page-top">
          <div className="eyebrow">A LITTLE SOMETHING FROM YOU</div>
          <h1>Share with your neighbors.</h1>
          <p>Big ideas, small updates, and a helping hand all belong here.</p>
        </div>
        <ShareOptions kind={kind} />
        <PostEditor key={kind} kind={kind} />
      </div>
    </RequireAuth>
  );
}
