export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      drivers: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          license: string;
          license_expires_on: string;
          name: string;
          organization_id: string;
          phone: string;
          row_version: number;
          status: string;
        };
        Insert: {
          created_at?: string;
          email?: string;
          id?: string;
          license: string;
          license_expires_on: string;
          name: string;
          organization_id: string;
          phone?: string;
          row_version?: number;
          status?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          license?: string;
          license_expires_on?: string;
          name?: string;
          organization_id?: string;
          phone?: string;
          row_version?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "drivers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      finance_entries: {
        Row: {
          amount_cents: number;
          category: string;
          concept: string;
          created_at: string;
          date: string;
          distance_km: number;
          id: string;
          kind: string;
          organization_id: string;
          payment_status: string;
          row_version: number;
          source_record_id: string | null;
          truck_id: string;
        };
        Insert: {
          amount_cents: number;
          category: string;
          concept: string;
          created_at?: string;
          date: string;
          distance_km?: number;
          id?: string;
          kind: string;
          organization_id: string;
          payment_status?: string;
          row_version?: number;
          source_record_id?: string | null;
          truck_id: string;
        };
        Update: {
          amount_cents?: number;
          category?: string;
          concept?: string;
          created_at?: string;
          date?: string;
          distance_km?: number;
          id?: string;
          kind?: string;
          organization_id?: string;
          payment_status?: string;
          row_version?: number;
          source_record_id?: string | null;
          truck_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "finance_entries_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "finance_entries_organization_id_truck_id_fkey";
            columns: ["organization_id", "truck_id"];
            isOneToOne: false;
            referencedRelation: "trucks";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          owner_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          owner_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          owner_id?: string;
        };
        Relationships: [];
      };
      trucks: {
        Row: {
          brand: string;
          created_at: string;
          driver_id: string | null;
          id: string;
          inspection_due_on: string;
          model: string;
          odometer_km: number;
          organization_id: string;
          plate: string;
          route: string;
          row_version: number;
          status: string;
          year: number;
        };
        Insert: {
          brand: string;
          created_at?: string;
          driver_id?: string | null;
          id?: string;
          inspection_due_on: string;
          model: string;
          odometer_km?: number;
          organization_id: string;
          plate: string;
          route?: string;
          row_version?: number;
          status?: string;
          year: number;
        };
        Update: {
          brand?: string;
          created_at?: string;
          driver_id?: string | null;
          id?: string;
          inspection_due_on?: string;
          model?: string;
          odometer_km?: number;
          organization_id?: string;
          plate?: string;
          route?: string;
          row_version?: number;
          status?: string;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: "trucks_organization_id_driver_id_fkey";
            columns: ["organization_id", "driver_id"];
            isOneToOne: false;
            referencedRelation: "drivers";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "trucks_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      approve_company_invoice: {
        Args: {
          p_entry: Json;
          p_invoice_id: string;
          p_organization_id: string;
        };
        Returns: string;
      };
      company_ai_budget_server: {
        Args: { p_action: string; p_data: Json };
        Returns: Json;
      };
      company_auth_mail_config: { Args: never; Returns: Json };
      company_auth_mail_consent: {
        Args: {
          p_authenticated?: boolean;
          p_request_id: string;
          p_user_id: string;
          p_version: string;
        };
        Returns: boolean;
      };
      company_auth_mail_reserve: { Args: { p_data: Json }; Returns: string };
      company_invoice_ai_apply: { Args: { p_data: Json }; Returns: boolean };
      company_mail_server: {
        Args: { p_action: string; p_data: Json };
        Returns: Json;
      };
      company_provider_runtime_config: {
        Args: { p_scope: string };
        Returns: Json;
      };
      get_company_document: {
        Args: { p_document_id: string; p_organization_id: string };
        Returns: unknown[];
        SetofOptions: {
          from: "*";
          to: "company_documents";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_company_gmail: {
        Args: { p_organization_id: string };
        Returns: {
          connected_at: string;
          email: string;
          last_sync_at: string;
          status: string;
        }[];
      };
      gmail_runtime_config: { Args: never; Returns: Json };
      gmail_server: { Args: { p_action: string; p_data: Json }; Returns: Json };
      list_company_documents: {
        Args: { p_organization_id: string };
        Returns: unknown[];
        SetofOptions: {
          from: "*";
          to: "company_documents";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      list_company_invoices: {
        Args: { p_organization_id: string };
        Returns: unknown[];
        SetofOptions: {
          from: "*";
          to: "invoice_documents";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      register_company_document: {
        Args: { p_document: Json; p_organization_id: string };
        Returns: string;
      };
      tc_admin_control: {
        Args: { p_action: string; p_data?: Json };
        Returns: Json;
      };
      tc_backup_page: {
        Args: { p_after?: string; p_kind: string; p_org: string };
        Returns: Json;
      };
      tc_book_record: {
        Args: { p_expected: number; p_org: string; p_record: string };
        Returns: Json;
      };
      tc_company_server_access: {
        Args: { p_org: string; p_user: string };
        Returns: Json;
      };
      tc_consume_document_ai: {
        Args: { p_org: string; p_user: string };
        Returns: boolean;
      };
      tc_delete_record: {
        Args: { p_expected: number; p_id: string; p_org: string };
        Returns: undefined;
      };
      tc_finish_registration: { Args: never; Returns: Json };
      tc_list_records: {
        Args: { p_after?: string; p_org: string };
        Returns: Json;
      };
      tc_my_access: { Args: never; Returns: Json };
      tc_organization_access: { Args: { p_org: string }; Returns: Json };
      tc_platform_server: {
        Args: { p_action: string; p_data: Json };
        Returns: Json;
      };
      tc_public_catalog: { Args: never; Returns: Json };
      tc_recurring_billing: {
        Args: { p_action: string; p_data: Json };
        Returns: Json;
      };
      tc_request_plan: { Args: { p_plan_id: string }; Returns: string };
      tc_save_record: {
        Args: {
          p_expected?: number;
          p_id: string;
          p_kind: string;
          p_org: string;
          p_payload: Json;
        };
        Returns: Json;
      };
      tc_set_ai_opt_in: { Args: { p_enabled: boolean }; Returns: Json };
      tc_team_control: {
        Args: { p_action: string; p_data?: Json; p_org: string };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
