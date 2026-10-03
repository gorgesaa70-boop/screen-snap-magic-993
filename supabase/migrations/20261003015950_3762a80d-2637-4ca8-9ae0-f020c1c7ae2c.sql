CREATE OR REPLACE FUNCTION public.notifications_mark_whatsapp() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF new.type <> 'admin' THEN new.whatsapp_status := 'pending'; END IF;
  RETURN new;
END $$;