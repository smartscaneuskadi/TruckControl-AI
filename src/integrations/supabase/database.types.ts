import type { Database as DeployedDatabase } from "./database.generated";
/** Domain-facing contract narrows server text fields to the validated enums.
 * database.generated.ts records the schema actually deployed to TruckControl. */
export type DeployedFleetTables = Pick<
  DeployedDatabase["public"]["Tables"],
  "organizations" | "trucks" | "drivers" | "finance_entries"
>;
type Table<
  Row extends { id: string; created_at: string },
  Insert = Omit<Row, "id" | "created_at" | "co_driver_id"> &
    Partial<Pick<Row, "id" | "created_at">> &
    Partial<Pick<Row, Extract<keyof Row, "co_driver_id">>>,
> = { Row: Row; Insert: Insert; Update: Partial<Insert>; Relationships: [] };
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
export interface CompanyDocument {
  id: string;
  organization_id: string;
  name: string;
  object_path: string;
  content_type: string;
  size_bytes: number;
  truck_id: string | null;
  driver_id: string | null;
  created_at: string;
  tracking?: import("../../domain/documents").DocumentTracking;
}
export interface CompanyInvoice {
  id: string;
  organization_id: string;
  message_id: string;
  attachment_id: string;
  content_hash: string;
  document_id: string;
  supplier: string;
  invoice_number: string;
  invoice_date: string | null;
  net_cents: number | null;
  tax_cents: number | null;
  total_cents: number | null;
  currency: string;
  status: "needs_review" | "approved";
  review_note: string;
  finance_entry_id: string | null;
  created_at: string;
  import_source?: "gmail" | "email_upload" | "file_upload" | "forwarded_email";
}
export interface CompanyGmail {
  email: string;
  status: string;
  connected_at: string;
  last_sync_at: string | null;
}
type Scoped = {
  id: string;
  organization_id: string;
  created_at: string;
  row_version: number;
};
export interface Database {
  public: {
    Tables: {
      organizations: Table<{
        id: string;
        owner_id: string;
        name: string;
        created_at: string;
      }>;
      trucks: Table<
        Scoped & {
          plate: string;
          brand: string;
          model: string;
          year: number;
          odometer_km: number;
          status: "on_route" | "available" | "maintenance";
          driver_id: string | null;
          /** New server column defaults to null; INSERT/UPDATE may omit it. */
          co_driver_id: string | null;
          inspection_due_on: string;
          route: string;
        }
      >;
      drivers: Table<
        Scoped & {
          name: string;
          email: string;
          phone: string;
          license: string;
          license_expires_on: string;
          status: "active" | "leave";
        }
      >;
      finance_entries: Table<
        Scoped & {
          truck_id: string;
          kind: "income" | "expense";
          concept: string;
          date: string;
          amount_cents: number;
          category:
            | "transport"
            | "fuel"
            | "maintenance"
            | "payroll"
            | "tolls"
            | "insurance"
            | "other";
          payment_status: "paid" | "pending";
          distance_km: number;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      tc_admin_subscription_incidents: {
        Args: { p_action: string; p_case_id?: string | null; p_expected?: number | null; p_operation_id?: string | null; p_data?: Json; p_after?: string | null };
        Returns: Json;
      };
      tc_admin_manual_subscription_invoices: {
        Args: {
          p_action: string;
          p_task_id?: string | null;
          p_expected?: number | null;
          /** Idempotency ID of the administrative operation, not the purchase. */
          p_request_id?: string | null;
          p_data?: Json;
          p_after?: string | null;
        };
        Returns: Json;
      };
      tc_commercial_backup_page: {
        Args: { p_org: string; p_kind: string; p_after?: string | null };
        Returns: Json;
      };
      tc_company_suppliers: {
        Args: { p_org: string; p_action: string; p_data?: Json };
        Returns: Json;
      };
      tc_trip_finance: {
        Args: { p_org: string; p_action: string; p_data: Json };
        Returns: Json;
      };
      tc_company_copilot: {
        Args: { p_org: string; p_action: string; p_data?: Json };
        Returns: Json;
      };
      tc_company_specialists: {
        Args: { p_org: string; p_action: string; p_data?: Json };
        Returns: Json;
      };
      tc_company_fiscal_control: {
        Args: {
          p_org: string | null;
          p_action: string;
          p_data?: Json;
          p_expected?: number | null;
          p_after?: string | null;
        };
        Returns: Json;
      };
      tc_tyre_page: {
        Args: {
          p_org: string;
          p_kind?: string;
          p_after?: string | null;
          p_tyre?: string | null;
        };
        Returns: Json;
      };
      tc_save_tyre: {
        Args: {
          p_org: string;
          p_id: string;
          p_data: Json;
          p_expected: number | null;
        };
        Returns: Json;
      };
      tc_invoice_page: {
        Args: { p_org: string; p_after?: string | null };
        Returns: Json;
      };
      tc_document_page: {
        Args: { p_org: string; p_after?: string | null };
        Returns: Json;
      };
      tc_update_document_metadata: {
        Args: {
          p_org: string;
          p_document: string;
          p_data: Json;
          p_expected: number;
        };
        Returns: Json;
      };
      tc_register_document: {
        Args: { p_org: string; p_document: Json; p_tracking: Json };
        Returns: string;
      };
      tc_backup_page_v2: {
        Args: { p_org: string; p_kind: string; p_after?: string | null };
        Returns: Json;
      };
      tc_provider_control: {
        Args: { p_action: string; p_data?: Json };
        Returns: Json;
      };
      tc_backup_page: {
        Args: { p_org: string; p_kind: string; p_after?: string | null };
        Returns: Json;
      };
      tc_organization_access: { Args: { p_org: string }; Returns: Json };
      tc_team_control: {
        Args: { p_org: string | null; p_action: string; p_data?: Json };
        Returns: Json;
      };
      tc_list_records: {
        Args: { p_org: string; p_after?: string | null };
        Returns: Json;
      };
      tc_save_record: {
        Args: {
          p_org: string;
          p_id: string;
          p_kind: string;
          p_payload: Json;
          p_expected?: number | null;
        };
        Returns: Json;
      };
      tc_delete_record: {
        Args: { p_org: string; p_id: string; p_expected: number };
        Returns: undefined;
      };
      tc_book_record: {
        Args: { p_org: string; p_record: string; p_expected: number };
        Returns: Json;
      };
      tc_public_catalog: { Args: Record<string, never>; Returns: Json };
      tc_my_access: { Args: Record<string, never>; Returns: Json };
      tc_finish_registration: { Args: Record<string, never>; Returns: Json };
      tc_set_ai_opt_in: { Args: { p_enabled: boolean }; Returns: Json };
      tc_request_plan: { Args: { p_plan_id: string }; Returns: string };
      tc_admin_control: {
        Args: { p_action: string; p_data?: Json };
        Returns: Json;
      };
      list_company_documents: {
        Args: { p_organization_id: string };
        Returns: CompanyDocument[];
      };
      get_company_document: {
        Args: { p_organization_id: string; p_document_id: string };
        Returns: CompanyDocument[];
      };
      register_company_document: {
        Args: { p_organization_id: string; p_document: Json };
        Returns: string;
      };
      get_company_gmail: {
        Args: { p_organization_id: string };
        Returns: CompanyGmail[];
      };
      list_company_invoices: {
        Args: { p_organization_id: string };
        Returns: CompanyInvoice[];
      };
      approve_company_invoice: {
        Args: {
          p_organization_id: string;
          p_invoice_id: string;
          p_entry: Json;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
