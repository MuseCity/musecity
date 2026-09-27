import { Link } from "react-router";
import { RequireAuth } from "../components/auth";
import { AgentManager } from "../components/agent-manager";

export default function AgentsPage() {
  return (
    <>
      <Link to="/agents" className="text-link mb-6 inline-block">
        ← Agent Onboarding
      </Link>
      <RequireAuth>
        <AgentManager />
      </RequireAuth>
    </>
  );
}
