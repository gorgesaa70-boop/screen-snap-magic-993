-- فاليو عقار — إصدار 15: إشعار عرض المالك بقى يقول إنه من مالك، وسجل التدقيق بيكتب «النظام» بدل «زائر» للتعديلات الأوتوماتيك.
-- مرة واحدة بس، وتلقائيًا كله أو مفيش. مفيش تغيير في أي جدول أو بيانات (دالتين بس).
--   20261013300000_admin-review-fixes.sql

begin;
-- Admin notification for a listing waiting for review now says who sent it:
-- an owner offer (owner_lead_id set, no broker) was announced as "طلب عقار جديد من وسيط".
-- Only the title/body text changes; everything else is as in 20261003015218.
CREATE OR REPLACE FUNCTION public.notify_on_property_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bu uuid; url text; bname text; who text; title text;
BEGIN
  url := CASE new.category WHEN 'industrial' THEN '/industrial/' || new.id WHEN 'mall' THEN '/dashboard' ELSE '/properties/' || new.id END;
  SELECT user_id, name INTO bu, bname FROM public.brokers WHERE id = new.broker_id;
  IF new.owner_lead_id IS NOT NULL AND new.broker_id IS NULL THEN
    title := 'عرض عقار جديد من مالك';
    SELECT name INTO who FROM public.leads WHERE id = new.owner_lead_id;
  ELSE
    title := 'طلب عقار جديد من وسيط';
    who := bname;
  END IF;
  IF tg_op = 'UPDATE' AND new.review_status IS DISTINCT FROM old.review_status THEN
    IF new.review_status IN ('approved','rejected') AND bu IS DISTINCT FROM auth.uid() THEN
      PERFORM public.notify_user(bu, 'request_status',
        CASE WHEN new.review_status = 'approved' THEN 'تم اعتماد عقارك' ELSE 'تم رفض عقارك' END,
        new.title || coalesce(' — ' || new.review_note, ''), new.id,
        CASE WHEN new.review_status = 'approved' THEN url ELSE '/dashboard' END);
    END IF;
    IF new.review_status = 'rejected' THEN
      PERFORM public.notify_admins('admin', 'تم رفض عقار', new.title || coalesce(' — ' || who, '') || coalesce(' — السبب: ' || new.review_note, ''), new.id, '/admin');
    ELSIF new.review_status = 'pending' THEN
      PERFORM public.notify_admins('admin', title, new.title || coalesce(' — ' || who, ''), new.id, '/admin');
    END IF;
  ELSIF tg_op = 'INSERT' AND new.review_status = 'pending' THEN
    PERFORM public.notify_admins('admin', title, new.title || coalesce(' — ' || who, ''), new.id, '/admin');
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

-- Audit log: changes made with no signed-in user and no visitor session (database migrations, scheduled jobs,
-- direct SQL) were labelled "زائر" (visitor). Only a real anonymous web session is a visitor now; the rest is "النظام".
create or replace function public.actor_label()
returns text language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then case when coalesce(auth.role(), '') = 'anon' then 'زائر' else 'النظام' end
    when public.has_role(auth.uid(), 'admin') then 'أدمن'
    when public.is_staff() then 'موظف فاليو عقار'
    else coalesce(
      (select 'صاحب حساب: ' || name from public.brokers where user_id = auth.uid() limit 1),
      (select 'فريق: ' || m.member_name || ' (' || b.name || ')' from public.my_membership() m join public.brokers b on b.id = m.company_id limit 1),
      'مستخدم')
  end
$$;
revoke execute on function public.actor_label() from public, anon, authenticated;

commit;
