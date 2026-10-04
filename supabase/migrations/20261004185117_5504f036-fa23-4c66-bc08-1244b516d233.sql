ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT 'برج العرب الجديدة';
CREATE INDEX IF NOT EXISTS properties_city_area_idx ON public.properties(city, area);
ALTER TABLE public.brokers DROP CONSTRAINT IF EXISTS brokers_account_type_check;
ALTER TABLE public.brokers ADD CONSTRAINT brokers_account_type_check CHECK (account_type IN ('individual','office','owner'));
DROP POLICY IF EXISTS "user requests to join" ON public.brokers;
CREATE POLICY "user requests to join" ON public.brokers FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND is_active = false AND is_demo = false AND plan_id IS NULL AND account_type IN ('individual','owner'));