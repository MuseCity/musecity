import { useEffect } from "react";
import { useNavigate } from "react-router";
import { RequireAuth } from "../components/auth";
import { useNeighborhoodData, QueryState } from "../components/neighborhood";
import type { Profile } from "../shared/contracts";
export default function Home() {
  return (
    <RequireAuth>
      <MyHome />
    </RequireAuth>
  );
}
function MyHome() {
  const me = useNeighborhoodData<Profile>("/me", undefined, true),
    navigate = useNavigate();
  useEffect(() => {
    if (me.data) void navigate("/u/" + me.data.handle, { replace: true });
  }, [me.data, navigate]);
  return <QueryState busy={me.busy} error={me.error} retry={me.reload} />;
}
