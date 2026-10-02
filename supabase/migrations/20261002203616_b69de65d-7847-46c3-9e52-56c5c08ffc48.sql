CREATE TABLE public.lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  actor_id uuid DEFAULT auth.uid(),
  kind text NOT NULL CHECK (kind IN ('call','whatsapp','status','note','follow_up','assign')),
  summary text NOT NULL CHECK (char_length(summary) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_activities_lead_idx ON public.lead_activities (lead_id, created_at DESC);
GRANT SELECT, INSERT ON public.lead_activities TO authenticated;
GRANT ALL ON public.lead_activities TO service_role;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read activities of visible leads" ON public.lead_activities FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id));
CREATE POLICY "log call/whatsapp/note on visible leads" ON public.lead_activities FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() AND kind IN ('call','whatsapp','note') AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id));

CREATE OR REPLACE FUNCTION public.log_lead_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF new.stage IS DISTINCT FROM old.stage THEN
    INSERT INTO public.lead_activities(lead_id, actor_id, kind, summary) VALUES (new.id, auth.uid(), 'status', old.stage || ' → ' || new.stage);
  END IF;
  IF new.notes IS DISTINCT FROM old.notes AND coalesce(new.notes,'') <> '' THEN
    INSERT INTO public.lead_activities(lead_id, actor_id, kind, summary) VALUES (new.id, auth.uid(), 'note', left(new.notes, 1000));
  END IF;
  IF new.follow_up_at IS DISTINCT FROM old.follow_up_at THEN
    INSERT INTO public.lead_activities(lead_id, actor_id, kind, summary) VALUES (new.id, auth.uid(), 'follow_up', coalesce(to_char(new.follow_up_at AT TIME ZONE 'Africa/Cairo','YYYY-MM-DD HH24:MI'), 'cleared'));
  END IF;
  IF new.assigned_broker_id IS DISTINCT FROM old.assigned_broker_id THEN
    INSERT INTO public.lead_activities(lead_id, actor_id, kind, summary) VALUES (new.id, auth.uid(), 'assign', coalesce((SELECT name FROM public.brokers WHERE id = new.assigned_broker_id), 'unassigned'));
  END IF;
  RETURN new;
END $$;
REVOKE EXECUTE ON FUNCTION public.log_lead_changes() FROM public, anon, authenticated;
CREATE TRIGGER leads_log_changes AFTER UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.log_lead_changes();