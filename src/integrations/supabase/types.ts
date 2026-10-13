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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_errors: {
        Row: {
          count: number
          day: string
          fingerprint: string
          first_seen: string
          id: string
          kind: string
          last_seen: string
          message: string
          path: string | null
          stack: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          count?: number
          day?: string
          fingerprint: string
          first_seen?: string
          id?: string
          kind: string
          last_seen?: string
          message: string
          path?: string | null
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          count?: number
          day?: string
          fingerprint?: string
          first_seen?: string
          id?: string
          kind?: string
          last_seen?: string
          message?: string
          path?: string | null
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          android_url: string | null
          featured_month_price: number
          featured_week_price: number
          finishing_ratios: Json
          id: number
          ios_url: string | null
          last_backup_at: string | null
          response_sla_minutes: number
          show_demo: boolean
          subscription_grace_days: number
          transfer_enabled: boolean
          transfer_max_companies: number
          updated_at: string
          updated_by: string | null
          work_end_hour: number
          work_start_hour: number
        }
        Insert: {
          android_url?: string | null
          featured_month_price?: number
          featured_week_price?: number
          finishing_ratios?: Json
          id?: number
          ios_url?: string | null
          last_backup_at?: string | null
          response_sla_minutes?: number
          show_demo?: boolean
          subscription_grace_days?: number
          transfer_enabled?: boolean
          transfer_max_companies?: number
          updated_at?: string
          updated_by?: string | null
          work_end_hour?: number
          work_start_hour?: number
        }
        Update: {
          android_url?: string | null
          featured_month_price?: number
          featured_week_price?: number
          finishing_ratios?: Json
          id?: number
          ios_url?: string | null
          last_backup_at?: string | null
          response_sla_minutes?: number
          show_demo?: boolean
          subscription_grace_days?: number
          transfer_enabled?: boolean
          transfer_max_companies?: number
          updated_at?: string
          updated_by?: string | null
          work_end_hour?: number
          work_start_hour?: number
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          actor_label: string | null
          at: string
          changes: Json
          id: number
          row_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor?: string | null
          actor_label?: string | null
          at?: string
          changes?: Json
          id?: never
          row_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor?: string | null
          actor_label?: string | null
          at?: string
          changes?: Json
          id?: never
          row_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      auth_events: {
        Row: {
          created_at: string
          detail: string | null
          event: string
          id: string
          phone_masked: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: string | null
          event: string
          id?: string
          phone_masked?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: string | null
          event?: string
          id?: string
          phone_masked?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      brokers: {
        Row: {
          account_type: string
          address: string | null
          areas: string[]
          bio: string | null
          commercial_register: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          facebook: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          name: string
          phone: string | null
          photo_url: string | null
          plan_id: string | null
          rejected_at: string | null
          review_note: string | null
          show_contact: boolean
          slug: string
          specialty: string | null
          suspended_at: string | null
          updated_at: string
          user_id: string | null
          whatsapp: string | null
        }
        Insert: {
          account_type?: string
          address?: string | null
          areas?: string[]
          bio?: string | null
          commercial_register?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          facebook?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          name: string
          phone?: string | null
          photo_url?: string | null
          plan_id?: string | null
          rejected_at?: string | null
          review_note?: string | null
          show_contact?: boolean
          slug: string
          specialty?: string | null
          suspended_at?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
        }
        Update: {
          account_type?: string
          address?: string | null
          areas?: string[]
          bio?: string | null
          commercial_register?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          facebook?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          name?: string
          phone?: string | null
          photo_url?: string | null
          plan_id?: string | null
          rejected_at?: string | null
          review_note?: string | null
          show_contact?: boolean
          slug?: string
          specialty?: string | null
          suspended_at?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brokers_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_payments: {
        Row: {
          amount: number
          commission_id: string
          created_at: string
          id: string
          method: string
          notes: string | null
          paid_on: string
          proof_path: string | null
          recorded_by: string | null
          reference: string | null
        }
        Insert: {
          amount: number
          commission_id: string
          created_at?: string
          id?: string
          method?: string
          notes?: string | null
          paid_on?: string
          proof_path?: string | null
          recorded_by?: string | null
          reference?: string | null
        }
        Update: {
          amount?: number
          commission_id?: string
          created_at?: string
          id?: string
          method?: string
          notes?: string | null
          paid_on?: string
          proof_path?: string | null
          recorded_by?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_payments_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: false
            referencedRelation: "commissions"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          agreement_id: string | null
          approved_at: string | null
          approved_by: string | null
          basis_value: number | null
          broker_id: string | null
          commission_no: number
          created_at: string
          deal_id: string
          due_date: string | null
          due_reminded_on: string | null
          expected_amount: number | null
          fixed_amount: number | null
          id: string
          paid_amount: number
          rate: number | null
          status: string
          status_note: string | null
          updated_at: string
        }
        Insert: {
          agreement_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          basis_value?: number | null
          broker_id?: string | null
          commission_no?: never
          created_at?: string
          deal_id: string
          due_date?: string | null
          due_reminded_on?: string | null
          expected_amount?: number | null
          fixed_amount?: number | null
          id?: string
          paid_amount?: number
          rate?: number | null
          status?: string
          status_note?: string | null
          updated_at?: string
        }
        Update: {
          agreement_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          basis_value?: number | null
          broker_id?: string | null
          commission_no?: never
          created_at?: string
          deal_id?: string
          due_date?: string | null
          due_reminded_on?: string | null
          expected_amount?: number | null
          fixed_amount?: number | null
          id?: string
          paid_amount?: number
          rate?: number | null
          status?: string
          status_note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "company_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      company_agreements: {
        Row: {
          approved_at: string
          approved_by: string | null
          broker_id: string
          created_at: string
          deal_type: string
          effective_from: string
          effective_to: string | null
          fixed_amount: number | null
          id: string
          notes: string | null
          rate: number | null
        }
        Insert: {
          approved_at?: string
          approved_by?: string | null
          broker_id: string
          created_at?: string
          deal_type?: string
          effective_from?: string
          effective_to?: string | null
          fixed_amount?: number | null
          id?: string
          notes?: string | null
          rate?: number | null
        }
        Update: {
          approved_at?: string
          approved_by?: string | null
          broker_id?: string
          created_at?: string
          deal_type?: string
          effective_from?: string
          effective_to?: string | null
          fixed_amount?: number | null
          id?: string
          notes?: string | null
          rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "company_agreements_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          added_by: string | null
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string
          role: string
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone: string
          role?: string
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
        ]
      }
      compounds: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          lat: number | null
          lng: number | null
          location: string | null
          logo_url: string | null
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          location?: string | null
          logo_url?: string | null
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          location?: string | null
          logo_url?: string | null
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      deal_documents: {
        Row: {
          created_at: string
          deal_id: string
          file_name: string
          file_path: string
          id: string
          kind: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          deal_id: string
          file_name: string
          file_path: string
          id?: string
          kind: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          deal_id?: string
          file_name?: string
          file_path?: string
          id?: string
          kind?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_documents_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          broker_id: string | null
          contract_date: string | null
          contract_value: number | null
          created_at: string
          created_by: string | null
          deal_no: number
          deal_type: string
          docs_reminded_at: string | null
          id: string
          lead_id: string
          project_unit_id: string | null
          property_id: string | null
          rent_end: string | null
          rent_monthly: number | null
          rent_start: string | null
          reservation_amount: number | null
          reservation_date: string | null
          review_note: string | null
          review_reminded_at: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          sale_date: string | null
          sale_requested_at: string | null
          sale_value: number | null
          unit_desc: string | null
          updated_at: string
        }
        Insert: {
          broker_id?: string | null
          contract_date?: string | null
          contract_value?: number | null
          created_at?: string
          created_by?: string | null
          deal_no?: never
          deal_type?: string
          docs_reminded_at?: string | null
          id?: string
          lead_id: string
          project_unit_id?: string | null
          property_id?: string | null
          rent_end?: string | null
          rent_monthly?: number | null
          rent_start?: string | null
          reservation_amount?: number | null
          reservation_date?: string | null
          review_note?: string | null
          review_reminded_at?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sale_date?: string | null
          sale_requested_at?: string | null
          sale_value?: number | null
          unit_desc?: string | null
          updated_at?: string
        }
        Update: {
          broker_id?: string | null
          contract_date?: string | null
          contract_value?: number | null
          created_at?: string
          created_by?: string | null
          deal_no?: never
          deal_type?: string
          docs_reminded_at?: string | null
          id?: string
          lead_id?: string
          project_unit_id?: string | null
          property_id?: string | null
          rent_end?: string | null
          rent_monthly?: number | null
          rent_start?: string | null
          reservation_amount?: number | null
          reservation_date?: string | null
          review_note?: string | null
          review_reminded_at?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sale_date?: string | null
          sale_requested_at?: string | null
          sale_value?: number | null
          unit_desc?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_project_unit_id_fkey"
            columns: ["project_unit_id"]
            isOneToOne: false
            referencedRelation: "project_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          property_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          property_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          property_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      industrial_activities: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      industrial_zones: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      investment_opportunities: {
        Row: {
          activity: string
          area: string
          broker_id: string | null
          built_area: number | null
          city: string
          created_at: string
          deal_kind: string
          details: string | null
          expected_return: number | null
          id: string
          images: string[]
          investment_max: number | null
          investment_min: number | null
          is_featured: boolean
          kind: string
          land_area: number | null
          lat: number | null
          licenses: string | null
          lng: number | null
          location_note: string | null
          offered_share: number | null
          opp_no: number
          review_note: string | null
          review_status: string
          submitted_by: string | null
          teaser: string
          title: string
          updated_at: string
        }
        Insert: {
          activity: string
          area: string
          broker_id?: string | null
          built_area?: number | null
          city: string
          created_at?: string
          deal_kind: string
          details?: string | null
          expected_return?: number | null
          id?: string
          images?: string[]
          investment_max?: number | null
          investment_min?: number | null
          is_featured?: boolean
          kind: string
          land_area?: number | null
          lat?: number | null
          licenses?: string | null
          lng?: number | null
          location_note?: string | null
          offered_share?: number | null
          opp_no?: never
          review_note?: string | null
          review_status?: string
          submitted_by?: string | null
          teaser: string
          title: string
          updated_at?: string
        }
        Update: {
          activity?: string
          area?: string
          broker_id?: string | null
          built_area?: number | null
          city?: string
          created_at?: string
          deal_kind?: string
          details?: string | null
          expected_return?: number | null
          id?: string
          images?: string[]
          investment_max?: number | null
          investment_min?: number | null
          is_featured?: boolean
          kind?: string
          land_area?: number | null
          lat?: number | null
          licenses?: string | null
          lng?: number | null
          location_note?: string | null
          offered_share?: number | null
          opp_no?: never
          review_note?: string | null
          review_status?: string
          submitted_by?: string | null
          teaser?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_opportunities_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_requests: {
        Row: {
          budget: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          investor_id: string
          lead_id: string | null
          message: string | null
          name: string
          opportunity_id: string
          status: string
        }
        Insert: {
          budget?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          investor_id?: string
          lead_id?: string | null
          message?: string | null
          name: string
          opportunity_id: string
          status?: string
        }
        Update: {
          budget?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          investor_id?: string
          lead_id?: string | null
          message?: string | null
          name?: string
          opportunity_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_requests_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_requests_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "investment_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_profiles: {
        Row: {
          areas: string[]
          budget_max: number | null
          budget_min: number | null
          created_at: string
          kinds: string[]
          name: string
          notify: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          areas?: string[]
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string
          kinds?: string[]
          name: string
          notify?: boolean
          updated_at?: string
          user_id?: string
        }
        Update: {
          areas?: string[]
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string
          kinds?: string[]
          name?: string
          notify?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      job_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: number
          job: string
          result: Json | null
          started_at: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: never
          job: string
          result?: Json | null
          started_at?: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: never
          job?: string
          result?: Json | null
          started_at?: string
        }
        Relationships: []
      }
      lead_activities: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          kind: string
          lead_id: string
          outcome: string | null
          summary: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          kind: string
          lead_id: string
          outcome?: string | null
          summary: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          lead_id?: string
          outcome?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_assignments: {
        Row: {
          broker_id: string | null
          changed_by: string | null
          created_at: string
          deadline_at: string | null
          end_reason: string | null
          ended_at: string | null
          id: string
          lead_id: string
          member_id: string | null
          note: string | null
          outcome: string | null
          source: string | null
          staff_id: string | null
        }
        Insert: {
          broker_id?: string | null
          changed_by?: string | null
          created_at?: string
          deadline_at?: string | null
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          lead_id: string
          member_id?: string | null
          note?: string | null
          outcome?: string | null
          source?: string | null
          staff_id?: string | null
        }
        Update: {
          broker_id?: string | null
          changed_by?: string | null
          created_at?: string
          deadline_at?: string | null
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          lead_id?: string
          member_id?: string | null
          note?: string | null
          outcome?: string | null
          source?: string | null
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_assignments_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_assignments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_assignments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          admin_queue_at: string | null
          admin_queue_reason: string | null
          area: string | null
          asking_price: number | null
          assigned_broker_id: string | null
          assigned_member_id: string | null
          assigned_staff_id: string | null
          budget: number | null
          campaign: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          details: string | null
          external_ref: string | null
          first_broker_id: string | null
          first_referred_at: string | null
          first_response_at: string | null
          first_response_by: string | null
          first_response_outcome: string | null
          follow_up_at: string | null
          id: string
          kind: string
          lead_no: number
          lost_reason: string | null
          name: string
          notes: string | null
          opportunity_id: string | null
          original_source: string
          phone: string
          phone_norm: string | null
          phone_verified: boolean
          project_id: string | null
          project_unit_id: string | null
          property_id: string | null
          property_type: string | null
          purpose: string | null
          referred_at: string | null
          reminded_follow_up_at: string | null
          reminded_visit_at: string | null
          routed_rule_id: string | null
          size_m2: number | null
          sla_alerted_at: string | null
          sla_escalated_at: string | null
          source: string
          source_note: string | null
          stage: Database["public"]["Enums"]["lead_stage"]
          stage_changed_at: string | null
          transfer_deadline_at: string | null
          updated_at: string
          utm: Json | null
          via_broker_id: string | null
          visit_at: string | null
        }
        Insert: {
          admin_queue_at?: string | null
          admin_queue_reason?: string | null
          area?: string | null
          asking_price?: number | null
          assigned_broker_id?: string | null
          assigned_member_id?: string | null
          assigned_staff_id?: string | null
          budget?: number | null
          campaign?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          details?: string | null
          external_ref?: string | null
          first_broker_id?: string | null
          first_referred_at?: string | null
          first_response_at?: string | null
          first_response_by?: string | null
          first_response_outcome?: string | null
          follow_up_at?: string | null
          id?: string
          kind?: string
          lead_no?: never
          lost_reason?: string | null
          name: string
          notes?: string | null
          opportunity_id?: string | null
          original_source: string
          phone: string
          phone_norm?: string | null
          phone_verified?: boolean
          project_id?: string | null
          project_unit_id?: string | null
          property_id?: string | null
          property_type?: string | null
          purpose?: string | null
          referred_at?: string | null
          reminded_follow_up_at?: string | null
          reminded_visit_at?: string | null
          routed_rule_id?: string | null
          size_m2?: number | null
          sla_alerted_at?: string | null
          sla_escalated_at?: string | null
          source?: string
          source_note?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          stage_changed_at?: string | null
          transfer_deadline_at?: string | null
          updated_at?: string
          utm?: Json | null
          via_broker_id?: string | null
          visit_at?: string | null
        }
        Update: {
          admin_queue_at?: string | null
          admin_queue_reason?: string | null
          area?: string | null
          asking_price?: number | null
          assigned_broker_id?: string | null
          assigned_member_id?: string | null
          assigned_staff_id?: string | null
          budget?: number | null
          campaign?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          details?: string | null
          external_ref?: string | null
          first_broker_id?: string | null
          first_referred_at?: string | null
          first_response_at?: string | null
          first_response_by?: string | null
          first_response_outcome?: string | null
          follow_up_at?: string | null
          id?: string
          kind?: string
          lead_no?: never
          lost_reason?: string | null
          name?: string
          notes?: string | null
          opportunity_id?: string | null
          original_source?: string
          phone?: string
          phone_norm?: string | null
          phone_verified?: boolean
          project_id?: string | null
          project_unit_id?: string | null
          property_id?: string | null
          property_type?: string | null
          purpose?: string | null
          referred_at?: string | null
          reminded_follow_up_at?: string | null
          reminded_visit_at?: string | null
          routed_rule_id?: string | null
          size_m2?: number | null
          sla_alerted_at?: string | null
          sla_escalated_at?: string | null
          source?: string
          source_note?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          stage_changed_at?: string | null
          transfer_deadline_at?: string | null
          updated_at?: string
          utm?: Json | null
          via_broker_id?: string | null
          visit_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_broker_id_fkey"
            columns: ["assigned_broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_assigned_member_id_fkey"
            columns: ["assigned_member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_first_broker_id_fkey"
            columns: ["first_broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "investment_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_project_unit_id_fkey"
            columns: ["project_unit_id"]
            isOneToOne: false
            referencedRelation: "project_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_routed_rule_id_fkey"
            columns: ["routed_rule_id"]
            isOneToOne: false
            referencedRelation: "routing_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_via_broker_id_fkey"
            columns: ["via_broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
        ]
      }
      malls: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          kind: string
          lat: number | null
          lng: number | null
          location: string | null
          logo_url: string | null
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          lat?: number | null
          lng?: number | null
          location?: string | null
          logo_url?: string | null
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          lat?: number | null
          lng?: number | null
          location?: string | null
          logo_url?: string | null
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          updated_at: string
          user_id: string
          whatsapp_enabled: boolean
          whatsapp_phone: string | null
          whatsapp_types: string[]
        }
        Insert: {
          created_at?: string
          updated_at?: string
          user_id: string
          whatsapp_enabled?: boolean
          whatsapp_phone?: string | null
          whatsapp_types?: string[]
        }
        Update: {
          created_at?: string
          updated_at?: string
          user_id?: string
          whatsapp_enabled?: boolean
          whatsapp_phone?: string | null
          whatsapp_types?: string[]
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          metadata: Json
          related_id: string | null
          related_url: string | null
          title: string
          type: string
          user_id: string
          whatsapp_error: string | null
          whatsapp_message_id: string | null
          whatsapp_sent_at: string | null
          whatsapp_status: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json
          related_id?: string | null
          related_url?: string | null
          title: string
          type: string
          user_id: string
          whatsapp_error?: string | null
          whatsapp_message_id?: string | null
          whatsapp_sent_at?: string | null
          whatsapp_status?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json
          related_id?: string | null
          related_url?: string | null
          title?: string
          type?: string
          user_id?: string
          whatsapp_error?: string | null
          whatsapp_message_id?: string | null
          whatsapp_sent_at?: string | null
          whatsapp_status?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          broker_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          failed_reason: string | null
          feature_days: number | null
          id: string
          method: string | null
          note: string | null
          paid_at: string | null
          payment_no: number
          period: string | null
          plan_id: string | null
          property_id: string | null
          provider: string
          provider_order_id: string | null
          provider_txn_id: string | null
          purpose: string
          refunded_at: string | null
          status: string
        }
        Insert: {
          amount: number
          broker_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          failed_reason?: string | null
          feature_days?: number | null
          id?: string
          method?: string | null
          note?: string | null
          paid_at?: string | null
          payment_no?: never
          period?: string | null
          plan_id?: string | null
          property_id?: string | null
          provider?: string
          provider_order_id?: string | null
          provider_txn_id?: string | null
          purpose: string
          refunded_at?: string | null
          status?: string
        }
        Update: {
          amount?: number
          broker_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          failed_reason?: string | null
          feature_days?: number | null
          id?: string
          method?: string | null
          note?: string | null
          paid_at?: string | null
          payment_no?: never
          period?: string | null
          plan_id?: string | null
          property_id?: string | null
          provider?: string
          provider_order_id?: string | null
          provider_txn_id?: string | null
          purpose?: string
          refunded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          created_at: string
          featured_slots: number
          id: string
          is_active: boolean
          max_properties: number
          monthly_price: number
          name: string
          trial_days: number
          yearly_price: number
        }
        Insert: {
          code: string
          created_at?: string
          featured_slots?: number
          id?: string
          is_active?: boolean
          max_properties?: number
          monthly_price?: number
          name: string
          trial_days?: number
          yearly_price?: number
        }
        Update: {
          code?: string
          created_at?: string
          featured_slots?: number
          id?: string
          is_active?: boolean
          max_properties?: number
          monthly_price?: number
          name?: string
          trial_days?: number
          yearly_price?: number
        }
        Relationships: []
      }
      project_unit_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          new_price: number | null
          new_status: string | null
          old_price: number | null
          old_status: string | null
          unit_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_price?: number | null
          new_status?: string | null
          old_price?: number | null
          old_status?: string | null
          unit_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_price?: number | null
          new_status?: string | null
          old_price?: number | null
          old_status?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_unit_history_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "project_units"
            referencedColumns: ["id"]
          },
        ]
      }
      project_units: {
        Row: {
          baths: number | null
          code: string | null
          created_at: string
          floor: string | null
          id: string
          notes: string | null
          price: number | null
          project_id: string
          rooms: number | null
          size: number
          status: string
          unit_type: string
          updated_at: string
        }
        Insert: {
          baths?: number | null
          code?: string | null
          created_at?: string
          floor?: string | null
          id?: string
          notes?: string | null
          price?: number | null
          project_id: string
          rooms?: number | null
          size?: number
          status?: string
          unit_type: string
          updated_at?: string
        }
        Update: {
          baths?: number | null
          code?: string | null
          created_at?: string
          floor?: string | null
          id?: string
          notes?: string | null
          price?: number | null
          project_id?: string
          rooms?: number | null
          size?: number
          status?: string
          unit_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_units_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string | null
          amenities: string[]
          area: string
          city: string
          created_at: string
          delivery_date: string | null
          description: string | null
          developer_id: string
          id: string
          images: string[]
          is_featured: boolean
          lat: number | null
          lng: number | null
          name: string
          payment_plans: string | null
          review_note: string | null
          review_status: Database["public"]["Enums"]["review_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          amenities?: string[]
          area: string
          city: string
          created_at?: string
          delivery_date?: string | null
          description?: string | null
          developer_id: string
          id?: string
          images?: string[]
          is_featured?: boolean
          lat?: number | null
          lng?: number | null
          name: string
          payment_plans?: string | null
          review_note?: string | null
          review_status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          amenities?: string[]
          area?: string
          city?: string
          created_at?: string
          delivery_date?: string | null
          description?: string | null
          developer_id?: string
          id?: string
          images?: string[]
          is_featured?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
          payment_plans?: string | null
          review_note?: string | null
          review_status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          activity_id: string | null
          address: string | null
          area: string
          available_from: string | null
          available_to: string | null
          baths: number | null
          broker_id: string | null
          built_size: number | null
          category: string
          city: string
          compound_id: string | null
          created_at: string
          deposit: number | null
          description: string | null
          featured_until: string | null
          finishing: string | null
          floor: string | null
          furnished: string | null
          guests: number | null
          hidden_by_plan: boolean
          highlight_reason: string | null
          highlight_requested_at: string | null
          highlight_yield: number | null
          id: string
          image_url: string | null
          images: string[]
          is_demo: boolean
          is_featured: boolean
          is_highlight: boolean
          land_size: number | null
          lat: number | null
          lng: number | null
          mall_id: string | null
          min_months: number | null
          owner_lead_id: string | null
          price: number
          price_month: number | null
          price_night: number | null
          price_season: number | null
          price_unit: string | null
          price_week: number | null
          review_note: string | null
          review_status: Database["public"]["Enums"]["review_status"]
          rooms: number | null
          size: number
          source_url: string | null
          status: string
          title: string
          type: string
          updated_at: string
          verified_at: string | null
          verified_note: string | null
          video_urls: string[]
          zone_id: string | null
        }
        Insert: {
          activity_id?: string | null
          address?: string | null
          area: string
          available_from?: string | null
          available_to?: string | null
          baths?: number | null
          broker_id?: string | null
          built_size?: number | null
          category?: string
          city?: string
          compound_id?: string | null
          created_at?: string
          deposit?: number | null
          description?: string | null
          featured_until?: string | null
          finishing?: string | null
          floor?: string | null
          furnished?: string | null
          guests?: number | null
          hidden_by_plan?: boolean
          highlight_reason?: string | null
          highlight_requested_at?: string | null
          highlight_yield?: number | null
          id?: string
          image_url?: string | null
          images?: string[]
          is_demo?: boolean
          is_featured?: boolean
          is_highlight?: boolean
          land_size?: number | null
          lat?: number | null
          lng?: number | null
          mall_id?: string | null
          min_months?: number | null
          owner_lead_id?: string | null
          price: number
          price_month?: number | null
          price_night?: number | null
          price_season?: number | null
          price_unit?: string | null
          price_week?: number | null
          review_note?: string | null
          review_status?: Database["public"]["Enums"]["review_status"]
          rooms?: number | null
          size?: number
          source_url?: string | null
          status: string
          title: string
          type: string
          updated_at?: string
          verified_at?: string | null
          verified_note?: string | null
          video_urls?: string[]
          zone_id?: string | null
        }
        Update: {
          activity_id?: string | null
          address?: string | null
          area?: string
          available_from?: string | null
          available_to?: string | null
          baths?: number | null
          broker_id?: string | null
          built_size?: number | null
          category?: string
          city?: string
          compound_id?: string | null
          created_at?: string
          deposit?: number | null
          description?: string | null
          featured_until?: string | null
          finishing?: string | null
          floor?: string | null
          furnished?: string | null
          guests?: number | null
          hidden_by_plan?: boolean
          highlight_reason?: string | null
          highlight_requested_at?: string | null
          highlight_yield?: number | null
          id?: string
          image_url?: string | null
          images?: string[]
          is_demo?: boolean
          is_featured?: boolean
          is_highlight?: boolean
          land_size?: number | null
          lat?: number | null
          lng?: number | null
          mall_id?: string | null
          min_months?: number | null
          owner_lead_id?: string | null
          price?: number
          price_month?: number | null
          price_night?: number | null
          price_season?: number | null
          price_unit?: string | null
          price_week?: number | null
          review_note?: string | null
          review_status?: Database["public"]["Enums"]["review_status"]
          rooms?: number | null
          size?: number
          source_url?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
          verified_at?: string | null
          verified_note?: string | null
          video_urls?: string[]
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "industrial_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_compound_id_fkey"
            columns: ["compound_id"]
            isOneToOne: false
            referencedRelation: "compounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_mall_id_fkey"
            columns: ["mall_id"]
            isOneToOne: false
            referencedRelation: "malls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_owner_lead_id_fkey"
            columns: ["owner_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "industrial_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      routing_rules: {
        Row: {
          areas: string[] | null
          broker_ids: string[]
          created_at: string
          id: string
          is_active: boolean
          kinds: string[] | null
          name: string
          priority: number
          property_types: string[] | null
          sources: string[] | null
          updated_at: string
        }
        Insert: {
          areas?: string[] | null
          broker_ids: string[]
          created_at?: string
          id?: string
          is_active?: boolean
          kinds?: string[] | null
          name: string
          priority?: number
          property_types?: string[] | null
          sources?: string[] | null
          updated_at?: string
        }
        Update: {
          areas?: string[] | null
          broker_ids?: string[]
          created_at?: string
          id?: string
          is_active?: boolean
          kinds?: string[] | null
          name?: string
          priority?: number
          property_types?: string[] | null
          sources?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      saved_searches: {
        Row: {
          area: string | null
          city: string | null
          created_at: string
          id: string
          label: string | null
          notify: boolean
          price_max: number | null
          price_min: number | null
          status: string | null
          types: string[]
          user_id: string
        }
        Insert: {
          area?: string | null
          city?: string | null
          created_at?: string
          id?: string
          label?: string | null
          notify?: boolean
          price_max?: number | null
          price_min?: number | null
          status?: string | null
          types?: string[]
          user_id?: string
        }
        Update: {
          area?: string | null
          city?: string | null
          created_at?: string
          id?: string
          label?: string | null
          notify?: boolean
          price_max?: number | null
          price_min?: number | null
          status?: string | null
          types?: string[]
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          broker_id: string
          created_at: string
          ends_at: string | null
          id: string
          payment_id: string | null
          plan_id: string
          provider: string | null
          provider_ref: string | null
          reminded_1d_at: string | null
          reminded_7d_at: string | null
          starts_at: string
          status: string
        }
        Insert: {
          broker_id: string
          created_at?: string
          ends_at?: string | null
          id?: string
          payment_id?: string | null
          plan_id: string
          provider?: string | null
          provider_ref?: string | null
          reminded_1d_at?: string | null
          reminded_7d_at?: string | null
          starts_at?: string
          status?: string
        }
        Update: {
          broker_id?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          payment_id?: string | null
          plan_id?: string
          provider?: string | null
          provider_ref?: string | null
          reminded_1d_at?: string | null
          reminded_7d_at?: string | null
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string
          created_at: string
          created_by: string | null
          done_at: string | null
          done_by: string | null
          due_at: string | null
          id: string
          lead_id: string | null
          notes: string | null
          reminded_at: string | null
          title: string
        }
        Insert: {
          assigned_to: string
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          done_by?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          reminded_at?: string | null
          title: string
        }
        Update: {
          assigned_to?: string
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          done_by?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          reminded_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_otps: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          ip_hash: string | null
          phone: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          ip_hash?: string | null
          phone: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          ip_hash?: string | null
          phone?: string
        }
        Relationships: []
      }
      whatsapp_webhook_events: {
        Row: {
          created_at: string
          error_code: string | null
          error_title: string | null
          event_at: string | null
          event_key: string
          from_masked: string | null
          id: string
          kind: string
          message_type: string | null
          status: string | null
          wa_message_id: string | null
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          error_title?: string | null
          event_at?: string | null
          event_key: string
          from_masked?: string | null
          id?: string
          kind: string
          message_type?: string | null
          status?: string | null
          wa_message_id?: string | null
        }
        Update: {
          created_at?: string
          error_code?: string | null
          error_title?: string | null
          event_at?: string | null
          event_key?: string
          from_masked?: string | null
          id?: string
          kind?: string
          message_type?: string | null
          status?: string | null
          wa_message_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      actor_label: { Args: never; Returns: string }
      add_work_minutes: {
        Args: { _from: string; _mins: number }
        Returns: string
      }
      admin_brokers: {
        Args: never
        Returns: {
          account_type: string
          address: string | null
          areas: string[]
          bio: string | null
          commercial_register: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          facebook: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          name: string
          phone: string | null
          photo_url: string | null
          plan_id: string | null
          rejected_at: string | null
          review_note: string | null
          show_contact: boolean
          slug: string
          specialty: string | null
          suspended_at: string | null
          updated_at: string
          user_id: string | null
          whatsapp: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "brokers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_exists: { Args: never; Returns: boolean }
      admin_opportunities: {
        Args: never
        Returns: {
          activity: string
          area: string
          broker_id: string | null
          built_area: number | null
          city: string
          created_at: string
          deal_kind: string
          details: string | null
          expected_return: number | null
          id: string
          images: string[]
          investment_max: number | null
          investment_min: number | null
          is_featured: boolean
          kind: string
          land_area: number | null
          lat: number | null
          licenses: string | null
          lng: number | null
          location_note: string | null
          offered_share: number | null
          opp_no: number
          review_note: string | null
          review_status: string
          submitted_by: string | null
          teaser: string
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "investment_opportunities"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      agreement_for:
        | {
            Args: { _broker: string; _on: string }
            Returns: {
              approved_at: string
              approved_by: string | null
              broker_id: string
              created_at: string
              deal_type: string
              effective_from: string
              effective_to: string | null
              fixed_amount: number | null
              id: string
              notes: string | null
              rate: number | null
            }
            SetofOptions: {
              from: "*"
              to: "company_agreements"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { _broker: string; _on: string; _type: string }
            Returns: {
              approved_at: string
              approved_by: string | null
              broker_id: string
              created_at: string
              deal_type: string
              effective_from: string
              effective_to: string | null
              fixed_amount: number | null
              id: string
              notes: string | null
              rate: number | null
            }
            SetofOptions: {
              from: "*"
              to: "company_agreements"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      assignable_users: {
        Args: never
        Returns: {
          label: string
          user_id: string
        }[]
      }
      auth_user_id_by_phone: { Args: { _phone: string }; Returns: string }
      auth_user_ids_by_phone: { Args: { _phone: string }; Returns: string[] }
      broker_contacts: {
        Args: { _ids: string[] }
        Returns: {
          email: string
          id: string
          phone: string
          whatsapp: string
        }[]
      }
      brokers_by_phone: {
        Args: { _phone: string }
        Returns: {
          account_type: string
          id: string
          is_active: boolean
          suspended: boolean
          user_id: string
        }[]
      }
      can_read_investment_doc: { Args: { _folder: string }; Returns: boolean }
      can_upload_investment_doc: { Args: { _folder: string }; Returns: boolean }
      claim_first_admin: { Args: never; Returns: boolean }
      commission_amount: {
        Args: { _basis: number; _fixed: number; _rate: number }
        Returns: number
      }
      create_payment: {
        Args: {
          _days?: number
          _period?: string
          _plan?: string
          _property?: string
          _purpose: string
        }
        Returns: string
      }
      current_broker_id: { Args: never; Returns: string }
      current_developer_id: { Args: never; Returns: string }
      current_member_role: { Args: never; Returns: string }
      delete_demo_data: { Args: never; Returns: Json }
      demo_visible: { Args: never; Returns: boolean }
      floor_level: { Args: { _floor: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: never; Returns: boolean }
      lead_alerts: {
        Args: never
        Returns: {
          broker_name: string
          detail: string
          happened_at: string
          kind: string
          lead_id: string
          lead_name: string
          lead_no: number
        }[]
      }
      lead_transferable: {
        Args: { _kind: string; _stage: string }
        Returns: boolean
      }
      log_app_error: {
        Args: {
          _kind: string
          _message: string
          _path: string
          _stack: string
          _ua: string
        }
        Returns: undefined
      }
      mark_payment_failed: {
        Args: { _id: string; _reason: string }
        Returns: string
      }
      mark_payment_paid: {
        Args: { _amount: number; _id: string; _method?: string; _txn: string }
        Returns: string
      }
      member_user_id: { Args: { _member: string }; Returns: string }
      meta_inbound_lead: {
        Args: {
          _ad: string
          _campaign: string
          _details: string
          _name: string
          _phone: string
          _platform: string
          _ref: string
        }
        Returns: string
      }
      my_account: {
        Args: never
        Returns: {
          account_type: string
          address: string | null
          areas: string[]
          bio: string | null
          commercial_register: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          facebook: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          name: string
          phone: string | null
          photo_url: string | null
          plan_id: string | null
          rejected_at: string | null
          review_note: string | null
          show_contact: boolean
          slug: string
          specialty: string | null
          suspended_at: string | null
          updated_at: string
          user_id: string | null
          whatsapp: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "brokers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      my_member_id: { Args: never; Returns: string }
      my_membership: {
        Args: never
        Returns: {
          company_id: string
          member_name: string
          role: string
        }[]
      }
      my_opportunities: {
        Args: never
        Returns: {
          activity: string
          area: string
          broker_id: string | null
          built_area: number | null
          city: string
          created_at: string
          deal_kind: string
          details: string | null
          expected_return: number | null
          id: string
          images: string[]
          investment_max: number | null
          investment_min: number | null
          is_featured: boolean
          kind: string
          land_area: number | null
          lat: number | null
          licenses: string | null
          lng: number | null
          location_note: string | null
          offered_share: number | null
          opp_no: number
          review_note: string | null
          review_status: string
          submitted_by: string | null
          teaser: string
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "investment_opportunities"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      my_phone: { Args: never; Returns: string }
      my_requests: {
        Args: never
        Returns: {
          area: string
          budget: number
          created_at: string
          details: string
          id: string
          kind: string
          lead_no: number
          property_id: string
          property_title: string
          property_type: string
          purpose: string
          stage: string
          updated_at: string
        }[]
      }
      next_transfer_company: {
        Args: { _lead: Database["public"]["Tables"]["leads"]["Row"] }
        Returns: string
      }
      normalize_phone: { Args: { _p: string }; Returns: string }
      notify_admins: {
        Args: {
          _except?: string
          _msg: string
          _related: string
          _title: string
          _type: string
          _url: string
        }
        Returns: undefined
      }
      notify_company: {
        Args: {
          _company: string
          _msg: string
          _related: string
          _title: string
          _type: string
          _url: string
        }
        Returns: undefined
      }
      notify_lead_people: {
        Args: {
          _lead: Database["public"]["Tables"]["leads"]["Row"]
          _msg: string
          _title: string
        }
        Returns: undefined
      }
      notify_team: {
        Args: {
          _msg: string
          _related: string
          _title: string
          _type: string
          _url: string
        }
        Returns: undefined
      }
      notify_user: {
        Args: {
          _msg: string
          _related: string
          _title: string
          _type: string
          _url: string
          _user: string
        }
        Returns: undefined
      }
      opportunity_location: {
        Args: { _id: string }
        Returns: {
          lat: number
          lng: number
        }[]
      }
      opportunity_private: {
        Args: { _id: string }
        Returns: {
          details: string
          licenses: string
          location_note: string
        }[]
      }
      owned_company_id: { Args: never; Returns: string }
      prepare_account_deletion: { Args: { _uid: string }; Returns: string }
      price_index: {
        Args: never
        Returns: {
          area: string
          city: string
          finishing: string
          floor_level: number
          kind: string
          mall_id: string
          month: string
          price_per_m2: number
          purpose: string
          samples: number
          unit_type: string
        }[]
      }
      run_lead_transfers: { Args: never; Returns: Json }
      run_reminders: { Args: never; Returns: Json }
      run_response_alerts: { Args: never; Returns: Json }
      run_subscription_expiry: { Args: never; Returns: Json }
      source_from_utm: { Args: { _u: Json }; Returns: string }
      whatsapp_inbound_lead: {
        Args: { _msg_id: string; _name: string; _phone: string; _text: string }
        Returns: string
      }
      work_minutes: { Args: { _from: string; _to: string }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "broker" | "staff"
      lead_stage:
        | "new"
        | "contacted"
        | "viewing"
        | "negotiating"
        | "won"
        | "lost"
        | "qualified"
        | "visit_scheduled"
        | "visited"
        | "reserved"
        | "contracted"
        | "sold"
        | "postponed"
      review_status: "draft" | "pending" | "approved" | "rejected"
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
  public: {
    Enums: {
      app_role: ["admin", "broker", "staff"],
      lead_stage: [
        "new",
        "contacted",
        "viewing",
        "negotiating",
        "won",
        "lost",
        "qualified",
        "visit_scheduled",
        "visited",
        "reserved",
        "contracted",
        "sold",
        "postponed",
      ],
      review_status: ["draft", "pending", "approved", "rejected"],
    },
  },
} as const
