import { useRouteLoaderData } from "react-router";
export function useTopics() {
  return (
    useRouteLoaderData<{ tags: { id: string; name: string }[] }>("root")
      ?.tags ?? []
  );
}
