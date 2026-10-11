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

export default async function ({ as, sys, expectOk, expectErr }) {
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
  await expectOk("manager adds a property (published)", () => as(U.manager, `insert into public.properties (broker_id, title, price, type, area, status, review_status) values ('${CO}','شقة',1,'شقة','الحي الأول','بيع','pending') returning review_status`), (r) => r[0].review_status === "approved");
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
  await expectOk("assigned to a team member → that member notified", async () => { await as(U.manager, `update public.leads set assigned_member_id='${salesId}' where id='${nl}'`); return [await notes(U.sales, "تم إسناد عميل لك")]; }, (r) => r[0] >= 1);
  await expectOk("assigned to a Value Aqar employee → employee notified", async () => { await as(U.admin, `update public.leads set assigned_staff_id='${U.staff}' where id='${nl}'`); return sys(`select count(*) c from public.notifications where user_id='${U.staff}' and related_id='${nl}' and title='تم إسناد عميل لك'`); }, (r) => Number(r[0].c) === 1);
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
  const prop = (sql) => as(U.manager, `insert into public.properties (broker_id, title, type, area, review_status, ${sql.cols}) values ('${CO}', '${sql.title}', 'شاليه', 'الساحل الشمالي', 'pending', ${sql.vals}) returning price, price_unit, price_month, price_night, min_months`);
  await expectErr("summer listing needs at least one price", () => prop({ title: "شاليه بدون سعر", cols: "status, price", vals: "'مصيف', 0" }));
  await expectOk("summer listing: lowest price shown per night", () => prop({ title: "شاليه بحري", cols: "status, price, price_night, price_week, guests, min_months", vals: "'مصيف', 0, 1500, 9000, 6, 3" }), (r) => Number(r[0].price) === 1500 && r[0].price_unit === "night" && r[0].min_months === null);
  await expectOk("monthly rent listing: price is per month", () => prop({ title: "شقة إيجار", cols: "status, price, price_night, min_months", vals: "'إيجار', 7000, 999, 6" }), (r) => r[0].price_unit === "month" && Number(r[0].price_month) === 7000 && r[0].price_night === null && r[0].min_months === 6);
  await expectOk("sale listing drops rent fields", () => prop({ title: "شاليه للبيع", cols: "status, price, price_night, min_months", vals: "'بيع', 900000, 1500, 6" }), (r) => r[0].price_unit === null && r[0].price_night === null && r[0].min_months === null);
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

}
