import type { CapacitorConfig } from "@capacitor/cli";

// The native app loads the published site live so site updates appear without store releases.
// Risk: the remote origin can call installed native plugins — keep plugins minimal and
// navigation restricted to our own domain.
const config: CapacitorConfig = {
  appId: "com.valueaqar.app",
  appName: "Value Aqar",
  webDir: "mobile-shell",
  server: {
    url: "https://valueaqar.com",
    cleartext: false,
    errorPath: "index.html",
    allowNavigation: ["valueaqar.com", "www.valueaqar.com"],
  },
  android: { allowMixedContent: false },
  ios: { contentInset: "automatic", limitsNavigationsToAppBoundDomains: false },
};

export default config;
