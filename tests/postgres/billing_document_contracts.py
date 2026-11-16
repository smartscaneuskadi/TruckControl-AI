"""Document/finance links on the caller's already guarded disposable CI PG.

No provider, live account, URL, credential, database selection or Docker setup is
accepted here. All fixture rows and contention belong to that isolated service.
"""
import hashlib
import json


def run(pg, f):
    start = len(pg.REPORT["checks"])
    q = pg.quote
    source = list((pg.ROOT / "supabase/migrations").glob("*_billing_document_attachments.sql"))
    if len(source) != 1:
        raise AssertionError("One canonical billing-document migration is required")
    migration = source[0]
    pg.sql((pg.ROOT / "tests/fixtures/billing-document-records.sql").read_text())

    def uid(n): return "ba210000-0000-4000-8000-" + str(n).zfill(12)
    def ident(kind, n): return "ba" + str(kind) + "0000-0000-4000-8000-" + str(n).zfill(12)
    org = pg.value("select jsonb_build_object('id',id) from public.organizations where owner_id=" + q(uid(1)))["id"]
    foreign = pg.value("select jsonb_build_object('id',id) from public.organizations where owner_id=" + q(uid(2)))["id"]

    def context(n=1, *, aal="aal1", role="authenticated"):
        actor = uid(n) if n is not None else ""
        claims = {"sub": actor, "role": role, "session_id": ident(22, n)} if n is not None else {}
        claims["aal"] = aal
        return ("set local role " + role + ";do $claims$ begin perform set_config('request.jwt.claim.sub',"
                + q(actor) + ",true);perform set_config('request.jwt.claims'," + q(json.dumps(claims))
                + ",true);end;$claims$;")

    def evaluate(statement, setup="", n=1, *, aal="aal1", role="authenticated"):
        return pg.value("begin;" + setup + context(n, aal=aal, role=role) + statement + ";rollback;")

    def denied(name, statement, setup="", n=1, *, code="42501", aal="aal1", role="authenticated"):
        pg.require_error("Billing documents: " + name, "begin;" + setup + context(n, aal=aal, role=role)
                         + statement + ";rollback;", code)

    def rpc(name, *args): return "select public." + name + "(" + ",".join(args) + ")"
    def js(data): return q(json.dumps(data)) + "::jsonb"
    tracking = {"category": "ticket", "status": "active", "expires_on": None, "remind_days": 30}

    def metadata(doc=2, data=None, expected=1, legacy=False):
        return rpc("tc_update_document_metadata" if legacy else "tc_update_document_metadata_v2",
                   q(org), q(ident(26, doc)), js(data or tracking), str(expected))

    def overrides(**features):
        return "update private.tc_customers set module_overrides=" + js(features) + " where user_id=" + q(uid(1)) + ";"

    def register(doc, data, **parents):
        return rpc("tc_register_document_v2", q(org), js({"id": doc, "name": "Ficticio.pdf",
                   "object_path": org + "/" + doc + "/document.pdf", "content_type": "application/pdf",
                   "size_bytes": 100, **parents}), js(data))

    page = rpc("tc_document_page_v2", q(org), "null::uuid")
    legacy = evaluate(rpc("tc_document_page", q(org), "null::uuid"))
    latest = evaluate(page)
    old = next(row for row in legacy if row["id"] == ident(26, 2))["tracking"]
    new = next(row for row in latest if row["id"] == ident(26, 2))["tracking"]
    pg.check("Billing documents: strict Sites47 DTO omits both new fields and maps the category",
             set(old) == {"category", "status", "expires_on", "remind_days", "row_version", "updated_at"}
             and old["category"] == "other")
    pg.check("Billing documents: versioned DTO retains classification, label and same-company finance link",
             new["category"] == "ticket" and new["label"] == "Justificante del gasto"
             and new["finance_entry_id"] == ident(25, 2))
    previous = evaluate(rpc("tc_backup_page_v2", q(org), "'documents'", "null::uuid"))
    fresh = evaluate(rpc("tc_backup_page_v3", q(org), "'documents'", "null::uuid"))
    pg.check("Billing documents: old and new backups keep separate lossless/legacy contracts",
             next(d for d in previous if d["id"] == ident(26, 2))["tracking"] == old
             and next(d for d in fresh if d["id"] == ident(26, 2))["tracking"] == new)
    pg.check("Billing documents: historical finance classes remain null",
             pg.value("select jsonb_build_object('n',count(*)) from public.finance_entries where id::text like 'ba250000-%' and document_type is not null")["n"] == 0)
    changed = evaluate("update public.finance_entries set document_type='delivery_note' where id=" + q(ident(25, 2))
                       + ";update public.finance_entries set concept='Legacy edit' where id=" + q(ident(25, 2))
                       + ";select jsonb_build_object('type',document_type,'cents',amount_cents,'kind',kind) from public.finance_entries where id=" + q(ident(25, 2)))
    pg.check("Billing documents: legacy financial write preserves class and original accounting values",
             changed == {"type": "delivery_note", "cents": 10000, "kind": "expense"})
    cleared = evaluate("update public.finance_entries set document_type='ticket' where id=" + q(ident(25, 2))
                       + ";update public.finance_entries set document_type=null where id=" + q(ident(25, 2))
                       + ";select jsonb_build_object('type',document_type) from public.finance_entries where id=" + q(ident(25, 2)))
    pg.check("Billing documents: explicit null clears only the classification", cleared == {"type": None})
    denied("unsupported finance classification", "update public.finance_entries set document_type='invented' where id=" + q(ident(25, 2)), code="23514")
    old_edit = evaluate(metadata(data={**tracking, "category": "other", "expires_on": "2028-01-01"}, legacy=True)
                        + ";reset role;" + context() + page)
    current = next(d for d in old_edit if d["id"] == ident(26, 2))["tracking"]
    pg.check("Billing documents: old other editor preserves specific category, label and finance reference",
             current["category"] == "ticket" and current["label"] == new["label"]
             and current["finance_entry_id"] == new["finance_entry_id"] and current["row_version"] == 2)
    denied("cross-company metadata read", page, n=2)
    denied("clients cannot choose an actor through the private service filter",
           "select private.tc_document_visible_for(" + q(foreign) + "," + q(ident(26, 9)) + "," + q(uid(2)) + ")")
    denied("cross-company financial link", register(ident(26, 31), {**tracking, "finance_entry_id": ident(25, 9)}), code="23503")
    denied("missing financial link", register(ident(26, 31), {**tracking, "finance_entry_id": ident(25, 99)}), code="23503")
    denied("free-text length bounded", register(ident(26, 31), {**tracking, "label": "x" * 161}), code="22023")
    denied("viewer cannot edit new fields", metadata(data={**tracking, "label": "must not commit"}),
           "update private.tc_memberships set role='viewer' where organization_id=" + q(org) + " and user_id=" + q(uid(3)) + ";", n=3)
    pg.check("Billing documents: operator retains permitted metadata writes",
             evaluate(metadata(data={**tracking, "label": "Operator edit"}), n=3)["label"] == "Operator edit")
    for feature, hidden in (("income", 6), ("expenses", 2)):
        scoped = evaluate(page, overrides(**{feature: False}))
        storage = evaluate("select jsonb_build_object('n',count(*)) from storage.objects where name like "
                           + q(org + "/" + ident(26, hidden) + "/%"), overrides(**{feature: False}))
        pg.check("Billing documents: disabling " + feature + " denies linked metadata and registered original",
                 not any(d["id"] == ident(26, hidden) for d in scoped) and storage["n"] == 0)
        entry = ident(25, 1 if feature == "income" else 2)
        before = pg.value("select to_jsonb(e) from public.finance_entries e where id=" + q(entry))
        denied("changing a hidden " + feature + " entry cannot reveal its document",
               "update public.finance_entries set kind=" + q("expense" if feature == "income" else "income")
               + ",category='other',distance_km=0 where id=" + q(entry), overrides(**{feature: False}))
        pg.check("Billing documents: denied reclassification preserves every field for " + feature,
                 pg.value("select to_jsonb(e) from public.finance_entries e where id=" + q(entry)) == before)
    pg.check("Billing documents: both authorized modules permit explicit reclassification without amount change",
             evaluate("update public.finance_entries set kind='income',category='other' where id=" + q(ident(25, 2))
                      + ";select jsonb_build_object('kind',kind,'cents',amount_cents) from public.finance_entries where id=" + q(ident(25, 2)))
             == {"kind": "income", "cents": 10000})
    gmail = evaluate("select jsonb_build_object('ids',coalesce(jsonb_agg(id order by id),'[]')) from private.company_documents where organization_id=" + q(org), overrides(documents=False))
    pg.check("Billing documents: Gmail-only still sees only its original invoice attachment", gmail["ids"] == [ident(26, 3)])
    invoice_data = {"organization_id": org, "user_id": uid(1), "invoice_ids": [ident(27, 3)]}
    invoice_status = rpc("company_invoice_ai_server", "'status'", js(invoice_data))
    pg.check("Billing documents: trusted service keeps Gmail-only invoice access for its actual user",
             len(evaluate(invoice_status, overrides(documents=False), n=None, role="service_role")) == 1)
    invoice_link = "update private.tc_document_details set finance_entry_id=" + q(ident(25, 2)) + " where document_id=" + q(ident(26, 3)) + ";"
    pg.check("Billing documents: service_role cannot bypass financial scope of invoice AI p_user",
             evaluate(invoice_status, invoice_link + overrides(expenses=False), n=None, role="service_role") == [])
    denied("docs-only cannot delete financial row to bypass attachment permission",
           "delete from public.finance_entries where id=" + q(ident(25, 2)), overrides(expenses=False))
    denied("docs-only cannot unlink a hidden financial attachment", metadata(data={**tracking, "finance_entry_id": None}), overrides(expenses=False))
    detached = evaluate("delete from public.finance_entries where id=" + q(ident(25, 2))
                        + ";select jsonb_build_object('original',(select count(*) from private.company_documents where id=" + q(ident(26, 2))
                        + "),'label',(select label from private.tc_document_details where document_id=" + q(ident(26, 2))
                        + "),'category',(select category from private.tc_document_details where document_id=" + q(ident(26, 2))
                        + "),'revision',(select row_version from private.tc_document_details where document_id=" + q(ident(26, 2))
                        + "),'ref',(select finance_entry_id from private.tc_document_details where document_id=" + q(ident(26, 2)) + "))")
    pg.check("Billing documents: authorized DELETE detaches without removing original or metadata",
             detached == {"original": 1, "label": new["label"], "category": "ticket", "revision": 2, "ref": None})
    mismatch = "update public.finance_entries set truck_id=" + q(ident(24, 2)) + " where id=" + q(ident(25, 2)) + ";"
    denied("mixed truck parents must agree when linking", register(ident(26, 32), {**tracking, "finance_entry_id": ident(25, 2)}, truck_id=ident(24, 1)), mismatch, code="23514")
    pg.check("Billing documents: later legitimate finance truck assignment keeps immutable originals usable",
             evaluate(metadata(data={**tracking, "finance_entry_id": ident(25, 2)}), mismatch)["finance_entry_id"] == ident(25, 2))

    factor = ident(28, 1)
    enrolled = ("insert into auth.mfa_factors(id,user_id,factor_type,status) values(" + q(factor) + "," + q(uid(1))
                + ",'totp','verified');update auth.sessions set aal='aal2',factor_id=" + q(factor) + " where id=" + q(ident(22, 1)) + ";")
    denied("MFA AAL1 stays denied despite an upgraded stored SID", page, enrolled)
    pg.check("Billing documents: native-bound AAL2 retains permitted new document access", bool(evaluate(page, enrolled, aal="aal2")))
    for state in ({"enabled": False, "expires_at": None}, {"enabled": True, "expires_at": "2000-01-01T00:00:00Z"}):
        full = context(9) + rpc("tc_admin_company_full", "'set'", q(org), "0", q(ident(29, 1)), js(state), "null::uuid") + ";reset role;"
        denied("FULL inactive or expired wins after MFA AAL2: " + str(state["enabled"]), page, enrolled + full, aal="aal2")
    rollback = (pg.ROOT / "docs/verification/billing-document-attachments-rollback.sql").read_text()
    pg.require_error("Billing documents: rollback refuses to drop real metadata", rollback, "billing_document_retirement_requires_forward_migration")

    # Two actual independent connections contend, not a simulated loop.
    pg.concurrent(context() + metadata(data={**tracking, "label": "CAS holder"}),
                  context() + metadata(data={**tracking, "label": "Stale contender"}),
                  "billing-document-cas", second_error="40001")
    pg.check("Billing documents: contention commits one metadata revision and keeps finance reference",
             pg.value("select jsonb_build_object('v',row_version,'label',label,'ref',finance_entry_id) from private.tc_document_details where document_id=" + q(ident(26, 2)))
             == {"v": 2, "label": "CAS holder", "ref": ident(25, 2)})
    new_entry, new_doc = ident(25, 40), ident(26, 40)
    pg.sql("insert into public.finance_entries(id,organization_id,truck_id,kind,concept,date,amount_cents,category,payment_status,distance_km) values("
           + q(new_entry) + "," + q(org) + "," + q(ident(24, 1)) + ",'expense','Synthetic race only',current_date,1234,'other','pending',0);")
    pg.concurrent(context() + register(new_doc, {**tracking, "label": "Race original", "finance_entry_id": new_entry}),
                  context() + "delete from public.finance_entries where id=" + q(new_entry), "billing-document-link-delete")
    pg.check("Billing documents: serialized registration/delete conserves original, label, version and tenant",
             pg.value("select jsonb_build_object('org',d.organization_id,'label',t.label,'ref',t.finance_entry_id,'version',t.row_version) from private.company_documents d join private.tc_document_details t on t.organization_id=d.organization_id and t.document_id=d.id where d.id=" + q(new_doc))
             == {"org": org, "label": "Race original", "ref": None, "version": 2})
    # Keep an explicitly classified synthetic record and linked metadata in the
    # saved dump. This is not retroclassification of managed customer records.
    pg.sql("update public.finance_entries set document_type='ticket' where id=" + q(ident(25, 2)))
    pg.REPORT["billing_documents"] = {
        "passed_checks": len(pg.REPORT["checks"]) - start, "real_lock_contentions": 2,
        "migration": {"filename": migration.name, "sha256": hashlib.sha256(migration.read_bytes()).hexdigest()},
        "restoration": "included in the caller's full subsequent isolated logical restore; not a third restore",
        "managed_auth_or_restore": False, "physical_devices": False, "provider_calls": 0,
        "classification_changes_accounting": False, "original_deletions": 0,
    }


