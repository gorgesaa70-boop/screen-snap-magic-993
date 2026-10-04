import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { TYPES, AREAS } from "@/components/site/data";
import { extractJson, normalizeDigits, validateParsed, type ParsedSearch } from "./search-parse";

const input = z.object({ query: z.string().trim().min(2).max(300) });

type Result = { ok: true; result: ParsedSearch } | { ok: false; error: string };

/** Converts an Arabic free-text property request into validated platform filters. */
export const parseSearchQuery = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<Result> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { ok: false, error: "خدمة البحث الذكي غير مُعدّة" };

    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText } = await import("ai");
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });
    const system =
      "أنت محلل طلبات بحث عقاري لمنصة في برج العرب الجديدة. حوّل طلب المستخدم إلى JSON فقط بدون أي نص آخر، ولا تكتب SQL أو استعلامات أبدًا. الشكل: " +
      '{"category":"residential|industrial|unknown","type":string|null,"status":"بيع"|"إيجار"|null,"area":string|null,"min_price":number|null,"max_price":number|null,"size":number|null,"rooms":number|null}. ' +
      `type من هذه القيم فقط: ${TYPES.join("، ")}. area من هذه القيم فقط: ${AREAS.join("، ")}. ` +
      "category=industrial للأراضي الصناعية والمصانع والمخازن. الأسعار بالجنيه كأرقام كاملة (مليون ونص = 1500000). «أقل من» تعني max_price و«أكثر من» تعني min_price. ضع null لأي قيمة غير مذكورة صراحة ولا تخمّن. «برج العرب» اسم المدينة وليس area. الأحياء المذكورة تخص برج العرب الجديدة فقط.";
    try {
      const result = streamText({
        model: provider.responses("openai/gpt-6-astra"),
        maxRetries: 0,
        system,
        prompt: normalizeDigits(data.query),
        providerOptions: {
          openai: { store: false, forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] },
        },
      });
      const raw = extractJson((await result.text).trim());
      if (!raw) return { ok: false, error: "لم نفهم الطلب. جرّب وصفًا أوضح." };
      return { ok: true, result: validateParsed(raw) };
    } catch (e: any) {
      const status = e?.statusCode ?? e?.status;
      console.error("parseSearchQuery failed", status);
      if (status === 429) return { ok: false, error: "ضغط كبير على الخدمة، حاول بعد قليل" };
      if (status === 402 || status === 403) return { ok: false, error: "البحث الذكي غير متاح حاليًا" };
      return { ok: false, error: "تعذر تحليل الطلب حاليًا" };
    }
  });
