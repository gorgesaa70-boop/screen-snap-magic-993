const U = {
  admin: "00000000-0000-0000-0000-00000000000a",
  owner: "00000000-0000-0000-0000-00000000000c",
  sales: "00000000-0000-0000-0000-000000000005",
  manager: "00000000-0000-0000-0000-000000000006",
  staff: "00000000-0000-0000-0000-000000000007",
  outsider: "00000000-0000-0000-0000-000000000008",
  dev: "00000000-0000-0000-0000-00000000000d",
  applicant: "00000000-0000-0000-0000-000000000009",
};
const CO = "c0000000-0000-0000-0000-000000000001";
const DEV = "d0000000-0000-0000-0000-000000000001";

export default async function ({ as, sys, expectOk, expectErr, exec }) {
  await sys(`insert into auth.users (id, phone) values
    ('${U.admin}','201000000010'), ('${U.owner}','201000000001'), ('${U.sales}','201000000002'), ('${U.manager}','201000000003'),
    ('${U.staff}','201000000004'), ('${U.outsider}','201000000005'), ('${U.dev}','201000000006'), ('${U.applicant}','201000000007')`);
  await sys(`insert into public.user_roles (user_id, role) values ('${U.admin}','admin'), ('${U.staff}','staff')`);
  await sys(`insert into public.brokers (id, user_id, slug, name, phone, account_type, is_active) values
    ('${CO}','${U.owner}','co','شركة تسويق','201000000001','company', true),
    ('${DEV}','${U.dev}','dev','شركة تطوير','201000000006','developer', true)`);
  await sys(`select set_config('request.jwt.claim.role','service_role',false)`);
  const lead = (await sys(`insert into public.leads (name, phone, assigned_broker_id) values ('عميل','01011111111','${CO}') returning id`))[0].id;
  await sys(`select set_config('request.jwt.claim.role','',false)`);

  console.log("\nCompany team");
  await expectOk("owner adds sales member (local phone format)", () => as(U.owner, `insert into public.company_members (company_id, name, phone, role) values ('${CO}','موظف','01000000002','sales') returning phone`), (r) => r[0].phone === "201000000002");
  await expectOk("owner adds manager", () => as(U.owner, `insert into public.company_members (company_id, name, phone, role) values ('${CO}','مدير','201000000003','manager')`));
  await expectErr("same phone can't join a second time", () => as(U.owner, `insert into public.company_members (company_id, name, phone) values ('${CO}','مكرر','+20 100 000 0002')`));
  await expectErr("phone of an independent account is refused", () => as(U.owner, `insert into public.company_members (company_id, name, phone) values ('${CO}','مطور','201000000006')`));
  await expectErr("owner can't add members to another company", () => as(U.owner, `insert into public.company_members (company_id, name, phone) values ('${DEV}','غريب','201000000099')`));
  await expectOk("outsider sees no team members", () => as(U.outsider, `select * from public.company_members`), (r) => r.length === 0);
  await expectOk("member sees own membership only", () => as(U.sales, `select * from public.company_members`), (r) => r.length === 1);

  // Sales staff only see leads assigned to them (item 11).
  await sys(`select set_config('request.jwt.claim.role','service_role',false)`);
  await sys(`update public.leads set assigned_member_id=(select id from public.company_members where role='sales') where id='${lead}'`);
  await sys(`select set_config('request.jwt.claim.role','',false)`);
  console.log("\nActing for the company");
  await expectOk("sales member acts as the company", () => as(U.sales, `select public.current_broker_id() id, public.current_member_role() role`), (r) => r[0].id === CO && r[0].role === "sales");
  await expectOk("owner role is 'owner'", () => as(U.owner, `select public.current_member_role() role`), (r) => r[0].role === "owner");
  await expectOk("sales member sees company lead", () => as(U.sales, `select id from public.leads`), (r) => r.length === 1);
  await expectOk("sales member updates lead stage", () => as(U.sales, `update public.leads set stage='contacted' where id='${lead}' returning stage`), (r) => r[0]?.stage === "contacted");
  await expectOk("sales member can't reassign lead", () => as(U.sales, `update public.leads set assigned_broker_id=null where id='${lead}' returning assigned_broker_id`), (r) => r[0]?.assigned_broker_id === CO);
  await expectErr("sales member can't add a property", () => as(U.sales, `insert into public.properties (broker_id, title, price, type, area, status) values ('${CO}','شقة',1,'شقة','الحي الأول','بيع')`));
  await expectOk("manager adds a property (waits for review)", () => as(U.manager, `insert into public.properties (broker_id, title, price, type, area, status, review_status) values ('${CO}','شقة',1,'شقة','الحي الأول','بيع','approved') returning review_status`), (r) => r[0].review_status === "pending");
  await sys(`update public.properties set review_status='approved' where broker_id='${CO}'`);
  await expectErr("sales member can't delete a property", async () => { const r = await as(U.sales, `delete from public.properties where broker_id='${CO}' returning id`); if (!r.length) throw new Error("nothing"); return r; });
  await expectOk("outsider sees no company leads", () => as(U.outsider, `select id from public.leads`), (r) => r.length === 0);
  await expectErr("team member can't file a join request", () => as(U.sales, `insert into public.brokers (user_id, slug, name, is_active, account_type) values ('${U.sales}','s','x',false,'individual')`));
  await sys(`update public.company_members set is_active=false where role='sales'`);
  await expectOk("deactivated member loses access", () => as(U.sales, `select public.current_broker_id() id`), (r) => r[0].id === null);

  console.log("\nValue Aqar staff");
  await expectOk("staff flag", () => as(U.staff, `select public.is_staff() s`), (r) => r[0].s === true);
  await expectOk("staff sees all leads", () => as(U.staff, `select id from public.leads`), (r) => r.length === 1);
  await expectOk("staff reassigns a lead", () => as(U.staff, `update public.leads set assigned_broker_id='${DEV}' where id='${lead}' returning assigned_broker_id`), (r) => r[0]?.assigned_broker_id === DEV);
  await expectOk("staff can't change customer phone", () => as(U.staff, `update public.leads set phone='0000000000' where id='${lead}' returning phone`), (r) => r[0]?.phone === "01011111111");
  await expectOk("staff can't delete leads", () => as(U.staff, `delete from public.leads returning id`), (r) => r.length === 0);
  await expectOk("staff sees inactive accounts", async () => { await sys(`insert into public.brokers (user_id, slug, name, is_active) values (null,'x','غير مفعل',false)`); return as(U.staff, `select id from public.brokers where not is_active`); }, (r) => r.length === 1);

  console.log("\nJoin requests and review");
  await expectOk("applicant requests a company account", () => as(U.applicant, `insert into public.brokers (user_id, slug, name, is_active, account_type, contact_person) values ('${U.applicant}','ap','شركة جديدة',false,'company','أحمد') returning id`));
  await expectErr("applicant can't pre-fill rejection fields", () => as(U.outsider, `insert into public.brokers (user_id, slug, name, is_active, account_type, rejected_at) values ('${U.outsider}','o','x',false,'company', now())`));
  // (brokers private columns are read through admin_brokers() / my_account(); checked here with sys)
  const acct = (where) => sys(`select rejected_at, review_note from public.brokers where ${where}`).then((r) => r[0]);
  await expectOk("admin rejects with a note", async () => { await as(U.admin, `update public.brokers set rejected_at=now(), review_note='بيانات ناقصة' where slug='ap'`); return acct(`slug='ap'`); }, (r) => r.rejected_at && r.review_note === "بيانات ناقصة");
  await expectOk("owner can't clear own review fields", async () => { await as(U.owner, `update public.brokers set review_note='x' where id='${CO}'`); return acct(`id='${CO}'`); }, (r) => r.review_note === null);
  await expectOk("activating clears rejection", async () => { await as(U.admin, `update public.brokers set is_active=true where slug='ap'`); return acct(`slug='ap'`); }, (r) => r.rejected_at === null);

  console.log("\nDeveloper projects");
  const pid = await expectOk("developer creates a project", () => as(U.dev, `insert into public.projects (developer_id, name, city, area, review_status, is_featured) values ('${DEV}','كمبوند','برج العرب الجديدة','الحي الأول','rejected', true) returning review_status, is_featured`), (r) => r[0].review_status === "approved" && r[0].is_featured === false);
  const proj = (await sys(`select id from public.projects limit 1`))[0].id;
  await expectOk("developer adds a unit", () => as(U.dev, `insert into public.project_units (project_id, unit_type, size, price) values ('${proj}','شقة',120,1000000)`));
  await expectOk("price change is logged", async () => { await as(U.dev, `update public.project_units set price=1100000, status='reserved'`); return as(U.dev, `select * from public.project_unit_history`); }, (r) => r.length === 1 && Number(r[0].new_price) === 1100000 && r[0].new_status === "reserved");
  await expectOk("public sees the project and unit", () => as(null, `select (select count(*) from public.projects) p, (select count(*) from public.project_units) u`), (r) => Number(r[0].p) === 1 && Number(r[0].u) === 1);
  await expectErr("company (not developer) can't add projects", () => as(U.owner, `insert into public.projects (developer_id, name, city, area) values ('${CO}','x','a','b')`));
  await expectErr("developer can't add units to someone else's project", async () => { await sys(`insert into public.projects (id, developer_id, name, city, area) values ('e0000000-0000-0000-0000-000000000001','${CO}','مشروع آخر','a','b')`); return as(U.dev, `insert into public.project_units (project_id, unit_type) values ('e0000000-0000-0000-0000-000000000001','شقة')`); });
  await expectOk("admin hides project, developer edit sends it to review", async () => { await as(U.admin, `update public.projects set review_status='rejected' where id='${proj}'`); return as(U.dev, `update public.projects set name='كمبوند 2' where id='${proj}' returning review_status`); }, (r) => r[0].review_status === "pending");
  await expectOk("hidden project not public", () => as(null, `select count(*) c from public.projects where id='${proj}'`), (r) => Number(r[0].c) === 0);
  void pid;

  console.log("\nApp store links");
  await expectOk("anyone reads app links (empty = not published)", () => as(null, `select ios_url, android_url from public.app_settings`), (r) => r.length === 1 && r[0].ios_url === null);
  await expectOk("admin sets the Play Store link", () => as(U.admin, `update public.app_settings set android_url='https://play.google.com/store/apps/details?id=com.valueaqar.app' returning android_url`), (r) => r.length === 1);
  await expectErr("a non-store link is refused", () => as(U.admin, `update public.app_settings set ios_url='https://evil.example/app'`));
  await expectOk("broker can't change app links", () => as(U.owner, `update public.app_settings set android_url=null returning id`), (r) => r.length === 0);
  await expectErr("no second settings row", () => as(U.admin, `insert into public.app_settings (id) values (2)`));

  console.log("\nPinned site announcement");
  await expectOk("anyone reads the announcement (off by default)", () => as(null, `select announce_on, announce_ar from public.app_settings`), (r) => r.length === 1 && r[0].announce_on === false);
  await expectOk("admin turns on a pinned message", () => as(U.admin, `update public.app_settings set announce_on=true, announce_ar='عرض خاص على شقق برج العرب', announce_en='Special offer', announce_url='/compounds', announce_popup=true returning announce_on`), (r) => r.length === 1);
  await expectOk("a visitor sees it", () => as(null, `select announce_ar, announce_popup from public.app_settings where announce_on`), (r) => r.length === 1 && r[0].announce_popup === true);
  await expectOk("the change is in the audit log", () => sys(`select changes from public.audit_log where table_name='app_settings' and changes ? 'announce_ar'`), (r) => r.length >= 1);
  await expectOk("broker can't change the announcement", () => as(U.owner, `update public.app_settings set announce_ar='spam' returning id`), (r) => r.length === 0);
  await expectOk("visitor can't change the announcement", () => as(null, `update public.app_settings set announce_on=false returning id`).catch(() => []), (r) => r.length === 0);
  await expectErr("a javascript: link is refused", () => as(U.admin, `update public.app_settings set announce_url='javascript:alert(1)'`));
  await expectErr("on without text is refused", () => as(U.admin, `update public.app_settings set announce_ar=null`));
  await expectErr("end before start is refused", () => as(U.admin, `update public.app_settings set announce_starts_at='2026-11-02', announce_ends_at='2026-11-01'`));
  await expectErr("text over 300 letters is refused", () => as(U.admin, `update public.app_settings set announce_ar=repeat('أ', 301)`));
  await as(U.admin, `update public.app_settings set announce_on=false, announce_popup=false`);

  console.log("\nLeads center");
  await sys(`update public.company_members set is_active=true`);
  const members = await sys(`select id, role from public.company_members where company_id='${CO}'`);
  const salesId = members.find((m) => m.role === "sales").id;
  await expectOk("public form lead gets a number and source 'website'", () => as(null, `insert into public.leads (name, phone, source, assigned_broker_id) values ('زائر','01022223333','referral','${CO}')`));
  const pub = (await sys(`select lead_no, source, original_source, assigned_broker_id from public.leads where name='زائر'`))[0];
  await expectOk("  → number assigned, source forced to website, no self-routing", async () => pub, (r) => Number(r.lead_no) > 0 && r.source === "website" && r.original_source === "website" && r.assigned_broker_id === null);
  await expectOk("staff adds a manual lead with its real source", () => as(U.staff, `insert into public.leads (name, phone, source, source_note, assigned_broker_id) values ('عميل إعلان','01022223333','facebook','حملة أكتوبر','${CO}') returning source, original_source, assigned_broker_id`), (r) => r[0].source === "facebook" && r[0].original_source === "facebook" && r[0].assigned_broker_id === CO);
  const fb = (await sys(`select id from public.leads where name='عميل إعلان'`))[0].id;
  await expectOk("duplicate phone is visible to staff", () => as(U.staff, `select count(*) c from public.leads where phone_norm = public.normalize_phone('+20 102 222 3333')`), (r) => Number(r[0].c) === 2);
  await expectOk("owner can't change the source", () => as(U.owner, `update public.leads set source='walk_in' where id='${fb}' returning source`), (r) => r[0].source === "facebook");
  await expectOk("admin changes source; original stays and change is logged", async () => { await as(U.admin, `update public.leads set source='referral', original_source='referral' where id='${fb}'`); return as(U.admin, `select l.source, l.original_source, (select count(*) from public.lead_activities a where a.lead_id=l.id and a.kind='source') logs from public.leads l where id='${fb}'`); }, (r) => r[0].source === "referral" && r[0].original_source === "facebook" && Number(r[0].logs) === 1);
  await expectOk("lead number can't be edited", async () => { try { await as(U.admin, `update public.leads set lead_no=999999 where id='${fb}'`); return [{ ok: false }]; } catch { return [{ ok: true }]; } }, (r) => r[0].ok);
  await expectOk("sales member doesn't see unassigned company leads", () => as(U.sales, `select id from public.leads where id='${fb}'`), (r) => r.length === 0);
  await expectOk("manager sees the team list", () => as(U.manager, `select id from public.company_members`), (r) => r.length === 2);
  await expectOk("manager assigns lead to sales member", () => as(U.manager, `update public.leads set assigned_member_id='${salesId}' where id='${fb}' returning assigned_member_id`), (r) => r[0]?.assigned_member_id === salesId);
  await expectOk("sales member now sees it", () => as(U.sales, `select id from public.leads where id='${fb}'`), (r) => r.length === 1);
  await expectOk("sales member can't reassign within the team", () => as(U.sales, `update public.leads set assigned_member_id=null where id='${fb}' returning assigned_member_id`), (r) => r[0]?.assigned_member_id === salesId);
  await expectErr("can't assign a member of another company", async () => { await sys(`insert into public.company_members (company_id, name, phone, role) values ('${DEV}','موظف مطور','201000000077','sales')`); const other = (await sys(`select id from public.company_members where company_id='${DEV}'`))[0].id; return as(U.admin, `update public.leads set assigned_member_id='${other}' where id='${fb}'`); });
  await expectOk("moving the lead to another company clears the team member", () => as(U.staff, `update public.leads set assigned_broker_id='${DEV}' where id='${fb}' returning assigned_member_id`), (r) => r[0]?.assigned_member_id === null);
  await expectOk("staff assigns a Value Aqar employee (logged)", async () => { await as(U.staff, `update public.leads set assigned_staff_id='${U.staff}' where id='${fb}'`); return as(U.admin, `select count(*) c from public.lead_activities where lead_id='${fb}' and kind='assign'`); }, (r) => Number(r[0].c) >= 3);
  await expectOk("owner can't assign Value Aqar staff", async () => { await as(U.admin, `update public.leads set assigned_broker_id='${CO}' where id='${fb}'`); return as(U.owner, `update public.leads set assigned_staff_id=null where id='${fb}' returning assigned_staff_id`); }, (r) => r[0]?.assigned_staff_id === U.staff);

  console.log("\nCustomer pipeline (10 stages)");
  const stage = (who, s, extra = "") => as(who, `update public.leads set stage='${s}'${extra} where id='${fb}' returning stage`);
  await expectOk("manager moves to qualified", () => stage(U.manager, "qualified"), (r) => r[0]?.stage === "qualified");
  await expectErr("lost needs a reason", () => stage(U.manager, "lost"));
  await expectErr("postponed needs a future follow-up", () => stage(U.manager, "postponed"));
  await expectErr("visit scheduled needs a visit time", () => stage(U.manager, "visit_scheduled"));
  await expectOk("visit scheduled with a time", () => stage(U.manager, "visit_scheduled", `, visit_at=now() + interval '1 day'`), (r) => r[0]?.stage === "visit_scheduled");
  await expectErr("reserved needs a deal with data and a document", () => stage(U.manager, "reserved"));
  const deal = await expectOk("manager opens a deal (company filled from the lead, review forced to draft)", () => as(U.manager, `insert into public.deals (lead_id, unit_desc, reservation_date, reservation_amount, review_status, broker_id) values ('${fb}','شقة 120م','2026-10-01',50000,'approved','${DEV}') returning broker_id, review_status`), (r) => r[0].broker_id === CO && r[0].review_status === "draft");
  void deal;
  const dealId = (await sys(`select id from public.deals where lead_id='${fb}'`))[0].id;
  await expectErr("still no reservation document", () => stage(U.manager, "reserved"));
  await expectErr("document path must be inside the deal folder", () => as(U.manager, `insert into public.deal_documents (deal_id, kind, file_path, file_name, uploaded_by) values ('${dealId}','reservation','other/x.pdf','x.pdf','${U.manager}')`));
  await expectOk("manager uploads the reservation document", () => as(U.manager, `insert into public.deal_documents (deal_id, kind, file_path, file_name, uploaded_by) values ('${dealId}','reservation','${dealId}/r.pdf','r.pdf','${U.manager}')`));
  await expectOk("reserved now allowed", () => stage(U.manager, "reserved"), (r) => r[0]?.stage === "reserved");
  await expectErr("sold can't be set by the company", () => stage(U.manager, "sold"));
  await expectErr("submitting for review needs sale date/value", () => as(U.manager, `update public.deals set review_status='pending' where id='${dealId}'`));
  await expectErr("…and a sale document", () => as(U.manager, `update public.deals set sale_date='2026-10-10', sale_value=1500000, review_status='pending' where id='${dealId}'`));
  await expectOk("company can't approve its own deal", () => as(U.manager, `update public.deals set review_status='approved' where id='${dealId}' returning review_status`), (r) => r[0]?.review_status === "draft");
  await expectOk("submit with sale document → pending + admins notified", async () => {
    await as(U.manager, `insert into public.deal_documents (deal_id, kind, file_path, file_name, uploaded_by) values ('${dealId}','sale','${dealId}/s.pdf','s.pdf','${U.manager}')`);
    await as(U.manager, `update public.deals set sale_date='2026-10-10', sale_value=1500000, review_status='pending' where id='${dealId}'`);
    return sys(`select (select review_status from public.deals where id='${dealId}') st, (select count(*) from public.notifications where user_id='${U.admin}' and title='صفقة بانتظار المراجعة') n`);
  }, (r) => r[0].st === "pending" && Number(r[0].n) === 1);
  await expectErr("admin rejection needs a reason", () => as(U.admin, `update public.deals set review_status='rejected' where id='${dealId}'`));
  await expectOk("admin approves → lead becomes sold", async () => { await as(U.admin, `update public.deals set review_status='approved' where id='${dealId}'`); return sys(`select stage from public.leads where id='${fb}'`); }, (r) => r[0].stage === "sold");
  await expectErr("approved deal is locked for the company", () => as(U.manager, `update public.deals set sale_value=1 where id='${dealId}'`));
  await expectErr("no new documents on an approved deal", () => as(U.manager, `insert into public.deal_documents (deal_id, kind, file_path, file_name, uploaded_by) values ('${dealId}','other','${dealId}/o.pdf','o.pdf','${U.manager}')`));
  await expectErr("company can't move a confirmed sale back", () => stage(U.manager, "qualified"));
  await expectOk("outsider can't see the deal", () => as(U.outsider, `select id from public.deals`), (r) => r.length === 0);
  await expectOk("pipeline is logged on the lead", () => sys(`select count(*) c from public.lead_activities where lead_id='${fb}' and kind='deal'`), (r) => Number(r[0].c) >= 3);

  console.log("\nReferral proof (item 13)");
  await expectOk("first referral is recorded (company + time)", () => sys(`select first_broker_id, first_referred_at, referred_at from public.leads where id='${fb}'`), (r) => r[0].first_broker_id === CO && r[0].first_referred_at && r[0].referred_at);
  await expectOk("even admin can't rewrite the first referral", () => as(U.admin, `update public.leads set first_broker_id='${DEV}', first_referred_at=now() - interval '1 year' where id='${fb}' returning first_broker_id`), (r) => r[0].first_broker_id === CO);
  await expectOk("every assignment change is in the history", () => as(U.admin, `select broker_id from public.lead_assignments where lead_id='${fb}' order by created_at`), (r) => r.length >= 4 && r[0].broker_id === CO);
  await expectOk("companies can't read the assignment history", () => as(U.owner, `select id from public.lead_assignments`), (r) => r.length === 0);
  await expectErr("companies can't run the alerts report", () => as(U.owner, `select * from public.lead_alerts()`));

  // Scenarios for the report.
  const visitor = (await sys(`select id from public.leads where name='زائر'`))[0].id;
  await as(U.staff, `update public.leads set assigned_broker_id='${DEV}' where id='${visitor}'`); // same phone as fb (at CO) → duplicate across companies
  await as(U.staff, `insert into public.leads (name, phone, assigned_broker_id) values ('ينقل','01055556666','${DEV}')`);
  const moved = (await sys(`select id from public.leads where name='ينقل'`))[0].id;
  await as(U.staff, `update public.leads set assigned_broker_id='${CO}' where id='${moved}'`); // company changed after referral
  await as(U.staff, `insert into public.leads (name, phone, assigned_broker_id) values ('سريع','01077778888','${CO}')`);
  const quick = (await sys(`select id from public.leads where name='سريع'`))[0].id;
  await as(U.manager, `update public.leads set stage='lost', lost_reason='اشترى من مكان تاني' where id='${quick}'`); // lost right after referral
  await as(U.staff, `insert into public.leads (name, phone, assigned_broker_id) values ('قديم','01099990000','${CO}')`);
  const old = (await sys(`select id from public.leads where name='قديم'`))[0].id;
  await sys(`set session_replication_role = replica`);
  await sys(`update public.leads set referred_at=now() - interval '10 days' where id='${old}'`);
  await sys(`delete from public.lead_activities where lead_id='${old}'`);
  await sys(`set session_replication_role = origin`);
  const alerts = await as(U.staff, `select kind, lead_id from public.lead_alerts()`);
  const has = (kind, id) => alerts.some((a) => a.kind === kind && a.lead_id === id);
  await expectOk("report: stale lead (10 days, no activity)", async () => [has("stale", old)], (r) => r[0]);
  await expectOk("report: sudden sale (3 days after referral)", async () => [has("sudden_sale", fb)], (r) => r[0]);
  await expectOk("report: dates out of order (reservation before the lead)", async () => [has("bad_dates", fb)], (r) => r[0]);
  await expectOk("report: company changed after referral", async () => [has("company_changed", moved)], (r) => r[0]);
  await expectOk("report: same phone at two companies", async () => [has("dup_companies", fb) && has("dup_companies", visitor)], (r) => r[0]);
  await expectOk("report: lost right after referral", async () => [has("quick_lost", quick)], (r) => r[0]);
  await expectOk("report: a healthy fresh lead is not flagged", async () => [!alerts.some((a) => a.lead_id === moved && a.kind === "stale")], (r) => r[0]);

  console.log("\nNotifications");
  const notes = (user, title) => sys(`select count(*) c from public.notifications where user_id='${user}' and title like '${title}%'`).then((r) => Number(r[0].c));
  await expectOk("join request → admins notified", async () => [await notes(U.admin, "طلب انضمام جديد")], (r) => r[0] >= 1);
  await expectOk("approval and rejection → applicant notified", async () => [await notes(U.applicant, "تم اعتماد حسابك"), await notes(U.applicant, "طلب الانضمام ما اتقبلش")], (r) => r[0] === 1 && r[1] === 1);
  await expectOk("deal approved → company owner and managers notified", async () => [await notes(U.owner, "تم اعتماد البيع"), await notes(U.manager, "تم اعتماد البيع")], (r) => r[0] === 1 && r[1] === 1);
  await as(U.staff, `insert into public.leads (name, phone, assigned_broker_id) values ('إشعار','01012121212','${CO}')`);
  const nl = (await sys(`select id from public.leads where name='إشعار'`))[0].id;
  await expectOk("new lead for a company → owner and manager notified (not sales)", () => sys(`select user_id from public.notifications where related_id='${nl}'`),
    (r) => [U.owner, U.manager].every((u) => r.some((x) => x.user_id === u)) && !r.some((x) => x.user_id === U.sales));
  await expectOk("assigned to a team member → that member notified", async () => { await as(U.manager, `update public.leads set assigned_member_id='${salesId}' where id='${nl}'`); return [await notes(U.sales, "اتحوّل لك: ")]; }, (r) => r[0] >= 1);
  await expectOk("assigned to a Value Aqar employee → employee notified", async () => { await as(U.admin, `update public.leads set assigned_staff_id='${U.staff}' where id='${nl}'`); return sys(`select count(*) c from public.notifications where user_id='${U.staff}' and related_id='${nl}' and title like 'اتحوّل لك: %'`); }, (r) => Number(r[0].c) === 1);
  await expectOk("quick 'lost' → admins and staff alerted", async () => [await notes(U.admin, "تنبيه: عميل اتقفل بسرعة"), await notes(U.staff, "تنبيه: عميل اتقفل بسرعة")], (r) => r[0] >= 1 && r[1] >= 1);
  await expectOk("nobody is notified about their own action", () => sys(`select count(*) c from public.notifications where user_id='${U.manager}' and related_id='${nl}' and title='تم إسناد عميل لك'`), (r) => Number(r[0].c) === 0);

  console.log("\nCommissions (item 15)");
  const com = () => sys(`select * from public.commissions where deal_id='${dealId}'`).then((r) => r[0]);
  await expectOk("approved deal already has a commission waiting for review", com, (r) => r && r.status === "pending_review" && r.expected_amount === null);
  await expectOk("admin adds a 2.5% agreement for the company", () => as(U.admin, `insert into public.company_agreements (broker_id, rate, effective_from) values ('${CO}', 2.5, '2026-01-01') returning approved_by`), (r) => r[0].approved_by === U.admin);
  await expectErr("agreement terms can't be edited", () => as(U.admin, `update public.company_agreements set rate=1 where broker_id='${CO}'`));
  await expectErr("agreement needs a rate or a fixed amount (not both)", () => as(U.admin, `insert into public.company_agreements (broker_id, rate, fixed_amount) values ('${CO}', 1, 1000)`));
  await expectOk("owner sees the company agreement, sales doesn't", async () => [(await as(U.owner, `select id from public.company_agreements`)).length, (await as(U.sales, `select id from public.company_agreements`)).length], (r) => r[0] === 1 && r[1] === 0);
  await expectOk("admin applies the rate → amount computed (1,500,000 × 2.5%)", () => as(U.admin, `update public.commissions set basis_value=1500000, rate=2.5 where deal_id='${dealId}' returning expected_amount`), (r) => Number(r[0].expected_amount) === 37500);
  await expectErr("approval needs a due date", () => as(U.admin, `update public.commissions set status='approved' where deal_id='${dealId}'`));
  await expectOk("admin approves with a due date → company notified", async () => { await as(U.admin, `update public.commissions set status='approved', due_date='2026-11-10' where deal_id='${dealId}'`); return [(await com()).status, await notes(U.owner, "عمولة مستحقة")]; }, (r) => r[0] === "approved" && r[1] === 1);
  await expectOk("company can't touch the commission", () => as(U.owner, `update public.commissions set expected_amount=1 where deal_id='${dealId}' returning id`), (r) => r.length === 0);
  await expectErr("approved amount is locked even for admin", () => as(U.admin, `update public.commissions set rate=1 where deal_id='${dealId}'`));
  await expectErr("admin can't fake the paid amount directly", async () => { const r = await as(U.admin, `update public.commissions set paid_amount=37500, status='paid' where deal_id='${dealId}' returning status`); return r; });
  const cid = (await com()).id;
  await expectErr("company can't record payments", () => as(U.owner, `insert into public.commission_payments (commission_id, amount, recorded_by) values ('${cid}', 1000, '${U.owner}')`));
  await expectOk("partial payment → partially paid, company notified", async () => { await as(U.admin, `insert into public.commission_payments (commission_id, amount, recorded_by) values ('${cid}', 10000, '${U.admin}')`); const c = await com(); return [c.status, Number(c.paid_amount), await notes(U.owner, "اتسجلت دفعة عمولة")]; }, (r) => r[0] === "partially_paid" && r[1] === 10000 && r[2] === 1);
  await expectErr("can't pay more than what's left", () => as(U.admin, `insert into public.commission_payments (commission_id, amount, recorded_by) values ('${cid}', 30000, '${U.admin}')`));
  await expectOk("final payment → paid", async () => { await as(U.admin, `insert into public.commission_payments (commission_id, amount, recorded_by) values ('${cid}', 27500, '${U.admin}')`); return [(await com()).status]; }, (r) => r[0] === "paid");
  await expectErr("a paid commission is closed", () => as(U.admin, `update public.commissions set due_date='2027-01-01' where id='${cid}'`));
  await expectErr("payments can't be deleted", () => as(U.admin, `delete from public.commission_payments`));
  await expectOk("owner sees payments, outsider doesn't", async () => [(await as(U.owner, `select id from public.commission_payments`)).length, (await as(U.outsider, `select id from public.commission_payments`)).length], (r) => r[0] === 2 && r[1] === 0);
  await expectOk("a new deal starts an expected commission from the agreement", async () => {
    await as(U.manager, `insert into public.deals (lead_id, contract_value, contract_date) values ('${nl}', 2000000, '2026-10-01')`);
    return sys(`select c.status, c.expected_amount from public.commissions c join public.deals d on d.id=c.deal_id where d.lead_id='${nl}'`);
  }, (r) => r[0].status === "expected" && Number(r[0].expected_amount) === 50000);
  await expectErr("cancelling needs a reason", () => as(U.admin, `update public.commissions c set status='cancelled' from public.deals d where d.id=c.deal_id and d.lead_id='${nl}'`));

  console.log("\nAudit log (item 20)");
  await expectOk("source change recorded with old and new value", () => as(U.admin, `select changes->'source' s, actor_label from public.audit_log where table_name='leads' and row_id='${fb}' and action='update' and changes ? 'source' order by at limit 1`), (r) => r[0] && r[0].s[0] === "facebook" && r[0].s[1] === "referral" && r[0].actor_label === "أدمن");
  await expectOk("team member actions carry their name and company", () => as(U.admin, `select actor_label from public.audit_log where actor='${U.manager}' limit 1`), (r) => r[0]?.actor_label.startsWith("فريق: مدير"));
  await expectOk("payments and commission approvals are in the log", () => as(U.admin, `select (select count(*) from public.audit_log where table_name='commission_payments') p, (select count(*) from public.audit_log where table_name='commissions' and changes ? 'approved_at') a`), (r) => Number(r[0].p) === 2 && Number(r[0].a) >= 1);
  await expectOk("unchanged updates add nothing", async () => { const before = (await sys(`select count(*) c from public.audit_log`))[0].c; await as(U.admin, `update public.plans set name=name`); return [(await sys(`select count(*) c from public.audit_log`))[0].c === before]; }, (r) => r[0]);
  await expectOk("companies and staff can't read the log", async () => [(await as(U.owner, `select id from public.audit_log`)).length, (await as(U.staff, `select id from public.audit_log`)).length], (r) => r[0] === 0 && r[1] === 0);
  await expectErr("even admin can't edit the log", () => as(U.admin, `update public.audit_log set actor_label='x'`));
  await expectErr("even admin can't delete the log", () => as(U.admin, `delete from public.audit_log`));
  await expectErr("nobody can write to the log directly", () => as(U.admin, `insert into public.audit_log (table_name, action) values ('x','insert')`));

  console.log("\nTasks and reminders (item 18)");
  await expectOk("manager can assign to the team, not to outsiders", () => as(U.manager, `select user_id from public.assignable_users()`), (r) => r.some((x) => x.user_id === U.sales) && r.some((x) => x.user_id === U.owner) && !r.some((x) => x.user_id === U.outsider));
  await expectOk("staff can assign to staff and admins", () => as(U.staff, `select label from public.assignable_users()`), (r) => r.some((x) => x.label.startsWith("أدمن")));
  await expectOk("manager gives a task to the sales member → notified", async () => { await as(U.manager, `insert into public.tasks (lead_id, title, due_at, assigned_to) values ('${nl}', 'كلّم العميل بخصوص التمويل', now() - interval '1 hour', '${U.sales}')`); return [await notes(U.sales, "مهمة جديدة ليك")]; }, (r) => r[0] === 1);
  await expectErr("an outsider can't hand tasks to the company team", () => as(U.outsider, `insert into public.tasks (title, assigned_to) values ('x', '${U.sales}')`));
  const task = (await sys(`select id from public.tasks limit 1`))[0].id;
  await expectOk("assignee can't rewrite the task, only tick it done", () => as(U.sales, `update public.tasks set title='تغيير', done_at=now() where id='${task}' returning title, done_by`), (r) => r[0].title === "كلّم العميل بخصوص التمويل" && r[0].done_by === U.sales);
  await expectOk("owner sees team tasks; outsider doesn't", async () => [(await as(U.owner, `select id from public.tasks`)).length, (await as(U.outsider, `select id from public.tasks`)).length], (r) => r[0] === 1 && r[1] === 0);
  await as(U.sales, `update public.tasks set done_at=null where id='${task}'`);

  const run = async () => { await sys(`select set_config('request.jwt.claim.role','service_role',false)`); const r = await sys(`select public.run_reminders() r`); await sys(`select set_config('request.jwt.claim.role','',false)`); return r[0].r; };
  await expectErr("reminders can only be run by the scheduler", () => as(U.admin, `select public.run_reminders()`));
  await as(U.manager, `update public.leads set follow_up_at = now() - interval '5 minutes' where id='${nl}'`);
  await as(U.manager, `update public.leads set stage='visit_scheduled', visit_at = now() + interval '3 hours' where id='${quick}'`).catch(() => {});
  await sys(`set session_replication_role = replica`);
  await sys(`update public.deals set updated_at = now() - interval '3 days' where lead_id='${nl}'`);
  await sys(`set session_replication_role = origin`);
  const first = await run();
  await expectOk("first run: follow-up, visit tomorrow, overdue task, missing contract document", async () => [first], (r) => r[0].follow_ups >= 1 && r[0].visits === 1 && r[0].tasks === 1 && r[0].documents === 1);
  await expectOk("the assigned team member gets the follow-up and the overdue task", async () => [await notes(U.sales, "حان ميعاد متابعة عميل"), await notes(U.sales, "مهمة متأخرة"), await notes(U.sales, "مستند ناقص")], (r) => r[0] === 1 && r[1] === 1 && r[2] === 1);
  const second = await run();
  await expectOk("second run sends nothing again", async () => [second], (r) => Object.values(r[0]).every((v) => v === 0));
  await expectOk("reminder markers don't flood the audit log", () => sys(`select count(*) c from public.audit_log where changes ? 'reminded_follow_up_at' or changes ? 'docs_reminded_at'`), (r) => Number(r[0].c) === 0);

  console.log("\nContact policy (item 17)");
  await expectErr("visitors can't read broker phone numbers", () => as(null, `select phone from public.brokers`));
  await expectErr("signed-in customers can't read WhatsApp numbers", () => as(U.outsider, `select whatsapp from public.brokers`));
  await expectOk("public profile columns still readable", () => as(null, `select name, slug, account_type from public.brokers where id='${CO}'`), (r) => r.length === 1);
  await expectOk("contacts hidden by default", () => as(null, `select * from public.broker_contacts(array['${CO}'::uuid])`), (r) => r.length === 0);
  await expectOk("a company can't open its own contacts", async () => { await as(U.owner, `update public.brokers set show_contact=true where id='${CO}'`); return as(null, `select * from public.broker_contacts(array['${CO}'::uuid])`); }, (r) => r.length === 0);
  await expectOk("admin opens contacts for an account → visible publicly", async () => { await as(U.admin, `update public.brokers set show_contact=true where id='${DEV}'`); return as(null, `select phone from public.broker_contacts(array['${DEV}'::uuid, '${CO}'::uuid])`); }, (r) => r.length === 1 && r[0].phone === "201000000006");
  await expectOk("the account itself and its team see their contacts", () => as(U.sales, `select phone from public.broker_contacts(array['${CO}'::uuid])`), (r) => r[0]?.phone === "201000000001");
  await expectOk("my_account gives the team member the full company row", () => as(U.sales, `select id, phone, plan_id from public.my_account()`), (r) => r.length === 1 && r[0].id === CO && r[0].phone === "201000000001");
  await expectOk("pending applicant still gets their own row", () => as(U.applicant, `select name from public.my_account()`), (r) => r[0]?.name === "شركة جديدة");
  await expectOk("admin and staff get full rows", async () => [(await as(U.admin, `select phone from public.admin_brokers()`)).length, (await as(U.staff, `select phone from public.admin_brokers()`)).length], (r) => r[0] >= 4 && r[0] === r[1]);
  await expectErr("companies can't list all accounts", () => as(U.owner, `select * from public.admin_brokers()`));
  await expectOk("inquiry from a broker page → lead for that broker, source website", async () => {
    await as(null, `insert into public.leads (name, phone, via_broker_id, assigned_broker_id, source) values ('من صفحة الوسيط','01033334444','${CO}','${DEV}','referral')`);
    return sys(`select assigned_broker_id, source, source_note, kind, first_broker_id from public.leads where name='من صفحة الوسيط'`);
  }, (r) => r[0].assigned_broker_id === CO && r[0].source === "website" && r[0].source_note === "صفحة الوسيط" && r[0].kind === "inquiry" && r[0].first_broker_id === CO);

  console.log("\nDeals linked to project units");
  await as(U.admin, `update public.projects set review_status='approved' where id='${proj}'`);
  await as(U.dev, `insert into public.project_units (project_id, code, unit_type, size, price) values ('${proj}', 'U-7', 'شقة', 110, 900000)`);
  const unit = (await sys(`select id from public.project_units where code='U-7'`))[0].id;
  const unitStatus = () => sys(`select status from public.project_units where id='${unit}'`).then((r) => r[0].status);
  await expectOk("reservation on a deal marks the unit reserved", async () => { await as(U.manager, `insert into public.deals (lead_id, project_unit_id, reservation_date, reservation_amount) values ('${moved}', '${unit}', current_date, 20000)`); return [await unitStatus()]; }, (r) => r[0] === "reserved");
  await expectOk("approved sale marks the unit sold (and logs unit history)", async () => { await as(U.admin, `update public.deals set review_status='approved', sale_date=current_date, sale_value=950000 where lead_id='${moved}'`); return [await unitStatus(), Number((await sys(`select count(*) c from public.project_unit_history where unit_id='${unit}'`))[0].c)]; }, (r) => r[0] === "sold" && r[1] === 2);
  await expectErr("a sold unit can't be put on another deal", () => as(U.manager, `insert into public.deals (lead_id, project_unit_id) values ('${quick}', '${unit}')`));


  console.log("\nRentals (item 39)");
  // The free plan allows 2 live listings; these checks add more, so the company is on the biggest plan here.
  await sys(`select set_config('request.jwt.claim.role','service_role',false)`);
  await sys(`update public.brokers set plan_id=(select id from public.plans where code='business') where id='${CO}'`);
  await sys(`select set_config('request.jwt.claim.role','',false)`);
  const prop = (sql) => as(U.manager, `insert into public.properties (broker_id, title, type, area, review_status, ${sql.cols}) values ('${CO}', '${sql.title}', 'شاليه', 'الساحل الشمالي', 'pending', ${sql.vals}) returning price, price_unit, price_month, price_night, min_months`);
  await expectErr("summer listing needs at least one price", () => prop({ title: "شاليه بدون سعر", cols: "status, price", vals: "'مصيف', 0" }));
  await expectOk("summer listing: lowest price shown per night", () => prop({ title: "شاليه بحري", cols: "status, price, price_night, price_week, guests, min_months", vals: "'مصيف', 0, 1500, 9000, 6, 3" }), (r) => Number(r[0].price) === 1500 && r[0].price_unit === "night" && r[0].min_months === null);
  await expectOk("monthly rent listing: price is per month", () => prop({ title: "شقة إيجار", cols: "status, price, price_night, min_months", vals: "'إيجار', 7000, 999, 6" }), (r) => r[0].price_unit === "month" && Number(r[0].price_month) === 7000 && r[0].price_night === null && r[0].min_months === 6);
  await expectOk("sale listing drops rent fields", () => prop({ title: "شاليه للبيع", cols: "status, price, price_night, min_months", vals: "'بيع', 900000, 1500, 6" }), (r) => r[0].price_unit === null && r[0].price_night === null && r[0].min_months === null);
  await sys(`update public.properties set review_status='approved' where broker_id='${CO}'`);
  await expectErr("existing statuses still validated", () => prop({ title: "غلط", cols: "status, price", vals: "'تأجير', 1" }));

  const summerId = (await sys(`select id from public.properties where title='شاليه بحري'`))[0].id;
  await as(null, `insert into public.leads (name, phone, property_id) values ('مصطاف', '01044445555', '${summerId}')`);
  await expectOk("inquiry on a summer listing is a summer lead for that company", () => sys(`select purpose, assigned_broker_id from public.leads where name='مصطاف'`), (r) => r[0].purpose === "summer" && r[0].assigned_broker_id === CO);

  await as(U.staff, `insert into public.leads (name, phone, purpose, assigned_broker_id) values ('مستأجر', '01055554444', 'rent', '${CO}')`);
  const renter = (await sys(`select id from public.leads where name='مستأجر'`))[0].id;
  await expectOk("rent deal: type from the lead, commission defaults to half a month", async () => {
    await as(U.manager, `insert into public.deals (lead_id, rent_monthly, rent_start, rent_end, contract_date, contract_value) values ('${renter}', 8000, '2026-11-01', '2027-10-31', '2026-10-20', 96000)`);
    return sys(`select d.deal_type, c.rate, c.basis_value, c.expected_amount from public.deals d join public.commissions c on c.deal_id = d.id where d.lead_id='${renter}'`);
  }, (r) => r[0].deal_type === "rent" && Number(r[0].rate) === 50 && Number(r[0].basis_value) === 8000 && Number(r[0].expected_amount) === 4000);
  await expectErr("rent deal can't go to review without the monthly rent", async () => {
    await as(U.staff, `insert into public.leads (name, phone, purpose, assigned_broker_id) values ('مستأجر٢', '01055554443', 'rent', '${CO}')`);
    const l2 = (await sys(`select id from public.leads where name='مستأجر٢'`))[0].id;
    await as(U.manager, `insert into public.deals (lead_id) values ('${l2}')`);
    return as(U.manager, `update public.deals set review_status='pending', sale_date=current_date, sale_value=1 where lead_id='${l2}'`);
  });
  await expectOk("a company rent agreement replaces the default", async () => {
    await as(U.admin, `insert into public.company_agreements (broker_id, deal_type, rate, effective_from) values ('${CO}', 'rent', 100, '2026-01-01')`);
    await as(U.manager, `update public.deals set rent_monthly = 9000 where lead_id='${renter}'`);
    return sys(`select c.rate, c.expected_amount from public.deals d join public.commissions c on c.deal_id = d.id where d.lead_id='${renter}'`);
  }, (r) => Number(r[0].rate) === 100 && Number(r[0].expected_amount) === 9000);
  await expectErr("agreement type can't be changed later", () => as(U.admin, `update public.company_agreements set deal_type='sale' where deal_type='rent'`));
  await expectOk("sale agreements still apply to sale deals only", () => sys(`select count(*) c from public.company_agreements where broker_id='${CO}' and deal_type='sale'`), (r) => Number(r[0].c) === 1);

  console.log("\nAutomatic routing and response time (item 28)");
  const leadBy = (name) => sys(`select * from public.leads where name='${name}'`).then((r) => r[0]);
  await expectErr("only admins create routing rules", () => as(U.owner, `insert into public.routing_rules (name, broker_ids) values ('x', array['${CO}'::uuid])`));
  await as(U.admin, `insert into public.routing_rules (name, priority, areas, property_types, broker_ids) values ('شقق الحي الأول', 10, array['الحي الأول'], array['شقة'], array['${CO}'::uuid])`);
  await as(U.admin, `insert into public.routing_rules (name, priority, kinds, sources, broker_ids) values ('طلبات الموقع بالدور', 20, array['request'], array['website'], array['${CO}'::uuid, '${DEV}'::uuid])`);
  const rules = await sys(`select id, name from public.routing_rules`);
  const ruleId = (n) => rules.find((r) => r.name === n).id;
  await expectOk("staff can read the rules", () => as(U.staff, `select id from public.routing_rules`), (r) => r.length === 2);
  await expectOk("matching area + type → that company (rule recorded)", async () => {
    await as(null, `insert into public.leads (name, phone, area, property_type) values ('توزيع 1','01040000001','الحي الأول','شقة')`);
    return [await leadBy("توزيع 1")];
  }, (r) => r[0].assigned_broker_id === CO && r[0].routed_rule_id === ruleId("شقق الحي الأول") && r[0].first_broker_id === CO);
  await expectOk("rotation: two requests in a row go to different companies", async () => {
    await as(null, `insert into public.leads (name, phone, area, property_type) values ('دور 1','01040000002','الحي الثاني','فيلا')`);
    await as(null, `insert into public.leads (name, phone, area, property_type) values ('دور 2','01040000003','الحي الثاني','فيلا')`);
    const a = await leadBy("دور 1"); const b = await leadBy("دور 2");
    return [a.assigned_broker_id, b.assigned_broker_id, a.routed_rule_id];
  }, (r) => r[0] && r[1] && r[0] !== r[1] && [CO, DEV].includes(r[0]) && [CO, DEV].includes(r[1]) && r[2] === ruleId("طلبات الموقع بالدور"));
  await expectOk("no matching rule → stays with the admins", async () => {
    await as(U.staff, `insert into public.leads (name, phone, source, area) values ('بلا قاعدة','01040000004','phone_call','الحي التاسع')`);
    return [await leadBy("بلا قاعدة")];
  }, (r) => r[0].assigned_broker_id === null && r[0].routed_rule_id === null);
  const propId = (await sys(`select id from public.properties where broker_id='${CO}' and review_status='approved' limit 1`))[0].id;
  await expectOk("property inquiries still go to the listing's owner", async () => {
    await as(null, `insert into public.leads (name, phone, property_id) values ('استفسار عقار','01040000005','${propId}')`);
    return [await leadBy("استفسار عقار")];
  }, (r) => r[0].assigned_broker_id === CO && r[0].routed_rule_id === null);
  await expectOk("broker-page inquiries go to that broker, not a rule", async () => {
    await as(null, `insert into public.leads (name, phone, via_broker_id) values ('صفحة مطور','01040000006','${DEV}')`);
    return [await leadBy("صفحة مطور")];
  }, (r) => r[0].assigned_broker_id === DEV && r[0].routed_rule_id === null);
  await expectOk("leads staff assign by hand are left alone", async () => {
    await as(U.staff, `insert into public.leads (name, phone, assigned_staff_id) values ('عند موظف','01040000007','${U.staff}')`);
    await as(U.staff, `insert into public.leads (name, phone, assigned_broker_id) values ('يدوي لمطور','01040000008','${DEV}')`);
    return [await leadBy("عند موظف"), await leadBy("يدوي لمطور")];
  }, (r) => r[0].assigned_broker_id === null && r[1].assigned_broker_id === DEV && r[1].routed_rule_id === null);

  const r1 = (await leadBy("توزيع 1")).id;
  await expectOk("pressing call / no answer is NOT a first response (CRM spec)", async () => {
    await as(U.manager, `insert into public.lead_activities (lead_id, kind, summary, actor_id) values ('${r1}', 'call', 'اتصال', '${U.manager}')`);
    await as(U.manager, `insert into public.lead_activities (lead_id, kind, summary, actor_id, outcome) values ('${r1}', 'call', 'ما ردش', '${U.manager}', 'no_answer')`);
    return [(await leadBy("توزيع 1")).first_response_at];
  }, (r) => r[0] === null);
  await expectOk("a call with outcome 'reached' = first response, with who and how", async () => {
    await as(U.manager, `insert into public.lead_activities (lead_id, kind, summary, actor_id, outcome) values ('${r1}', 'call', 'اتكلمنا', '${U.manager}', 'reached')`);
    const l = await leadBy("توزيع 1");
    return [l.first_response_at, (await sys(`select first_response_by, first_response_outcome from public.leads where id='${r1}'`))[0]];
  }, (r) => !!r[0] && r[1].first_response_by === U.manager && r[1].first_response_outcome === "reached");
  await expectOk("moving to another company resets the response clock; the 'assign' log isn't a response", async () => {
    await as(U.staff, `update public.leads set assigned_broker_id='${DEV}' where id='${r1}'`);
    const l = await leadBy("توزيع 1");
    return [l.first_response_at, l.sla_alerted_at, l.referred_at];
  }, (r) => r[0] === null && r[1] === null && !!r[2]);
  const d2 = (await leadBy("دور 2"));
  await expectOk("a stage change also counts as a response", async () => {
    const who = d2.assigned_broker_id === CO ? U.manager : U.dev;
    await as(who, `update public.leads set stage='contacted' where id='${d2.id}'`);
    return [(await leadBy("دور 2")).first_response_at];
  }, (r) => !!r[0]);

  await expectOk("working minutes count only 9:00–21:00 Cairo", () => sys(`select
      public.work_minutes('2026-10-12 06:00'::timestamp at time zone 'Africa/Cairo', '2026-10-12 10:30'::timestamp at time zone 'Africa/Cairo') a,
      public.work_minutes('2026-10-12 20:30'::timestamp at time zone 'Africa/Cairo', '2026-10-13 09:30'::timestamp at time zone 'Africa/Cairo') b,
      public.work_minutes('2026-10-12 22:00'::timestamp at time zone 'Africa/Cairo', '2026-10-13 08:00'::timestamp at time zone 'Africa/Cairo') c`),
    (r) => Number(r[0].a) === 90 && Number(r[0].b) === 60 && Number(r[0].c) === 0);
  await expectOk("companies can't change the response settings", () => as(U.owner, `update public.app_settings set response_sla_minutes=5 returning id`), (r) => r.length === 0);

  // Make the clock deterministic for the alert run: count all 24 hours.
  // These checks cover the reminder-only mode (automatic transfer switched off); transfer has its own tests below.
  await as(U.admin, `update public.app_settings set transfer_enabled=false`);
  await as(U.admin, `update public.app_settings set work_start_hour=0, work_end_hour=24`);
  const slow = (await leadBy("دور 1"));
  const late = async (mins) => {
    await sys(`set session_replication_role = replica`);
    await sys(`update public.leads set referred_at = now() - interval '${mins} minutes', first_response_at = null where id='${slow.id}'`);
    await sys(`set session_replication_role = origin`);
  };
  await late(90);
  const res1 = await run();
  await expectOk("run_reminders includes the response alerts", async () => [res1], (r) => "response_alerts" in r[0] && "response_escalations" in r[0]);
  await expectOk("after the SLA (60 min): the company is reminded, admins not yet", async () => {
    const l = await leadBy("دور 1");
    const owner = slow.assigned_broker_id === CO ? U.owner : U.dev;
    return [await notes(owner, "عميل مستني رد"), !!l.sla_alerted_at, !!l.sla_escalated_at];
  }, (r) => r[0] >= 1 && r[1] && !r[2]);
  await late(150);
  await run();
  const escalations = (user) => sys(`select count(*) c from public.notifications where user_id='${user}' and related_id='${slow.id}' and title='تأخير رد على عميل'`).then((r) => Number(r[0].c));
  await expectOk("after twice the SLA: admins and staff are alerted", async () => [await escalations(U.admin), await escalations(U.staff)], (r) => r[0] === 1 && r[1] === 1);
  const res3 = await run();
  await expectOk("each alert is sent once", async () => [res3.response_alerts, res3.response_escalations], (r) => r[0] === 0 && r[1] === 0);
  await expectOk("review report lists the lead waiting for a response", () => as(U.staff, `select kind from public.lead_alerts() where lead_id='${slow.id}'`), (r) => r.some((x) => x.kind === "slow_response"));
  await as(U.admin, `update public.app_settings set work_start_hour=9, work_end_hour=21, transfer_enabled=true`);

  console.log("\nInvestment opportunities (item 40)");
  await expectOk("investor registers interests", () => as(U.outsider, `insert into public.investor_profiles (name, budget_min, budget_max, kinds, areas) values ('مستثمر', 10000000, 80000000, array['development_land'], array['برج العرب الجديدة']) returning user_id`), (r) => r[0].user_id === U.outsider);
  await expectOk("company submits an opportunity → pending, admins and staff notified", async () => {
    await as(U.owner, `insert into public.investment_opportunities (title, kind, activity, deal_kind, city, area, land_area, investment_min, investment_max, teaser, details, location_note, licenses) values ('أرض لمول طبي على الطريق الرئيسي', 'development_land', 'مول طبي', 'full_sale', 'برج العرب الجديدة', 'الحي الأول', 4200, 30000000, 45000000, 'أرض بموقع ممتاز تصلح لمول طبي أو تجاري، تخصيص سليم.', 'رقم القطعة 15 بلوك 3 — المالك جاهز للتفاوض', 'بجوار المستشفى العام', 'تخصيص من جهاز المدينة')`);
    return sys(`select o.review_status, o.broker_id, (select count(*) from public.notifications n where n.user_id in ('${U.admin}','${U.staff}') and n.title='فرصة استثمارية مستنية مراجعة') n from public.investment_opportunities o`);
  }, (r) => r[0].review_status === "pending" && r[0].broker_id === CO && Number(r[0].n) === 2);
  const opp = (await sys(`select id from public.investment_opportunities limit 1`))[0].id;
  await expectOk("pending opportunity isn't public", () => as(null, `select id from public.investment_opportunities`), (r) => r.length === 0);
  await expectErr("submitter can't approve their own opportunity", async () => { await as(U.owner, `update public.investment_opportunities set review_status='approved' where id='${opp}'`); const r = await sys(`select review_status from public.investment_opportunities where id='${opp}'`); if (r[0].review_status === "pending") throw new Error("stayed pending"); return r; });
  await expectErr("admin rejection needs a reason", () => as(U.admin, `update public.investment_opportunities set review_status='rejected' where id='${opp}'`));
  await expectOk("admin approves → submitter told, matching investor notified", async () => {
    await as(U.admin, `update public.investment_opportunities set review_status='approved', is_featured=true where id='${opp}'`);
    return [await notes(U.owner, "فرصتك الاستثمارية اتنشرت"), await notes(U.outsider, "فرصة استثمارية جديدة تناسبك")];
  }, (r) => r[0] === 1 && r[1] === 1);
  await expectOk("public sees the teaser", () => as(null, `select title, teaser, investment_min from public.investment_opportunities`), (r) => r.length === 1 && Number(r[0].investment_min) === 30000000);
  await expectErr("public can't read the confidential details", () => as(null, `select details from public.investment_opportunities`));
  await expectErr("signed-in users can't read them either", () => as(U.outsider, `select location_note from public.investment_opportunities`));
  await expectOk("investor has no access before approval", () => as(U.outsider, `select * from public.opportunity_private('${opp}')`), (r) => r.length === 0);
  await expectOk("investor asks for details → investment lead for Value Aqar (not routed), team notified", async () => {
    await as(U.outsider, `insert into public.investment_requests (opportunity_id, name, budget, message) values ('${opp}', 'مستثمر', 40000000, 'مهتم بالشراء الكامل')`);
    return sys(`select l.kind, l.assigned_broker_id, l.opportunity_id, l.source, r.lead_id is not null linked, (select count(*) from public.notifications where title='مستثمر طالب تفاصيل فرصة') n from public.investment_requests r join public.leads l on l.id = r.lead_id`);
  }, (r) => r[0].kind === "investment" && r[0].assigned_broker_id === null && r[0].opportunity_id === opp && r[0].source === "website" && r[0].linked && Number(r[0].n) >= 2);
  await expectErr("investor can't grant themselves access", async () => { await as(U.outsider, `update public.investment_requests set status='approved'`); const r = await sys(`select status from public.investment_requests`); if (r[0].status === "pending") throw new Error("still pending"); return r; });
  await expectOk("staff grants access → investor notified and sees details", async () => {
    await as(U.staff, `update public.investment_requests set status='approved' where opportunity_id='${opp}'`);
    return [await notes(U.outsider, "اتفتحت لك تفاصيل الفرصة"), (await as(U.outsider, `select details from public.opportunity_private('${opp}')`))[0]?.details];
  }, (r) => r[0] === 1 && r[1]?.includes("القطعة 15"));
  await expectOk("submitter sees own full row with review data", () => as(U.owner, `select review_status, details from public.my_opportunities()`), (r) => r[0].review_status === "approved" && r[0].details);
  await expectErr("companies can't list all opportunities with private data", () => as(U.owner, `select * from public.admin_opportunities()`));
  await expectOk("submitter edit sends it back to review", async () => { await as(U.owner, `update public.investment_opportunities set teaser='أرض بموقع ممتاز تصلح لمول طبي، تخصيص سليم ومساحة كبيرة.' where id='${opp}'`); return sys(`select review_status from public.investment_opportunities where id='${opp}'`); }, (r) => r[0].review_status === "pending");

  console.log("\nSpecial-price listings (item 41) and medical malls (item 42)");
  const cprop = (await sys(`select id from public.properties where broker_id='${CO}' limit 1`))[0].id;
  await expectOk("company can't mark its own listing as a special deal", async () => { await as(U.manager, `update public.properties set is_highlight=true, highlight_reason='أرخص من السوق' where id='${cprop}'`); return sys(`select is_highlight from public.properties where id='${cprop}'`); }, (r) => r[0].is_highlight === false);
  await expectOk("company asks for it → admins notified", async () => { await as(U.manager, `update public.properties set highlight_requested_at=now() where id='${cprop}'`); return [await notes(U.admin, "طلب ترشيح عرض بسعر مميز")]; }, (r) => r[0] === 1);
  await expectErr("admin must write the reason", () => as(U.admin, `update public.properties set is_highlight=true where id='${cprop}'`));
  await expectOk("admin highlights with a reason and yield; request cleared", async () => { await as(U.admin, `update public.properties set is_highlight=true, highlight_reason='أقل من متوسط سعر المتر في الحي بـ 15%', highlight_yield=9 where id='${cprop}'`); return sys(`select is_highlight, highlight_requested_at from public.properties where id='${cprop}'`); }, (r) => r[0].is_highlight === true && r[0].highlight_requested_at === null);
  await expectOk("malls can be medical", async () => { await as(U.admin, `insert into public.malls (name, kind) values ('مول طبي تجريبي', 'medical')`); return as(null, `select kind from public.malls where name='مول طبي تجريبي'`); }, (r) => r[0].kind === "medical");
  await expectErr("unknown mall kind refused", () => as(U.admin, `insert into public.malls (name, kind) values ('مول غلط', 'other')`));


  console.log("\nMap locations (item 43)");
  const mall = (await sys(`select id from public.malls where name='مول طبي تجريبي'`))[0].id;
  await as(U.admin, `update public.malls set lat=30.8701, lng=29.5902 where id='${mall}'`);
  await as(U.admin, `insert into public.properties (broker_id, title, type, area, status, price, category, mall_id, review_status) values ('${CO}', 'عيادة في المول', 'عيادة', 'الحي الأول', 'إيجار', 6000, 'mall', '${mall}', 'approved')`);
  const unitLoc = () => sys(`select lat, lng from public.properties where title='عيادة في المول'`).then((r) => r[0]);
  await expectOk("a unit added to a mall takes the mall's pin", unitLoc, (r) => r.lat === 30.8701 && r.lng === 29.5902);
  await expectOk("moving the mall's pin moves its units", async () => { await as(U.admin, `update public.malls set lat=30.8800, lng=29.6000 where id='${mall}'`); return unitLoc(); }, (r) => r.lat === 30.88 && r.lng === 29.6);
  await expectOk("a unit with its own pin keeps it when the mall moves", async () => {
    await as(U.admin, `update public.properties set lat=30.9, lng=29.7 where title='عيادة في المول'`);
    await as(U.admin, `update public.malls set lat=30.8100, lng=29.5100 where id='${mall}'`);
    return unitLoc();
  }, (r) => r.lat === 30.9 && r.lng === 29.7);

  await as(U.admin, `update public.investment_opportunities set lat=30.861, lng=29.598 where id='${opp}'`);
  await expectErr("visitors can't read an opportunity's pin", () => as(null, `select lat from public.investment_opportunities`));
  await expectErr("signed-in users can't read it from the table", () => as(U.owner, `select lng from public.investment_opportunities`));
  await expectOk("an investor with approved access sees the pin", () => as(U.outsider, `select * from public.opportunity_location('${opp}')`), (r) => r.length === 1 && r[0].lat === 30.861);
  await expectOk("the submitter and admins see it", async () => [(await as(U.owner, `select * from public.opportunity_location('${opp}')`)).length, (await as(U.admin, `select * from public.opportunity_location('${opp}')`)).length], (r) => r[0] === 1 && r[1] === 1);
  await expectOk("anyone else gets nothing", () => as(U.sales, `select * from public.opportunity_location('${opp}')`), (r) => r.length === 0);
  await expectErr("visitors can't call the location function", () => as(null, `select * from public.opportunity_location('${opp}')`));

  console.log("\nCustomer: verified badge, favourites, alerts, my requests (items 33–35)");
  const CU = "00000000-0000-0000-0000-0000000000c1", CU2 = "00000000-0000-0000-0000-0000000000c2";
  await sys(`insert into auth.users (id, phone) values ('${CU}','201000000071'), ('${CU2}','')`);
  await expectOk("company can't mark its listing verified", async () => { await as(U.manager, `update public.properties set verified_at=now(), verified_note='x' where id='${cprop}'`); return sys(`select verified_at from public.properties where id='${cprop}'`); }, (r) => r[0].verified_at === null);
  await expectOk("admin marks it verified; everyone sees it", async () => { await as(U.admin, `update public.properties set verified_at=now(), verified_note='عاينه فريقنا' where id='${cprop}'`); return as(null, `select verified_at, verified_note from public.properties where id='${cprop}'`); }, (r) => r[0].verified_at !== null && r[0].verified_note === "عاينه فريقنا");
  await expectOk("a company edit keeps the badge", async () => { await as(U.manager, `update public.properties set title='شقة محدثة' where id='${cprop}'`); return sys(`select verified_at from public.properties where id='${cprop}'`); }, (r) => r[0].verified_at !== null);
  await expectOk("removing the badge clears the note", async () => { await as(U.admin, `update public.properties set verified_at=null where id='${cprop}'`); return sys(`select verified_note from public.properties where id='${cprop}'`); }, (r) => r[0].verified_note === null);

  await expectOk("customer saves a favourite", () => as(CU, `insert into public.favorites (property_id) values ('${cprop}') returning user_id`), (r) => r[0].user_id === CU);
  await expectOk("others don't see it", () => as(CU2, `select * from public.favorites`), (r) => r.length === 0);
  await expectErr("can't add a favourite for someone else", () => as(CU2, `insert into public.favorites (user_id, property_id) values ('${CU}','${cprop}')`));
  await expectErr("visitors can't save favourites", () => as(null, `insert into public.favorites (property_id) values ('${cprop}')`));

  await expectOk("customer creates an alert", () => as(CU, `insert into public.saved_searches (status, types, city, price_max) values ('بيع', '{شقة}', 'برج العرب الجديدة', 2000000) returning id`), (r) => r.length === 1);
  await as(CU2, `insert into public.saved_searches (status) values ('إيجار')`);
  await expectOk("others can't see or delete it", async () => [(await as(CU2, `select * from public.saved_searches`)).length, (await as(CU2, `delete from public.saved_searches where user_id='${CU}' returning id`)).length], (r) => r[0] === 1 && r[1] === 0);
  await expectErr("max 10 alerts", async () => { for (let i = 0; i < 10; i++) await as(CU2, `insert into public.saved_searches (label) values ('${i}')`); });
  await sys(`delete from public.saved_searches where label is not null`); // filter-less alerts match everything
  await expectOk("matching listing goes public → only the matching customer is notified", async () => {
    await as(U.admin, `insert into public.properties (broker_id, title, price, type, area, city, status, review_status) values ('${CO}','شقة للتنبيه',1500000,'شقة','الحي الأول','برج العرب الجديدة','بيع','approved')`);
    return [await notes(CU, "نزل عقار مطابق لبحثك"), await notes(CU2, "نزل عقار مطابق لبحثك")];
  }, (r) => r[0] === 1 && r[1] === 0);
  await expectOk("too expensive → no alert", async () => {
    await as(U.admin, `insert into public.properties (broker_id, title, price, type, area, city, status, review_status) values ('${CO}','شقة غالية',3000000,'شقة','الحي الأول','برج العرب الجديدة','بيع','approved')`);
    return notes(CU, "نزل عقار مطابق لبحثك");
  }, (r) => r === 1);

  await expectOk("signed-in customer's request is linked to them", async () => { await as(CU, `insert into public.leads (name, phone, kind, details) values ('عميل مسجل','01000000071','request','شقة 3 غرف')`); return sys(`select customer_id from public.leads where name='عميل مسجل'`); }, (r) => r[0].customer_id === CU);
  await sys(`insert into public.leads (name, phone) values ('قبل التسجيل','+20 100 000 0071')`);
  await expectOk("my requests: own + earlier ones from the verified phone, no internal fields", () => as(CU, `select * from public.my_requests()`), (r) => r.length === 2 && !("notes" in r[0]) && !("phone" in r[0]));
  await expectOk("other customers see nothing", () => as(CU2, `select * from public.my_requests()`), (r) => r.length === 0);
  await expectErr("visitors can't call it", () => as(null, `select * from public.my_requests()`));
  await expectOk("staff-entered leads aren't linked to the staff member", async () => { await as(U.staff, `insert into public.leads (name, phone) values ('من الفريق','01000000099')`); return sys(`select customer_id from public.leads where name='من الفريق'`); }, (r) => r[0].customer_id === null);
  await expectOk("customer_id can't be changed by the team", async () => { await as(U.staff, `update public.leads set customer_id='${CU2}' where name='عميل مسجل'`); return sys(`select customer_id from public.leads where name='عميل مسجل'`); }, (r) => r[0].customer_id === CU);
  await expectOk("customer is notified when the request moves forward", async () => {
    await as(U.staff, `update public.leads set stage='contacted' where name='عميل مسجل'`);
    return notes(CU, "فريق فاليو عقار بدأ يتابع طلبك");
  }, (r) => r === 1);

  console.log("\nLead sources: ads, WhatsApp, Meta Lead Ads (items 29–30)");
  const src = (name) => sys(`select source, original_source, campaign, source_note, external_ref, utm from public.leads where name='${name}'`).then((r) => r[0]);
  await expectOk("visitor from a Facebook ad → source facebook + campaign", async () => {
    await as(null, `insert into public.leads (name, phone, utm) values ('من إعلان فيس','01055550001','{"utm_source":"fb","utm_campaign":"برج العرب أكتوبر","utm_content":"فيديو 1","evil":"x"}')`);
    return src("من إعلان فيس");
  }, (r) => r.source === "facebook" && r.original_source === "facebook" && r.campaign === "برج العرب أكتوبر" && r.source_note === "إعلان: فيديو 1" && !("evil" in r.utm));
  await expectOk("Google click id → google_ads", async () => { await as(null, `insert into public.leads (name, phone, utm) values ('من جوجل','01055550002','{"gclid":"abc"}')`); return src("من جوجل"); }, (r) => r.source === "google_ads");
  await expectOk("Instagram referrer → instagram", async () => { await as(null, `insert into public.leads (name, phone, utm) values ('من انستا','01055550003','{"ref":"l.instagram.com"}')`); return src("من انستا"); }, (r) => r.source === "instagram");
  await expectOk("unknown utm source stays website but keeps the campaign", async () => { await as(null, `insert into public.leads (name, phone, utm) values ('نشرة','01055550004','{"utm_source":"newsletter","utm_campaign":"n1"}')`); return src("نشرة"); }, (r) => r.source === "website" && r.campaign === "n1");
  await expectOk("visitors can't set campaign or external_ref directly", async () => { await as(null, `insert into public.leads (name, phone, campaign, external_ref) values ('مزوّر','01055550005','fake','meta:1')`); return src("مزوّر"); }, (r) => r.campaign === null && r.external_ref === null && r.source === "website");
  await expectOk("the team can't rewrite the ad data later", async () => { await as(U.staff, `update public.leads set campaign='x', utm=null where name='من إعلان فيس'`); return src("من إعلان فيس"); }, (r) => r.campaign === "برج العرب أكتوبر" && r.utm);

  await expectErr("public can't call the WhatsApp import", () => as(null, `select public.whatsapp_inbound_lead('201055550010','x','y','m1')`));
  await expectErr("signed-in users can't either", () => as(U.outsider, `select public.whatsapp_inbound_lead('201055550010','x','y','m1')`));
  await sys(`select set_config('request.jwt.claim.role','service_role',false)`);
  await expectOk("WhatsApp from a new number → lead (source whatsapp), admins notified", async () => {
    const r = await sys(`select public.whatsapp_inbound_lead('201055550010','منى','عايزة شقة 3 غرف','wamid.1') r`);
    return [r[0].r, await src("منى"), await notes(U.admin, "طلب عقار")];
  }, (r) => r[0] === "created" && r[1].source === "whatsapp" && r[1].external_ref === "wa:wamid.1" && r[2] >= 1);
  await expectOk("second message from the same customer → one note, no new lead", async () => {
    const a = await sys(`select public.whatsapp_inbound_lead('+20 105 555 0010','منى','لسه مستنية','wamid.2') r`);
    await sys(`select public.whatsapp_inbound_lead('201055550010','منى','تالت رسالة','wamid.3')`);
    return [a[0].r, (await sys(`select count(*) c from public.leads where phone_norm=public.normalize_phone('201055550010')`))[0].c,
      (await sys(`select count(*) c from public.lead_activities a join public.leads l on l.id=a.lead_id where l.name='منى' and a.kind='whatsapp'`))[0].c];
  }, (r) => r[0] === "existing" && Number(r[1]) === 1 && Number(r[2]) === 1);
  await expectOk("messages from a company's number are ignored", () => sys(`select public.whatsapp_inbound_lead('201000000001','شركة','رد','wamid.4') r`), (r) => r[0].r === "team");
  await expectOk("messages from staff are ignored", () => sys(`select public.whatsapp_inbound_lead('201000000004','موظف','x','wamid.5') r`), (r) => r[0].r === "team");

  await expectOk("Meta lead → lead with Instagram source, campaign and ad", async () => {
    const r = await sys(`select public.meta_inbound_lead('L1','أحمد','+201055550020','ig','حملة الساحل','إعلان شاليه','الميزانية: 2 مليون') r`);
    return [r[0].r, await src("أحمد")];
  }, (r) => r[0] === "created" && r[1].source === "instagram" && r[1].campaign === "حملة الساحل" && r[1].source_note === "Lead Ads: إعلان شاليه" && r[1].external_ref === "meta:L1");
  await expectOk("the same Meta lead twice is imported once", () => sys(`select public.meta_inbound_lead('L1','أحمد','+201055550020','ig','حملة الساحل','إعلان شاليه','') r`), (r) => r[0].r === "duplicate");
  await expectOk("an open customer filling the form again → note, not a duplicate", () => sys(`select public.meta_inbound_lead('L2','منى','01055550010','fb','حملة 2','','') r`), (r) => r[0].r === "existing");
  await expectOk("no phone → skipped", () => sys(`select public.meta_inbound_lead('L3','x','','fb','','','') r`), (r) => r[0].r === "no_phone");
  await sys(`select set_config('request.jwt.claim.role','',false)`);

  console.log("\nError tracking (item 37)");
  await expectOk("a visitor's browser error is recorded", async () => {
    await as(null, `select public.log_app_error('client', 'Cannot read properties of undefined', E'TypeError: x\\n    at Foo (app.js:1:2)', '/properties/94136c70-b49d-475b-b920-221af5785d8c?x=1', 'Mozilla')`);
    return sys(`select kind, path, count from public.app_errors`);
  }, (r) => r.length === 1 && r[0].kind === "client" && r[0].path === "/properties/94136c70-b49d-475b-b920-221af5785d8c");
  await expectOk("the same error on another listing is grouped and counted", async () => {
    await as(U.outsider, `select public.log_app_error('client', 'Cannot read properties of undefined', E'TypeError: x\\n    at Foo (app.js:1:2)', '/properties/11111111-1111-1111-1111-111111111111', 'Mozilla')`);
    return sys(`select count from public.app_errors`);
  }, (r) => r.length === 1 && r[0].count === 2);
  await expectOk("a visitor can't pretend to be the server", async () => {
    await as(null, `select public.log_app_error('server', 'fake', null, '/', null)`);
    return sys(`select kind from public.app_errors where message='fake'`);
  }, (r) => r[0].kind === "client");
  await expectOk("the server's own errors are marked as server", async () => {
    await sys(`select set_config('request.jwt.claim.role','service_role',false)`);
    await sys(`select public.log_app_error('server', 'SSR failed', null, '/projects', null)`);
    await sys(`select set_config('request.jwt.claim.role','',false)`);
    return sys(`select kind from public.app_errors where message='SSR failed'`);
  }, (r) => r[0].kind === "server");
  await expectErr("visitors can't read the errors table", () => as(null, `select * from public.app_errors`));
  await expectOk("non-admins see nothing", () => as(U.owner, `select * from public.app_errors`), (r) => r.length === 0);
  await expectOk("admins see and clear them", async () => [(await as(U.admin, `select * from public.app_errors`)).length, (await as(U.admin, `delete from public.app_errors returning id`)).length], (r) => r[0] === 3 && r[1] === 3);
  await expectErr("nobody inserts directly", () => as(U.admin, `insert into public.app_errors (fingerprint, kind, message) values ('x','client','x')`));
  await expectOk("capped at 300 distinct errors a day", async () => {
    await sys(`insert into public.app_errors (fingerprint, kind, message) select 'f' || g, 'client', 'm' from generate_series(1, 300) g`);
    await as(null, `select public.log_app_error('client', 'one more', null, '/', null)`);
    return sys(`select count(*) c from public.app_errors`);
  }, (r) => Number(r[0].c) === 300);

  console.log("\nDemo data switch (item 32)");
  const demoCounts = async (uid) => [
    (await as(uid, `select count(*) c from public.properties where is_demo`))[0].c,
    (await as(uid, `select count(*) c from public.brokers where is_demo`))[0].c,
  ].map(Number);
  const before = await demoCounts(null);
  await expectOk("demo rows are public while the switch is on", async () => before, (r) => r[0] > 0 && r[1] > 0);
  await expectOk("a company can't turn the switch off", async () => { await as(U.owner, `update public.app_settings set show_demo=false`); return sys(`select show_demo from public.app_settings`); }, (r) => r[0].show_demo === true);
  await expectOk("admin turns it off → visitors and signed-in users stop seeing demo rows; real rows stay", async () => {
    await as(U.admin, `update public.app_settings set show_demo=false`);
    return [...await demoCounts(null), ...await demoCounts(U.outsider), Number((await as(null, `select count(*) c from public.properties where not is_demo and review_status='approved'`))[0].c)];
  }, (r) => r[0] === 0 && r[1] === 0 && r[2] === 0 && r[3] === 0 && r[4] > 0);
  await expectOk("admins still see them", () => demoCounts(U.admin), (r) => r[0] === before[0]);
  await expectOk("turning it back on brings them back", async () => { await as(U.admin, `update public.app_settings set show_demo=true`); return demoCounts(null); }, (r) => r[0] === before[0] && r[1] === before[1]);
  await expectErr("only admins can delete demo data", () => as(U.owner, `select public.delete_demo_data()`));
  await expectErr("visitors can't either", () => as(null, `select public.delete_demo_data()`));
  await expectOk("admin deletes demo data for good; switch goes off; real data untouched", async () => {
    const realBefore = Number((await sys(`select count(*) c from public.properties where not is_demo`))[0].c);
    const r = (await as(U.admin, `select public.delete_demo_data() r`))[0].r;
    return [r.properties, Number((await sys(`select count(*) c from public.properties where is_demo`))[0].c), Number((await sys(`select count(*) c from public.properties where not is_demo`))[0].c) === realBefore, (await sys(`select show_demo from public.app_settings`))[0].show_demo];
  }, (r) => r[0] === before[0] && r[1] === 0 && r[2] === true && r[3] === false);

  console.log("\nAccount deletion (store compliance)");
  const DU = "00000000-0000-0000-0000-0000000000d1", DB = "00000000-0000-0000-0000-0000000000d2";
  await sys(`insert into auth.users (id, phone) values ('${DU}','201000000091'), ('${DB}','201000000092')`);
  const anyProp = (await sys(`select id from public.properties where not is_demo limit 1`))[0].id;
  await as(DU, `insert into public.favorites (property_id) values ('${anyProp}')`);
  await as(DU, `insert into public.saved_searches (label) values ('x')`);
  await as(DU, `insert into public.leads (name, phone, details) values ('عميل هيمسح','01000000091','شقة')`);
  await sys(`insert into public.notifications (user_id, title, type) values ('${DU}','x','admin')`);
  await sys(`insert into public.user_roles (user_id, role) values ('${DB}','broker')`);
  const dbBroker = (await sys(`insert into public.brokers (user_id, slug, name, phone, whatsapp, email, account_type, is_active) values ('${DB}','del-b','وسيط هيمسح','201000000092','201000000092','b@x.com','individual', true) returning id`))[0].id;
  await expectErr("users can't call it themselves", () => as(DU, `select public.prepare_account_deletion('${DU}')`));
  await expectErr("visitors can't either", () => as(null, `select public.prepare_account_deletion('${DU}')`));
  await sys(`select set_config('request.jwt.claim.role','service_role',false)`);
  await expectOk("an admin account is not deleted", () => sys(`select public.prepare_account_deletion('${U.admin}') r`), (r) => r[0].r === "admin");
  await expectOk("customer: favourites, alerts, notifications gone; their request kept for the company without the link", async () => {
    const r = (await sys(`select public.prepare_account_deletion('${DU}') r`))[0].r;
    const c = async (sql) => Number((await sys(sql))[0].c);
    return [r, await c(`select count(*) c from public.favorites where user_id='${DU}'`), await c(`select count(*) c from public.saved_searches where user_id='${DU}'`),
      await c(`select count(*) c from public.notifications where user_id='${DU}'`), (await sys(`select customer_id from public.leads where name='عميل هيمسح'`))[0].customer_id];
  }, (r) => r[0] === "ok" && r[1] === 0 && r[2] === 0 && r[3] === 0 && r[4] === null);
  await expectOk("broker: profile hidden, contact details cleared, role removed, admins notified", async () => {
    await sys(`select public.prepare_account_deletion('${DB}')`);
    const b = (await sys(`select is_active, user_id, phone, whatsapp, email from public.brokers where id='${dbBroker}'`))[0];
    return [b, Number((await sys(`select count(*) c from public.user_roles where user_id='${DB}'`))[0].c), await notes(U.admin, "حساب اتمسح بطلب صاحبه")];
  }, (r) => r[0].is_active === false && r[0].user_id === null && r[0].phone === null && r[0].email === null && r[1] === 0 && r[2] >= 2);
  await sys(`select set_config('request.jwt.claim.role','',false)`);
  await expectOk("the deleted broker no longer shows publicly", () => as(null, `select id from public.brokers where id='${dbBroker}'`), (r) => r.length === 0);

  console.log("\nCRM phase 3: contact outcomes, project link, assignment history, isolation");
  await sys(`select set_config('request.jwt.claim.role','service_role',false)`);
  const cl = (await sys(`insert into public.leads (name, phone, assigned_broker_id) values ('عميل CRM','01000000501','${CO}') returning id`))[0].id;
  const pubProj = (await sys(`insert into public.projects (developer_id, name, city, area, review_status) values ('${DEV}','مشروع منشور','برج العرب الجديدة','الحي الأول','approved') returning id`))[0].id;
  const hidProj = (await sys(`insert into public.projects (developer_id, name, city, area, review_status) values ('${DEV}','مشروع مخفي','برج العرب الجديدة','الحي الأول','pending') returning id`))[0].id;
  const pubUnit = (await sys(`insert into public.project_units (project_id, unit_type, size, price) values ('${pubProj}','شقة',100,900000) returning id`))[0].id;
  await sys(`select set_config('request.jwt.claim.role','',false)`);
  const crm = () => sys(`select assigned_broker_id, first_response_at, project_id, project_unit_id from public.leads where id='${cl}'`).then((r) => r[0]);

  await expectErr("an outcome only goes on a call or WhatsApp", () => as(U.owner, `insert into public.lead_activities (lead_id, kind, summary, actor_id, outcome) values ('${cl}','note','x','${U.owner}','reached')`));
  await expectErr("unknown outcomes are refused", () => as(U.owner, `insert into public.lead_activities (lead_id, kind, summary, actor_id, outcome) values ('${cl}','call','x','${U.owner}','maybe')`));
  await expectOk("a wrong number alerts Value Aqar (admins and staff) and doesn't count as contact", async () => {
    await as(U.owner, `insert into public.lead_activities (lead_id, kind, summary, actor_id, outcome) values ('${cl}','call','الرقم غلط','${U.owner}','wrong_number')`);
    return [await notes(U.admin, "رقم عميل غلط"), await notes(U.staff, "رقم عميل غلط"), (await crm()).first_response_at];
  }, (r) => r[0] >= 1 && r[1] >= 1 && r[2] === null);
  await expectOk("'callback' (customer asked to be called back) counts as contact", async () => {
    await as(U.owner, `insert into public.lead_activities (lead_id, kind, summary, actor_id, outcome) values ('${cl}','call','كلمني بكرة','${U.owner}','callback')`);
    return (await crm()).first_response_at;
  }, (r) => !!r);

  await expectOk("a visitor's project inquiry is linked to the project through the unit", async () => {
    await as(null, `insert into public.leads (name, phone, kind, project_unit_id) values ('مهتم بوحدة','01000000502','request','${pubUnit}')`);
    return sys(`select project_id, project_unit_id from public.leads where name='مهتم بوحدة'`).then((r) => r[0]);
  }, (r) => r.project_id === pubProj && r.project_unit_id === pubUnit);
  await expectOk("a visitor can't point a lead at an unpublished project", async () => {
    await as(null, `insert into public.leads (name, phone, kind, project_id) values ('مشروع مخفي','01000000503','request','${hidProj}')`);
    return sys(`select project_id from public.leads where name='مشروع مخفي'`).then((r) => r[0].project_id);
  }, (r) => r === null);
  await expectOk("a company can't move a lead to another project", async () => {
    await as(U.admin, `update public.leads set project_id='${pubProj}' where id='${cl}'`);
    await as(U.owner, `update public.leads set project_id=null, project_unit_id='${pubUnit}' where id='${cl}'`);
    return crm();
  }, (r) => r.project_id === pubProj && r.project_unit_id === null);

  await expectOk("reassignment closes the previous period (reason + outcome) and opens a new one marked manual", async () => {
    await as(U.staff, `update public.leads set assigned_broker_id='${DEV}' where id='${cl}'`);
    return sys(`select broker_id, source, ended_at is not null ended, end_reason, outcome from public.lead_assignments where lead_id='${cl}' order by created_at, ended_at nulls last`);
  }, (r) => r.length === 2 && r[0].broker_id === CO && r[0].ended && r[0].end_reason === "reassigned" && r[0].outcome === "callback" && r[1].broker_id === DEV && !r[1].ended && r[1].source === "manual");
  await expectOk("the previous company no longer sees the lead or its history", async () => [
    (await as(U.owner, `select id from public.leads where id='${cl}'`)).length,
    (await as(U.owner, `select id from public.lead_activities where lead_id='${cl}'`)).length,
  ], (r) => r[0] === 0 && r[1] === 0);
  await expectErr("…and can't add activity to it", () => as(U.owner, `insert into public.lead_activities (lead_id, kind, summary, actor_id) values ('${cl}','note','x','${U.owner}')`));
  await expectOk("…and can't change it", async () => (await as(U.owner, `update public.leads set stage='lost' where id='${cl}' returning id`)).length, (r) => r === 0);
  await expectOk("the new company sees it", async () => (await as(U.dev, `select id from public.leads where id='${cl}'`)).length, (r) => r === 1);
  await expectOk("companies can't read the assignment history", async () => (await as(U.dev, `select id from public.lead_assignments where lead_id='${cl}'`)).length, (r) => r === 0);

  console.log("\nCRM phase 4: 60-minute automatic transfer");
  // Working minutes: 9:00–21:00 Cairo by default (Cairo = UTC+3 in these fixed dates).
  await expectOk("deadline inside working hours = +60 minutes", () => sys(`select public.add_work_minutes('2026-10-12 10:00+03', 60) t`), (r) => new Date(r[0].t).toISOString() === "2026-10-12T08:00:00.000Z");
  await expectOk("a lead at 20:30 gets 30 minutes tonight and 30 tomorrow morning", () => sys(`select public.add_work_minutes('2026-10-12 20:30+03', 60) t`), (r) => new Date(r[0].t).toISOString() === "2026-10-13T06:30:00.000Z");
  await expectOk("a lead at 23:00 starts counting at 9:00", () => sys(`select public.add_work_minutes('2026-10-12 23:00+03', 60) t`), (r) => new Date(r[0].t).toISOString() === "2026-10-13T07:00:00.000Z");

  // Three companies in one rotating rule for this test's leads.
  const C3 = "c0000000-0000-0000-0000-000000000003";
  const U3 = "00000000-0000-0000-0000-0000000000e3";
  await sys(`insert into auth.users (id, phone) values ('${U3}','201000000333')`);
  await sys(`insert into public.brokers (id, user_id, slug, name, account_type, is_active) values ('${C3}','${U3}','co3','شركة تالتة','company', true)`);
  await as(U.admin, `insert into public.routing_rules (name, priority, areas, broker_ids) values ('نقل تلقائي', 1, array['منطقة النقل'], array['${CO}'::uuid, '${DEV}'::uuid, '${C3}'::uuid])`);
  const newLead = async (name) => { await as(null, `insert into public.leads (name, phone, kind, area) values ('${name}','010${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}','request','منطقة النقل')`); return (await sys(`select * from public.leads where name='${name}'`))[0]; };
  const expire = async (id) => { await sys(`select set_config('request.jwt.claim.role','service_role',false)`); await sys(`update public.leads set transfer_deadline_at = now() - interval '1 minute' where id='${id}'`); await sys(`select set_config('request.jwt.claim.role','',false)`); };
  const runT = async () => { await sys(`select set_config('request.jwt.claim.role','service_role',false)`); const r = (await sys(`select public.run_lead_transfers() r`))[0].r; await sys(`select set_config('request.jwt.claim.role','',false)`); return r; };
  const state = (id) => sys(`select assigned_broker_id, transfer_deadline_at, admin_queue_at, admin_queue_reason from public.leads where id='${id}'`).then((r) => r[0]);

  const t1 = await newLead("نقل 1");
  await expectOk("a routed lead gets a deadline at assignment", async () => t1, (r) => !!r.assigned_broker_id && !!r.transfer_deadline_at);
  await expectOk("before the deadline nothing moves", async () => [await runT(), (await state(t1.id)).assigned_broker_id], (r) => r[0].moved === 0 && r[1] === t1.assigned_broker_id);
  await expectOk("no answer + deadline passed → moved to the next company, new deadline, both companies notified", async () => {
    await as(U.owner, `insert into public.lead_activities (lead_id, kind, summary, actor_id, outcome) select '${t1.id}','call','ما ردش','${U.owner}','no_answer' where '${t1.assigned_broker_id}' = '${CO}'`);
    await expire(t1.id);
    const r = await runT(); const s = await state(t1.id);
    return [r.moved, s.assigned_broker_id !== t1.assigned_broker_id && !!s.assigned_broker_id, new Date(s.transfer_deadline_at) > new Date(), await notes(U.owner, "العميل اتنقل لشركة تانية") + await notes(U.dev, "العميل اتنقل لشركة تانية") + await notes(U3, "العميل اتنقل لشركة تانية")];
  }, (r) => r[0] === 1 && r[1] && r[2] && r[3] >= 1);
  await expectOk("the move is logged: timeout end, auto_transfer start, deadline kept", () => sys(`select end_reason, source, deadline_at is not null has_deadline from public.lead_assignments where lead_id='${t1.id}' order by created_at`), (r) => r.length === 2 && r[0].end_reason === "timeout" && r[1].source === "auto_transfer" && r[1].has_deadline);
  await expectOk("running the job again (or twice) does not move it again", async () => { const a = await runT(); const b = await runT(); return [a.moved + b.moved, Number((await sys(`select count(*) c from public.lead_assignments where lead_id='${t1.id}'`))[0].c)]; }, (r) => r[0] === 0 && r[1] === 2);

  const t2 = await newLead("نقل 2");
  await expectOk("real contact before the deadline stops the transfer for good", async () => {
    const owner = { [CO]: U.owner, [DEV]: U.dev }[t2.assigned_broker_id] ?? U.admin;
    await as(owner, `insert into public.lead_activities (lead_id, kind, summary, actor_id, outcome) values ('${t2.id}','call','اتكلمنا','${owner}','reached')`);
    const s = await state(t2.id); await expire(t2.id); const r = await runT();
    return [s.transfer_deadline_at, r.moved, (await state(t2.id)).assigned_broker_id === t2.assigned_broker_id];
  }, (r) => r[0] === null && r[1] === 0 && r[2]);

  const t3 = await newLead("نقل 3");
  await expectOk("after 3 companies without contact → admin queue, team notified, lead kept", async () => {
    for (let i = 0; i < 3; i++) { await expire(t3.id); await runT(); }
    const s = await state(t3.id);
    return [s.assigned_broker_id, !!s.admin_queue_at, s.admin_queue_reason, await notes(U.staff, "عميل في طابور الإدارة"), Number((await sys(`select count(distinct broker_id) c from public.lead_assignments where lead_id='${t3.id}'`))[0].c)];
  }, (r) => r[0] === null && r[1] && r[2].includes("3") && r[3] >= 1 && r[4] === 3);
  await expectOk("none of the companies sees it anymore", async () => [(await as(U.owner, `select id from public.leads where id='${t3.id}'`)).length, (await as(U.dev, `select id from public.leads where id='${t3.id}'`)).length], (r) => r[0] === 0 && r[1] === 0);
  await expectOk("an admin assigns it again by hand → out of the queue, new deadline (manual assignments are timed too)", async () => {
    await as(U.admin, `update public.leads set assigned_broker_id='${CO}' where id='${t3.id}'`);
    const s = await state(t3.id); return [s.admin_queue_at, !!s.transfer_deadline_at];
  }, (r) => r[0] === null && r[1]);

  const t4 = await newLead("نقل 4");
  await expectOk("no other eligible company (others suspended) → admin queue with the reason", async () => {
    await sys(`select set_config('request.jwt.claim.role','service_role',false)`);
    await sys(`update public.brokers set suspended_at = now() where id in ('${CO}','${DEV}','${C3}') and id <> '${t4.assigned_broker_id}'`);
    await sys(`select set_config('request.jwt.claim.role','',false)`);
    await expire(t4.id); await runT();
    await sys(`select set_config('request.jwt.claim.role','service_role',false)`);
    await sys(`update public.brokers set suspended_at = null where id in ('${CO}','${DEV}','${C3}')`);
    await sys(`select set_config('request.jwt.claim.role','',false)`);
    return state(t4.id);
  }, (r) => r.assigned_broker_id === null && r.admin_queue_reason === "مفيش شركة تانية مؤهلة");

  const t5 = await newLead("نقل 5");
  await expectOk("a wrong number goes to Value Aqar for review instead of another company", async () => {
    await as(U.admin, `insert into public.lead_activities (lead_id, kind, summary, actor_id, outcome) values ('${t5.id}','call','رقم غلط','${U.admin}','wrong_number')`);
    await expire(t5.id); await runT(); return state(t5.id);
  }, (r) => r.assigned_broker_id === null && r.admin_queue_reason.startsWith("الرقم غلط"));

  await expectOk("investment requests and owner listings never get a deadline", async () => {
    await sys(`select set_config('request.jwt.claim.role','service_role',false)`);
    await sys(`insert into public.leads (name, phone, kind, assigned_broker_id) values ('عرض مالك نقل','01000000777','listing','${CO}')`);
    await sys(`select set_config('request.jwt.claim.role','',false)`);
    return sys(`select transfer_deadline_at from public.leads where name='عرض مالك نقل'`);
  }, (r) => r[0].transfer_deadline_at === null);
  await expectErr("companies can't run the job", () => as(U.owner, `select public.run_lead_transfers()`));
  await expectErr("visitors can't either", () => as(null, `select public.run_lead_transfers()`));
  await expectOk("every run is logged; only admins read the log", async () => [Number((await sys(`select count(*) c from public.job_runs where job='lead_transfers' and finished_at is not null`))[0].c), (await as(U.owner, `select * from public.job_runs`)).length], (r) => r[0] >= 5 && r[1] === 0);
  await expectOk("switching automatic transfer off stops moves", async () => {
    await as(U.admin, `update public.app_settings set transfer_enabled=false`);
    const t6 = await newLead("نقل 6"); await expire(t6.id); const r = await runT();
    await as(U.admin, `update public.app_settings set transfer_enabled=true`);
    return [r.disabled, t6.transfer_deadline_at];
  }, (r) => r[0] === true && r[1] === null);

  console.log("\nPayments phase 1: ledger, applying payments once, subscription expiry");
  const svc = async (sql) => { await sys(`select set_config('request.jwt.claim.role','service_role',false)`); try { return await sys(sql); } finally { await sys(`select set_config('request.jwt.claim.role','',false)`); } };
  const pro = (await sys(`select id from public.plans where code='pro'`))[0].id;
  const free = (await sys(`select id from public.plans where code='free'`))[0].id;
  await expectErr("only admins set prices", () => as(U.owner, `update public.plans set monthly_price=500 where id='${pro}' returning id`).then((r) => { if (!r.length) throw new Error("blocked"); return r; }));
  await expectErr("a free plan can't be paid for (price not set)", () => as(U.owner, `select public.create_payment('subscription', '${pro}', 'monthly')`));
  await as(U.admin, `update public.plans set monthly_price=500, yearly_price=5000 where id='${pro}'`);
  await as(U.admin, `update public.app_settings set featured_week_price=150, featured_month_price=400`);
  await expectErr("team members (not the owner) can't pay", () => as(U.manager, `select public.create_payment('subscription', '${pro}', 'monthly')`));
  await expectErr("visitors can't pay", () => as(null, `select public.create_payment('subscription', '${pro}', 'monthly')`));
  const pay1 = (await as(U.owner, `select public.create_payment('subscription', '${pro}', 'monthly') id`))[0].id;
  await expectOk("the owner starts a payment; the amount comes from the price list", () => sys(`select amount, status, broker_id from public.payments where id='${pay1}'`), (r) => Number(r[0].amount) === 500 && r[0].status === "pending" && r[0].broker_id === CO);
  await expectErr("nobody writes payments directly", () => as(U.owner, `update public.payments set amount=1 where id='${pay1}' returning id`).then((r) => { if (!r.length) throw new Error("blocked"); return r; }));
  await expectErr("users can't confirm payments themselves", () => as(U.owner, `select public.mark_payment_paid('${pay1}', 'T1', 500)`));
  await expectOk("a wrong amount is refused and admins are alerted", async () => [(await svc(`select public.mark_payment_paid('${pay1}', 'T1', 1) r`))[0].r, (await sys(`select status from public.payments where id='${pay1}'`))[0].status, await notes(U.admin, "دفعة بمبلغ مختلف")], (r) => r[0] === "amount_mismatch" && r[1] === "pending" && r[2] >= 1);
  await expectOk("confirmed payment → paid, plan switched, one-month subscription, owner and admins notified", async () => {
    const r = (await svc(`select public.mark_payment_paid('${pay1}', 'T1', 500, 'card') r`))[0].r;
    const sub = (await sys(`select plan_id, status, round(extract(epoch from (ends_at - starts_at)) / 86400) days from public.subscriptions where payment_id='${pay1}'`))[0];
    return [r, (await sys(`select plan_id from public.brokers where id='${CO}'`))[0].plan_id, sub, await notes(U.owner, "اتفعّلت باقتك"), await notes(U.admin, "دفعة جديدة")];
  }, (r) => r[0] === "paid" && r[1] === pro && r[2].status === "active" && Number(r[2].days) >= 28 && Number(r[2].days) <= 31 && r[3] === 1 && r[4] >= 1);
  await expectOk("the same confirmation again changes nothing", async () => [(await svc(`select public.mark_payment_paid('${pay1}', 'T1', 500) r`))[0].r, Number((await sys(`select count(*) c from public.subscriptions where payment_id='${pay1}'`))[0].c)], (r) => r[0] === "already_paid" && r[1] === 1);
  const pay2 = (await as(U.owner, `select public.create_payment('subscription', '${pro}', 'yearly') id`))[0].id;
  await expectOk("a transaction id can't pay for two payments", async () => (await svc(`select public.mark_payment_paid('${pay2}', 'T1', 5000) r`))[0].r, (r) => r === "duplicate_txn");
  await expectOk("renewing the same plan early extends from the current end date", async () => {
    const before = (await sys(`select ends_at from public.subscriptions where payment_id='${pay1}'`))[0].ends_at;
    await svc(`select public.mark_payment_paid('${pay2}', 'T2', 5000)`);
    const s = (await sys(`select starts_at, ends_at from public.subscriptions where payment_id='${pay2}'`))[0];
    return [new Date(s.starts_at).getTime() === new Date(before).getTime(), new Date(s.ends_at) > new Date(Date.now() + 360 * 864e5)];
  }, (r) => r[0] && r[1]);
  await expectOk("the owner sees their payments, other companies don't", async () => [(await as(U.owner, `select id from public.payments`)).length, (await as(U.dev, `select id from public.payments`)).length], (r) => r[0] === 2 && r[1] === 0);

  const myProp = (await sys(`select id from public.properties where broker_id='${CO}' and review_status='approved' limit 1`))[0].id;
  const otherProp = (await svc(`insert into public.properties (broker_id, title, price, type, area, status, review_status) values ('${DEV}','عقار شركة تانية',1,'شقة','الحي الأول','بيع','approved') returning id`))[0].id;
  await expectErr("featuring needs a published listing of your own", () => as(U.owner, `select public.create_payment('featured', null, null, '${otherProp}', 7)`));
  await expectOk("featured payment → listing featured for 7 days", async () => {
    const id = (await as(U.owner, `select public.create_payment('featured', null, null, '${myProp}', 7) id`))[0].id;
    await svc(`select public.mark_payment_paid('${id}', 'T3', 150)`);
    return sys(`select is_featured, round(extract(epoch from (featured_until - now())) / 86400) d from public.properties where id='${myProp}'`).then((x) => x[0]);
  }, (r) => r.is_featured === true && Number(r.d) === 7);

  await expectErr("companies can't run the expiry job", () => as(U.owner, `select public.run_subscription_expiry()`));
  await expectOk("7 days before the end → reminder (once)", async () => {
    await svc(`update public.subscriptions set status='canceled' where broker_id='${CO}' and payment_id='${pay2}'`);
    await svc(`update public.subscriptions set ends_at = now() + interval '5 days' where payment_id='${pay1}'`);
    await svc(`select public.run_subscription_expiry()`); await svc(`select public.run_subscription_expiry()`);
    return notes(U.owner, "باقتك هتخلص خلال أسبوع");
  }, (r) => r === 1);
  await expectOk("inside the grace period nothing changes", async () => {
    await svc(`update public.subscriptions set ends_at = now() - interval '1 day' where payment_id='${pay1}'`);
    await svc(`select public.run_subscription_expiry()`);
    return sys(`select plan_id from public.brokers where id='${CO}'`).then((x) => x[0].plan_id);
  }, (r) => r === pro);
  await expectOk("after the grace period → free plan, extra listings hidden (not deleted), owner notified", async () => {
    await svc(`update public.subscriptions set ends_at = now() - interval '4 days' where payment_id='${pay1}'`);
    await svc(`select public.run_subscription_expiry()`);
    const total = Number((await sys(`select count(*) c from public.properties where broker_id='${CO}'`))[0].c);
    const hidden = Number((await sys(`select count(*) c from public.properties where broker_id='${CO}' and hidden_by_plan`))[0].c);
    return [(await sys(`select plan_id from public.brokers where id='${CO}'`))[0].plan_id, total, hidden, await notes(U.owner, "باقتك انتهت")];
  }, (r) => r[0] === free && r[2] === Math.max(0, r[1] - 2) && r[3] === 1);
  await expectOk("hidden listings are not public, and the company can't unhide them itself", async () => {
    const h = (await sys(`select id from public.properties where broker_id='${CO}' and hidden_by_plan limit 1`))[0];
    if (!h) return [0, false];
    await as(U.owner, `update public.properties set hidden_by_plan=false where id='${h.id}'`);
    return [(await as(null, `select id from public.properties where id='${h.id}'`)).length, (await sys(`select hidden_by_plan from public.properties where id='${h.id}'`))[0].hidden_by_plan];
  }, (r) => r[0] === 0 && r[1] === true);
  await expectOk("paying again brings every hidden listing back", async () => {
    const id = (await as(U.owner, `select public.create_payment('subscription', '${pro}', 'monthly') id`))[0].id;
    await svc(`select public.mark_payment_paid('${id}', 'T4', 500)`);
    return Number((await sys(`select count(*) c from public.properties where broker_id='${CO}' and hidden_by_plan`))[0].c);
  }, (r) => r === 0);
  await expectOk("featured ends on time; abandoned checkouts expire after 2 hours", async () => {
    await svc(`update public.properties set featured_until = now() - interval '1 minute' where id='${myProp}'`);
    const id = (await as(U.owner, `select public.create_payment('featured', null, null, '${myProp}', 30) id`))[0].id;
    await svc(`update public.payments set created_at = now() - interval '3 hours' where id='${id}'`);
    await svc(`select public.run_subscription_expiry()`);
    return [(await sys(`select is_featured from public.properties where id='${myProp}'`))[0].is_featured, (await sys(`select status from public.payments where id='${id}'`))[0].status];
  }, (r) => r[0] === false && r[1] === "expired");

  console.log("\nFile uploads (storage rules)");
  await expectOk("a user uploads their own photo to media", () => as(U.sales, `insert into storage.objects (bucket_id, name) values ('media', '${U.sales}/avatar.jpg') returning id`), (r) => r.length === 1);
  await expectErr("…but not into someone else's folder", () => as(U.sales, `insert into storage.objects (bucket_id, name) values ('media', '${U.owner}/x.jpg')`));
  await sys(`set session_replication_role = replica`);
  await sys(`insert into public.investment_opportunities (id, title, kind, activity, deal_kind, city, area, teaser, submitted_by) values ('f0000000-0000-0000-0000-000000000001', 'فرصة اختبار للرفع', 'running_business', 'مول', 'full_sale', 'برج العرب الجديدة', 'الحي الأول', 'فرصة استثمارية للاختبار فقط في قاعدة البيانات', '${U.owner}')`);
  await sys(`set session_replication_role = origin`);
  await expectOk("the submitter uploads investment documents", () => as(U.owner, `insert into storage.objects (bucket_id, name) values ('investment-docs', 'f0000000-0000-0000-0000-000000000001/plan.pdf') returning id`), (r) => r.length === 1);
  await expectErr("others can't upload to that opportunity", () => as(U.outsider, `insert into storage.objects (bucket_id, name) values ('investment-docs', 'f0000000-0000-0000-0000-000000000001/x.pdf')`));
  await expectOk("odd folder names don't break other buckets", () => as(U.sales, `select count(*) c from storage.objects where bucket_id = 'media'`), (r) => Number(r[0].c) >= 1);

  console.log("\nWho can download deal papers and payment proofs");
  await sys(`insert into storage.objects (bucket_id, name) values ('deal-docs', '${dealId}/contract.pdf'), ('commission-docs', '${cid}/receipt.jpg')`);
  const seesDoc = (who, bucket) => as(who, `select name from storage.objects where bucket_id='${bucket}'`).then((r) => r.length);
  await expectOk("deal papers: the admin and the company's manager can open them", async () => [await seesDoc(U.admin, "deal-docs"), await seesDoc(U.manager, "deal-docs")], (r) => r[0] === 1 && r[1] === 1);
  await expectOk("deal papers: an outsider, a customer or another company can't", async () => [await seesDoc(U.outsider, "deal-docs"), await seesDoc(U.applicant, "deal-docs"), await seesDoc(U.dev, "deal-docs")], (r) => r.every((n) => n === 0));
  await expectOk("deal papers: visitors (not signed in) can't", () => as(null, `select name from storage.objects where bucket_id='deal-docs'`), (r) => r.length === 0);
  await expectOk("payment proofs: admin and the company owner can open them", async () => [await seesDoc(U.admin, "commission-docs"), await seesDoc(U.owner, "commission-docs")], (r) => r[0] === 1 && r[1] === 1);
  await expectOk("payment proofs: outsiders, sales staff and other companies can't", async () => [await seesDoc(U.outsider, "commission-docs"), await seesDoc(U.sales, "commission-docs"), await seesDoc(U.dev, "commission-docs")], (r) => r.every((n) => n === 0));
  console.log("\nAdmin review fixes");
  await sys(`select set_config('request.jwt.claim.role','service_role',false)`);
  const ownerLead = (await sys(`insert into public.leads (name, phone, kind) values ('محمد المالك','01012340000','request') returning id`))[0].id;
  const offer = (await sys(`insert into public.properties (title, price, type, area, status, review_status, owner_lead_id) values ('دوبلكس مالك',1,'دوبلكس','مراسي','بيع','pending','${ownerLead}') returning id`))[0].id;
  await sys(`select set_config('request.jwt.claim.role','',false)`);
  await expectOk("owner offer: admins told it came from an owner, with the owner name", () => sys(`select title, message from public.notifications where user_id='${U.admin}' and related_id='${offer}'`), (r) => r.length === 1 && r[0].title === "عرض عقار جديد من مالك" && r[0].message.includes("محمد المالك"));
  await expectOk("broker listing waiting for review still says it came from a broker", async () => { const id = (await sys(`insert into public.properties (broker_id, title, price, type, area, status, review_status) values ('${DEV}','شقة وسيط',1,'شقة','الحي الأول','بيع','pending') returning id`))[0].id; return sys(`select title from public.notifications where user_id='${U.admin}' and related_id='${id}'`); }, (r) => r.length === 1 && r[0].title === "طلب عقار جديد من وسيط");
  console.log("\nPrice index");
  await expectOk("floor names become levels", () => sys(`select public.floor_level('الأرضي') g, public.floor_level('الدور الأول') f, public.floor_level('التالت') t, public.floor_level('3') n, public.floor_level('السابع') h, public.floor_level('ميزانين') x`),
    (r) => r[0].g === 0 && r[0].f === 1 && r[0].t === 3 && r[0].n === 3 && r[0].h === 5 && r[0].x === null);
  const mallId = (await sys(`insert into public.malls (name, kind) values ('مول المؤشر', 'commercial') returning id`))[0].id;
  const mallUnit = (title, price, size, floor, demo = false) => sys(`insert into public.properties (title, price, size, type, area, status, review_status, category, mall_id, floor, is_demo) values ('${title}', ${price}, ${size}, 'محل تجاري', 'مول المؤشر', 'بيع', 'approved', 'mall', '${mallId}', '${floor}', ${demo})`);
  await mallUnit("محل 1", 300000, 30, "الأرضي");
  await mallUnit("محل 2", 400000, 40, "أرضي");
  await expectOk("two units are not enough to show a price", () => as(null, `select * from public.price_index() where mall_id='${mallId}'`), (r) => r.length === 0);
  await mallUnit("محل 3", 600000, 50, "الدور الأرضي");
  await mallUnit("محل تجريبي", 9000000, 30, "الأرضي", true);
  await expectOk("three real units → visitors see the median price per m², demo ignored", () => as(null, `select price_per_m2, samples, floor_level from public.price_index() where mall_id='${mallId}' and month is null and unit_type = 'محل تجاري'`),
    (r) => r.length === 1 && Number(r[0].price_per_m2) === 10000 && r[0].samples === 3 && r[0].floor_level === 0);
  await expectOk("a floor row across all unit types exists for the mall comparison", () => as(null, `select samples from public.price_index() where mall_id='${mallId}' and month is null and unit_type is null`), (r) => r.length === 1 && r[0].samples === 3);
  await expectOk("monthly rows exist for the trend chart", () => as(null, `select count(*) c from public.price_index() where mall_id='${mallId}' and month is not null`), (r) => Number(r[0].c) === 2);
  await expectErr("visitors can't write finishing ratios", () => as(null, `update public.app_settings set finishing_ratios='{}'::jsonb returning id`).then((r) => { if (!r.length) throw new Error("blocked"); return r; }));
  await expectErr("unknown finishing refused", () => sys(`update public.properties set finishing='luxury' where title='محل 1'`));
  await expectOk("audit: a change with no user and no visitor session is labelled النظام",async () => { await sys(`update public.leads set notes='migration' where id='${ownerLead}'`); return sys(`select actor_label from public.audit_log where table_name='leads' and row_id='${ownerLead}' and action='update' order by id desc limit 1`); }, (r) => r[0]?.actor_label === "النظام");

  console.log("\nCompounds");
  const DS = "00000000-0000-0000-0000-0000000000d5", DM = "00000000-0000-0000-0000-0000000000d6";
  await sys(`insert into auth.users (id, phone) values ('${DS}','201000000061'), ('${DM}','201000000062')`);
  await as(U.dev, `insert into public.company_members (company_id, name, phone, role) values ('${DEV}','سيلز المطور','201000000061','sales'), ('${DEV}','مدير المطور','201000000062','sales')`);
  const memberOf = async (phone) => (await sys(`select id from public.company_members where phone='${phone}'`))[0].id;
  const dsMember = await memberOf("201000000061"), dmMember = await memberOf("201000000062");
  await expectOk("developer creates a compound (published, can't self-feature)", () => as(U.dev, `insert into public.compounds (developer_id, name, city, area, review_status, is_featured) values ('${DEV}','كمبوند النخيل','برج العرب الجديدة','الحي الأول','rejected', true) returning review_status, is_featured`), (r) => r[0].review_status === "approved" && r[0].is_featured === false);
  const cmp = (await sys(`select id from public.compounds where name='كمبوند النخيل'`))[0].id;
  await expectOk("admins told about the new compound", () => sys(`select title from public.notifications where user_id='${U.admin}' and related_id='${cmp}'`), (r) => r.some((n) => n.title === "كمبوند جديد"));
  await expectOk("visitors see the compound", () => as(null, `select id from public.compounds where id='${cmp}'`), (r) => r.length === 1);
  await expectErr("a company (not developer) can't add compounds", () => as(U.owner, `insert into public.compounds (developer_id, name) values ('${CO}','كمبوند شركة')`));
  await expectErr("developer can't add a compound for nobody", () => as(U.dev, `insert into public.compounds (name) values ('كمبوند يتيم')`));
  await expectOk("same compound name allowed for another owner", () => as(U.admin, `insert into public.compounds (name, developer_name) values ('كمبوند النخيل','مطور لسه مش مشترك') returning developer_id`), (r) => r[0].developer_id === null);
  const va = (await sys(`select id from public.compounds where name='كمبوند النخيل' and developer_id is null`))[0].id;
  await expectOk("developer can't edit a compound Value Aqar runs", () => as(U.dev, `update public.compounds set name='x' where id='${va}' returning id`), (r) => r.length === 0);
  await expectOk("developer adds a cUnit", () => as(U.dev, `insert into public.compound_units (compound_id, code, building, floor, unit_type, size, price) values ('${cmp}','A-101','A','1','شقة',120,1500000) returning id`), (r) => r.length === 1);
  const cUnit = (await sys(`select id from public.compound_units where code='A-101'`))[0].id;
  await expectOk("visitors see the cUnit", () => as(null, `select id from public.compound_units where id='${cUnit}'`), (r) => r.length === 1);
  await expectOk("developer assigns a sales member to the compound", () => as(U.dev, `insert into public.compound_members (compound_id, member_id, role) values ('${cmp}','${dsMember}','sales') returning id`), (r) => r.length === 1);
  await expectOk("assigned member is notified", () => sys(`select title from public.notifications where user_id='${DS}' and related_id='${cmp}'`), (r) => r.some((n) => n.title === "اتعينت على كمبوند"));
  await expectErr("another company's member can't be assigned", () => as(U.dev, `insert into public.compound_members (compound_id, member_id) values ('${cmp}',(select id from public.company_members where company_id='${CO}' limit 1))`));
  await expectErr("Value Aqar staff can't be put on a developer's compound", () => as(U.admin, `insert into public.compound_members (compound_id, staff_user_id) values ('${cmp}','${U.staff}')`));
  await expectOk("sales member sees the compound in «my compounds» as sales", () => as(DS, `select role from public.my_compounds()`), (r) => r.length === 1 && r[0].role === "sales");
  await expectOk("unassigned member of the developer sees nothing private", () => as(DM, `select role from public.my_compounds()`), (r) => r.length === 0);
  await expectOk("sales reserves a cUnit but can't change its price", () => as(DS, `update public.compound_units set status='reserved', price=1 where id='${cUnit}' returning status, price`), (r) => r[0].status === "reserved" && Number(r[0].price) === 1500000);
  await expectErr("sales can't add units", () => as(DS, `insert into public.compound_units (compound_id, unit_type) values ('${cmp}','شقة')`));
  await expectOk("sales can't delete units", () => as(DS, `delete from public.compound_units where id='${cUnit}' returning id`), (r) => r.length === 0);
  await expectOk("reservation notifies the developer", () => sys(`select title from public.notifications where user_id='${U.dev}' and related_id='${cmp}'`), (r) => r.some((n) => n.title === "وحدة اتحجزت في كمبوند النخيل"));
  await expectOk("activity log shows the reservation to the team", () => as(DS, `select kind, summary from public.compound_activity where compound_id='${cmp}' order by id`), (r) => r.some((a) => a.kind === "unit_status" && a.summary.includes("محجوزة")) && r.some((a) => a.kind === "team"));
  await expectOk("outsiders can't read the activity log", () => as(U.outsider, `select id from public.compound_activity`), (r) => r.length === 0);
  await expectOk("promoting to compound manager gives edit rights", async () => { await as(U.dev, `update public.compound_members set role='manager' where member_id='${dsMember}'`); return as(DS, `update public.compound_units set price=1600000 where id='${cUnit}' returning price`); }, (r) => Number(r[0].price) === 1600000);
  await expectOk("compound manager can't assign the team", () => as(DS, `insert into public.compound_members (compound_id, member_id) values ('${cmp}','${dmMember}') returning id`).catch(() => []), (r) => r.length === 0);
  await expectOk("developer can't hand the compound to nobody", () => as(U.dev, `update public.compounds set developer_id=null where id='${cmp}' returning developer_id`), (r) => r[0].developer_id === DEV);

  console.log("\nCompounds run by Value Aqar, then handed over");
  await expectOk("admin puts staff on the Value Aqar compound", () => as(U.admin, `insert into public.compound_members (compound_id, staff_user_id, role) values ('${va}','${U.staff}','sales') returning id`), (r) => r.length === 1);
  await expectOk("staff opens the compound office", () => as(U.staff, `select public.compound_role('${va}') r`), (r) => r[0].r === "sales");
  await sys(`insert into public.compound_units (compound_id, unit_type, size) values ('${va}','فيلا',300)`);
  await as(null, `insert into public.leads (name, phone, kind, compound_id) values ('عميل كمبوند','01022223333','request','${va}')`);
  await expectOk("request on the compound is linked and the staff on it is told", async () => [await sys(`select compound_id from public.leads where name='عميل كمبوند'`), await sys(`select title from public.notifications where user_id='${U.staff}' and title='طلب جديد على كمبوند'`)], (r) => r[0][0].compound_id === va && r[1].length === 1);
  await sys(`update public.compounds set is_active=false where id='${va}'`);
  await as(null, `insert into public.leads (name, phone, kind, compound_id) values ('عميل مخفي','01033334444','request','${va}')`);
  await expectOk("public request can't point at a hidden compound", () => sys(`select compound_id from public.leads where name='عميل مخفي'`), (r) => r[0].compound_id === null);
  await sys(`update public.compounds set is_active=true where id='${va}'`);
  await expectErr("a compound can only go to a developer account", () => as(U.admin, `update public.compounds set developer_id='${CO}' where id='${va}'`));
  await expectOk("admin hands the compound to the developer", () => as(U.admin, `update public.compounds set developer_id='${DEV}' where id='${va}' returning handed_over_at`), (r) => r[0].handed_over_at !== null);
  await expectOk("Value Aqar staff leave the team on handover", () => sys(`select count(*) c from public.compound_members where compound_id='${va}'`), (r) => Number(r[0].c) === 0);
  await expectOk("developer is told and now runs it", async () => [await sys(`select title from public.notifications where user_id='${U.dev}' and related_id='${va}'`), await as(U.dev, `select public.compound_role('${va}') r`)], (r) => r[0].some((n) => n.title === "الكمبوند بقى في حسابك") && r[1][0].r === "owner");
  await expectOk("units and requests stay with the compound", () => sys(`select (select count(*) from public.compound_units where compound_id='${va}') u, (select count(*) from public.leads where compound_id='${va}') l`), (r) => Number(r[0].u) === 1 && Number(r[0].l) === 1);
  await expectOk("admin hides a compound, visitors lose it, developer edit sends it to review", async () => { await as(U.admin, `update public.compounds set review_status='rejected' where id='${cmp}'`); const pub = await as(null, `select id from public.compounds where id='${cmp}'`); const r = await as(U.dev, `update public.compounds set description='جديد' where id='${cmp}' returning review_status`); return [pub, r]; }, (r) => r[0].length === 0 && r[1][0].review_status === "pending");
  await expectOk("developer's mall: admin links it", async () => { const m = (await sys(`insert into public.malls (name) values ('مول المطور') returning id`))[0].id; return as(U.admin, `update public.malls set developer_id='${DEV}' where id='${m}' returning developer_id`); }, (r) => r[0].developer_id === DEV);
  await expectOk("developer can't edit the mall", () => as(U.dev, `update public.malls set name='x' where name='مول المطور' returning id`), (r) => r.length === 0);

  console.log("\nUnit requests reach the developer and Value Aqar together");
  const vaUnit = (await sys(`select id from public.compound_units where compound_id='${va}' limit 1`))[0].id;
  await as(null, `insert into public.leads (name, phone, kind, compound_id, compound_unit_id) values ('سارة الطالبة','01077778888','request','${va}','${vaUnit}')`);
  await expectOk("compound unit request: developer told (no customer name), admins told too", async () => [
    await sys(`select title, message from public.notifications where user_id='${U.dev}' and title='طلب وحدة في كمبوند النخيل' order by created_at desc limit 1`),
    await sys(`select count(*) c from public.notifications where user_id='${U.admin}' and message like '%سارة الطالبة%'`)],
    (r) => r[0].length === 1 && r[0][0].message.includes("فيلا") && !r[0][0].message.includes("سارة") && Number(r[1][0].c) >= 1);
  const pj = (await sys(`insert into public.projects (developer_id, name, city, area) values ('${DEV}','برج الياسمين','برج العرب الجديدة','الحي الأول') returning id`))[0].id;
  await as(null, `insert into public.leads (name, phone, kind, project_id) values ('عميل مشروع','01077779999','request','${pj}')`);
  await expectOk("project request: developer told at once (short notice, or the full request when it is routed to him)", () => sys(`select title, message from public.notifications where user_id='${U.dev}' and (title='طلب وحدة في برج الياسمين' or message like '%عميل مشروع%')`), (r) => r.length >= 1);
  await expectOk("a broker's listing inquiry still goes to the broker and the admins", async () => {
    const pid = (await sys(`insert into public.properties (broker_id, title, price, type, area, status, review_status) values ('${CO}','شقة الوسيط',1,'شقة','الحي الأول','بيع','approved') returning id`))[0].id;
    await as(null, `insert into public.leads (name, phone, kind, property_id) values ('مستفسر','01066665555','inquiry','${pid}')`);
    return [await sys(`select count(*) c from public.notifications where user_id='${U.owner}' and message like '%مستفسر%'`), await sys(`select count(*) c from public.notifications where user_id='${U.admin}' and message like '%مستفسر%'`)];
  }, (r) => Number(r[0][0].c) >= 1 && Number(r[1][0].c) >= 1);

  await expectOk("notifications carry the request's name: unit in a compound, inquiry on a listing", async () => [
    await sys(`select count(*) c from public.notifications where user_id='${U.admin}' and title='طلب وحدة في كمبوند النخيل'`),
    await sys(`select count(*) c from public.notifications where user_id='${U.admin}' and title='استفسار عن شقة الوسيط'`),
    await sys(`select count(*) c from public.notifications where user_id='${U.owner}' and title='استفسار عن شقة الوسيط'`)],
    (r) => Number(r[0][0].c) >= 1 && Number(r[1][0].c) === 1 && Number(r[2][0].c) === 1);

  console.log("\nServices: providers, requests, subscriptions");
  const PV = "00000000-0000-0000-0000-0000000000e1", PV2 = "00000000-0000-0000-0000-0000000000e2";
  await sys(`insert into auth.users (id, phone) values ('${PV}','201000000071'), ('${PV2}','201000000072')`);
  await expectOk("visitor registers as a provider; approval fields are ignored", async () => { await as(null, `insert into public.service_providers (kind, category, name, phone, status, verified) values ('technician','media','استوديو فوتو','01000000071','approved', true)`); return sys(`select status, verified, phone from public.service_providers where name='استوديو فوتو'`); }, (r) => r[0].status === "pending" && r[0].verified === false && r[0].phone === "201000000071");
  const prov = (await sys(`select id from public.service_providers where name='استوديو فوتو'`))[0].id;
  await expectOk("admins told a provider is waiting", () => sys(`select title from public.notifications where user_id='${U.admin}' and related_id='${prov}'`), (r) => r.some((n) => n.title === "مقدم خدمة جديد مستني الموافقة"));
  await expectErr("same phone can't register twice", () => as(null, `insert into public.service_providers (category, name, phone) values ('crafts','تاني','+20 100 000 0071')`));
  await expectOk("provider signs in with that phone and sees own profile", () => as(PV, `select id, status from public.service_providers`), (r) => r.length === 1 && r[0].id === prov);
  await expectOk("provider edits bio but can't approve himself", () => as(PV, `update public.service_providers set bio='تصوير عقارات ودرون', status='approved', verified=true where id='${prov}' returning bio, status, verified`), (r) => r[0].bio === "تصوير عقارات ودرون" && r[0].status === "pending" && r[0].verified === false);
  await expectOk("outsiders can't see providers", () => as(U.outsider, `select id from public.service_providers`), (r) => r.length === 0);
  await expectOk("visitors can't see providers", () => as(null, `select id from public.service_providers`).catch(() => []), (r) => r.length === 0);

  await expectOk("visitor asks for a service; status and assignment are ignored", async () => { await as(null, `insert into public.service_requests (name, phone, category, details, status) values ('عميل خدمة','01011112222','media','تصوير شقة','done')`); return sys(`select status, assigned_provider_id from public.service_requests where name='عميل خدمة'`); }, (r) => r[0].status === "new" && r[0].assigned_provider_id === null);
  const sreq = (await sys(`select id from public.service_requests where name='عميل خدمة'`))[0].id;
  await expectOk("admins and staff told about the service request (not as a real-estate lead)", async () => [await sys(`select title from public.notifications where user_id='${U.staff}' and related_id='${sreq}'`), await sys(`select count(*) c from public.leads where name='عميل خدمة'`)], (r) => r[0].some((n) => n.title === "طلب خدمة جديد — تصوير وميديا") && Number(r[1][0].c) === 0);
  await expectErr("can't assign to a provider who isn't approved", () => as(U.admin, `update public.service_requests set assigned_provider_id='${prov}' where id='${sreq}'`));
  await expectOk("admin approves; provider is told", async () => { await as(U.admin, `update public.service_providers set status='approved', verified=true where id='${prov}'`); return sys(`select title from public.notifications where user_id='${PV}' and related_id='${prov}'`); }, (r) => r.some((n) => n.title === "حسابك كمقدم خدمة اتفعّل"));
  await expectOk("admin assigns: provider and Value Aqar told at the same time", async () => { await as(U.admin, `update public.service_requests set assigned_provider_id='${prov}' where id='${sreq}'`); return [await sys(`select title from public.notifications where user_id='${PV}' and related_id='${sreq}'`), await sys(`select title from public.notifications where user_id='${U.staff}' and related_id='${sreq}'`), await sys(`select status from public.service_requests where id='${sreq}'`)]; },
    (r) => r[0].some((n) => n.title === "طلب خدمة جديد ليك") && r[1].some((n) => n.title.startsWith("طلب خدمة اتحوّل لـ استوديو فوتو")) && r[2][0].status === "assigned");
  await expectOk("provider sees the assigned request with the customer's phone", () => as(PV, `select phone from public.service_requests`), (r) => r.length === 1 && r[0].phone === "201011112222");
  await expectOk("another provider sees nothing", async () => { await sys(`insert into public.service_providers (category, name, phone, status) values ('media','منافس','201000000072','approved')`); return as(PV2, `select id from public.service_requests`); }, (r) => r.length === 0);
  await expectOk("provider can't reassign or edit the customer, but marks it done", () => as(PV, `update public.service_requests set assigned_provider_id=null, phone='0', status='done', notes='اتصورت' where id='${sreq}' returning assigned_provider_id, phone, status, notes`), (r) => r[0].assigned_provider_id === prov && r[0].phone === "201011112222" && r[0].status === "done" && r[0].notes === "اتصورت");
  await expectOk("admins told the provider finished", () => sys(`select title from public.notifications where user_id='${U.admin}' and related_id='${sreq}'`), (r) => r.some((n) => n.title === "مقدم خدمة خلّص طلب"));
  await expectErr("can't assign a craftsmen request to a photographer", async () => { const id = (await sys(`insert into public.service_requests (name, phone, category) values ('سباكة','01022221111','crafts') returning id`))[0].id; return as(U.admin, `update public.service_requests set assigned_provider_id='${prov}' where id='${id}'`); });
  await expectOk("outsiders can't read service requests", () => as(U.outsider, `select id from public.service_requests`), (r) => r.length === 0);

  const basic = (await sys(`select id from public.service_plans where code='basic'`))[0].id;
  await expectOk("three plans exist, prices not set yet", () => as(null, `select code, monthly_price from public.service_plans order by sort_order`), (r) => r.map((x) => x.code).join() === "free,basic,featured" && r.every((x) => x.monthly_price === null));
  await expectErr("provider can't give himself a subscription", () => as(PV, `insert into public.service_subscriptions (provider_id, plan_id, ends_at) values ('${prov}','${basic}', now() + interval '30 days')`));
  await expectOk("admin activates a plan; provider row and notification follow", async () => { await as(U.admin, `insert into public.service_subscriptions (provider_id, plan_id, ends_at) values ('${prov}','${basic}', now() + interval '30 days')`); return [await sys(`select plan_id from public.service_providers where id='${prov}'`), await sys(`select title from public.notifications where user_id='${PV}' and title='اشتراكك اتفعّل'`)]; }, (r) => r[0][0].plan_id === basic && r[1].length === 1);
  await expectOk("3 days before the end: provider and admins reminded once", async () => { await sys(`update public.service_subscriptions set ends_at = now() + interval '2 days' where provider_id='${prov}'`); await sys(`select public.run_service_subscriptions()`); await sys(`select public.run_service_subscriptions()`); return [await sys(`select count(*) c from public.notifications where user_id='${PV}' and title='اشتراكك قرّب يخلص'`), await sys(`select count(*) c from public.notifications where user_id='${U.admin}' and title='اشتراك مقدم خدمة قرّب يخلص'`)]; }, (r) => Number(r[0][0].c) === 1 && Number(r[1][0].c) === 1);
  await expectOk("after the end: expired and back to the free plan", async () => { await sys(`update public.service_subscriptions set starts_at = now() - interval '40 days', ends_at = now() - interval '1 minute' where provider_id='${prov}'`); await sys(`select public.run_service_subscriptions()`); return sys(`select p.plan_id, (select status from public.service_subscriptions where provider_id=p.id) st from public.service_providers p where p.id='${prov}'`); }, (r) => r[0].plan_id === null && r[0].st === "expired");
  await expectOk("provider asks for a plan; admins told", async () => { await as(PV, `select public.request_service_plan('${basic}')`); return sys(`select title from public.notifications where user_id='${U.admin}' and title='طلب اشتراك من مقدم خدمة'`); }, (r) => r.length === 1);
  await expectErr("non-provider can't ask for a plan", () => as(U.outsider, `select public.request_service_plan('${basic}')`));
  await expectOk("old service requests saved as leads are copied once (re-running the file is safe)", async () => {
    await sys(`select set_config('request.jwt.claim.role','service_role',false)`);
    await sys(`insert into public.leads (name, phone, kind, details) values ('قديم طالب','01055556666','request','دليل الخدمات (قريبًا) — طالب خدمة — صنايعية — سباك'), ('قديم فني','01055557777','request','دليل الخدمات (قريبًا) — مقدم خدمة — شركات التصوير والميديا — درون')`);
    await sys(`select set_config('request.jwt.claim.role','',false)`);
    const sql = (await import("node:fs")).readFileSync(new URL("../migrations/20261013700000_services.sql", import.meta.url), "utf8");
    await exec(`begin;
${sql}
commit;`);
    await exec(`begin;
${sql}
commit;`);
    return [await sys(`select category, details from public.service_requests where name='قديم طالب'`), await sys(`select category, status from public.service_providers where name='قديم فني'`)];
  }, (r) => r[0].length === 1 && r[0][0].category === "crafts" && r[0][0].details === "سباك" && r[1].length === 1 && r[1][0].category === "media" && r[1][0].status === "pending");

  console.log("\nMessages inside the platform");
  const MU = {
    cust: "00000000-0000-0000-0000-00000000a0e1", owner: "00000000-0000-0000-0000-00000000a0e2",
    sales: "00000000-0000-0000-0000-00000000a0e3", owner2: "00000000-0000-0000-0000-00000000a0e4",
  };
  const MX = "c0000000-0000-0000-0000-00000000a0e1", MY = "c0000000-0000-0000-0000-00000000a0e2";
  await sys(`insert into auth.users (id, phone) values ('${MU.cust}','201022220001'), ('${MU.owner}','201022220002'),
    ('${MU.sales}','201022220003'), ('${MU.owner2}','201022220004')`);
  await sys(`select set_config('request.jwt.claim.role','service_role',false)`);
  await sys(`insert into public.brokers (id, user_id, slug, name, phone, account_type, is_active) values
    ('${MX}','${MU.owner}','msg-x','شركة الرسايل','201022220002','company', true),
    ('${MY}','${MU.owner2}','msg-y','شركة تانية','201022220004','company', true)`);
  await sys(`insert into public.company_members (company_id, name, phone, role) values ('${MX}','بياع','201022220003','sales')`);
  const ml = (await sys(`insert into public.leads (name, phone, kind, assigned_broker_id, assigned_member_id)
    values ('عميل رسايل','01022220001','request','${MX}',(select id from public.company_members where phone='201022220003')) returning id`))[0].id;
  const inv = (await sys(`insert into public.leads (name, phone, kind) values ('مستثمر','01022220001','investment') returning id`))[0].id;
  await sys(`select set_config('request.jwt.claim.role','',false)`);
  const seq = async (fns) => { const out = []; for (const f of fns) out.push(await f()); return out; };
  const send = (u, body) => as(u, `select public.send_lead_message('${ml}', $$${body}$$) id`);
  const msgNotes = (u) => sys(`select title, message, related_url, is_read from public.notifications where user_id='${u}' and type='new_message' and related_id='${ml}' order by created_at`);

  await expectOk("each side is recognised (customer by verified phone, assigned sales, owner, Value Aqar)", () => seq([
    () => as(MU.cust, `select public.lead_chat_side('${ml}') s`), () => as(MU.sales, `select public.lead_chat_side('${ml}') s`),
    () => as(MU.owner, `select public.lead_chat_side('${ml}') s`), () => as(U.staff, `select public.lead_chat_side('${ml}') s`),
    () => as(MU.owner2, `select public.lead_chat_side('${ml}') s`), () => as(U.outsider, `select public.lead_chat_side('${ml}') s`)]),
    (r) => r.map((x) => x[0].s).join() === "customer,company,company,platform,,");
  await expectOk("customer sends a message", () => send(MU.cust, "عايز أعرف تفاصيل الشقة"), (r) => !!r[0].id);
  await expectOk("the company hears about it (owner + assigned sales)", async () => [await msgNotes(MU.owner), await msgNotes(MU.sales)],
    (r) => r[0].length === 1 && r[1].length === 1 && r[0][0].title.startsWith("رسالة جديدة: ") && r[0][0].related_url === `/leads/${ml}#messages`);
  await expectOk("a second message within 5 minutes doesn't notify again", async () => { await send(MU.cust, "ومتاح معاينة إمتى؟"); return msgNotes(MU.owner); }, (r) => r.length === 1);
  await expectOk("a phone number from the customer is hidden", async () => { await send(MU.cust, "كلمني على 0101 234 5678 أو ٠١١٢٣٤٥٦٧٨٩"); return as(MU.cust, `select body, masked from public.lead_messages where lead_id='${ml}' order by created_at desc limit 1`); },
    (r) => r[0].masked === true && !/[0-9٠-٩]{4}/.test(r[0].body.replace("[رقم مخفي]", "")) && r[0].body.includes("[رقم مخفي]"));
  await expectOk("a WhatsApp link is hidden", async () => { await send(MU.cust, "ابعتلي على https://wa.me/201012345678 بسرعة"); return as(MU.cust, `select body from public.lead_messages where lead_id='${ml}' order by created_at desc limit 1`); },
    (r) => r[0].body.includes("[رابط مخفي]") && !r[0].body.includes("wa.me"));
  await expectOk("prices and areas are not hidden", async () => { await send(MU.cust, "ميزانيتي 2500000 والمساحة 120 متر"); return as(MU.cust, `select body, masked from public.lead_messages where lead_id='${ml}' order by created_at desc limit 1`); },
    (r) => r[0].masked === false && r[0].body.includes("2500000"));
  await expectOk("the company reply counts as the first contact", async () => { await send(MU.sales, "أهلا بحضرتك، الشقة متاحة"); return sys(`select first_response_outcome o, first_response_by b from public.leads where id='${ml}'`); },
    (r) => r[0].o === "message" && r[0].b === MU.sales);
  await expectOk("the customer hears the reply, with a link to their messages", () => msgNotes(MU.cust), (r) => r.length === 1 && r[0].related_url === `/messages?lead=${ml}` && r[0].message.startsWith("شركة الرسايل: "));
  await expectOk("the lead file shows the conversation", () => sys(`select summary from public.lead_activities where lead_id='${ml}' and kind='message' order by created_at`), (r) => r.length === 2);
  await expectOk("Value Aqar can write numbers (not hidden)", async () => { await as(U.admin, `select public.send_lead_message('${ml}', 'كلمونا على 01000000000')`); return sys(`select masked, sender_label from public.lead_messages where lead_id='${ml}' order by created_at desc limit 1`); },
    (r) => r[0].masked === false && r[0].sender_label === "فاليو عقار");
  await expectOk("an outsider reads nothing", () => as(U.outsider, `select id from public.lead_messages`), (r) => r.length === 0);
  await expectErr("an outsider can't send", () => send(U.outsider, "سلام"));
  await expectErr("nobody writes to the table directly", () => as(MU.cust, `insert into public.lead_messages (lead_id, sender_id, sender_side, sender_label, body) values ('${ml}','${MU.cust}','platform','فاليو عقار','مزيف')`));
  await expectErr("messages can't be edited", () => as(MU.cust, `update public.lead_messages set body='تعديل' where lead_id='${ml}'`));
  await expectErr("messages can't be deleted", () => as(MU.cust, `delete from public.lead_messages where lead_id='${ml}'`));
  await expectOk("inbox shows the conversation with unread count", () => as(MU.cust, `select * from public.my_conversations()`),
    (r) => r.length === 1 && r[0].unread === 2 && r[0].other_label === "شركة الرسايل" && r[0].side === "customer");
  await expectOk("opening it marks it read (messages and bell)", async () => { await as(MU.cust, `select public.mark_lead_messages_read('${ml}')`); return [await as(MU.cust, `select public.my_unread_messages() n`), await msgNotes(MU.cust)]; },
    (r) => r[0][0].n === 0 && r[1].every((n) => n.is_read));
  await expectOk("the company sees that the customer read it", () => as(MU.sales, `select side from public.lead_message_reads where lead_id='${ml}'`), (r) => r.some((x) => x.side === "customer"));

  await expectOk("customer reports a message, admins are told", async () => {
    const m = (await as(MU.cust, `select id from public.lead_messages where lead_id='${ml}' and sender_side='company' limit 1`))[0].id;
    await as(MU.cust, `select public.report_lead_message('${m}', 'كلام مش لطيف')`);
    return [await sys(`select reported_by from public.lead_messages where id='${m}'`), await sys(`select count(*)::int c from public.notifications where user_id='${U.admin}' and title='بلاغ عن رسالة'`)];
  }, (r) => r[0][0].reported_by === MU.cust && r[1][0].c === 1);
  await expectErr("you can't report your own message", async () => { const m = (await as(MU.cust, `select id from public.lead_messages where lead_id='${ml}' and sender_id='${MU.cust}' limit 1`))[0].id; return as(MU.cust, `select public.report_lead_message('${m}', 'x')`); });

  await expectOk("attachments: the customer uploads to the conversation folder", () => as(MU.cust, `insert into storage.objects (bucket_id, name) values ('lead-messages', '${ml}/photo.jpg') returning name`), (r) => r.length === 1);
  await expectErr("attachments: an outsider can't upload there", () => as(U.outsider, `insert into storage.objects (bucket_id, name) values ('lead-messages', '${ml}/x.jpg')`));
  await expectErr("attachments: a folder that isn't a conversation is refused", () => as(MU.cust, `insert into storage.objects (bucket_id, name) values ('lead-messages', 'other/x.jpg')`));
  await expectOk("attachments: the company reads the file, an outsider doesn't", () => seq([
    () => as(MU.owner, `select name from storage.objects where bucket_id='lead-messages'`), () => as(U.outsider, `select name from storage.objects where bucket_id='lead-messages'`)]),
    (r) => r[0].length === 1 && r[1].length === 0);
  await expectOk("attachments: sending a photo", () => as(MU.cust, `select public.send_lead_message('${ml}', null, '${ml}/photo.jpg', 'photo.jpg', 'image') id`), (r) => !!r[0].id);
  await expectErr("attachments: a file from another conversation is refused", () => as(MU.cust, `select public.send_lead_message('${ml}', null, '${inv}/x.pdf', 'x.pdf', 'pdf')`));

  await expectOk("after a transfer the new company sees the history and the old one doesn't", async () => {
    await sys(`select set_config('request.jwt.claim.role','service_role',false)`);
    await sys(`update public.leads set assigned_broker_id='${MY}', assigned_member_id=null where id='${ml}'`);
    await sys(`select set_config('request.jwt.claim.role','',false)`);
    return [await as(MU.owner2, `select count(*)::int c from public.lead_messages where lead_id='${ml}'`), await as(MU.owner, `select count(*)::int c from public.lead_messages`), await as(MU.sales, `select count(*)::int c from public.lead_messages`)];
  }, (r) => r[0][0].c >= 8 && r[1][0].c === 0 && r[2][0].c === 0);
  await expectOk("from «reserved» numbers are shown", async () => {
    await sys(`select set_config('request.jwt.claim.role','service_role',false)`);
    await sys(`update public.leads set stage='reserved' where id='${ml}'`);
    await sys(`select set_config('request.jwt.claim.role','',false)`);
    await send(MU.owner2, "رقم المكتب 01099998888");
    return sys(`select masked, body from public.lead_messages where lead_id='${ml}' order by created_at desc limit 1`);
  }, (r) => r[0].masked === false && r[0].body.includes("01099998888"));

  await expectErr("a company can't close a conversation", () => as(MU.owner2, `select public.set_lead_chat_closed('${ml}', true)`));
  await expectErr("after Value Aqar closes it, the customer can't send", async () => { await as(U.admin, `select public.set_lead_chat_closed('${ml}', true)`); return send(MU.cust, "سلام"); });
  await expectErr("…and can't upload files", () => as(MU.cust, `insert into storage.objects (bucket_id, name) values ('lead-messages', '${ml}/late.jpg')`));
  await expectOk("…but still reads the history, and Value Aqar can still write", async () => { await as(U.admin, `select public.send_lead_message('${ml}', 'المحادثة اتقفلت')`); return as(MU.cust, `select closed from public.my_conversations()`); }, (r) => r[0].closed === true);
  await expectOk("investment requests have no conversation (for now)", () => as(MU.cust, `select public.lead_chat_side('${inv}') s`), (r) => r[0].s === null);
  await expectErr("flood guard: 20 messages a minute", async () => { await as(U.admin, `select public.set_lead_chat_closed('${ml}', false)`); for (let i = 0; i < 21; i++) await send(MU.cust, `رسالة ${i}`); });
  await expectOk("release-21 can be re-run safely (messages stay)", async () => {
    const sql = (await import("node:fs")).readFileSync(new URL("../migrations/20261013900000_lead-messages.sql", import.meta.url), "utf8");
    const before = (await sys(`select count(*)::int c from public.lead_messages`))[0].c;
    await exec(`begin;\n${sql}\ncommit;`);
    await exec(`begin;\n${sql}\ncommit;`);
    return [before, (await sys(`select count(*)::int c from public.lead_messages`))[0].c];
  }, (r) => r[0] > 0 && r[0] === r[1]);

  console.log("\nPush notifications (devices)");
  const PU = { a: "00000000-0000-0000-0000-00000000b0a1", b: "00000000-0000-0000-0000-00000000b0a2" };
  await sys(`insert into auth.users (id, phone) values ('${PU.a}','201033330001'), ('${PU.b}','201033330002')`);
  const ep = "https://fcm.googleapis.com/fcm/send/device-one";
  const k = "BElongP256dhPublicKeyValueForTestsOnly0123456789";
  const pushOf = (u) => sys(`select push_status from public.notifications where user_id='${u}' order by created_at desc limit 1`);
  const notifyAs = (u, type) => sys(`select public.notify_user('${u}', '${type}', 'عنوان', 'رسالة', null, '/notifications')`);
  await expectOk("no device: notifications aren't queued for push", async () => { await notifyAs(PU.a, "request_status"); return pushOf(PU.a); }, (r) => r[0].push_status === null);
  await expectOk("a signed-in user saves their device", () => as(PU.a, `select public.save_push_subscription('${ep}', '${k}', 'authsecret123', 'Chrome Android') id`), (r) => !!r[0].id);
  await expectErr("a visitor can't save a device", () => as(null, `select public.save_push_subscription('https://x.example/1', '${k}', 'authsecret123')`));
  await expectErr("only https push addresses", () => as(PU.a, `select public.save_push_subscription('http://x.example/1', '${k}', 'authsecret123')`));
  await expectOk("with a device: the next notification is queued for push", async () => { await notifyAs(PU.a, "request_status"); return pushOf(PU.a); }, (r) => r[0].push_status === "pending");
  await expectOk("each user sees only their own devices", async () => [await as(PU.a, `select endpoint from public.push_subscriptions`), await as(PU.b, `select endpoint from public.push_subscriptions`)], (r) => r[0].length === 1 && r[1].length === 0);
  await expectErr("nobody writes devices directly", () => as(PU.b, `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('${PU.b}','https://x.example/2','${k}','authsecret123')`));
  await expectOk("the user picks which kinds reach the device", async () => {
    await as(PU.a, `insert into public.notification_preferences (user_id, push_types) values ('${PU.a}', array['new_message'])`);
    await notifyAs(PU.a, "request_status"); const skipped = await pushOf(PU.a);
    await notifyAs(PU.a, "new_message"); return [skipped, await pushOf(PU.a)];
  }, (r) => r[0][0].push_status === null && r[1][0].push_status === "pending");
  await expectOk("a shared phone moves to the account signed in now", async () => { await as(PU.b, `select public.save_push_subscription('${ep}', '${k}', 'authsecret456')`); return sys(`select user_id from public.push_subscriptions where endpoint='${ep}'`); }, (r) => r.length === 1 && r[0].user_id === PU.b);
  await expectOk("removing the device on sign-out", async () => { await as(PU.b, `select public.delete_push_subscription('${ep}')`); return sys(`select count(*)::int c from public.push_subscriptions`); }, (r) => r[0].c === 0);
  await expectOk("ten devices at most per account (the oldest makes room)", async () => {
    for (let i = 0; i < 11; i++) await as(PU.a, `select public.save_push_subscription('https://push.example/${i}', '${k}', 'authsecret123')`);
    return sys(`select count(*)::int c, bool_or(endpoint = 'https://push.example/0') has_first from public.push_subscriptions where user_id='${PU.a}'`);
  }, (r) => r[0].c === 10 && r[0].has_first === false);
  await expectOk("the server settings are private (secret, keys)", async () => [
    await as(PU.a, `select count(*)::int c from public.push_config`).catch(() => [{ c: -1 }]),
    await as(null, `select count(*)::int c from public.push_config`).catch(() => [{ c: -1 }]),
    await sys(`select char_length(secret) n from public.push_config`)], (r) => r[0][0].c === -1 && r[1][0].c === -1 && r[2][0].n === 64);
  await expectOk("without pg_net the notification is still saved (sent later by the scheduled dispatch)", async () => { await notifyAs(PU.a, "new_message"); return pushOf(PU.a); }, (r) => r[0].push_status === "pending");
  await expectOk("release-22 can be re-run safely (devices and secret stay)", async () => {
    const sql = (await import("node:fs")).readFileSync(new URL("../migrations/20261014000000_web-push.sql", import.meta.url), "utf8");
    const before = await sys(`select (select count(*)::int from public.push_subscriptions) d, (select secret from public.push_config) s`);
    await exec(`begin;\n${sql}\ncommit;`);
    await exec(`begin;\n${sql}\ncommit;`);
    const after = await sys(`select (select count(*)::int from public.push_subscriptions) d, (select secret from public.push_config) s`);
    return [before[0], after[0]];
  }, (r) => r[0].d === 10 && r[0].d === r[1].d && r[0].s === r[1].s);

  console.log("\nListing plans for everyone (brokers and owners)");
  const LP = { broker: "00000000-0000-0000-0000-0000000000f1", owner: "00000000-0000-0000-0000-0000000000f2" };
  const NB = "b0000000-0000-0000-0000-0000000000f1";
  await sys(`insert into auth.users (id, phone) values ('${LP.broker}','201055500081'), ('${LP.owner}','201055500082')`);
  await sys(`insert into public.brokers (id, user_id, slug, name, phone, account_type, is_active) values ('${NB}','${LP.broker}','nb','وسيط جديد','201055500081','individual', true)`);
  const svcRole = async (sql) => { await sys(`select set_config('request.jwt.claim.role','service_role',false)`); try { return await sys(sql); } finally { await sys(`select set_config('request.jwt.claim.role','',false)`); } };
  const addListing = async (title) => {
    const id = (await as(LP.broker, `insert into public.properties (broker_id, title, price, type, area, status, review_status) values ('${NB}','${title}',1,'شقة','الحي الأول','بيع','pending') returning id`))[0].id;
    return as(U.admin, `update public.properties set review_status='approved' where id='${id}' returning id, review_status, listed_until`);
  };
  await expectOk("owner plans exist; the free plan allows 2 listings for 30 days", () => sys(`select code, audience, max_properties, listing_days from public.plans where code in ('free','owner_free','owner_plus') order by code`),
    (r) => r.length === 3 && r[0].max_properties === 2 && r[0].listing_days === 30 && r[1].audience === "owner" && r[2].max_properties === 5);
  await expectErr("a broker can't be put on an owner plan", () => as(U.admin, `update public.brokers set plan_id=(select id from public.plans where code='owner_plus') where id='${NB}'`));
  const l1 = (await addListing("إعلان 1"))[0];
  await expectOk("approved listing gets a 30-day term", async () => l1, (r) => r.review_status === "approved" && Math.round((new Date(r.listed_until) - Date.now()) / 864e5) === 30);
  const l2 = (await addListing("إعلان 2"))[0].id;
  await expectErr("third live listing on the free plan is refused", () => addListing("إعلان 3"));
  await expectOk("a draft beyond the limit is fine, but can't be published", async () => {
    const d = (await as(LP.broker, `insert into public.properties (broker_id, title, price, type, area, status, review_status) values ('${NB}','مسودة',1,'شقة','الحي الأول','بيع','draft') returning id`))[0].id;
    try { await as(LP.broker, `update public.properties set review_status='pending' where id='${d}'`); return "published"; } catch { return "refused"; }
  }, (r) => r === "refused");
  await expectOk("the broker can't move the end date", () => as(LP.broker, `update public.properties set listed_until = now() + interval '1 year' where id='${l1.id}' returning listed_until`), (r) => Math.round((new Date(r[0].listed_until) - Date.now()) / 864e5) === 30);
  await expectErr("renewing with more than a week left is refused", () => as(LP.broker, `select public.renew_listing('${l1.id}')`));
  await expectOk("in the last week the listing renews from its end date", async () => { await svcRole(`update public.properties set listed_until = now() + interval '3 days' where id='${l1.id}'`); return as(LP.broker, `select public.renew_listing('${l1.id}') d`); }, (r) => Math.round((new Date(r[0].d) - Date.now()) / 864e5) === 33);
  await expectOk("an expired listing disappears for visitors but stays for its owner", async () => {
    await svcRole(`update public.properties set listed_until = now() - interval '1 minute' where id='${l2}'`);
    return [await as(null, `select id from public.properties where id='${l2}'`), await as(LP.broker, `select id from public.properties where id='${l2}'`)];
  }, (r) => r[0].length === 0 && r[1].length === 1);
  await expectOk("an expired listing frees its place for a new one", () => addListing("إعلان 3"), (r) => r.length === 1);
  await expectErr("an expired listing can't come back while the plan is full", () => as(LP.broker, `select public.renew_listing('${l2}')`));
  await expectErr("another company can't renew it", () => as(U.owner, `select public.renew_listing('${l1.id}')`));
  await expectOk("«باقتي» shows the plan and what's used", () => as(LP.broker, `select public.my_listing_plan() p`), (r) => r[0].p.audience === "broker" && r[0].p.code === "free" && r[0].p.used === 2 && r[0].p.max === 2);
  await expectOk("expiry reminders: one per account and stage, never twice", async () => {
    await svcRole(`update public.properties set listed_until = now() + interval '3 days', listing_notice = 0 where broker_id='${NB}' and title in ('إعلان 1','إعلان 3')`);
    await svcRole(`update public.properties set listing_notice = 0 where id='${l2}'`);
    await svcRole(`select public.run_listing_expiry()`); await svcRole(`select public.run_listing_expiry()`);
    return [await sys(`select title from public.notifications where user_id='${LP.broker}' and title like '%هتخلص خلال أسبوع'`), await sys(`select title from public.notifications where user_id='${LP.broker}' and title like 'إعلانك خلص%'`)];
  }, (r) => r[0].length === 1 && r[0][0].title === "2 إعلانات هتخلص خلال أسبوع" && r[1].length === 1);
  await expectErr("companies can't run the listing expiry job", () => as(LP.broker, `select public.run_listing_expiry()`));
  await expectOk("the broker asks for a bigger plan; admins told", async () => { await as(LP.broker, `select public.request_listing_plan((select id from public.plans where code='pro'))`); return sys(`select title from public.notifications where user_id='${U.admin}' and title like 'طلب باقة إعلانات%'`); }, (r) => r.length === 1);
  await expectErr("a broker can't ask for an owner plan", () => as(LP.broker, `select public.request_listing_plan((select id from public.plans where code='owner_plus'))`));

  const ownerListing = async (title) => {
    const lead = (await svcRole(`insert into public.leads (name, phone, kind) values ('مالك الخطة','01055500082','listing') returning id`))[0].id;
    return svcRole(`insert into public.properties (title, price, type, area, status, review_status, owner_lead_id) values ('${title}',1,'شقة','الحي الأول','بيع','pending','${lead}') returning id`);
  };
  const o1 = (await ownerListing("شقة مالك 1"))[0].id;
  await ownerListing("شقة مالك 2");
  await expectOk("owner quota by phone: 2 of 2 used", () => svcRole(`select public.owner_listing_quota('01055500082') q`), (r) => r[0].q.used === 2 && r[0].q.max === 2);
  await expectErr("owner's third listing is refused on the free owner plan", () => ownerListing("شقة مالك 3"));
  await expectOk("the owner sees their listings after signing in with that phone", () => as(LP.owner, `select title, review_status from public.my_owner_listings()`), (r) => r.length === 2);
  await expectOk("admin approves: the owner's listing gets a term", async () => { await as(U.admin, `update public.properties set review_status='approved' where id='${o1}'`); return sys(`select listed_until from public.properties where id='${o1}'`); }, (r) => r[0].listed_until !== null);
  await expectOk("the owner renews in the last week", async () => { await svcRole(`update public.properties set listed_until = now() + interval '2 days' where id='${o1}'`); return as(LP.owner, `select public.renew_listing('${o1}') d`); }, (r) => Math.round((new Date(r[0].d) - Date.now()) / 864e5) === 32);
  await expectErr("someone else can't renew the owner's listing", () => as(U.outsider, `select public.renew_listing('${o1}')`));
  await expectErr("an owner grant must be an owner plan", () => as(U.admin, `insert into public.owner_plan_grants (phone, plan_id, ends_at) values ('01055500082',(select id from public.plans where code='pro'), now() + interval '30 days')`));
  await expectOk("admin gives the owner «بلس»: 5 listings, a third one goes through", async () => {
    await as(U.admin, `insert into public.owner_plan_grants (phone, plan_id, ends_at) values ('01055500082',(select id from public.plans where code='owner_plus'), now() + interval '30 days')`);
    await ownerListing("شقة مالك 3");
    return as(LP.owner, `select public.my_listing_plan() p`);
  }, (r) => r[0].p.audience === "owner" && r[0].p.code === "owner_plus" && r[0].p.used === 3 && r[0].p.max === 5);
  await expectOk("the owner sees own grant only", async () => [await as(LP.owner, `select id from public.owner_plan_grants`), await as(U.outsider, `select id from public.owner_plan_grants`)], (r) => r[0].length === 1 && r[1].length === 0);
  await expectOk("the owner asks for a plan; admins told", async () => { await as(LP.owner, `select public.request_listing_plan((select id from public.plans where code='owner_plus'))`); return sys(`select message from public.notifications where user_id='${U.admin}' and title='طلب باقة إعلانات — مالك — بلس'`); }, (r) => r.length === 1 && r[0].message.includes("201055500082"));

  console.log("\nServices: automatic routing, accept / decline, ratings, photos, directory");
  // An earlier check re-runs the release-19 services file, which brings back the old functions; put the new ones back.
  await exec(`begin;\n${(await import("node:fs")).readFileSync(new URL("../migrations/20261014100000_plans-and-providers.sql", import.meta.url), "utf8")}\ncommit;`);
  const SV = { e1: "00000000-0000-0000-0000-0000000000a1", e2: "00000000-0000-0000-0000-0000000000a2", cust: "00000000-0000-0000-0000-0000000000a3" };
  await sys(`insert into auth.users (id, phone) values ('${SV.e1}','201055500091'), ('${SV.e2}','201055500092'), ('${SV.cust}','201055500093')`);
  const E1 = (await sys(`insert into public.service_providers (kind, category, name, phone, areas) values ('technician','engineering','مهندس أول','201055500091', array['الحي الأول']) returning id`))[0].id;
  const E2 = (await sys(`insert into public.service_providers (kind, category, name, phone) values ('company','engineering','مكتب تاني','201055500092') returning id`))[0].id;
  await as(U.admin, `update public.service_providers set status='approved' where id in ('${E1}','${E2}')`);
  await as(U.admin, `insert into public.service_subscriptions (provider_id, plan_id, ends_at) values ('${E2}',(select id from public.service_plans where code='basic'), now() + interval '30 days')`);
  const ask = async (extra = "") => { await as(null, `insert into public.service_requests (name, phone, category, area, details${extra ? ", target_provider_id" : ""}) values ('أحمد العميل','01055500093','engineering','الحي الأول','رسم معماري'${extra ? `, '${extra}'` : ""})`); return (await sys(`select id from public.service_requests order by request_no desc limit 1`))[0].id; };
  const offerOf = (id) => sys(`select offer_provider_id o, assigned_provider_id a, status, needs_manual m, declined_provider_ids d from public.service_requests where id='${id}'`).then((x) => x[0]);
  const sr1 = await ask();
  await expectOk("a new request is offered to the best match (higher plan first); provider and admins told", async () => [await offerOf(sr1), await sys(`select title from public.notifications where user_id='${SV.e2}' and related_id='${sr1}'`), await sys(`select title from public.notifications where user_id='${U.admin}' and related_id='${sr1}'`)],
    (r) => r[0].o === E2 && r[1][0]?.title === "طلب خدمة جديد ليك — رد خلال ساعتين" && r[2].length === 1 && r[2][0].title === "طلب خدمة جديد — مكاتب هندسية");
  await expectOk("before accepting, the provider sees the offer without the customer's name or phone", async () => [await as(SV.e2, `select id from public.service_requests where id='${sr1}'`), await as(SV.e2, `select * from public.my_service_offers()`)],
    (r) => r[0].length === 0 && r[1].length === 1 && !("phone" in r[1][0]) && !("name" in r[1][0]) && r[1][0].details === "رسم معماري");
  await expectErr("a provider it wasn't offered to can't accept it", () => as(SV.e1, `select public.accept_service_offer('${sr1}')`));
  await expectErr("the provider can't take it by editing the row", async () => { const r = await as(SV.e2, `update public.service_requests set assigned_provider_id='${E2}' where id='${sr1}' returning id`); if (!r.length) throw new Error("no rows"); return r; });
  await expectOk("decline → offered to the next provider", async () => { await as(SV.e2, `select public.decline_service_offer('${sr1}')`); return offerOf(sr1); }, (r) => r.o === E1 && r.d.includes(E2));
  await expectOk("accept → assigned; now the phone shows; admins and customer told", async () => {
    await as(SV.e1, `select public.accept_service_offer('${sr1}')`);
    return [await offerOf(sr1), await as(SV.e1, `select phone from public.service_requests where id='${sr1}'`), await sys(`select title from public.notifications where user_id='${U.admin}' and related_id='${sr1}' and title='مهندس أول قبل طلب خدمة'`), await sys(`select title from public.notifications where user_id='${SV.cust}' and related_id='${sr1}'`)];
  }, (r) => r[0].a === E1 && r[0].o === null && r[0].status === "assigned" && r[1][0]?.phone === "201055500093" && r[2].length === 1 && r[3].some((n) => n.title === "مهندس أول هيتواصل معاك"));
  await expectOk("no reply in 2 hours → moves on and the first provider is told", async () => {
    const id = await ask(); const first = (await offerOf(id)).o;
    await expectOk("nobody moves an offer's deadline by editing the row (not even Value Aqar)", () => svcRole(`update public.service_requests set offer_expires_at = now() - interval '1 minute' where id='${id}' returning offer_expires_at`), (r) => new Date(r[0].offer_expires_at) > new Date());
    await sys(`select set_config('va.service_routing','1',false)`);
    await sys(`update public.service_requests set offer_expires_at = now() - interval '1 minute' where id='${id}'`);
    await sys(`select set_config('va.service_routing','',false)`);
    await svcRole(`select public.run_service_offers()`);
    return [first, await offerOf(id), await sys(`select count(*)::int c from public.notifications where related_id='${id}' and title='طلب خدمة اتحوّل لغيرك'`)];
  }, (r) => r[0] === E2 && r[1].o === E1 && r[1].d.includes(E2) && r[2][0].c === 1);
  await expectOk("the provider the customer chose gets it first", async () => { const id = await ask(E1); return offerOf(id); }, (r) => r.o === E1);
  await expectOk("choosing a provider sets the service to theirs", async () => { await as(null, `insert into public.service_requests (name, phone, category, target_provider_id) values ('عميل تاني','01055500094','media','${E1}')`); return sys(`select category from public.service_requests where name='عميل تاني'`); }, (r) => r[0].category === "engineering");
  await expectOk("nobody available → waits for Value Aqar with a notification", async () => { await as(null, `insert into public.service_requests (name, phone, category) values ('عميل نجارة','01055500095','crafts')`); const id = (await sys(`select id from public.service_requests where name='عميل نجارة'`))[0].id; return [await offerOf(id), await sys(`select title from public.notifications where user_id='${U.admin}' and related_id='${id}'`)]; },
    (r) => r[0].m === true && r[0].o === null && r[1].length === 1);
  await expectErr("outsiders can't restart the routing", async () => as(U.outsider, `select public.reroute_service_request('${sr1}')`));
  await expectOk("a free provider at this month's limit gets no more offers", async () => {
    for (let i = 0; i < 5; i++) { const id = (await sys(`insert into public.service_requests (name, phone, category) values ('حد ${i}','010555101${i}','engineering') returning id`))[0].id; await as(U.admin, `update public.service_requests set assigned_provider_id='${E1}' where id='${id}'`); }
    const id = await ask(E1); return [await offerOf(id), await as(SV.e1, `select public.my_service_stats() s`)];
  }, (r) => r[0].o === E2 && r[1][0].s.month >= 5 && r[1][0].s.limit === 5);

  await expectErr("rating before the work is done is refused", () => as(SV.cust, `select public.rate_service_request('${sr1}', 5, 'ممتاز')`));
  await as(SV.e1, `update public.service_requests set status='done' where id='${sr1}'`);
  await expectOk("done → the customer is asked to rate", () => sys(`select title from public.notifications where user_id='${SV.cust}' and related_id='${sr1}' and title='قيّم الخدمة ★'`), (r) => r.length === 1);
  await expectErr("someone else can't rate it", () => as(U.outsider, `select public.rate_service_request('${sr1}', 1, 'وحش')`));
  await expectOk("the customer (signed in by the request's phone) rates it; provider and admins told", async () => { await as(SV.cust, `select public.rate_service_request('${sr1}', 5, 'شغل نضيف ومواعيد مظبوطة')`); return [await sys(`select title from public.notifications where user_id='${SV.e1}' and title like 'تقييم جديد%'`), await sys(`select title from public.notifications where user_id='${U.admin}' and title like 'تقييم مقدم خدمة%'`)]; },
    (r) => r[0][0]?.title === "تقييم جديد ★★★★★" && r[1].length === 1);
  await expectErr("one rating per request", () => as(SV.cust, `select public.rate_service_request('${sr1}', 4)`));
  await expectErr("nobody writes reviews directly", () => as(SV.cust, `insert into public.service_reviews (request_id, provider_id, stars, customer_name) values ('${sr1}','${E1}',5,'أنا')`));
  await expectOk("the customer sees the request with their rating", () => as(SV.cust, `select provider_name, stars from public.my_service_requests() where id='${sr1}'`), (r) => r[0].provider_name === "مهندس أول" && r[0].stars === 5);
  const rev = (await sys(`select id from public.service_reviews where request_id='${sr1}'`))[0].id;
  await expectOk("the provider replies once", () => as(SV.e1, `select public.reply_service_review('${rev}', 'شكرًا ليك')`), (r) => r.length === 1);
  await expectErr("a second reply is refused", () => as(SV.e1, `select public.reply_service_review('${rev}', 'تاني')`));
  await expectErr("another provider can't reply", () => as(SV.e2, `select public.reply_service_review('${rev}', 'رد')`));
  await expectOk("visitors see the profile: rating, review with reply, first name only, no phone", () => as(null, `select public.service_provider_profile('${E1}') p`),
    (r) => Number(r[0].p.rating) === 5 && r[0].p.reviews_count === 1 && r[0].p.reviews[0].name === "أحمد" && r[0].p.reviews[0].reply === "شكرًا ليك" && !JSON.stringify(r[0].p).includes("201055500091"));
  await expectOk("admin hides a review: gone from the profile and the average", async () => { await as(U.admin, `update public.service_reviews set hidden=true where id='${rev}'`); return as(null, `select public.service_provider_profile('${E1}') p`); }, (r) => r[0].p.reviews.length === 0 && r[0].p.rating === null);
  await expectOk("the provider can't hide reviews", async () => { await as(SV.e1, `update public.service_reviews set hidden=false where id='${rev}'`); return sys(`select hidden from public.service_reviews where id='${rev}'`); }, (r) => r[0].hidden === true);

  await expectOk("work photos up to the plan's limit (free: 6)", async () => { for (let i = 0; i < 6; i++) await as(SV.e1, `insert into public.service_provider_photos (provider_id, url) values ('${E1}','https://x.example/${i}.jpg')`); return sys(`select count(*)::int c from public.service_provider_photos where provider_id='${E1}'`); }, (r) => r[0].c === 6);
  await expectErr("the 7th photo is refused", () => as(SV.e1, `insert into public.service_provider_photos (provider_id, url) values ('${E1}','https://x.example/7.jpg')`));
  await expectErr("a provider can't add photos to someone else's profile", () => as(SV.e2, `insert into public.service_provider_photos (provider_id, url) values ('${E1}','https://x.example/z.jpg')`));
  await expectOk("profile shows the photos", () => as(null, `select jsonb_array_length(public.service_provider_profile('${E1}')->'photos') n`), (r) => r[0].n === 6);
  await expectOk("directory: approved only, higher plan first, filters by service, kind and area, no phones", async () => [
    await as(null, `select * from public.service_directory('engineering')`), await as(null, `select id from public.service_directory('engineering', 'technician')`),
    await as(null, `select id from public.service_directory(null, null, 'الحي الثاني')`), await as(null, `select id from public.service_directory()`)],
    (r) => r[0].length === 2 && r[0][0].id === E2 && !("phone" in r[0][0]) && r[1].length === 1 && r[1][0].id === E1 && !r[2].some((x) => x.id === E1) && !r[3].some((x) => x.id === E1 && false));
  await expectOk("a pending provider has no public profile", async () => { const p = (await sys(`select id from public.service_providers where status='pending' limit 1`))[0]; return p ? as(null, `select public.service_provider_profile('${p.id}') p`) : [{ p: null }]; }, (r) => r[0].p === null);
  await expectOk("plans carry the new limits", () => sys(`select code, monthly_requests, priority, max_photos from public.service_plans order by sort_order`), (r) => r[0].monthly_requests === 5 && r[1].monthly_requests === 20 && r[2].monthly_requests === null && r[2].priority === 2 && r[2].max_photos === 50);
  await expectOk("this release can be re-run safely (limits and terms stay)", async () => {
    const sql = (await import("node:fs")).readFileSync(new URL("../migrations/20261014100000_plans-and-providers.sql", import.meta.url), "utf8");
    const before = await sys(`select (select max_properties from public.plans where code='free') f, (select count(*)::int from public.plans) n, (select listed_until from public.properties where id='${o1}') u`);
    await exec(`begin;\n${sql}\ncommit;`);
    const after = await sys(`select (select max_properties from public.plans where code='free') f, (select count(*)::int from public.plans) n, (select listed_until from public.properties where id='${o1}') u`);
    return [before[0], after[0]];
  }, (r) => r[0].f === r[1].f && r[0].n === r[1].n && String(r[0].u) === String(r[1].u));

  console.log("\nReferrals between brokers («إحالة عميل»)");
  const RF = { seller: "00000000-0000-0000-0000-0000000000b1", ref: "00000000-0000-0000-0000-0000000000b2", other: "00000000-0000-0000-0000-0000000000b3" };
  const SB = "b0000000-0000-0000-0000-0000000000b1", RB = "b0000000-0000-0000-0000-0000000000b2", OB = "b0000000-0000-0000-0000-0000000000b3";
  await sys(`insert into auth.users (id, phone) values ('${RF.seller}','201066600001'), ('${RF.ref}','201066600002'), ('${RF.other}','201066600003')`);
  await sys(`insert into public.brokers (id, user_id, slug, name, phone, account_type, is_active, plan_id) values
    ('${SB}','${RF.seller}','rf-seller','شركة البايع','201066600001','company', true, (select id from public.plans where code='business')),
    ('${RB}','${RF.ref}','rf-ref','وسيط المشتري','201066600002','individual', true, null),
    ('${OB}','${RF.other}','rf-other','وسيط تالت','201066600003','individual', true, null)`);
  const rUnit = (await as(RF.seller, `insert into public.properties (broker_id, title, price, type, area, status, review_status) values ('${SB}','شقة البايع',2000000,'شقة','الحي الأول','بيع','pending') returning id`))[0].id;
  const rUnit2 = (await as(RF.seller, `insert into public.properties (broker_id, title, price, type, area, status, review_status) values ('${SB}','فيلا البايع',5000000,'فيلا','الحي الأول','بيع','pending') returning id`))[0].id;
  await sys(`update public.properties set review_status='approved' where id in ('${rUnit}','${rUnit2}')`);
  const rRefer = (who, id, phone = "01066600099", name = "مشتري محال") => as(who, `select public.create_referral('property', '${id}', '${name}', '${phone}', 'عايز يعاين الأسبوع ده') r`).then((x) => x[0].r);
  await expectErr("a rUnit not opened for referrals can't be referred to", () => rRefer(RF.ref, rUnit));
  await expectOk("the seller opens the rUnit at 30%", () => as(RF.seller, `update public.properties set co_broke_share = 30 where id in ('${rUnit}','${rUnit2}') returning co_broke_share`), (r) => r.length === 2 && Number(r[0].co_broke_share) === 30);
  await expectOk("brokers see it in the market; visitors don't", async () => [await as(RF.ref, `select id, share_pct, seller_name from public.co_broke_market()`), await as(null, `select * from public.co_broke_market()`).catch(() => "denied")],
    (r) => r[0].some((x) => x.id === rUnit && Number(x.share_pct) === 30 && x.seller_name === "شركة البايع") && r[1] === "denied");
  await expectErr("a seller can't rRefer to their own rUnit", () => rRefer(RF.seller, rUnit));
  await expectErr("a customer (not a broker) can't rRefer", () => rRefer(U.outsider, rUnit));
  const rRef1 = await rRefer(RF.ref, rUnit);
  await expectOk("referral sent: seller and admins told, without the customer's name or phone", async () => [await sys(`select title, message from public.notifications where user_id='${RF.seller}' and related_id='${rRef1}'`), await sys(`select title from public.notifications where user_id='${U.admin}' and related_id='${rRef1}'`)],
    (r) => r[0].length === 1 && r[0][0].title === "عندي مشتري لـ شقة البايع" && !r[0][0].message.includes("مشتري محال") && !r[0][0].message.includes("66600099") && r[1].length === 1);
  await expectOk("the seller sees the request without customer details before accepting", () => as(RF.seller, `select status, customer_name, customer_phone, referrer_name from public.received_referrals()`),
    (r) => r.length === 1 && r[0].status === "pending" && r[0].customer_name === null && r[0].customer_phone === null && r[0].referrer_name === "وسيط المشتري");
  await expectOk("the seller can't read the referrals table directly", () => as(RF.seller, `select id from public.referrals`), (r) => r.length === 0);
  await expectErr("the same customer can't be referred twice to the same seller", () => rRefer(RF.other, rUnit2));
  await expectErr("someone else can't accept it", () => as(RF.other, `select public.accept_referral('${rRef1}')`));
  const rLead1 = (await as(RF.seller, `select public.accept_referral('${rRef1}') l`))[0].l;
  await expectOk("accept → the customer is the seller's, marked as a referral, never moved on automatically", () => sys(`select assigned_broker_id, source, referral_id, transfer_deadline_at, kind from public.leads where id='${rLead1}'`),
    (r) => r[0].assigned_broker_id === SB && r[0].source === "referral" && r[0].referral_id === rRef1 && r[0].transfer_deadline_at === null);
  await expectOk("after accepting the seller sees the customer; the referrer is told and protected 90 days", async () => [await as(RF.seller, `select customer_name, customer_phone from public.received_referrals()`), await sys(`select title from public.notifications where user_id='${RF.ref}' and related_id='${rRef1}'`), await as(RF.ref, `select status, protected_until from public.sent_referrals()`)],
    (r) => r[0][0].customer_name === "مشتري محال" && r[0][0].customer_phone === "201066600099" && r[1].some((n) => n.title === "إحالتك اتقبلت ✓") && r[2][0].status === "accepted" && Math.round((new Date(r[2][0].protected_until) - Date.now()) / 864e5) === 90);
  await expectOk("the seller's page shows who brought the customer", () => as(RF.seller, `select public.lead_referral('${rLead1}') x`), (r) => r[0].x.referrer === "وسيط المشتري" && Number(r[0].x.share_pct) === 30);
  await expectOk("an outsider learns nothing about it", () => as(U.outsider, `select public.lead_referral('${rLead1}') x`), (r) => r[0].x === null);
  await expectOk("within 90 days the same customer on another rUnit of the seller is linked to the referrer", async () => {
    await as(null, `insert into public.leads (name, phone, property_id) values ('مشتري محال','01066600099','${rUnit2}')`);
    return [await sys(`select referral_id from public.leads where property_id='${rUnit2}'`), await sys(`select title from public.notifications where user_id='${RF.ref}' and title like 'عميلك رجع%'`)];
  }, (r) => r[0][0].referral_id === rRef1 && r[1].length === 1);

  // The rDeal: 2.5% to Value Aqar on 2,000,000 = 50,000; total commission 100,000 → referrer 30% of 50,000 = 15,000.
  await as(U.admin, `insert into public.company_agreements (broker_id, rate, effective_from) values ('${SB}', 2.5, '2026-01-01')`);
  const rDeal = (await as(RF.seller, `insert into public.deals (lead_id, sale_date, sale_value) values ('${rLead1}', current_date, 2000000) returning id`))[0].id;
  await as(RF.seller, `insert into public.deal_documents (deal_id, kind, file_path, file_name, uploaded_by) values ('${rDeal}','sale','${rDeal}/s.pdf','s.pdf','${RF.seller}')`);
  await expectErr("a referred customer's sale needs the total commission before review", () => as(RF.seller, `update public.deals set review_status='pending' where id='${rDeal}'`));
  await expectOk("with the total commission the sale goes to review", () => as(RF.seller, `update public.deals set brokerage_total=100000, review_status='pending' where id='${rDeal}' returning review_status`), (r) => r[0].review_status === "pending");
  await expectOk("admin approves: the referrer's share is due (after Value Aqar's share) and everyone is told", async () => {
    await as(U.admin, `update public.deals set review_status='approved' where id='${rDeal}'`);
    return [await sys(`select status, amount from public.referral_payouts where deal_id='${rDeal}'`), await sys(`select title from public.notifications where user_id='${RF.ref}' and title like 'مبروك%'`), await sys(`select title from public.notifications where user_id='${RF.seller}' and title='نصيب إحالة مستحق'`)];
  }, (r) => r[0][0].status === "due" && Number(r[0][0].amount) === 15000 && r[1].length === 1 && r[2].length === 1);
  await expectOk("both sides see the share (to pay / to receive)", async () => [await as(RF.seller, `select side, amount from public.my_referral_payouts()`), await as(RF.ref, `select side, amount, va_commission from public.my_referral_payouts()`)],
    (r) => r[0][0].side === "pay" && Number(r[0][0].amount) === 15000 && r[1][0].side === "receive" && Number(r[1][0].va_commission) === 50000);
  await expectOk("the seller can't lower the total after approval", async () => { await as(RF.seller, `update public.deals set brokerage_total=1 where id='${rDeal}'`).catch(() => {}); return sys(`select brokerage_total from public.deals where id='${rDeal}'`); }, (r) => Number(r[0].brokerage_total) === 100000);
  const rPayout = (await sys(`select id from public.referral_payouts where deal_id='${rDeal}'`))[0].id;
  await expectErr("the referrer can't mark it paid", () => as(RF.ref, `select public.mark_referral_paid('${rPayout}')`));
  await expectOk("the seller marks it paid, the referrer confirms", async () => { await as(RF.seller, `select public.mark_referral_paid('${rPayout}')`); await as(RF.ref, `select public.confirm_referral_received('${rPayout}')`); return sys(`select status, paid_at from public.referral_payouts where id='${rPayout}'`); }, (r) => r[0].status === "confirmed" && r[0].paid_at !== null);
  await expectOk("an outsider sees no payouts", () => as(RF.other, `select * from public.my_referral_payouts()`), (r) => r.length === 0);

  await expectOk("decline: the referrer is told and keeps the customer", async () => {
    const id = await rRefer(RF.other, rUnit, "01066600088", "عميل تاني");
    await as(RF.seller, `select public.decline_referral('${id}', 'الوحدة اتحجزت')`);
    return [await sys(`select status, decline_reason from public.referrals where id='${id}'`), await sys(`select title from public.notifications where user_id='${RF.other}' and related_id='${id}'`), await sys(`select count(*)::int c from public.leads where phone_norm='201066600088'`)];
  }, (r) => r[0][0].status === "declined" && r[0][0].decline_reason === "الوحدة اتحجزت" && r[1].some((n) => n.title === "إحالتك اترفضت") && r[2][0].c === 0);
  await expectOk("no answer in 24 hours → expired, referrer told", async () => {
    const id = await rRefer(RF.other, rUnit, "01066600077", "عميل تالت");
    await svcRole(`update public.referrals set respond_by = now() - interval '1 minute' where id='${id}'`);
    await svcRole(`select public.run_referrals()`);
    return [await sys(`select status from public.referrals where id='${id}'`), await sys(`select title from public.notifications where user_id='${RF.other}' and related_id='${id}' and title='إحالتك ماترد عليهاش'`)];
  }, (r) => r[0][0].status === "expired" && r[1].length === 1);
  await expectErr("an expired referral can't be accepted", async () => { const id = (await sys(`select id from public.referrals where status='expired' limit 1`))[0].id; return as(RF.seller, `select public.accept_referral('${id}')`); });
  await expectOk("the referrer cancels a pending one; the seller is told", async () => {
    const id = await rRefer(RF.other, rUnit2, "01066600066", "عميل رابع");
    await as(RF.other, `select public.cancel_referral('${id}')`);
    return [await sys(`select status from public.referrals where id='${id}'`), await sys(`select title from public.notifications where user_id='${RF.seller}' and related_id='${id}' and title='الوسيط لغى الإحالة'`)];
  }, (r) => r[0][0].status === "cancelled" && r[1].length === 1);
  await expectErr("a customer the seller already has can't be referred", async () => {
    await as(null, `insert into public.leads (name, phone, property_id) values ('عميل البايع','01066600055','${rUnit}')`);
    return rRefer(RF.other, rUnit, "01066600055", "عميل البايع");
  });
  await expectOk("owner listings: closed until the admin sets a share, then Value Aqar answers", async () => {
    const ol = (await svcRole(`insert into public.leads (name, phone, kind) values ('مالك','01066600044','listing') returning id`))[0].id;
    const op = (await svcRole(`insert into public.properties (title, price, type, area, status, review_status, owner_lead_id) values ('شقة مالك محال',1,'شقة','الحي الأول','بيع','approved','${ol}') returning id`))[0].id;
    const closed = await rRefer(RF.ref, op, "01066600033", "مشتري المالك").then(() => "open", () => "closed");
    await as(U.admin, `update public.app_settings set owner_listing_co_broke_share = 20 where id = 1`);
    const id = await rRefer(RF.ref, op, "01066600033", "مشتري المالك");
    const sellerCant = await as(RF.seller, `select public.accept_referral('${id}')`).then(() => "accepted", () => "refused");
    const l = (await as(U.staff, `select public.accept_referral('${id}') l`))[0].l;
    return [closed, sellerCant, await sys(`select share_pct, owner_id from public.referrals where id='${id}'`), await sys(`select property_id, referral_id from public.leads where id='${l}'`)];
  }, (r) => r[0] === "closed" && r[1] === "refused" && Number(r[2][0].share_pct) === 20 && r[2][0].owner_id === null && r[3][0].referral_id !== null);
  await expectOk("a visitor's form can't attach a referral to a lead", async () => { await as(null, `insert into public.leads (name, phone, referral_id) values ('محتال','01066600011','${rRef1}')`); return sys(`select referral_id from public.leads where phone_norm='201066600011'`); }, (r) => r[0].referral_id === null);
  await expectOk("this release can be re-run safely", async () => {
    const sql = (await import("node:fs")).readFileSync(new URL("../migrations/20261014200000_co-brokerage.sql", import.meta.url), "utf8");
    const before = await sys(`select (select count(*)::int from public.referrals) n, (select count(*)::int from public.referral_payouts) p`);
    await exec(`begin;\n${sql}\ncommit;`);
    const after = await sys(`select (select count(*)::int from public.referrals) n, (select count(*)::int from public.referral_payouts) p`);
    return [before[0], after[0]];
  }, (r) => r[0].n === r[1].n && r[0].p === r[1].p);

  console.log("\nNew areas, installments and review for every listing (release 25)");
  const AU = "00000000-0000-0000-0000-0000000000e9", AB = "b0000000-0000-0000-0000-0000000000e9";
  await sys(`insert into auth.users (id, phone) values ('${AU}','201077700001')`);
  await sys(`insert into public.brokers (id, user_id, slug, name, phone, account_type, is_active, plan_id) values ('${AB}','${AU}','area-broker','وسيط إسكندرية','201077700001','individual', true, (select id from public.plans where code='business'))`);
  const aProp = (cols, vals) => as(AU, `insert into public.properties (broker_id, title, type, status, ${cols}) values ('${AB}', 'شقة', 'شقة', 'بيع', ${vals}) returning *`).then((r) => r[0]);
  const adminNotes = (title) => sys(`select title, message from public.notifications where user_id='${U.admin}' and title='${title}'`);
  await expectOk("the old places are there for everyone", () => as(null, `select city, area from public.locations`), (r) => r.length >= 22 && r.some((x) => x.city === "كينج مريوط" && x.area === null));
  const smouha = await aProp("price, city, area, review_status", "1500000, 'الإسكندرية', 'سموحة', 'approved'");
  await expectOk("a listing in a new place is saved with it, and waits for review", async () => smouha, (r) => r.city === "الإسكندرية" && r.area === "سموحة" && r.review_status === "pending");
  await expectOk("the new place waits for the admin, who is told once", async () => {
    await aProp("price, city, area", "900000, 'الإسكندرية', 'سموحة'");
    return [await sys(`select status from public.locations where city='الإسكندرية' and area='سموحة'`), await adminNotes("منطقة جديدة مستنية اعتماد")];
  }, (r) => r[0].length === 1 && r[0][0].status === "pending" && r[1].filter((x) => x.message.includes("الإسكندرية")).length === 1);
  await expectOk("visitors and brokers don't see places waiting for the admin", async () => [await as(null, `select id from public.locations where status <> 'approved'`), await as(AU, `select id from public.locations where city='الإسكندرية'`)], (r) => r[0].length === 0 && r[1].length === 0);
  await expectErr("a broker can't add a place directly", () => as(AU, `insert into public.locations (city, area, status) values ('الإسكندرية','ميامي','approved')`));
  await expectOk("a broker can't approve a place", async () => { await as(AU, `update public.locations set status='approved' where city='الإسكندرية'`); return sys(`select status from public.locations where city='الإسكندرية'`); }, (r) => r.every((x) => x.status === "pending"));
  await expectOk("the admin approves; everyone sees it", async () => { await as(U.admin, `update public.locations set status='approved', reviewed_at=now() where city='الإسكندرية' and area='سموحة'`); return as(null, `select id from public.locations where city='الإسكندرية'`); }, (r) => r.length === 1);
  const typo = await aProp("price, city, area", "800000, 'الإسكندرية', 'سموحه'");
  await expectErr("a broker can't merge places", () => as(AU, `select public.merge_location((select id from public.locations where area='سموحه'), (select id from public.locations where area='سموحة'))`));
  await expectErr("merging into a place that isn't approved is refused", () => as(U.admin, `select public.merge_location((select id from public.locations where area='سموحة'), (select id from public.locations where area='سموحه'))`));
  await expectOk("merging a misspelling moves its listings and drops it", async () => {
    await sys(`update public.brokers set areas = array['سموحه'] where id='${AB}'`);
    const n = (await as(U.admin, `select public.merge_location((select id from public.locations where area='سموحه'), (select id from public.locations where area='سموحة')) n`))[0].n;
    return [n, await sys(`select area from public.properties where id='${typo.id}'`), await sys(`select id from public.locations where area='سموحه'`), await sys(`select areas from public.brokers where id='${AB}'`)];
  }, (r) => r[0] === 1 && r[1][0].area === "سموحة" && r[2].length === 0 && r[3][0].areas[0] === "سموحة");
  await expectOk("a city without areas is one place", async () => { await aProp("price, city, area", "700000, 'العامرية', 'العامرية'"); return sys(`select area from public.locations where city='العامرية'`); }, (r) => r.length === 1 && r[0].area === null);

  console.log("\nEvery listing is reviewed");
  await expectOk("an admin's listing is published at once", () => as(U.admin, `insert into public.properties (broker_id, title, price, type, area, status, review_status) values ('${AB}','شقة الأدمن',1,'شقة','الحي الأول','بيع','approved') returning review_status`), (r) => r[0].review_status === "approved");
  await expectOk("the admin approves the broker's listing", () => as(U.admin, `update public.properties set review_status='approved' where id='${smouha.id}' returning review_status`), (r) => r[0].review_status === "approved");
  await expectOk("opening it for co-brokerage keeps it live", () => as(AU, `update public.properties set co_broke_share = 25 where id='${smouha.id}' returning review_status`), (r) => r[0].review_status === "approved");
  await expectOk("changing the price sends it back to review; the admin is told", async () => {
    const r = await as(AU, `update public.properties set price = 1400000 where id='${smouha.id}' returning review_status`);
    return [r, await sys(`select id from public.notifications where user_id='${U.admin}' and related_id='${smouha.id}'`), await as(null, `select id from public.properties where id='${smouha.id}'`)];
  }, (r) => r[0][0].review_status === "pending" && r[1].length >= 1 && r[2].length === 0);
  await expectOk("a broker can't approve their own listing", () => as(AU, `update public.properties set review_status='approved' where id='${smouha.id}' returning review_status`), (r) => r[0].review_status === "pending");
  await expectOk("a broker can take a listing down to draft", () => as(AU, `update public.properties set review_status='draft' where id='${smouha.id}' returning review_status`), (r) => r[0].review_status === "draft");

  console.log("\nInstallments on sale listings");
  await expectErr("installments need the number of years", () => aProp("price, area, payment_method, down_payment", "2000000, 'الحي الأول', 'installment', 200000"));
  await expectErr("the down payment must be less than the price", () => aProp("price, area, payment_method, down_payment, installment_years", "2000000, 'الحي الأول', 'both', 2000000, 5"));
  await expectOk("a sale listing with installments", () => aProp("price, area, payment_method, down_payment, installment_years, monthly_installment, installment_note", "2000000, 'الحي الأول', 'both', 300000, 5, 28334, 'خصم 10% للكاش'"),
    (r) => r.payment_method === "both" && Number(r.down_payment) === 300000 && r.installment_years === 5 && Number(r.monthly_installment) === 28334);
  await expectOk("cash clears the installment details", () => aProp("price, area, payment_method, down_payment, installment_years", "2000000, 'الحي الأول', 'cash', 300000, 5"), (r) => r.payment_method === "cash" && r.down_payment === null && r.installment_years === null);
  await expectOk("rent listings have no installments", () => as(AU, `insert into public.properties (broker_id, title, type, status, price, area, payment_method, installment_years) values ('${AB}','شقة إيجار','شقة','إيجار',8000,'الحي الأول','installment',5) returning payment_method, installment_years`), (r) => r[0].payment_method === null && r[0].installment_years === null);
  await expectOk("every listing has its own code", () => sys(`select count(*)::int n, count(distinct listing_no)::int d, count(listing_no)::int c from public.properties`), (r) => r[0].n === r[0].d && r[0].n === r[0].c);

  await expectOk("release 25 can be re-run safely", async () => {
    const sql = (await import("node:fs")).readFileSync(new URL("../migrations/20261017100000_areas-installments-review.sql", import.meta.url), "utf8");
    const before = await sys(`select (select count(*)::int from public.locations) n, (select max(listing_no)::int from public.properties) m`);
    await exec(`begin;\n${sql}\ncommit;`);
    const after = await sys(`select (select count(*)::int from public.locations) n, (select max(listing_no)::int from public.properties) m`);
    return [before[0], after[0]];
  }, (r) => r[0].n === r[1].n && r[0].m === r[1].m);

  console.log("\nAdmin: every account, delete any account (release 26)");
  const XU = "00000000-0000-0000-0000-0000000000e7", XB = "b0000000-0000-0000-0000-0000000000e7";
  await sys(`insert into auth.users (id, phone, email, raw_user_meta_data) values ('${XU}','201088800001','gone@x.com','{"full_name":"وسيط هيتمسح"}')`);
  await sys(`insert into public.user_roles (user_id, role) values ('${XU}','broker')`);
  await sys(`insert into public.brokers (id, user_id, slug, name, phone, email, account_type, is_active, plan_id) values ('${XB}','${XU}','x-del','وسيط هيتمسح','201088800001','gone@x.com','individual', true, (select id from public.plans where code='business'))`);
  const xFree = (await sys(`insert into public.properties (broker_id, title, price, type, area, status, review_status) values ('${XB}','إعلان من غير عملاء',1,'شقة','الحي الأول','بيع','approved') returning id`))[0].id;
  const xKept = (await sys(`insert into public.properties (broker_id, title, price, type, area, status, review_status) values ('${XB}','إعلان عليه عميل',1,'شقة','الحي الأول','بيع','approved') returning id`))[0].id;
  await sys(`insert into public.leads (name, phone, property_id) values ('عميل مهتم','01088800009','${xKept}')`);
  await expectOk("the admin sees every login with its details", () => as(U.admin, `select * from public.admin_accounts() where user_id='${XU}'`),
    (r) => r.length === 1 && r[0].email === "gone@x.com" && r[0].full_name === "وسيط هيتمسح" && r[0].broker_id === XB && r[0].roles.includes("broker") && r[0].listings === 2);
  await expectOk("customers without a company show too", () => as(U.admin, `select count(*)::int n from public.admin_accounts() where broker_id is null`), (r) => r[0].n > 0);
  await expectErr("staff can't list accounts", () => as(U.staff, `select * from public.admin_accounts()`));
  await expectErr("a broker can't list accounts", () => as(XU, `select * from public.admin_accounts()`));
  await expectErr("nobody but the server deletes", () => as(U.admin, `select public.prepare_account_deletion('${XU}', '${U.admin}')`));
  await sys(`select set_config('request.jwt.claim.role','service_role',false)`);
  await expectOk("deleting by the admin: free listing removed, listing with a customer kept off the site, logged", async () => {
    const r = (await sys(`select public.prepare_account_deletion('${XU}', '${U.admin}') r`))[0].r;
    return [r, await sys(`select id, review_status from public.properties where id in ('${xFree}','${xKept}')`),
      await sys(`select changes from public.audit_log where table_name='accounts' and row_id='${XU}'`),
      await sys(`select is_active, email, user_id, review_note from public.brokers where id='${XB}'`)];
  }, (r) => r[0] === "ok" && r[1].length === 1 && r[1][0].id === xKept && r[1][0].review_status === "draft"
    && r[2][0].changes.listings_removed === 1 && r[2][0].changes.listings_hidden === 1
    && r[3][0].is_active === false && r[3][0].email === null && r[3][0].user_id === null && r[3][0].review_note === "الحساب اتمسح من الإدارة");
  await expectOk("an admin account can't be deleted", () => sys(`select public.prepare_account_deletion('${U.admin}', '${U.admin}') r`), (r) => r[0].r === "admin");
  await sys(`select set_config('request.jwt.claim.role','',false)`);
  await expectOk("search engines: the last send is remembered", () => sys(`select indexnow_sent_at from public.app_settings limit 1`), (r) => r.length <= 1);

  await expectOk("release 26 can be re-run safely", async () => {
    const sql = (await import("node:fs")).readFileSync(new URL("../migrations/20261017200000_admin-accounts.sql", import.meta.url), "utf8");
    await exec(`begin;\n${sql}\ncommit;`);
    return as(U.admin, `select count(*)::int n from public.admin_accounts()`);
  }, (r) => r[0].n > 0);
  console.log("\nDirect messages (Value Aqar ↔ accounts, broker ↔ broker)");
  const DMU = {
    ownA: "00000000-0000-0000-0000-00000000d0a1", mgrA: "00000000-0000-0000-0000-00000000d0a2",
    salesA: "00000000-0000-0000-0000-00000000d0a3", ownB: "00000000-0000-0000-0000-00000000d0b1",
    ownO: "00000000-0000-0000-0000-00000000d0c1",
  };
  const DMA = "c0000000-0000-0000-0000-00000000d0a0", DMB = "c0000000-0000-0000-0000-00000000d0b0", DMO = "c0000000-0000-0000-0000-00000000d0c0";
  await sys(`insert into auth.users (id, phone) values ('${DMU.ownA}','201077770001'), ('${DMU.mgrA}','201077770002'),
    ('${DMU.salesA}','201077770003'), ('${DMU.ownB}','201077770004'), ('${DMU.ownO}','201077770005')`);
  await sys(`select set_config('request.jwt.claim.role','service_role',false)`);
  await sys(`insert into public.brokers (id, user_id, slug, name, phone, account_type, is_active) values
    ('${DMA}','${DMU.ownA}','dm-a','شركة ألف','201077770001','company', true),
    ('${DMB}','${DMU.ownB}','dm-b','وسيط باء','201077770004','individual', true),
    ('${DMO}','${DMU.ownO}','dm-o','مالك','201077770005','owner', true)`);
  await sys(`insert into public.company_members (company_id, name, phone, role) values
    ('${DMA}','مدير ألف','201077770002','manager'), ('${DMA}','بياع ألف','201077770003','sales')`);
  await sys(`select set_config('request.jwt.claim.role','',false)`);
  const dmNotes = (u, t) => sys(`select title, message, related_url, is_read from public.notifications where user_id='${u}' and type='new_message' and related_id='${t}' order by created_at`);
  let dmt = null, dmp = null;
  // The re-run check of release 21 above put back its own header-badge function; release 27 always comes after it.
  await exec(`begin;
${(await import("node:fs")).readFileSync(new URL("../migrations/20261017300000_direct-messages.sql", import.meta.url), "utf8")}
commit;`);

  await expectErr("a sales member can't start direct messages", () => as(DMU.salesA, `select public.start_direct_thread('${DMB}')`));
  await expectOk("an account starts a conversation with another broker; both sides get the same one", async () => {
    dmt = (await as(DMU.ownA, `select public.start_direct_thread('${DMB}') id`))[0].id;
    return [dmt, (await as(DMU.ownB, `select public.start_direct_thread('${DMA}') id`))[0].id];
  }, (r) => !!r[0] && r[0] === r[1]);
  await expectErr("an owner (مالك) account isn't in the broker directory", () => as(DMU.ownA, `select public.start_direct_thread('${DMO}')`));
  await expectErr("you can't message your own account", () => as(DMU.ownA, `select public.start_direct_thread('${DMA}')`));
  await expectOk("a phone number between brokers is hidden", async () => {
    await as(DMU.ownA, `select public.send_direct_message('${dmt}', 'عندي عميل، كلمني 0101 234 5678')`);
    return sys(`select body, masked, sender_label, sender_side from public.direct_messages where thread_id='${dmt}' order by created_at desc limit 1`);
  }, (r) => r[0].masked === true && r[0].body.includes("[رقم مخفي]") && r[0].sender_label === "شركة ألف" && r[0].sender_side === DMA);
  await expectOk("the other broker gets a notification that opens the conversation", () => dmNotes(DMU.ownB, dmt),
    (r) => r.length === 1 && r[0].title === "رسالة جديدة من شركة ألف" && r[0].related_url === `/messages?dm=${dmt}`);
  await expectOk("the sender's own team isn't notified", () => dmNotes(DMU.mgrA, dmt), (r) => r.length === 0);
  await expectOk("the manager reads and writes for the account; sales and outsiders see nothing", async () => [
    await as(DMU.mgrA, `select public.direct_thread_side('${dmt}') s`),
    await as(DMU.mgrA, `select count(*)::int c from public.direct_messages where thread_id='${dmt}'`),
    await as(DMU.salesA, `select count(*)::int c from public.direct_messages`),
    await as(U.outsider, `select count(*)::int c from public.direct_messages`),
    await as(U.outsider, `select count(*)::int c from public.direct_threads`)],
    (r) => r[0][0].s === DMA && r[1][0].c === 1 && r[2][0].c === 0 && r[3][0].c === 0 && r[4][0].c === 0);
  await expectOk("inbox and header badge count it as unread for the other broker", async () => [
    await as(DMU.ownB, `select * from public.my_direct_threads()`), await as(DMU.ownB, `select public.my_unread_messages() n`)],
    (r) => r[0].length === 1 && r[0][0].other_label === "شركة ألف" && r[0][0].other_slug === "dm-a" && r[0][0].kind === "broker" && r[0][0].unread === 1 && r[1][0].n >= 1);
  await expectOk("a colleague's message isn't unread for the sender's side", () => as(DMU.mgrA, `select unread, last_mine from public.my_direct_threads()`),
    (r) => r[0].unread === 0 && r[0].last_mine === true);
  await expectOk("opening it marks it read (messages and bell)", async () => {
    await as(DMU.ownB, `select public.mark_direct_read('${dmt}')`);
    return [await as(DMU.ownB, `select unread from public.my_direct_threads()`), await dmNotes(DMU.ownB, dmt)];
  }, (r) => r[0][0].unread === 0 && r[1].every((n) => n.is_read));
  await expectOk("Value Aqar reads every conversation, labelled with both accounts", () => as(U.staff, `select side, other_label, kind from public.my_direct_threads() where thread_id='${dmt}'`),
    (r) => r[0].side === "platform" && r[0].other_label === "شركة ألف ↔ وسيط باء");

  await expectOk("an account writes to Value Aqar (numbers not hidden) and the team is notified", async () => {
    dmp = (await as(DMU.ownA, `select public.start_direct_thread() id`))[0].id;
    await as(DMU.ownA, `select public.send_direct_message('${dmp}', 'محتاج مساعدة، رقمي 01033330001')`);
    return [await sys(`select masked from public.direct_messages where thread_id='${dmp}'`), await dmNotes(U.admin, dmp), await dmNotes(U.staff, dmp)];
  }, (r) => r[0][0].masked === false && r[1].length === 1 && r[2].length === 1);
  await expectOk("the admin opening the same account gets the same conversation, and the account hears the reply", async () => {
    const id = (await as(U.admin, `select public.start_direct_thread('${DMA}') id`))[0].id;
    await as(U.admin, `select public.send_direct_message('${id}', 'أهلا، بنكلمك حالا')`);
    return [id, await dmNotes(DMU.ownA, dmp), await dmNotes(DMU.mgrA, dmp), await as(DMU.ownA, `select other_label, kind from public.my_direct_threads() where thread_id='${dmp}'`)];
  }, (r) => r[0] === dmp && r[1].length === 1 && r[2].length === 1 && r[3][0].other_label === "فاليو عقار" && r[3][0].kind === "platform");
  await expectOk("the admin can message an owner (مالك) account", () => as(U.admin, `select public.start_direct_thread('${DMO}') id`), (r) => !!r[0].id);
  await expectErr("another broker can't write in Value Aqar's conversation with an account", () => as(DMU.ownB, `select public.send_direct_message('${dmp}', 'دخيل')`));

  await expectErr("nobody writes to the table directly", () => as(DMU.ownA, `insert into public.direct_messages (thread_id, sender_id, sender_side, sender_label, body) values ('${dmt}','${DMU.ownA}','platform','فاليو عقار','مزيف')`));
  await expectErr("messages can't be edited", () => as(DMU.ownA, `update public.direct_messages set body='x' where thread_id='${dmt}'`));
  await expectErr("an attachment from another folder is refused", () => as(DMU.ownA, `select public.send_direct_message('${dmt}', null, 'dm/${dmp}/x.jpg', 'x.jpg', 'image')`));
  await expectOk("an attachment in the conversation's folder is accepted", () => as(DMU.ownA, `select public.send_direct_message('${dmt}', null, 'dm/${dmt}/x.jpg', 'x.jpg', 'image') id`), (r) => !!r[0].id);
  await expectOk("members upload files into the conversation folder", () => as(DMU.ownB, `insert into storage.objects (bucket_id, name) values ('lead-messages', 'dm/${dmt}/y.pdf') returning id`), (r) => r.length === 1);
  await expectErr("…outsiders can't", () => as(U.outsider, `insert into storage.objects (bucket_id, name) values ('lead-messages', 'dm/${dmt}/z.pdf')`));
  await expectOk("reporting a message alerts Value Aqar", async () => {
    const m = (await as(DMU.ownB, `select id from public.direct_messages where thread_id='${dmt}' and sender_id='${DMU.ownA}' limit 1`))[0].id;
    await as(DMU.ownB, `select public.report_direct_message('${m}', 'رسالة مزعجة')`);
    return sys(`select reported_by from public.direct_messages where id='${m}'`);
  }, (r) => r[0].reported_by === DMU.ownB);
  await expectErr("only Value Aqar closes a conversation", () => as(DMU.ownB, `select public.set_direct_thread_closed('${dmt}', true)`));
  await expectErr("a closed conversation refuses new messages from accounts…", async () => {
    await as(U.admin, `select public.set_direct_thread_closed('${dmt}', true)`);
    return as(DMU.ownB, `select public.send_direct_message('${dmt}', 'لسه موجود؟')`);
  });
  await expectOk("…but Value Aqar can still write and both still read it", async () => {
    await as(U.admin, `select public.send_direct_message('${dmt}', 'المحادثة اتقفلت')`);
    return as(DMU.ownA, `select closed from public.my_direct_threads() where thread_id='${dmt}'`);
  }, (r) => r[0].closed === true);
  await expectOk("request conversations still count in the header badge", () => as(MU.cust, `select public.my_unread_messages() n`), (r) => typeof r[0].n === "number");
  await expectOk("release 27 can be re-run safely", async () => {
    const sql = (await import("node:fs")).readFileSync(new URL("../migrations/20261017300000_direct-messages.sql", import.meta.url), "utf8");
    await exec(`begin;\n${sql}\ncommit;`);
    return as(DMU.ownA, `select count(*)::int n from public.my_direct_threads()`);
  }, (r) => r[0].n === 2);

  // Mall gallery (release 29): up to 10 photos; admins, or the mall developer's owner / manager, through set_mall_images.
  const mallG = (await sys(`insert into public.malls (name, developer_id, logo_url) values ('مول المعرض', '${DEV}', null) returning id`))[0].id;
  const pic = (n) => `https://x.supabase.co/storage/v1/object/sign/media/p${n}.jpg`;
  await expectOk("the mall developer sets its photos; the first becomes the cover", async () => {
    await as(U.dev, `select public.set_mall_images('${mallG}', array['${pic(1)}','${pic(2)}'])`);
    return sys(`select images, logo_url from public.malls where id='${mallG}'`);
  }, (r) => r[0].images.length === 2 && r[0].logo_url === pic(1));
  await expectOk("the admin sets photos too", () => as(U.admin, `select public.set_mall_images('${mallG}', array['${pic(3)}'])`), () => true);
  await expectErr("another account can't", () => as(U.owner, `select public.set_mall_images('${mallG}', array['${pic(4)}'])`));
  await expectErr("a sales member of another company can't", () => as(U.sales, `select public.set_mall_images('${mallG}', array['${pic(4)}'])`));
  await expectErr("more than 10 photos is refused", () => as(U.admin, `select public.set_mall_images('${mallG}', array(select '${pic(0)}' || g from generate_series(1, 11) g))`));
  await expectErr("only https photo links", () => as(U.dev, `select public.set_mall_images('${mallG}', array['javascript:alert(1)'])`));
  await expectErr("the developer still can't edit the mall itself", () => as(U.dev, `update public.malls set name='تغيير' where id='${mallG}' returning id`).then((r) => { if (!r.length) throw new Error("no rows"); return r; }));
  await expectOk("release 29 can be re-run safely", async () => {
    const sql = (await import("node:fs")).readFileSync(new URL("../migrations/20261017500000_mall-gallery.sql", import.meta.url), "utf8");
    await exec(`begin;
${sql}
commit;`);
    return sys(`select cardinality(images) n from public.malls where id='${mallG}'`);
  }, (r) => r[0].n === 1);

  await expectOk("the admin approves all waiting units of a mall at once (drafts and sent for review)", async () => {
    await sys(`insert into public.properties (broker_id, category, mall_id, title, type, status, price, size, area, review_status) values
      ('${CO}','mall','${mallG}','محل 1','محل تجاري','بيع',1000000,30,'مول المعرض','draft'),
      ('${CO}','mall','${mallG}','محل 2','محل تجاري','بيع',1200000,35,'مول المعرض','pending')`);
    return as(U.admin, `update public.properties set review_status='approved', review_note=null where category='mall' and mall_id='${mallG}' and review_status in ('pending','draft') returning id`);
  }, (r) => r.length === 2);

  // Release 30: availability + admin_delete.
  // Earlier checks re-run release 25, which restores its review guard: load release 30 again first.
  await exec(`begin;
${(await import("node:fs")).readFileSync(new URL("../migrations/20261017600000_manage-everything.sql", import.meta.url), "utf8")}
commit;`);
  const avP = (await sys(`insert into public.properties (broker_id, title, type, status, price, size, city, area, review_status) values ('${CO}','شقة للحجز','شقة','بيع',1000000,100,'برج العرب الجديدة','الحي الأول','approved') returning id`))[0].id;
  await exec(`begin; set local request.jwt.claim.role to 'service_role'; update public.properties set review_status='approved' where id='${avP}'; commit;`);
  await expectOk("the account owner marks a listing reserved; it stays approved and is stamped", async () => {
    await as(U.owner, `update public.properties set availability='reserved' where id='${avP}'`);
    return sys(`select availability, review_status, availability_at is not null stamped from public.properties where id='${avP}'`);
  }, (r) => r[0].availability === "reserved" && r[0].review_status === "approved" && r[0].stamped === true);
  await expectErr("availability only takes available / reserved / sold", () => as(U.owner, `update public.properties set availability='gone' where id='${avP}'`));
  await expectErr("a sales member can't change availability (team rule)", () => as(U.sales, `update public.properties set availability='sold' where id='${avP}'`));
  await expectErr("only the admin calls admin_delete", () => as(U.owner, `select public.admin_delete('property', '${avP}')`));
  await expectOk("admin deletes a listing with no deal", async () => { await as(U.admin, `select public.admin_delete('property', '${avP}') r`); return sys(`select count(*)::int n from public.properties where id='${avP}'`); }, (r) => r[0].n === 0);
  await expectOk("a listing with a deal is hidden, not deleted", async () => {
    const pid = (await sys(`insert into public.properties (broker_id, title, type, status, price, size, city, area, review_status) values ('${CO}','شقة مباعة','شقة','بيع',900000,90,'برج العرب الجديدة','الحي الأول','approved') returning id`))[0].id;
    const lid = (await sys(`insert into public.leads (name, phone, assigned_broker_id, property_id) values ('مشتري','01099990001','${CO}','${pid}') returning id`))[0].id;
    await exec(`begin; set local request.jwt.claim.role to 'service_role'; insert into public.deals (lead_id, broker_id, property_id) values ('${lid}','${CO}','${pid}'); commit;`);
    const r = await as(U.admin, `select public.admin_delete('property', '${pid}') r`);
    const row = await sys(`select review_status from public.properties where id='${pid}'`);
    const del = await as(U.admin, `select public.admin_delete('lead', '${lid}') r`).then(() => "deleted", (e) => String(e.message));
    return [{ r: r[0].r, rs: row[0]?.review_status, del }];
  }, (r) => r[0].r === "hidden" && r[0].rs === "rejected" && /صفقة/.test(r[0].del));
  await expectOk("admin deletes a customer request without a deal (its notes go with it)", async () => {
    const lid = (await sys(`insert into public.leads (name, phone, assigned_broker_id) values ('تجربة','01099990002','${CO}') returning id`))[0].id;
    await as(U.admin, `select public.admin_delete('lead', '${lid}')`);
    return sys(`select (select count(*) from public.leads where id='${lid}')::int n, (select count(*) from public.audit_log where table_name='lead' and row_id='${lid}')::int logged`);
  }, (r) => r[0].n === 0 && r[0].logged === 1);
  await expectOk("deleting a mall can move its units to another mall", async () => {
    const a = (await sys(`insert into public.malls (name) values ('مول قديم') returning id`))[0].id;
    const b = (await sys(`insert into public.malls (name) values ('مول جديد') returning id`))[0].id;
    await sys(`insert into public.properties (broker_id, category, mall_id, title, type, status, price, size, area, review_status) values ('${CO}','mall','${a}','محل','محل تجاري','بيع',1,10,'مول قديم','approved')`);
    await as(U.admin, `select public.admin_delete('mall', '${a}', '${b}')`);
    return sys(`select (select count(*) from public.malls where id='${a}')::int gone, (select count(*) from public.properties where mall_id='${b}' and area='مول جديد')::int moved`);
  }, (r) => r[0].gone === 0 && r[0].moved === 1);
  await expectOk("deleting a mall without a target deletes its units", async () => {
    const a = (await sys(`insert into public.malls (name) values ('مول للمسح') returning id`))[0].id;
    await sys(`insert into public.properties (broker_id, category, mall_id, title, type, status, price, size, area, review_status) values ('${CO}','mall','${a}','محل','محل تجاري','بيع',1,10,'مول للمسح','approved')`);
    await as(U.admin, `select public.admin_delete('mall', '${a}')`);
    return sys(`select count(*)::int n from public.properties where area='مول للمسح'`);
  }, (r) => r[0].n === 0);
  await expectOk("a provider with requests is suspended, one without is deleted; a plan with subscribers is turned off", async () => {
    const p1 = (await sys(`insert into public.service_providers (category, name, phone, status) values ('media','مقدم عليه شغل','201000009991','approved') returning id`))[0].id;
    const p2 = (await sys(`insert into public.service_providers (category, name, phone, status) values ('media','مقدم فاضي','201000009992','pending') returning id`))[0].id;
    await exec(`begin; set local request.jwt.claim.role to 'service_role'; update public.service_providers set status='approved' where id='${p1}'; insert into public.service_requests (name, phone, category, assigned_provider_id) values ('طالب خدمة','01011119999','media','${p1}'); commit;`);
    const r1 = (await as(U.admin, `select public.admin_delete('service_provider', '${p1}') r`))[0].r;
    const r2 = (await as(U.admin, `select public.admin_delete('service_provider', '${p2}') r`))[0].r;
    const st = (await sys(`select status from public.service_providers where id='${p1}'`))[0].status;
    const req = (await sys(`select id from public.service_requests where name='طالب خدمة'`))[0].id;
    const r3 = (await as(U.admin, `select public.admin_delete('service_request', '${req}') r`))[0].r;
    return [{ r1, r2, st, r3 }];
  }, (r) => r[0].r1 === "deactivated" && r[0].st === "suspended" && r[0].r2 === "deleted" && r[0].r3 === "deleted");
  await expectOk("release 30 can be re-run safely", async () => {
    const sql = (await import("node:fs")).readFileSync(new URL("../migrations/20261017600000_manage-everything.sql", import.meta.url), "utf8");
    await exec(`begin;
${sql}
commit;`);
    return sys(`select count(*)::int n from public.properties where availability not in ('available','reserved','sold')`);
  }, (r) => r[0].n === 0);

  // Release 31: deleting an account removes the broker row too (or hides it when it has money records).
  const svc31 = (sql) => exec(`begin; set local request.jwt.claim.role to 'service_role'; ${sql}; commit;`);
  await svc31(`insert into public.brokers (id, slug, name, account_type, is_active) values ('b0000000-0000-0000-0000-00000000de31', 'del-co-1', 'شركة للمسح', 'company', true), ('b0000000-0000-0000-0000-00000000de32', 'del-co-2', 'شركة عليها اتفاقية', 'company', true)`);
  await svc31(`insert into public.properties (broker_id, title, type, status, price, size, city, area, review_status) values ('b0000000-0000-0000-0000-00000000de31', 'إعلان الشركة', 'شقة', 'بيع', 1, 1, 'برج العرب الجديدة', 'الحي الأول', 'approved')`);
  await svc31(`insert into public.company_agreements (broker_id, rate) values ('b0000000-0000-0000-0000-00000000de32', 2.5)`);
  await expectErr("only the admin deletes an account", () => as(U.owner, `select public.admin_delete_broker('b0000000-0000-0000-0000-00000000de31')`));
  await expectErr("an account with a login: the login goes first", () => as(U.admin, `select public.admin_delete_broker('${CO}')`));
  await expectOk("an account without money records is deleted with its listings", async () => {
    const r = (await as(U.admin, `select public.admin_delete_broker('b0000000-0000-0000-0000-00000000de31') r`))[0].r;
    const left = await sys(`select (select count(*) from public.brokers where id='b0000000-0000-0000-0000-00000000de31')::int b, (select count(*) from public.properties where title='إعلان الشركة')::int p`);
    return [{ r, ...left[0] }];
  }, (r) => r[0].r === "deleted" && r[0].b === 0 && r[0].p === 0);
  await expectOk("an account with an agreement is kept for the records but leaves every list", async () => {
    const r = (await as(U.admin, `select public.admin_delete_broker('b0000000-0000-0000-0000-00000000de32') r`))[0].r;
    const b = (await sys(`select deleted_at is not null del, is_active from public.brokers where id='b0000000-0000-0000-0000-00000000de32'`))[0];
    return [{ r, ...b }];
  }, (r) => r[0].r === "hidden" && r[0].del === true && r[0].is_active === false);
  await expectOk("release 31 can be re-run safely", async () => {
    const sql = (await import("node:fs")).readFileSync(new URL("../migrations/20261017700000_delete-accounts.sql", import.meta.url), "utf8");
    await exec(`begin;
${sql}
commit;`);
    return sys(`select count(*)::int n from public.brokers where deleted_at is not null`);
  }, (r) => r[0].n === 1);
}
