-- Item 39: rentals. Listings can be for sale, monthly rent (إيجار) or summer / holiday rent (مصيف).
-- Summer listings may carry several prices (night, week, month, season); `price` keeps the lowest so
-- existing price filters and sorting keep working, and `price_unit` says what it is per.
-- Deals get a type; commissions use a per-company agreement for each type
-- (rent default: half a month's rent when no rent agreement exists).

-- 1) Listings.
alter table public.properties drop constraint if exists properties_status_check;
alter table public.properties add constraint properties_status_check check (status in ('بيع','إيجار','مصيف'));
alter table public.properties
  add column if not exists price_unit text check (price_unit is null or price_unit in ('night','week','month','season')),
  add column if not exists price_night numeric check (price_night is null or price_night > 0),
  add column if not exists price_week numeric check (price_week is null or price_week > 0),
  add column if not exists price_month numeric check (price_month is null or price_month > 0),
  add column if not exists price_season numeric check (price_season is null or price_season > 0),
  add column if not exists furnished text check (furnished is null or furnished in ('furnished','semi','unfurnished')),
  add column if not exists min_months smallint check (min_months is null or min_months between 1 and 60),
  add column if not exists deposit numeric check (deposit is null or deposit >= 0),
  add column if not exists guests smallint check (guests is null or guests between 1 and 50),
  add column if not exists available_from date,
  add column if not exists available_to date;
update public.properties set price_unit = 'month' where status = 'إيجار' and price_unit is null;

-- Keep rent fields consistent with the listing purpose (runs after properties_guard: name order).
create or replace function public.properties_rent_normalize()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'مصيف' then
    if coalesce(new.price_night, new.price_week, new.price_month, new.price_season) is null then
      raise exception 'حط سعر واحد على الأقل للمصيف (الليلة أو الأسبوع أو الشهر أو الموسم)' using errcode = '23514';
    end if;
    new.price_unit := case
      when new.price_night is not null then 'night' when new.price_week is not null then 'week'
      when new.price_month is not null then 'month' else 'season' end;
    new.price := coalesce(new.price_night, new.price_week, new.price_month, new.price_season);
    new.min_months := null;
  elsif new.status = 'إيجار' then
    new.price_unit := 'month';
    new.price_night := null; new.price_week := null; new.price_season := null; new.guests := null;
    new.price_month := new.price;
  else
    new.price_unit := null;
    new.price_night := null; new.price_week := null; new.price_month := null; new.price_season := null;
    new.furnished := null; new.min_months := null; new.deposit := null; new.guests := null;
    new.available_from := null; new.available_to := null;
  end if;
  if new.available_to is not null and new.available_from is not null and new.available_to < new.available_from then
    raise exception 'تاريخ «متاح لحد» قبل «متاح من»' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists properties_rent_normalize on public.properties;
create trigger properties_rent_normalize before insert or update on public.properties for each row execute function public.properties_rent_normalize();

-- 2) Customer requests and owner offers can be for summer too; an inquiry on a listing takes its purpose.
alter table public.leads drop constraint if exists leads_purpose_check;
alter table public.leads add constraint leads_purpose_check check (purpose is null or purpose in ('sale','rent','summer'));

create or replace function public.leads_purpose_from_property()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.property_id is not null and new.purpose is null then
    select case status when 'إيجار' then 'rent' when 'مصيف' then 'summer' else 'sale' end into new.purpose
    from public.properties where id = new.property_id;
  end if;
  return new;
end $$;
revoke execute on function public.leads_purpose_from_property() from public, anon, authenticated;
drop trigger if exists leads_purpose_from_property on public.leads;
create trigger leads_purpose_from_property before insert on public.leads for each row execute function public.leads_purpose_from_property();

-- 3) Deals: sale, monthly rent or summer booking.
alter table public.deals
  add column if not exists deal_type text not null default 'sale' check (deal_type in ('sale','rent','summer')),
  add column if not exists rent_monthly numeric check (rent_monthly is null or rent_monthly > 0),
  add column if not exists rent_start date,
  add column if not exists rent_end date;
