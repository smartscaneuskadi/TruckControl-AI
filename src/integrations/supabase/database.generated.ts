// Generated from project crcdrxbioyberfibrzuw after the TruckControl migrations.
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
      plans: {
        Row: {
          created_at: string;
          id: string;
          included_users: number | null;
          name: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          included_users?: number | null;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          included_users?: number | null;
          name?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          created_at: string;
          external_customer_id: string | null;
          external_subscription_id: string | null;
          id: string;
          plan_id: string;
          status: string;
          user_limit_override: number | null;
          workshop_id: string;
        };
        Insert: {
          created_at?: string;
          external_customer_id?: string | null;
          external_subscription_id?: string | null;
          id?: string;
          plan_id: string;
          status?: string;
          user_limit_override?: number | null;
          workshop_id: string;
        };
        Update: {
          created_at?: string;
          external_customer_id?: string | null;
          external_subscription_id?: string | null;
          id?: string;
          plan_id?: string;
          status?: string;
          user_limit_override?: number | null;
          workshop_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_workshop_id_fkey";
            columns: ["workshop_id"];
            isOneToOne: true;
            referencedRelation: "workshops";
            referencedColumns: ["id"];
          },
        ];
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
      workshop_members: {
        Row: {
          active: boolean;
          created_at: string;
          role: string;
          user_id: string;
          workshop_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          role: string;
          user_id: string;
          workshop_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          role?: string;
          user_id?: string;
          workshop_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workshop_members_workshop_id_fkey";
            columns: ["workshop_id"];
            isOneToOne: false;
            referencedRelation: "workshops";
            referencedColumns: ["id"];
          },
        ];
      };
      workshops: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          status: string;
          tax_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          status?: string;
          tax_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          status?: string;
          tax_id?: string | null;
        };
        Relationships: [];
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
      gmail_server: { Args: { p_action: string; p_data: Json }; Returns: Json };
      is_workshop_admin: { Args: { p_workshop_id: string }; Returns: boolean };
      is_workshop_member: { Args: { p_workshop_id: string }; Returns: boolean };
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
      tc_finish_registration: { Args: never; Returns: Json };
      tc_my_access: { Args: never; Returns: Json };
      tc_platform_server: {
        Args: { p_action: string; p_data: Json };
        Returns: Json;
      };
      tc_public_catalog: { Args: never; Returns: Json };
      tc_request_plan: { Args: { p_plan_id: string }; Returns: string };
      tc_set_ai_opt_in: { Args: { p_enabled: boolean }; Returns: Json };
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
