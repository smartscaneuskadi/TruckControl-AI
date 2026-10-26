/** Schema contract maintained alongside the initial migration. Regenerate from the
 * target project with the Supabase CLI when the remote adapter is implemented. */
type Table<
  Row extends { id: string; created_at: string },
  Insert = Omit<Row, "id" | "created_at"> &
    Partial<Pick<Row, "id" | "created_at">>,
> = { Row: Row; Insert: Insert; Update: Partial<Insert>; Relationships: [] };
type Scoped = { id: string; organization_id: string; created_at: string };
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
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
