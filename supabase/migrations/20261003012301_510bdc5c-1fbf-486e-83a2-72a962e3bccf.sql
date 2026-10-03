CREATE TABLE public.malls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(name) BETWEEN 2 AND 120),
  logo_url text,
  description text CHECK (description IS NULL OR length(description) <= 2000),
  location text CHECK (location IS NULL OR length(location) <= 300),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.malls TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.malls TO authenticated;
GRANT ALL ON public.malls TO service_role;
ALTER TABLE public.malls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "malls public read" ON public.malls FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin manages malls" ON public.malls FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.malls (name, sort_order) VALUES ('جميرا', 1);

ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_category_check;
ALTER TABLE public.properties ADD CONSTRAINT properties_category_check CHECK (category IN ('residential','industrial','mall'));
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS mall_id uuid REFERENCES public.malls(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS floor text CHECK (floor IS NULL OR length(floor) <= 50);
CREATE INDEX IF NOT EXISTS properties_mall_idx ON public.properties (mall_id);