import { createContext } from "react-router";
import type { createApi } from "./server/api";
export const servicesContext = createContext<{
  appId: string;
  origin: string;
  api: ReturnType<typeof createApi>;
}>();
