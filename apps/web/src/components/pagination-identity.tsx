import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "./auth";

// Public URL cursors are anonymous. A new identity must start its own sequence.
export function PaginationIdentityReset() {
  const auth = useAuth(),
    location = useLocation(),
    navigate = useNavigate();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!auth.ready) return;
    const identity = auth.userId ?? null;
    const changed =
      previous.current !== undefined && previous.current !== identity;
    previous.current = identity;
    if (!identity && !changed) return;
    const params = new URLSearchParams(location.search);
    if (!params.has("cursor") && !params.has("commentCursor")) return;
    params.delete("cursor");
    params.delete("commentCursor");
    void navigate(
      location.pathname + (params.size ? "?" + params : "") + location.hash,
      { replace: true, state: location.state },
    );
  }, [auth.ready, auth.userId, location, navigate]);
  return null;
}
