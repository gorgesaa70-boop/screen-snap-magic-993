import { useEffect, useState } from "react";

/** True inside the Android / iPhone app. Plan prices and plan requests stay on the website (store billing rules). */
export function useIsNativeApp() {
  const [native, setNative] = useState(false);
  useEffect(() => {
    void import("@capacitor/core").then(({ Capacitor }) => setNative(Capacitor.isNativePlatform())).catch(() => {});
  }, []);
  return native;
}
