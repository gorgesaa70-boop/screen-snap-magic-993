import { useQuery } from "@tanstack/react-query";
import { Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { dbx } from "@/lib/dbx";
import { t, useLang } from "@/lib/i18n";

/** One link for every phone: /app sends iPhones to the App Store and Android phones to Google Play. */
export const APP_DOWNLOAD_URL = "https://valueaqar.com/app";

/** Which store a phone belongs to, from its user agent. */
export function storeFor(ua: string): "ios" | "android" | null {
  if (/android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua))) return "ios";
  return null;
}

export type AppLinks = { ios: string | null; android: string | null };

export async function fetchAppLinks(): Promise<AppLinks> {
  const { data } = await dbx.from("app_settings").select("ios_url, android_url").eq("id", 1).maybeSingle();
  return { ios: data?.ios_url ?? null, android: data?.android_url ?? null };
}

export const useAppLinks = () => useQuery({ queryKey: ["app-links"], queryFn: fetchAppLinks, staleTime: 5 * 60_000 });

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 384 512" aria-hidden="true" className={className} fill="currentColor">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true" className={className}>
      <path fill="#00d7fe" d="M48 59.5v393c0 8.7 4.3 16.3 10.9 20.9L287 256 58.9 38.6C52.3 43.2 48 50.8 48 59.5z" />
      <path fill="#ffce00" d="M371.6 172.4 287 256l84.6 83.6 95.2-54.1c19.2-11 19.2-27.9 0-39z" />
      <path fill="#ff3a44" d="M287 256 58.9 473.4c6.6 4.6 15.9 5.4 25.3.1l287.4-133.9z" />
      <path fill="#00f076" d="M58.9 38.6 287 256l84.6-83.6L84.2 38.5c-9.4-5.3-18.7-4.5-25.3.1z" />
    </svg>
  );
}

/** Store button styled like the official badges; shows "coming soon" instead of a dead link until the app is published. */
export function StoreButton({ store, url }: { store: "ios" | "android"; url: string | null }) {
  useLang();
  const ios = store === "ios";
  const top = url ? (ios ? t("حمّله من") : t("متاح على")) : t("قريبًا على");
  const name = ios ? "App Store" : "Google Play";
  const body = (
    <>
      {ios ? <AppleIcon className="size-7 shrink-0" /> : <PlayIcon className="size-7 shrink-0" />}
      <span className="flex flex-col items-start leading-tight" dir="ltr">
        <span className="text-[10px] font-semibold opacity-80">{top}</span>
        <span className="text-base font-bold">{name}</span>
      </span>
    </>
  );
  const cls = "inline-flex h-14 min-w-[170px] items-center justify-center gap-2.5 rounded-xl border px-4 transition";
  if (!url) return <span aria-disabled="true" title={t("التطبيق لسه مش منشور على {store}", { store: name })} className={`${cls} cursor-default border-dashed border-primary/30 bg-secondary text-primary/60`}>{body}</span>;
  return <a href={url} target="_blank" rel="noopener noreferrer" className={`${cls} border-black bg-black text-white hover:bg-black/85`}>{body}</a>;
}

/** "Download the app" block: store buttons plus a scannable QR that opens /app on the phone. */
export function AppDownload({ compact = false }: { compact?: boolean }) {
  useLang();
  const q = useAppLinks();
  const links = q.data ?? { ios: null, android: null };
  const published = !!(links.ios || links.android);
  return (
    <section className="rounded-3xl bg-primary p-6 text-primary-foreground md:p-8">
      <span className="grid size-11 place-items-center rounded-2xl bg-teal/20 text-teal"><Smartphone className="size-6" /></span>
      <h2 className="mt-4 text-xl font-extrabold md:text-2xl">{t("حمّل تطبيق Value Aqar")}</h2>
      <p className="mt-2 text-sm leading-6 text-primary-foreground/80">{t("تابع العقارات والطلبات والإشعارات من موبايلك في أي وقت، بنفس حسابك على الموقع.")}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <StoreButton store="ios" url={links.ios} />
        <StoreButton store="android" url={links.android} />
      </div>
      {!q.isLoading && !published && <p className="mt-3 text-xs font-semibold text-teal">{t("التطبيق قيد التجهيز وهيكون متاح على المتاجر قريبًا.")}</p>}
      {!compact && (
        <div className="mt-6 hidden items-center gap-4 rounded-2xl bg-card p-4 text-foreground md:flex">
          <img src="/app-qr.svg" alt={t("رمز QR لتنزيل تطبيق Value Aqar")} width={112} height={112} className="size-28 shrink-0" />
          <div>
            <p className="font-bold text-primary">{t("امسح الكود بكاميرا موبايلك لتنزيل التطبيق")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("الكود بيفتح الصفحة المناسبة لموبايلك تلقائيًا (آيفون أو أندرويد).")}</p>
            <p className="mt-1 text-xs text-muted-foreground" dir="ltr">valueaqar.com/app</p>
          </div>
        </div>
      )}
    </section>
  );
}
