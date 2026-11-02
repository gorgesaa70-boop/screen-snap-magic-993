// WebAssembly imported as a compiled module (nitro / Cloudflare Workers: `?module`), used by social-card.server.ts.
declare module "*.wasm?module" {
  const mod: WebAssembly.Module;
  export default mod;
}
