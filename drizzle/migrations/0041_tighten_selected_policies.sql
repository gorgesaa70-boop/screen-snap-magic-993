ALTER POLICY "signed-in users submit opportunities" ON public.investment_opportunities
  WITH CHECK (submitted_by = auth.uid());

ALTER POLICY "staff edits settings" ON public.app_settings
  WITH CHECK (staff_can('announce','edit') OR staff_can('closed','edit') OR staff_can('wa','edit') OR staff_can('app','edit') OR staff_can('wa_inbox','edit') OR staff_can('routing','edit') OR staff_can('plans','edit'));

ALTER POLICY "deal docs readable with their deal" ON storage.objects
  USING (bucket_id = 'deal-docs' AND EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id::text = (storage.foldername(objects.name))[1]
      AND (d.broker_id = public.current_broker_id()
           OR public.has_role(auth.uid(), 'admin'::public.app_role)
           OR public.staff_can('deals','view'))));

ALTER POLICY "deal docs uploaded to an open deal" ON storage.objects
  WITH CHECK (bucket_id = 'deal-docs' AND EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id::text = (storage.foldername(objects.name))[1]
      AND d.review_status <> 'approved'
      AND (d.broker_id = public.current_broker_id()
           OR public.has_role(auth.uid(), 'admin'::public.app_role)
           OR public.staff_can('deals','edit'))));

ALTER POLICY "commission docs readable with their commission" ON storage.objects
  USING (bucket_id = 'commission-docs' AND EXISTS (
    SELECT 1 FROM public.commissions c
    WHERE c.id::text = (storage.foldername(objects.name))[1]
      AND ((c.broker_id = public.current_broker_id() AND public.current_member_role() = ANY (ARRAY['owner','manager']))
           OR public.has_role(auth.uid(), 'admin'::public.app_role)
           OR public.staff_can('commissions','view'))));