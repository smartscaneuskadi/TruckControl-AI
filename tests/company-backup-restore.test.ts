import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  readFileSync,
  readdirSync,
  mkdtempSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDemo } from "../src/data/demo";
import { demoOperations } from "../src/data/operations";
import {
  backupDigest,
  collectCompanyBackup,
  decryptCompanyBackup,
  encryptCompanyBackup,
  decodeBackupBytes,
  backupRequiredFeatures,
} from "../src/data/company-backup";
import type { BackupRecords } from "../src/data/company-backup";

it("restaura registros, relaciones y PDF en un entorno aislado y conserva el aislamiento RLS", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
      create schema auth;create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
      alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;`);
    for (const name of readdirSync("supabase/migrations")
      .filter((n) => n.endsWith(".sql"))
      .sort())
      await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
    await db.exec(
      "update private.tc_settings set enforce_access=true,registration_open=true,sms_ready=false",
    );
    const owner = "f3000000-0000-4000-8000-000000000001",
      other = "f3000000-0000-4000-8000-000000000002";
    for (const [i, user] of [owner, other].entries())
      await db.query(
        "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)",
        [
          user,
          `recovery${i}@example.com`,
          {
            truckcontrol_registration: {
              contact_name: "Persona ficticia",
              company_name: `Recuperación ficticia ${i}`,
              tax_id: `DEMO-RESTORE-${i}`,
              address: "Dirección ficticia 10",
              phone: `+3460000080${i}`,
            },
          },
        ],
      );
    const org = (
      await db.query<{ id: string }>(
        "select id from public.organizations where owner_id=$1",
        [owner],
      )
    ).rows[0].id;
    const fleet = createDemo();
    fleet.organization = { id: org, name: "Recuperación ficticia 0" };
    const operations = demoOperations(fleet),
      trip = operations.find((r) => r.kind === "trips")!;
    trip.data.status = "completed";
    trip.data.endOn = trip.data.startOn;
    trip.financeEntryId = trip.id;
    fleet.entries.push({
      id: trip.id,
      truckId: fleet.trucks[0].id,
      kind: "income",
      concept: "Viaje de recuperación ficticio",
      date: String(trip.data.startOn),
      amountCents: Number(trip.data.amountCents),
      category: "transport",
      paymentStatus: "pending",
      distanceKm: Number(trip.data.distanceKm),
    });
    const expense = "f4000000-0000-4000-8000-000000000001",
      doc = "f5000000-0000-4000-8000-000000000001",
      invoice = "f6000000-0000-4000-8000-000000000001";
    fleet.entries.push({
      id: expense,
      truckId: fleet.trucks[0].id,
      kind: "expense",
      concept: "Factura ficticia recuperada",
      date: "2026-11-01",
      amountCents: 12100,
      category: "maintenance",
      paymentStatus: "pending",
      distanceKm: 0,
    });
    const bytes = new TextEncoder().encode(
        "%PDF-1.7\nDocumento ficticio de recuperacion\n%%EOF",
      ),
      hash = await backupDigest(bytes),
      created = new Date().toISOString();
    const records: BackupRecords = {
      fleet,
      operations,
      documents: [
        {
          id: doc,
          organization_id: org,
          name: "Factura ficticia.pdf",
          object_path: `${org}/${doc}/document.pdf`,
          content_type: "application/pdf",
          size_bytes: bytes.length,
          truck_id: fleet.trucks[0].id,
          driver_id: null,
          created_at: created,
        },
      ],
      invoices: [
        {
          id: invoice,
          organization_id: org,
          message_id: "recovery-fixture",
          attachment_id: "recovery-fixture",
          content_hash: hash,
          document_id: doc,
          supplier: "Proveedor ficticio",
          invoice_number: "RESTORE-001",
          invoice_date: "2026-11-01",
          net_cents: 10000,
          tax_cents: 2100,
          total_cents: 12100,
          currency: "EUR",
          status: "approved",
          review_note: "Prueba ficticia",
          finance_entry_id: expense,
          created_at: created,
          import_source: "file_upload",
        },
      ],
    };
    const backup = await collectCompanyBackup(
      {
        authorize: async () => ({
          active: true,
          canManage: true,
          organizationId: org,
          coverage: { documents: "library", invoices: true },
          features: Object.fromEntries(
            backupRequiredFeatures.map((f) => [f, true]),
          ),
        }),
        read: async () => structuredClone(records),
        download: async () => bytes,
      },
      org,
    );
    const encrypted = await encryptCompanyBackup(
        backup,
        "Frase-ficticia-recuperacion-2026",
      ),
      restored = await decryptCompanyBackup(
        encrypted,
        "Frase-ficticia-recuperacion-2026",
        org,
      );
    expect(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from public.trucks where organization_id=$1",
          [org],
        )
      ).rows[0].count,
    ).toBe(0);
    await db.exec("begin");
    for (const d of restored.fleet.drivers)
      await db.query(
        "insert into public.drivers(id,organization_id,name,email,phone,license,license_expires_on,status) values($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          d.id,
          org,
          d.name,
          d.email,
          d.phone,
          d.license,
          d.licenseExpiresOn,
          d.status,
        ],
      );
    for (const t of restored.fleet.trucks)
      await db.query(
        "insert into public.trucks(id,organization_id,plate,brand,model,year,odometer_km,status,driver_id,inspection_due_on,route) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [
          t.id,
          org,
          t.plate,
          t.brand,
          t.model,
          t.year,
          t.odometerKm,
          t.status,
          t.driverId,
          t.inspectionDueOn,
          t.route,
        ],
      );
    for (const e of restored.fleet.entries)
      await db.query(
        "insert into public.finance_entries(id,organization_id,truck_id,kind,concept,date,amount_cents,category,payment_status,distance_km) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          e.id,
          org,
          e.truckId,
          e.kind,
          e.concept,
          e.date,
          e.amountCents,
          e.category,
          e.paymentStatus,
          e.distanceKm,
        ],
      );
    const ordered = [...restored.operations].sort(
      (a, b) =>
        Number(!["trailers", "customers"].includes(a.kind)) -
        Number(!["trailers", "customers"].includes(b.kind)),
    );
    for (const r of ordered)
      await db.query(
        "insert into private.fleet_records(id,organization_id,kind,payload,row_version,finance_entry_id) values($1,$2,$3,$4,$5,$6)",
        [r.id, org, r.kind, r.data, r.version, r.financeEntryId],
      );
    for (const r of restored.operations)
      if (r.financeEntryId)
        await db.query(
          "update public.finance_entries set source_record_id=$1 where organization_id=$2 and id=$3",
          [r.id, org, r.financeEntryId],
        );
    for (const d of restored.documents) {
      await db.query(
        "insert into private.company_documents(id,organization_id,name,object_path,content_type,size_bytes,truck_id,driver_id,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          d.id,
          org,
          d.name,
          d.object_path,
          d.content_type,
          d.size_bytes,
          d.truck_id,
          d.driver_id,
          d.created_at,
        ],
      );
      await db.query(
        "insert into storage.objects(bucket_id,name) values('truckcontrol-documents',$1)",
        [d.object_path],
      );
    }
    for (const i of restored.invoices)
      await db.query(
        "insert into private.invoice_documents(id,organization_id,message_id,attachment_id,content_hash,document_id,supplier,invoice_number,invoice_date,net_cents,tax_cents,total_cents,currency,status,review_note,finance_entry_id,created_at,import_source) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)",
        [
          i.id,
          org,
          i.message_id,
          i.attachment_id,
          i.content_hash,
          i.document_id,
          i.supplier,
          i.invoice_number,
          i.invoice_date,
          i.net_cents,
          i.tax_cents,
          i.total_cents,
          i.currency,
          i.status,
          i.review_note,
          i.finance_entry_id,
          i.created_at,
          i.import_source,
        ],
      );
    await db.exec("commit");
    const fileRoot = mkdtempSync(
      join(tmpdir(), "truckcontrol-restored-originals-"),
    );
    for (const file of restored.files) {
      const path = join(fileRoot, `${file.documentId}.pdf`);
      writeFileSync(path, decodeBackupBytes(file.base64));
      expect(await backupDigest(readFileSync(path))).toBe(file.sha256);
    }
    const sums = (
      await db.query<{ income: string; expense: string }>(
        "select coalesce(sum(amount_cents) filter(where kind='income'),0)::text as income,coalesce(sum(amount_cents) filter(where kind='expense'),0)::text as expense from public.finance_entries where organization_id=$1",
        [org],
      )
    ).rows[0];
    expect(Number(sums.income)).toBe(
      fleet.entries
        .filter((e) => e.kind === "income")
        .reduce((n, e) => n + e.amountCents, 0),
    );
    expect(Number(sums.expense)).toBe(
      fleet.entries
        .filter((e) => e.kind === "expense")
        .reduce((n, e) => n + e.amountCents, 0),
    );
    expect(
      (
        await db.query<{ source_record_id: string }>(
          "select source_record_id from public.finance_entries where id=$1",
          [trip.id],
        )
      ).rows[0].source_record_id,
    ).toBe(trip.id);
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
    expect(
      (
        await db.query("select * from public.trucks where organization_id=$1", [
          org,
        ])
      ).rows,
    ).toHaveLength(50);
    expect(
      (
        await db.query<{ data: unknown[] }>(
          "select public.tc_backup_page($1,'invoices',null) as data",
          [org],
        )
      ).rows[0].data,
    ).toHaveLength(1);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      other,
    ]);
    expect(
      (
        await db.query("select * from public.trucks where organization_id=$1", [
          org,
        ])
      ).rows,
    ).toHaveLength(0);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
    await db.exec("reset role");
    const root =
      process.env.TRUCKCONTROL_RECOVERY_ARTIFACTS ??
      mkdtempSync(join(tmpdir(), "truckcontrol-recovery-report-"));
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "logical-restore-rehearsal.json"),
      JSON.stringify(
        {
          passed: true,
          environment:
            "isolated PGlite/PostgreSQL with application migrations; synthetic data only",
          trucks: 50,
          drivers: restored.fleet.drivers.length,
          financeEntries: restored.fleet.entries.length,
          operations: restored.operations.length,
          documents: 1,
          invoices: 1,
          originalSha256Matched: true,
          financialTotalsUnchanged: true,
          bookedOperationLinkPreserved: true,
          crossCompanyRlsDenied: true,
          managedSupabaseRestoreTested: false,
          authAccountsCredentialsAndProviderSettingsRestored: false,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await db.close();
  }
}, 30000);
