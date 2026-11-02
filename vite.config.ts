// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// The social card (src/lib/social-card.server.ts) imports WebAssembly as compiled modules ("….wasm?module").
// The SSR build leaves those imports alone, and nitro bundles them the way Cloudflare Workers need
// (Workers can't compile WebAssembly at runtime).
const wasmModulesForNitro = {
  name: "value-aqar:wasm-modules-for-nitro",
  enforce: "pre" as const,
  // Only the SSR build: nitro's own build (unwasm) then turns them into Cloudflare WebAssembly modules.
  applyToEnvironment: (env: { name: string }) => env.name === "ssr",
  resolveId(id: string) {
    if (id.endsWith(".wasm?module")) return { id, external: true };
    return null;
  },
};

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: { plugins: [wasmModulesForNitro] },
});
