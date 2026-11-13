#!/usr/bin/env python3
"""Extra migration64 acceptance, synthetic official PostgreSQL CI container only.

The preceding isolated-postgres step verifies the image digest and schema.
This step uses real competing psql connections and a second logical restore;
it never contacts Stripe, Supabase, email, Vault or customer accounts.
"""
from __future__ import annotations
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("isolated_postgres", ROOT / "scripts/verify-isolated-postgres.py")
assert spec and spec.loader
pg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg)
q, sql, value, check = pg.quote, pg.sql, pg.value, pg.check
ACCOUNT = "acct_IncidentPostgres"
ADMIN = "fd110000-0000-4000-8000-000000000001"
SID = "fd220000-0000-4000-8000-000000000001"
RESTORED = "tc_incidents_restored"
pg.DATABASES.add(RESTORED)
pg.REPORT.update({
 "contract": "truckcontrol-financial-incidents-postgres-v1",
 "scope": "synthetic financial observations, real PostgreSQL locks and same-cluster logical restore",
 "checks": [], "money_movement": False, "licence_changes": False,
 "fiscal_emission": False, "provider_calls": 0,
})
def uid(n): return "fd330000-0000-4000-8000-" + str(n).zfill(12)
def req(n): return "fd440000-0000-4000-8000-" + str(n).zfill(12)
def op(n): return "fd550000-0000-4000-8000-" + str(n).zfill(12)
def js(data): return q(json.dumps(data)) + "::jsonb"
def rpc(name, *args): return "select public." + name + "(" + ",".join(args) + ")"
def service(statement): return "set local role service_role;" + statement
def admin(statement):
 claims=json.dumps({"sub":ADMIN,"role":"authenticated","session_id":SID})
 return ("set local role authenticated;do $claims$ begin perform set_config('request.jwt.claim.sub',"
  +q(ADMIN)+",true);perform set_config('request.jwt.claims',"+q(claims)+",true);end $claims$;"+statement)
def result(statement,database=pg.SOURCE):
 return value("begin;"+statement+";commit;",database)
def create_payment(n, monthly=False):
 registration={"truckcontrol_registration":{"contact_name":"Synthetic operator","company_name":"Synthetic PG company "+str(n),
  "tax_id":"SYNTHETIC-PG-INCIDENT-"+str(n),"address":"Synthetic isolated address 123",
  "phone":"+12025557"+str(100+n),"requested_plan":"limited"}}
 sql("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values("
  +q(uid(n))+","+q("incident-pg-"+str(n)+"@example.invalid")+",now(),"+js(registration)+");")
 company=value("select jsonb_build_object('id',id) from public.organizations where owner_id="+q(uid(n)))["id"]
 checkout="cs_test_IncidentPG"+str(n)
 sql("insert into private.tc_payment_requests(id,user_id,plan_id,quoted_cents,plan_revision,status,checkout_id,net_cents,vat_rate_bps,vat_cents)"
  +" select "+q(req(n))+","+q(uid(n))+",id,36300,revision,'checkout',"+q(checkout)+",30000,2100,6300 from private.tc_plans where id='limited';")
 data={"provider_event_id":"evt_IncidentPGPaid"+str(n),"provider_event_type":"invoice.paid" if monthly else "checkout.session.completed",
  "provider_event_created":pg.REPORT["epoch"]-10,"provider_payment_id":"in_IncidentPG"+str(n) if monthly else "pi_IncidentPG"+str(n),
  "request_id":req(n),"user_id":uid(n),"company_id":company,"amount_cents":36300,"currency":"EUR",
  "paid_at":pg.REPORT["paid_at"],"livemode":False,"checkout_id":checkout,"customer_id":"cus_IncidentPG"+str(n)}
 if monthly:
  sql("insert into private.tc_subscription_orders(user_id,request_id,checkout_id,terms_version) values("
   +q(uid(n))+","+q(req(n))+","+q(checkout)+",'synthetic-incident-v1');")
  data.update({"invoice_id":"in_IncidentPG"+str(n),"subscription_id":"sub_IncidentPG"+str(n),
   "invoice_period_start":pg.REPORT["epoch"]-30*86400,"invoice_period_end":pg.REPORT["epoch"],
   "subscription_current_period_end":pg.REPORT["epoch"],"unit_amount":36300,"subscription_state":"active",
   "cancel_at_period_end":False,"billing_reason":"subscription_create"})
 paid=result(service(rpc("tc_manual_subscription_apply_payment",q("subscription_invoice" if monthly else "initial_payment"),q(ACCOUNT),js(data))))
 return {"n":n,"data":data,"task":paid["task_id"],"monthly":monthly}
