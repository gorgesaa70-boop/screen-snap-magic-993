import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  inquiry: z.string().trim().min(3).max(2000),
  property: z.string().trim().max(2000).default(""),
  customerName: z.string().trim().max(100).default(""),
});

export const draftWhatsappReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = (context as { supabase: any; userId: string }).supabase;
    const uid = (context as { userId: string }).userId;
    const [{ data: isAdmin }, { data: isBroker }] = await Promise.all([
      sb.rpc("has_role", { _user_id: uid, _role: "admin" }),
      sb.rpc("has_role", { _user_id: uid, _role: "broker" }),
    ]);
    if (!isAdmin && !isBroker) return { ok: false as const, error: "هذه الميزة متاحة للوسطاء والإدارة فقط" };

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { ok: false as const, error: "خدمة الذكاء الاصطناعي غير مُعدّة" };

    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText } = await import("ai");
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });
    try {
      const result = streamText({
        model: provider.responses("openai/gpt-6-astra"),
        maxRetries: 0,
        system:
          "أنت وسيط عقاري محترف في شركة فاليو عقار بمصر. اكتب ردًا واحدًا جاهزًا للإرسال عبر واتساب باللهجة المصرية المهذبة: ترحيب بالاسم إن وُجد، إجابة مباشرة على الاستفسار اعتمادًا على معلومات العقار فقط دون اختلاق أسعار أو تفاصيل غير مذكورة، ثم دعوة لخطوة تالية (معاينة أو مكالمة). لا تتجاوز 120 كلمة. أعد نص الرسالة فقط بدون مقدمات أو علامات تنسيق.",
        prompt: `اسم العميل: ${data.customerName || "غير معروف"}\n\nاستفسار العميل:\n${data.inquiry}\n\nمعلومات العقار:\n${data.property || "غير متوفرة"}`,
        providerOptions: {
          openai: { store: false, forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] },
        },
      });
      const text = (await result.text).trim();
      if (!text) return { ok: false as const, error: "لم يتمكن النموذج من صياغة رد. حاول لاحقًا." };
      return { ok: true as const, text };
    } catch (e: any) {
      const status = e?.statusCode ?? e?.status;
      console.error("draftWhatsappReply failed", status);
      if (status === 429) return { ok: false as const, error: "ضغط كبير على الخدمة، حاول بعد قليل" };
      if (status === 402) return { ok: false as const, error: "رصيد الذكاء الاصطناعي نفد. يرجى إضافة رصيد." };
      return { ok: false as const, error: "تعذر صياغة الرد حاليًا" };
    }
  });

const analysisSchema = z.object({
  intent: z.enum(["buy", "rent", "sell", "invest", "info", "other"]),
  urgency: z.enum(["high", "medium", "low"]),
  reason: z.string().max(400),
  next_action: z.string().max(400),
  follow_up_in_hours: z.number().int().min(1).max(720),
});
export type LeadAnalysis = z.infer<typeof analysisSchema>;

export const analyzeInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = (context as { supabase: any; userId: string }).supabase;
    const uid = (context as { userId: string }).userId;
    const [{ data: isAdmin }, { data: isBroker }] = await Promise.all([
      sb.rpc("has_role", { _user_id: uid, _role: "admin" }),
      sb.rpc("has_role", { _user_id: uid, _role: "broker" }),
    ]);
    if (!isAdmin && !isBroker) return { ok: false as const, error: "هذه الميزة متاحة للوسطاء والإدارة فقط" };
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { ok: false as const, error: "خدمة الذكاء الاصطناعي غير مُعدّة" };

    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText } = await import("ai");
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });
    try {
      const result = streamText({
        model: provider.responses("openai/gpt-6-astra"),
        maxRetries: 0,
        system:
          'أنت محلل مبيعات عقارية في مصر. حلّل استفسار العميل وأعد JSON فقط بهذا الشكل بدون أي نص آخر: {"intent":"buy|rent|sell|invest|info|other","urgency":"high|medium|low","reason":"سبب مختصر بالعربية","next_action":"إجراء المتابعة التالي المقترح بالعربية في جملة","follow_up_in_hours":عدد صحيح}. العجلة high عند وجود موعد قريب أو جاهزية للدفع أو طلب معاينة فورية.',
        prompt: `اسم العميل: ${data.customerName || "غير معروف"}\n\nاستفسار العميل:\n${data.inquiry}\n\nمعلومات العقار:\n${data.property || "غير متوفرة"}`,
        providerOptions: {
          openai: { store: false, forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] },
        },
      });
      const raw = (await result.text).trim();
      const m = raw.match(/\{[\s\S]*\}/);
      const parsed = m ? analysisSchema.safeParse(JSON.parse(m[0])) : null;
      if (!parsed?.success) return { ok: false as const, error: "تعذر تحليل الاستفسار. حاول مرة أخرى." };
      return { ok: true as const, analysis: parsed.data };
    } catch (e: any) {
      const status = e?.statusCode ?? e?.status;
      console.error("analyzeInquiry failed", status);
      if (status === 429) return { ok: false as const, error: "ضغط كبير على الخدمة، حاول بعد قليل" };
      if (status === 402) return { ok: false as const, error: "رصيد الذكاء الاصطناعي نفد. يرجى إضافة رصيد." };
      return { ok: false as const, error: "تعذر التحليل حاليًا" };
    }
  });
