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
  await expectOk("a call by the company = first response", async () => {
    await as(U.manager, `insert into public.lead_activities (lead_id, kind, summary, actor_id) values ('${r1}', 'call', 'اتصال', '${U.manager}')`);
    return [(await leadBy("توزيع 1")).first_response_at];
  }, (r) => !!r[0]);
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
  await as(U.admin, `update public.app_settings set work_start_hour=9, work_end_hour=21`);

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
    return [r[0].r, await src("منى"), await notes(U.admin, "طلب عقاري جديد")];
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
}
