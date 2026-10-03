CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  type text NOT NULL CHECK (type IN ('saved_search_match','new_inquiry','new_request','broker_reply','request_status','admin')),
  related_id uuid,
  related_url text,
  is_read boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_created_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx ON public.notifications (user_id) WHERE NOT is_read;

GRANT SELECT, DELETE ON public.notifications TO authenticated;
GRANT UPDATE (is_read) ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications read" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own notifications update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own notifications delete" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_user(_user uuid, _type text, _title text, _msg text, _related uuid, _url text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications(user_id, type, title, message, related_id, related_url)
  SELECT _user, _type, _title, coalesce(_msg,''), _related, _url WHERE _user IS NOT NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_user(uuid,text,text,text,uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_admins(_type text, _title text, _msg text, _related uuid, _url text, _except uuid DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications(user_id, type, title, message, related_id, related_url)
  SELECT DISTINCT user_id, _type, _title, coalesce(_msg,''), _related, _url FROM public.user_roles
  WHERE role = 'admin' AND (_except IS NULL OR user_id <> _except);
$$;
REVOKE EXECUTE ON FUNCTION public.notify_admins(text,text,text,uuid,text,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_on_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t text; ttl text; bu uuid; msg text;
BEGIN
  IF tg_op = 'INSERT' THEN
    t := CASE WHEN new.kind = 'inquiry' THEN 'new_inquiry' ELSE 'new_request' END;
    ttl := CASE WHEN new.kind = 'inquiry' THEN 'استفسار جديد عن عقار' ELSE 'طلب عقاري جديد' END;
    msg := new.name || coalesce(' — ' || new.area, '');
    PERFORM public.notify_admins(t, ttl, msg, new.id, '/inquiries');
    IF new.assigned_broker_id IS NOT NULL THEN
      SELECT user_id INTO bu FROM public.brokers WHERE id = new.assigned_broker_id;
      IF NOT public.has_role(bu, 'admin') THEN PERFORM public.notify_user(bu, t, ttl, msg, new.id, '/inquiries'); END IF;
    END IF;
  ELSIF new.assigned_broker_id IS DISTINCT FROM old.assigned_broker_id AND new.assigned_broker_id IS NOT NULL THEN
    SELECT user_id INTO bu FROM public.brokers WHERE id = new.assigned_broker_id;
    PERFORM public.notify_user(bu, 'new_request', 'تم إسناد طلب جديد لك', new.name, new.id, '/inquiries');
  END IF;
  RETURN new;
END $$;
CREATE TRIGGER leads_notify AFTER INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.notify_on_lead();

CREATE OR REPLACE FUNCTION public.notify_on_property_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bu uuid; url text;
BEGIN
  url := CASE new.category WHEN 'industrial' THEN '/industrial/' || new.id WHEN 'mall' THEN '/dashboard' ELSE '/properties/' || new.id END;
  IF tg_op = 'UPDATE' AND new.review_status IS DISTINCT FROM old.review_status THEN
    SELECT user_id INTO bu FROM public.brokers WHERE id = new.broker_id;
    IF new.review_status IN ('approved','rejected') AND bu IS DISTINCT FROM auth.uid() THEN
      PERFORM public.notify_user(bu, 'request_status',
        CASE WHEN new.review_status = 'approved' THEN 'تم اعتماد عقارك' ELSE 'تم رفض عقارك' END,
        new.title || coalesce(' — ' || new.review_note, ''), new.id,
        CASE WHEN new.review_status = 'approved' THEN url ELSE '/dashboard' END);
    ELSIF new.review_status = 'pending' THEN
      PERFORM public.notify_admins('admin', 'عقار بانتظار المراجعة', new.title, new.id, '/admin', auth.uid());
    END IF;
  ELSIF tg_op = 'INSERT' AND new.review_status = 'pending' THEN
    PERFORM public.notify_admins('admin', 'عقار بانتظار المراجعة', new.title, new.id, '/admin', auth.uid());
  END IF;
  RETURN new;
END $$;
CREATE TRIGGER properties_notify AFTER INSERT OR UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.notify_on_property_review();

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;