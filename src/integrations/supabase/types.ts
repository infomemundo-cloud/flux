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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: number
          ip: string | null
          metadata: Json
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: number
          ip?: string | null
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: number
          ip?: string | null
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      billing_checkout_intents: {
        Row: {
          consumed_at: string | null
          created_at: string
          id: string
          mp_plan_id: string
          mp_preapproval_id: string | null
          org_id: string
          status: string
          tier_code: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          id?: string
          mp_plan_id: string
          mp_preapproval_id?: string | null
          org_id: string
          status?: string
          tier_code: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          id?: string
          mp_plan_id?: string
          mp_preapproval_id?: string | null
          org_id?: string
          status?: string
          tier_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_checkout_intents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_access_effective"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "billing_checkout_intents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          action: string | null
          created_at: string
          error: string | null
          id: string
          live_mode: boolean
          mp_event_id: string
          payload: Json
          processed_at: string | null
          status: Database["public"]["Enums"]["billing_event_status"]
          topic: string
          updated_at: string
        }
        Insert: {
          action?: string | null
          created_at?: string
          error?: string | null
          id?: string
          live_mode?: boolean
          mp_event_id: string
          payload?: Json
          processed_at?: string | null
          status?: Database["public"]["Enums"]["billing_event_status"]
          topic: string
          updated_at?: string
        }
        Update: {
          action?: string | null
          created_at?: string
          error?: string | null
          id?: string
          live_mode?: boolean
          mp_event_id?: string
          payload?: Json
          processed_at?: string | null
          status?: Database["public"]["Enums"]["billing_event_status"]
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
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
            referencedRelation: "org_access_effective"
            referencedColumns: ["org_id"]
          },
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
          avatar_fetched_at: string | null
          avatar_url: string | null
          company: string | null
          created_at: string
          email: string | null
          external_id: string | null
          id: string
          metadata: Json
          name: string | null
          notes: string | null
          org_id: string
          phone: string | null
          tags: Json
          updated_at: string
        }
        Insert: {
          avatar_fetched_at?: string | null
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json
          name?: string | null
          notes?: string | null
          org_id: string
          phone?: string | null
          tags?: Json
          updated_at?: string
        }
        Update: {
          avatar_fetched_at?: string | null
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json
          name?: string | null
          notes?: string | null
          org_id?: string
          phone?: string | null
          tags?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_access_effective"
            referencedColumns: ["org_id"]
          },
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
          file_name: string | null
          from_value: string | null
          id: string
          kind: Database["public"]["Enums"]["event_kind"]
          media_type: string | null
          media_url: string | null
          metadata: Json
          org_id: string
          to_value: string | null
        }
        Insert: {
          actor_id?: string | null
          content?: string | null
          created_at?: string
          demanda_id: string
          file_name?: string | null
          from_value?: string | null
          id?: string
          kind: Database["public"]["Enums"]["event_kind"]
          media_type?: string | null
          media_url?: string | null
          metadata?: Json
          org_id: string
          to_value?: string | null
        }
        Update: {
          actor_id?: string | null
          content?: string | null
          created_at?: string
          demanda_id?: string
          file_name?: string | null
          from_value?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["event_kind"]
          media_type?: string | null
          media_url?: string | null
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
            referencedRelation: "org_access_effective"
            referencedColumns: ["org_id"]
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
            referencedRelation: "org_access_effective"
            referencedColumns: ["org_id"]
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
      demanda_views: {
        Row: {
          demanda_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          demanda_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          demanda_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "demanda_views_demanda_id_fkey"
            columns: ["demanda_id"]
            isOneToOne: false
            referencedRelation: "demandas"
            referencedColumns: ["id"]
          },
        ]
      }
      demandas: {
        Row: {
          assignee_id: string | null
          category: string | null
          channel_id: string | null
          channel_type: Database["public"]["Enums"]["demanda_channel_type"]
          closed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          instance_name: string | null
          last_message_at: string | null
          last_message_id: string | null
          last_message_preview: string | null
          org_id: string
          priority: Database["public"]["Enums"]["demanda_priority"]
          protocol: string | null
          resolved_at: string | null
          state: Database["public"]["Enums"]["demanda_state"]
          title: string
          updated_at: string
          whatsapp_jid: string | null
        }
        Insert: {
          assignee_id?: string | null
          category?: string | null
          channel_id?: string | null
          channel_type?: Database["public"]["Enums"]["demanda_channel_type"]
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          instance_name?: string | null
          last_message_at?: string | null
          last_message_id?: string | null
          last_message_preview?: string | null
          org_id: string
          priority?: Database["public"]["Enums"]["demanda_priority"]
          protocol?: string | null
          resolved_at?: string | null
          state?: Database["public"]["Enums"]["demanda_state"]
          title: string
          updated_at?: string
          whatsapp_jid?: string | null
        }
        Update: {
          assignee_id?: string | null
          category?: string | null
          channel_id?: string | null
          channel_type?: Database["public"]["Enums"]["demanda_channel_type"]
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          instance_name?: string | null
          last_message_at?: string | null
          last_message_id?: string | null
          last_message_preview?: string | null
          org_id?: string
          priority?: Database["public"]["Enums"]["demanda_priority"]
          protocol?: string | null
          resolved_at?: string | null
          state?: Database["public"]["Enums"]["demanda_state"]
          title?: string
          updated_at?: string
          whatsapp_jid?: string | null
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
            referencedRelation: "org_access_effective"
            referencedColumns: ["org_id"]
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
      feature_flag_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          flag_id: string
          id: string
          org_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled: boolean
          flag_id: string
          id?: string
          org_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          flag_id?: string
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flag_overrides_flag_id_fkey"
            columns: ["flag_id"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_flag_overrides_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_access_effective"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "feature_flag_overrides_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          default_state: boolean
          description: string
          enabled_for_tags: string[]
          id: string
          key: string
          rollout_percent: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          default_state?: boolean
          description?: string
          enabled_for_tags?: string[]
          id?: string
          key: string
          rollout_percent?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          default_state?: boolean
          description?: string
          enabled_for_tags?: string[]
          id?: string
          key?: string
          rollout_percent?: number
          updated_at?: string
        }
        Relationships: []
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
            referencedRelation: "org_access_effective"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          due_at: string | null
          failure_reason: string | null
          id: string
          mp_payment_id: string | null
          org_id: string
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          due_at?: string | null
          failure_reason?: string | null
          id?: string
          mp_payment_id?: string | null
          org_id: string
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          due_at?: string | null
          failure_reason?: string | null
          id?: string
          mp_payment_id?: string | null
          org_id?: string
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_access_effective"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
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
            referencedRelation: "org_access_effective"
            referencedColumns: ["org_id"]
          },
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
          allow_group_ingest: boolean
          auto_assign_enabled: boolean
          auto_assign_mode: string
          created_at: string
          created_by: string
          id: string
          last_assigned_user_id: string | null
          logo_url: string | null
          name: string
          onboarding_dismissed_at: string | null
          sla_enabled: boolean
          sla_max_inactivity_hours: number
          slug: string
          tags: string[]
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          allow_group_ingest?: boolean
          auto_assign_enabled?: boolean
          auto_assign_mode?: string
          created_at?: string
          created_by: string
          id?: string
          last_assigned_user_id?: string | null
          logo_url?: string | null
          name: string
          onboarding_dismissed_at?: string | null
          sla_enabled?: boolean
          sla_max_inactivity_hours?: number
          slug: string
          tags?: string[]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          allow_group_ingest?: boolean
          auto_assign_enabled?: boolean
          auto_assign_mode?: string
          created_at?: string
          created_by?: string
          id?: string
          last_assigned_user_id?: string | null
          logo_url?: string | null
          name?: string
          onboarding_dismissed_at?: string | null
          sla_enabled?: boolean
          sla_max_inactivity_hours?: number
          slug?: string
          tags?: string[]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_admin_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          role?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: string
          token?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          active: boolean
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          banned_until: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          last_sign_in_at: string | null
          updated_at: string
        }
        Insert: {
          banned_until?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          last_sign_in_at?: string | null
          updated_at?: string
        }
        Update: {
          banned_until?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          last_sign_in_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quick_replies: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          label: string
          org_id: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          org_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_replies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_access_effective"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "quick_replies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_requested_by_user: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          mp_external_reference: string | null
          mp_preapproval_id: string | null
          mp_preapproval_plan_id: string | null
          org_id: string
          plan_code: string
          state: Database["public"]["Enums"]["tenant_subscription_state"]
          updated_at: string
        }
        Insert: {
          cancel_requested_by_user?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          mp_external_reference?: string | null
          mp_preapproval_id?: string | null
          mp_preapproval_plan_id?: string | null
          org_id: string
          plan_code: string
          state?: Database["public"]["Enums"]["tenant_subscription_state"]
          updated_at?: string
        }
        Update: {
          cancel_requested_by_user?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          mp_external_reference?: string | null
          mp_preapproval_id?: string | null
          mp_preapproval_plan_id?: string | null
          org_id?: string
          plan_code?: string
          state?: Database["public"]["Enums"]["tenant_subscription_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_access_effective"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "tiers"
            referencedColumns: ["code"]
          },
        ]
      }
      tiers: {
        Row: {
          code: string
          created_at: string
          limits: Json
          name: string
          position: number
          price_cents: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          limits?: Json
          name: string
          position?: number
          price_cents?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          limits?: Json
          name?: string
          position?: number
          price_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
      webhook_delivery_logs: {
        Row: {
          action: string
          created_at: string
          demanda_id: string | null
          error: string | null
          id: number
          latency_ms: number | null
          org_id: string | null
          outcome: string
          payload: Json
          protocol: string | null
          status: number | null
          token_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          demanda_id?: string | null
          error?: string | null
          id?: number
          latency_ms?: number | null
          org_id?: string | null
          outcome: string
          payload?: Json
          protocol?: string | null
          status?: number | null
          token_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          demanda_id?: string | null
          error?: string | null
          id?: number
          latency_ms?: number | null
          org_id?: string | null
          outcome?: string
          payload?: Json
          protocol?: string | null
          status?: number | null
          token_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_delivery_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_access_effective"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "webhook_delivery_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_delivery_logs_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "webhook_tokens"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "org_access_effective"
            referencedColumns: ["org_id"]
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
      whatsapp_settings: {
        Row: {
          api_key: string | null
          auto_reply_enabled: boolean
          base_url: string | null
          connected_at: string | null
          connected_number: string | null
          connection_status: string
          created_at: string
          instance_name: string | null
          org_id: string
          updated_at: string
          use_master_credentials: boolean
        }
        Insert: {
          api_key?: string | null
          auto_reply_enabled?: boolean
          base_url?: string | null
          connected_at?: string | null
          connected_number?: string | null
          connection_status?: string
          created_at?: string
          instance_name?: string | null
          org_id: string
          updated_at?: string
          use_master_credentials?: boolean
        }
        Update: {
          api_key?: string | null
          auto_reply_enabled?: boolean
          base_url?: string | null
          connected_at?: string | null
          connected_number?: string | null
          connection_status?: string
          created_at?: string
          instance_name?: string | null
          org_id?: string
          updated_at?: string
          use_master_credentials?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "org_access_effective"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "whatsapp_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      org_access_effective: {
        Row: {
          access_level: Database["public"]["Enums"]["access_level"] | null
          days_left: number | null
          effective_state: string | null
          org_id: string | null
          source: string | null
          subscription_state: string | null
          trial_ends_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      delete_organization_cascade: {
        Args: { p_org_id: string }
        Returns: undefined
      }
      gen_demanda_protocol: { Args: never; Returns: string }
      ingest_upsert_demand: {
        Args: {
          p_channel_id: string
          p_channel_type: Database["public"]["Enums"]["demanda_channel_type"]
          p_contact_id: string
          p_description: string
          p_instance_name: string
          p_message_at: string
          p_message_id: string
          p_org_id: string
          p_preview: string
          p_priority: Database["public"]["Enums"]["demanda_priority"]
          p_title: string
          p_whatsapp_jid: string
        }
        Returns: {
          created: boolean
          demanda_id: string
          protocol: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      access_level: "full" | "readonly" | "blocked"
      app_role: "owner" | "admin" | "agent" | "viewer"
      billing_event_status: "received" | "processed" | "failed" | "ignored"
      channel_kind:
        | "whatsapp"
        | "instagram"
        | "telegram"
        | "email"
        | "portal"
        | "api"
        | "manual"
      demanda_channel_type: "simulation" | "evolution" | "whatsapp_official"
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
      invoice_status:
        | "scheduled"
        | "processing"
        | "retrying"
        | "paid"
        | "failed"
      tenant_subscription_state:
        | "active"
        | "grace_period"
        | "past_due"
        | "canceled_by_user"
        | "canceled_by_dunning"
        | "suspended"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      access_level: ["full", "readonly", "blocked"],
      app_role: ["owner", "admin", "agent", "viewer"],
      billing_event_status: ["received", "processed", "failed", "ignored"],
      channel_kind: [
        "whatsapp",
        "instagram",
        "telegram",
        "email",
        "portal",
        "api",
        "manual",
      ],
      demanda_channel_type: ["simulation", "evolution", "whatsapp_official"],
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
      invoice_status: ["scheduled", "processing", "retrying", "paid", "failed"],
      tenant_subscription_state: [
        "active",
        "grace_period",
        "past_due",
        "canceled_by_user",
        "canceled_by_dunning",
        "suspended",
      ],
    },
  },
} as const
