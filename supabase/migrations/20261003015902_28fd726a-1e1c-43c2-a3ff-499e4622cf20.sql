CREATE TABLE public.notification_preferences (
  user_id uuid PRIMARY KEY,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  whatsapp_phone text CHECK (whatsapp_phone IS NULL OR whatsapp_phone ~ '^[0-9]{8,15}$'),
  whatsapp_types text[] NOT NULL DEFAULT ARRAY['new_inquiry','broker_reply'],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs read" ON public.notification_preferences FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own prefs insert" ON public.notification_preferences FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own prefs update" ON public.notification_preferences FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN new.updated_at := now(); RETURN new; END $$;
CREATE TRIGGER notification_preferences_touch BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.notifications
  ADD COLUMN whatsapp_status text CHECK (whatsapp_status IN ('pending','sent','failed','skipped')),
  ADD COLUMN whatsapp_sent_at timestamptz,
  ADD COLUMN whatsapp_error text,
  ADD COLUMN whatsapp_message_id text;
CREATE INDEX notifications_whatsapp_pending_idx ON public.notifications (created_at) WHERE whatsapp_status = 'pending';

CREATE OR REPLACE FUNCTION public.notifications_mark_whatsapp() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF new.type IN ('new_inquiry','broker_reply') THEN new.whatsapp_status := 'pending'; END IF;
  RETURN new;
END $$;
CREATE TRIGGER notifications_mark_whatsapp BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.notifications_mark_whatsapp();