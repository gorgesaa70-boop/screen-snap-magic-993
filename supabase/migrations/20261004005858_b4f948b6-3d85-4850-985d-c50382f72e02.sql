CREATE TABLE public.whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('message','status')),
  wa_message_id text,
  status text,
  from_masked text,
  message_type text,
  error_code text,
  error_title text,
  event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.whatsapp_webhook_events TO service_role;
GRANT SELECT ON public.whatsapp_webhook_events TO authenticated;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin reads webhook events" ON public.whatsapp_webhook_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX whatsapp_webhook_events_msg_idx ON public.whatsapp_webhook_events (wa_message_id);