import { defineConfig } from "vite";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
export default defineConfig({
  cacheDir: "node_modules/.vite-e2e",
  plugins: [
    {
      name: "isolated-browser-fixture",
      enforce: "pre",
      transform(code, id) {
        if (id.endsWith("/src/root.tsx"))
          return code.replace(
            /import \{ AuthProvider \} from [\"\']\.\/components\/auth[\"\'];/,
            "import { AuthProvider } from '../e2e/auth';",
          );
      },
    },
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ],
});
