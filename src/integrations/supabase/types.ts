export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      channels: {
        Row: {
          active: boolean
          config: Json
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["channel_kind"]
          name: string
          org_id: string
        }
        Insert: {
          active?: boolean
          config?: Json
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["channel_kind"]
          name: string
          org_id: string
        }
        Update: {
          active?: boolean
          config?: Json
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["channel_kind"]
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          email: string | null
          external_id: string | null
          id: string
          metadata: Json
          name: string | null
          org_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json
          name?: string | null
          org_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json
          name?: string | null
          org_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      demanda_events: {
        Row: {
          actor_id: string | null
          content: string | null
          created_at: string
          demanda_id: string
          from_value: string | null
          id: string
          kind: Database["public"]["Enums"]["event_kind"]
          metadata: Json
          org_id: string
          to_value: string | null
        }
        Insert: {
          actor_id?: string | null
          content?: string | null
          created_at?: string
          demanda_id: string
          from_value?: string | null
          id?: string
          kind: Database["public"]["Enums"]["event_kind"]
          metadata?: Json
          org_id: string
          to_value?: string | null
        }
        Update: {
          actor_id?: string | null
          content?: string | null
          created_at?: string
          demanda_id?: string
          from_value?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["event_kind"]
          metadata?: Json
          org_id?: string
          to_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demanda_events_demanda_id_fkey"
            columns: ["demanda_id"]
            isOneToOne: false
            referencedRelation: "demandas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demanda_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      demanda_status_audit: {
        Row: {
          actor_id: string | null
          changed_at: string
          demanda_id: string
          from_state: string | null
          id: string
          is_ai_generated: boolean
          org_id: string
          to_state: string
        }
        Insert: {
          actor_id?: string | null
          changed_at?: string
          demanda_id: string
          from_state?: string | null
          id?: string
          is_ai_generated?: boolean
          org_id: string
          to_state: string
        }
        Update: {
          actor_id?: string | null
          changed_at?: string
          demanda_id?: string
          from_state?: string | null
          id?: string
          is_ai_generated?: boolean
          org_id?: string
          to_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "demanda_status_audit_demanda_id_fkey"
            columns: ["demanda_id"]
            isOneToOne: false
            referencedRelation: "demandas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demanda_status_audit_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      demandas: {
        Row: {
          assignee_id: string | null
          category: string | null
          channel_id: string | null
          closed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          org_id: string
          priority: Database["public"]["Enums"]["demanda_priority"]
          resolved_at: string | null
          state: Database["public"]["Enums"]["demanda_state"]
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          category?: string | null
          channel_id?: string | null
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          org_id: string
          priority?: Database["public"]["Enums"]["demanda_priority"]
          resolved_at?: string | null
          state?: Database["public"]["Enums"]["demanda_state"]
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          category?: string | null
          channel_id?: string | null
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          org_id?: string
          priority?: Database["public"]["Enums"]["demanda_priority"]
          resolved_at?: string | null
          state?: Database["public"]["Enums"]["demanda_state"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "demandas_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandas_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_role: string | null
          created_at: string
          email: string | null
          id: string
          invited_by: string | null
          org_id: string
          requested_by: string | null
          status: string
          suggested_role: string
          token: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_role?: string | null
          created_at?: string
          email?: string | null
          id?: string
          invited_by?: string | null
          org_id: string
          requested_by?: string | null
          status?: string
          suggested_role?: string
          token: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_role?: string | null
          created_at?: string
          email?: string | null
          id?: string
          invited_by?: string | null
          org_id?: string
          requested_by?: string | null
          status?: string
          suggested_role?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      webhook_tokens: {
        Row: {
          channel_id: string | null
          created_at: string
          created_by: string | null
          id: string
          last_used_at: string | null
          name: string
          org_id: string
          token: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_used_at?: string | null
          name: string
          org_id: string
          token: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          org_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_tokens_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "owner" | "admin" | "agent" | "viewer"
      channel_kind:
        | "whatsapp"
        | "instagram"
        | "telegram"
        | "email"
        | "portal"
        | "api"
        | "manual"
      demanda_priority: "baixa" | "media" | "alta" | "urgente"
      demanda_state:
        | "novo"
        | "em_analise"
        | "aguardando_cliente"
        | "aguardando_revisao_humana"
        | "concluido"
      event_kind:
        | "created"
        | "state_changed"
        | "assigned"
        | "commented"
        | "message_in"
        | "message_out"
        | "due_updated"
        | "priority_changed"
        | "closed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "admin", "agent", "viewer"],
      channel_kind: [
        "whatsapp",
        "instagram",
        "telegram",
        "email",
        "portal",
        "api",
        "manual",
      ],
      demanda_priority: ["baixa", "media", "alta", "urgente"],
      demanda_state: [
        "novo",
        "em_analise",
        "aguardando_cliente",
        "aguardando_revisao_humana",
        "concluido",
      ],
      event_kind: [
        "created",
        "state_changed",
        "assigned",
        "commented",
        "message_in",
        "message_out",
        "due_updated",
        "priority_changed",
        "closed",
      ],
    },
  },
} as const
