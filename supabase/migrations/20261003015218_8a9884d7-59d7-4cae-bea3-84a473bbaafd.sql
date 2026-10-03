CREATE OR REPLACE FUNCTION public.notify_on_property_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bu uuid; url text; bname text;
BEGIN
  url := CASE new.category WHEN 'industrial' THEN '/industrial/' || new.id WHEN 'mall' THEN '/dashboard' ELSE '/properties/' || new.id END;
  SELECT user_id, name INTO bu, bname FROM public.brokers WHERE id = new.broker_id;
  IF tg_op = 'UPDATE' AND new.review_status IS DISTINCT FROM old.review_status THEN
    IF new.review_status IN ('approved','rejected') AND bu IS DISTINCT FROM auth.uid() THEN
      PERFORM public.notify_user(bu, 'request_status',
        CASE WHEN new.review_status = 'approved' THEN 'تم اعتماد عقارك' ELSE 'تم رفض عقارك' END,
        new.title || coalesce(' — ' || new.review_note, ''), new.id,
        CASE WHEN new.review_status = 'approved' THEN url ELSE '/dashboard' END);
    END IF;
    IF new.review_status = 'rejected' THEN
      PERFORM public.notify_admins('admin', 'تم رفض عقار', new.title || coalesce(' — ' || bname, '') || coalesce(' — السبب: ' || new.review_note, ''), new.id, '/admin');
    ELSIF new.review_status = 'pending' THEN
      PERFORM public.notify_admins('admin', 'طلب عقار جديد من وسيط', new.title || coalesce(' — ' || bname, ''), new.id, '/admin');
    END IF;
  ELSIF tg_op = 'INSERT' AND new.review_status = 'pending' THEN
    PERFORM public.notify_admins('admin', 'طلب عقار جديد من وسيط', new.title || coalesce(' — ' || bname, ''), new.id, '/admin');
  END IF;
  IF tg_op = 'UPDATE' AND new.is_featured AND NOT old.is_featured THEN
    PERFORM public.notify_admins('admin', 'تم تمييز عقار', new.title || coalesce(' — ' || bname, ''), new.id, url);
    IF bu IS DISTINCT FROM auth.uid() THEN
      PERFORM public.notify_user(bu, 'request_status', 'تم تمييز عقارك', new.title, new.id, url);
    END IF;
  END IF;
  RETURN new;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_on_property_review() FROM PUBLIC, anon, authenticated;