def verify_restored(pg, f, database):
    """Query the caller's existing restored DB, never create another restore."""
    q = pg.quote
    user = "ba210000-0000-4000-8000-000000000001"
    session = "ba220000-0000-4000-8000-000000000001"
    doc = "ba260000-0000-4000-8000-000000000002"
    entry = "ba250000-0000-4000-8000-000000000002"
    claims = json.dumps({"sub": user, "role": "authenticated", "session_id": session, "aal": "aal1"})
    scoped = ("begin read only;set local role authenticated;do $claims$ begin perform set_config('request.jwt.claim.sub',"
              + q(user) + ",true);perform set_config('request.jwt.claims'," + q(claims) + ",true);end;$claims$;")
    restored = pg.value(scoped + "select jsonb_build_object('type',e.document_type,'category',t.category,'label',t.label,"
                        "'ref',t.finance_entry_id,'version',t.row_version,'original',d.id,'objects',"
                        "(select count(*) from storage.objects where name=d.object_path)) from private.company_documents d "
                        "join private.tc_document_details t on t.organization_id=d.organization_id and t.document_id=d.id "
                        "join public.finance_entries e on e.organization_id=t.organization_id and e.id=t.finance_entry_id "
                        "where d.id=" + q(doc) + ";rollback;", database)
    pg.check("Billing documents: existing logical restore preserves classified finance, linked original and scoped RLS reads",
             restored == {"type": "ticket", "category": "ticket", "label": "CAS holder", "ref": entry,
                          "version": 2, "original": doc, "objects": 1})
    pg.REPORT["billing_documents"]["restored_fixture_verified"] = True