def observation(payment, suffix="A"):
 n=payment["n"];monthly=payment["monthly"];data=payment["data"]
 return {"event_id":"evt_IncidentPGRefund"+str(n)+suffix,"event_type":"refund.created",
  "event_created":pg.REPORT["epoch"]-2,"livemode":False,"currency":"EUR","object_type":"refund",
  "object_id":"re_IncidentPG"+str(n),"status_at_event":"succeeded","current_status":"succeeded",
  "event_amount_cents":5000,"current_amount_cents":5000,"charge_amount_cents":36300,
  "charge_amount_refunded_cents":5000,"event_amount_refunded_cents":None,
  "payment_intent_id":"pi_IncidentPG"+str(n),"charge_id":"ch_IncidentPG"+str(n),"customer_id":data["customer_id"],
  "invoice_id":data.get("invoice_id"),"subscription_id":data.get("subscription_id"),
  "invoice_payment_id":"inpay_IncidentPG"+str(n) if monthly else None,
  "invoice_period_start":data.get("invoice_period_start"),"invoice_period_end":data.get("invoice_period_end"),
  "invoice_amount_cents":36300 if monthly else None}
def record(data): return service(rpc("tc_manual_subscription_record_incident",q(ACCOUNT),q("test"),js(data)))
def administrative(action, case_id, expected=None, operation=None, data=None):
 return admin(rpc("tc_admin_subscription_incidents",q(action),q(case_id)+"::uuid",
  "null" if expected is None else str(expected),"null" if operation is None else q(operation)+"::uuid",js(data or {}),"null::uuid"))
def count(case_id):
 return value("select jsonb_build_object('n',count(*),'max',max(row_version)) from private.tc_subscription_financial_entries where case_id="+q(case_id))
def original(payment):
 return value("select jsonb_build_object('customer',(select to_jsonb(c) from private.tc_customers c where user_id="+q(uid(payment["n"]))+
  "),'request',(select to_jsonb(r) from private.tc_payment_requests r where id="+q(req(payment["n"]))+
  "),'task',(select to_jsonb(t) from private.tc_manual_subscription_invoice_tasks t where id="+q(payment["task"])+
  "),'receipts',(select jsonb_agg(to_jsonb(b) order by provider_event_id) from private.tc_manual_stripe_bridge_receipts b where task_id="+q(payment["task"])+
  "),'notices',(select jsonb_agg(to_jsonb(n) order by id) from private.tc_manual_invoice_notice_outbox n where task_id="+q(payment["task"])+"))")
def restore_saved_backup(manifest_sha256: str) -> None:
 verified=pg.backup.read_backup(pg.RESULTS,"incidents-backup.manifest.json",manifest_sha256,
  {"synthetic-financial-incidents.dump":"postgresql"})
 pg.run(["docker","exec",pg.CONTAINER,"createdb","-U","postgres","-T","template0",RESTORED])
 pg.run(["docker","exec","-i",pg.CONTAINER,"pg_restore","-U","postgres","-d",RESTORED,"--no-owner","--exit-on-error"],
  data=verified["synthetic-financial-incidents.dump"])
 pg.REPORT["saved_artifacts_verified"]=True
 pg.REPORT["backup_manifest_sha256"]=manifest_sha256

