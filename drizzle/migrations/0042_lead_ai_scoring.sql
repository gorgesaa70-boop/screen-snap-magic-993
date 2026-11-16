ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ai_score smallint CHECK (ai_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_worth_call boolean,
  ADD COLUMN IF NOT EXISTS ai_scored_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_score_attempts smallint NOT NULL DEFAULT 0;
GRANT SELECT (ai_score, ai_summary, ai_worth_call, ai_scored_at) ON public.leads TO authenticated;
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS ideal_customer text NOT NULL DEFAULT 'عميل جاد عنده ميزانية واضحة مناسبة للسوق، بيدور على شراء أو إيجار خلال 3 شهور في برج العرب الجديدة أو العلمين أو الساحل الشمالي، وسايب بيانات كفاية (نوع العقار، المنطقة، الميزانية) ورقم تليفون صحيح.';
CREATE INDEX IF NOT EXISTS leads_ai_unscored_idx ON public.leads (created_at) WHERE ai_scored_at IS NULL;