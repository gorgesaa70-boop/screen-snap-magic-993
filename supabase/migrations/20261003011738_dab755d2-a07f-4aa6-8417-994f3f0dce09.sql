CREATE TABLE public.industrial_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(name) BETWEEN 2 AND 120),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.industrial_zones TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.industrial_zones TO authenticated;
GRANT ALL ON public.industrial_zones TO service_role;
ALTER TABLE public.industrial_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zones public read" ON public.industrial_zones FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin manages zones" ON public.industrial_zones FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.industrial_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(name) BETWEEN 2 AND 120),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.industrial_activities TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.industrial_activities TO authenticated;
GRANT ALL ON public.industrial_activities TO service_role;
ALTER TABLE public.industrial_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activities public read" ON public.industrial_activities FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin manages activities" ON public.industrial_activities FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.industrial_zones (name, sort_order) VALUES
('المنطقة الصناعية الأولى',1),('المنطقة الصناعية الثانية',2),('المنطقة الصناعية الثالثة',3),('المنطقة الصناعية الرابعة',4),('المنطقة الصناعية الخامسة',5),
('المنطقة الصناعية السادسة',6),('المنطقة الصناعية السابعة',7),('المنطقة الصناعية الثامنة',8),('المنطقة الصناعية التاسعة',9),('المنطقة الصناعية العاشرة',10);
INSERT INTO public.industrial_activities (name, sort_order) VALUES
('صناعات غذائية',1),('صناعات هندسية',2),('صناعات بلاستيكية',3),('صناعات كيماوية',4),('صناعات نسيجية',5),('مخازن ومستودعات',6),('أنشطة لوجستية',7),('أنشطة صناعية أخرى',8);

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'residential' CHECK (category IN ('residential','industrial')),
  ADD COLUMN IF NOT EXISTS zone_id uuid REFERENCES public.industrial_zones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS activity_id uuid REFERENCES public.industrial_activities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS land_size numeric CHECK (land_size IS NULL OR land_size >= 0),
  ADD COLUMN IF NOT EXISTS built_size numeric CHECK (built_size IS NULL OR built_size >= 0),
  ADD COLUMN IF NOT EXISTS address text CHECK (address IS NULL OR length(address) <= 300),
  ADD COLUMN IF NOT EXISTS video_urls text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS properties_category_idx ON public.properties (category);
CREATE INDEX IF NOT EXISTS properties_zone_idx ON public.properties (zone_id);