def main():
 if os.environ.get("GITHUB_ACTIONS")!="true" or not re.fullmatch(r"[0-9a-f]{12,64}",pg.CONTAINER):
  raise AssertionError("Only the explicit isolated CI service container is accepted")
 for name in ("DATABASE_URL","SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","STRIPE_SECRET_KEY","STRIPE_API_KEY","OPENAI_API_KEY"):
  if os.environ.get(name): raise AssertionError("External credentials must be absent")
 pg.REPORT["source_commit"]=pg.run(["git","rev-parse","HEAD"]).stdout.decode().strip()
 check("Migration64 real function exists in the previously verified local PostgreSQL schema",
  value("select jsonb_build_object('present',to_regprocedure('public.tc_manual_subscription_record_incident(text,text,jsonb)') is not null)")["present"])
 pg.REPORT["epoch"]=value("select jsonb_build_object('epoch',extract(epoch from clock_timestamp())::bigint,'paid_at',clock_timestamp()-interval '20 seconds')")["epoch"]
 pg.REPORT["paid_at"]=value("select jsonb_build_object('paid_at',to_timestamp("+str(pg.REPORT["epoch"]-20)+"))")["paid_at"]
 sql("insert into auth.users(id,email,email_confirmed_at) values("+q(ADMIN)+",'incident-pg-admin@example.invalid',now());"+
  "insert into auth.sessions(id,user_id) values("+q(SID)+","+q(ADMIN)+");"+
  "insert into private.tc_admins(user_id) values("+q(ADMIN)+");"+
  "insert into private.tc_manual_stripe_channels(provider_account_id,mode,enabled,isolated_test_instance) values("+q(ACCOUNT)+",'test',true,true);")
 a,b,c=create_payment(1),create_payment(2,True),create_payment(3)
 originals={p["task"]:original(p) for p in (a,b,c)}
 # Two real connections contend on the task; an exact duplicate commits once.
 out1,out2=pg.concurrent(record(observation(a)),record(observation(a)),"incident-provider-duplicate")
 parsed1=[json.loads(x) for x in out1.decode().splitlines() if x.startswith("{")][-1]
 parsed2=[json.loads(x) for x in out2.decode().splitlines() if x.startswith("{")][-1]
 case_a=parsed1["case_id"]
 check("Concurrent duplicate provider delivery creates one case/entry and returns duplicate ACK",
  parsed1["duplicate"] is False and parsed2["duplicate"] is True and parsed2["case_id"]==case_a and count(case_a)=={"n":1,"max":2})
 # Independent provider Events are separate observations, never duplicate sums.
 pg.concurrent(record(observation(a,"B")),record(observation(a,"C")),"incident-provider-sequence")
 check("Two provider events retain strictly increasing immutable versions",count(case_a)=={"n":3,"max":4})
 pg.concurrent(administrative("review",case_a,4,op(1),{"note":"First serialized review"}),
  administrative("review",case_a,4,op(2),{"note":"Stale concurrent review"}),"incident-admin-cas",second_error="40001")
 check("Stale concurrent administrator action adds no second audit row",count(case_a)=={"n":4,"max":5})
 case_b=result(record(observation(b)))["case_id"]
 pg.concurrent(administrative("review",case_b,2,op(3),{"note":"Same operation retry"}),
  administrative("review",case_b,2,op(3),{"note":"Same operation retry"}),"incident-admin-operation-replay")
 check("Concurrent identical UUID review has exactly one durable operation",count(case_b)=={"n":2,"max":3})
 # Provider observation wins; admin must reload before reviewing the newer event.
 pg.concurrent(record(observation(b,"B")),administrative("review",case_b,3,op(4),{"note":"Review of stale provider snapshot"}),
  "incident-provider-admin-cas",second_error="40001")
 check("A newly arrived provider event invalidates stale administrative expectations",count(case_b)=={"n":3,"max":4})
 # Rollback even the just-created case when its first audit insert fails.
 sql("create function private.incident_ci_fail() returns trigger language plpgsql as $fail$ begin "+
  "if new.provider_event_id='evt_IncidentPGRefund3A' then raise exception 'synthetic_incident_failure';end if;return new;end;$fail$;"+
  "create trigger incident_ci_fail before insert on private.tc_subscription_financial_entries for each row execute function private.incident_ci_fail();")
 try: pg.require_error("Financial ledger rejects partial case persistence atomically","begin;"+record(observation(c))+";commit;","synthetic_incident_failure")
 finally: sql("drop trigger incident_ci_fail on private.tc_subscription_financial_entries;drop function private.incident_ci_fail();")
 check("Failed initial observation leaves no orphan case",
  value("select jsonb_build_object('n',count(*)) from private.tc_subscription_financial_cases where task_id="+q(c["task"]))=={"n":0})
 for p in (a,b,c):
  check("Financial observations preserve original paid licence/task/notice for synthetic buyer "+str(p["n"]),original(p)==originals[p["task"]])
 # Exact original63 proofs stay readable in READ ONLY transactions after incidents.
 for p in (a,b):
  data=p["data"];hint={"id":data["provider_event_id"],"type":data["provider_event_type"],
   "created":data["provider_event_created"],"resource_id":data.get("invoice_id",data["checkout_id"])}
  acknowledged=value("begin read only;"+service(rpc("tc_manual_subscription_known_payment_event",q(ACCOUNT),q("test"),js(hint)))+";commit;")
  check("Original63 paid proof matches without writing for monthly="+str(p["monthly"]),acknowledged.get("known") is True)
 capabilities=result(administrative("capabilities",case_a))
 check("Money movement, automatic licence policy and fiscal emission are unavailable",
  all(capabilities[key] is False for key in ("refunds_available","license_changes_available","rectification_emission_available")))
 # Actual dump/restore AFTER the new ledger and reviews exist.
 before=pg.database_fingerprint(pg.SOURCE)
 dump=pg.run(["docker","exec",pg.CONTAINER,"pg_dump","-U","postgres","-d",pg.SOURCE,"-Fc","--no-owner"]).stdout
 pg.RESULTS.mkdir(exist_ok=True)
 manifest_sha256=pg.backup.save_backup(pg.RESULTS,"incidents-backup.manifest.json",
  {"synthetic-financial-incidents.dump":("postgresql",dump)})
 pg.REPORT["dump_sha256"]=hashlib.sha256(dump).hexdigest()
 del dump
 restore_saved_backup(manifest_sha256)
 after=pg.database_fingerprint(RESTORED)
 if before!=after:
  pg.REPORT["restore_differences"]=pg.fingerprint_differences(before,after)
 check("Logical restore preserves all financial rows, ACL, RLS, triggers and immutable operations",before==after)
 pg.require_error("Restored financial audit remains immutable","delete from private.tc_subscription_financial_entries","manual_invoice_intake_immutable",RESTORED)
 sql("delete from auth.sessions where id="+q(SID),RESTORED)
 pg.require_error("Restored administrator session revocation is effective",
  "begin;"+administrative("detail",case_a)+";commit;","42501",RESTORED)
 check("Live checkout, document and notification switches remain OFF",
  value("select jsonb_build_object('payments',(select payments_enabled from private.tc_settings where id),"+
   "'notices',(select enabled from private.tc_manual_invoice_notice_settings where id),"+
   "'live_channels',(select count(*) from private.tc_manual_stripe_channels where mode='live' and enabled))")
  =={"payments":False,"notices":False,"live_channels":0})
 pg.REPORT["passed"]=True

if __name__=="__main__":
 pg.RESULTS.mkdir(exist_ok=True)
 try:main()
 except BaseException as error:
  pg.REPORT["passed"]=False;pg.REPORT["failure"]=str(error)[-2000:];raise
 finally:
  pg.REPORT["passed_checks"]=len(pg.REPORT["checks"])
  (pg.RESULTS/"financial-incidents-report.json").write_text(json.dumps(pg.REPORT,indent=2)+"\n")