alter table public.deals add constraint deals_rent_dates_check check (rent_end is null or rent_start is null or rent_end >= rent_start);
-- New deals take their type from the lead's purpose.
create or replace function public.deals_type_from_lead()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.deal_type = 'sale' then
    select case purpose when 'rent' then 'rent' when 'summer' then 'summer' else 'sale' end into new.deal_type
    from public.leads where id = new.lead_id;
  end if;
  if new.deal_type = 'rent' and new.review_status = 'pending' and coalesce(new.rent_monthly, 0) = 0 then
    raise exception 'اكتب الإيجار الشهري قبل الإرسال للمراجعة' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.deals_type_from_lead() from public, anon, authenticated;
drop trigger if exists deals_type_from_lead on public.deals;
-- 'deals_aa_type' fires before deals_guard (name order) so the guard sees the final type.
create trigger deals_aa_type before insert or update on public.deals for each row execute function public.deals_type_from_lead();

-- 4) Agreements per deal type.
alter table public.company_agreements
  add column if not exists deal_type text not null default 'sale' check (deal_type in ('sale','rent','summer'));

create or replace function public.agreement_for(_broker uuid, _on date, _type text)
returns public.company_agreements language sql stable security definer set search_path = public as $$
  select * from public.company_agreements
  where broker_id = _broker and deal_type = coalesce(_type, 'sale')
    and effective_from <= coalesce(_on, current_date) and (effective_to is null or effective_to >= coalesce(_on, current_date))
  order by effective_from desc limit 1
$$;
revoke execute on function public.agreement_for(uuid, date, text) from public, anon, authenticated;

-- Agreement type can't change once recorded.
create or replace function public.agreements_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.rate is distinct from old.rate or new.fixed_amount is distinct from old.fixed_amount or new.deal_type is distinct from old.deal_type
       or new.effective_from is distinct from old.effective_from or new.broker_id is distinct from old.broker_id then
      raise exception 'شروط الاتفاقية مايتعدّلوش — اقفل الاتفاقية وأضف واحدة جديدة' using errcode = '42501';
    end if;
    new.approved_by := old.approved_by; new.approved_at := old.approved_at;
  else
    new.approved_by := auth.uid(); new.approved_at := now();
  end if;
  return new;
end $$;
revoke execute on function public.agreements_guard() from public, anon, authenticated;

-- Commission basis by type: sale → sale value; rent → monthly rent (default 50% = half a month);
-- summer → booking total (sale_value).
create or replace function public.deals_commission_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare a public.company_agreements%rowtype; basis numeric; c public.commissions%rowtype; l public.leads%rowtype; v_rate numeric; v_fixed numeric;
begin
  basis := case new.deal_type when 'rent' then new.rent_monthly else coalesce(new.sale_value, new.contract_value) end;
  a := public.agreement_for(new.broker_id, coalesce(new.sale_date, new.contract_date, new.rent_start, current_date), new.deal_type);
  v_rate := a.rate; v_fixed := a.fixed_amount;
  if a.id is null and new.deal_type = 'rent' then v_rate := 50; end if;
  if tg_op = 'INSERT' then
    insert into public.commissions (deal_id, broker_id, agreement_id, basis_value, rate, fixed_amount, expected_amount)
    values (new.id, new.broker_id, a.id, basis, v_rate, v_fixed, public.commission_amount(basis, v_rate, v_fixed));
    return new;
  end if;
  select * into c from public.commissions where deal_id = new.id;
  if c.id is null then return new; end if;
  if c.status = 'expected' then
    perform set_config('va.internal', '1', true);
    update public.commissions set broker_id = new.broker_id, agreement_id = a.id, basis_value = basis, rate = v_rate, fixed_amount = v_fixed,
      expected_amount = public.commission_amount(basis, v_rate, v_fixed),
      status = case when new.review_status = 'approved' then 'pending_review' else 'expected' end
    where id = c.id;
    perform set_config('va.internal', '', true);
    if new.review_status = 'approved' and old.review_status is distinct from 'approved' then
      select * into l from public.leads where id = new.lead_id;
      perform public.notify_admins('admin', 'عمولة بانتظار الاعتماد',
        'C-' || lpad(c.commission_no::text, 6, '0') || ' — ' || l.name || coalesce(' — ' || (select name from public.brokers where id = new.broker_id), ''),
        new.lead_id, '/commissions');
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.deals_commission_sync() from public, anon, authenticated;
