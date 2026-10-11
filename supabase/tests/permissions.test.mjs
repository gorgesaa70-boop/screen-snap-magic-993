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
  await expectOk("admin rejects with a note", () => as(U.admin, `update public.brokers set rejected_at=now(), review_note='بيانات ناقصة' where slug='ap' returning rejected_at`), (r) => r[0].rejected_at);
  await expectOk("owner can't clear own review fields", () => as(U.owner, `update public.brokers set review_note='x' where id='${CO}' returning review_note`), (r) => r[0].review_note === null);
  await expectOk("activating clears rejection", () => as(U.admin, `update public.brokers set is_active=true where slug='ap' returning rejected_at`), (r) => r[0].rejected_at === null);

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
}
