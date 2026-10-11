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
      app_settings: {
        Row: {
          android_url: string | null
          id: number
          ios_url: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          android_url?: string | null
          id?: number
          ios_url?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          android_url?: string | null
          id?: number
          ios_url?: string | null
          updated_at?: string
          updated_by?: string | null
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
          commercial_register: string | null
          contact_person: string | null
          rejected_at: string | null
          review_note: string | null
          areas: string[]
          bio: string | null
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
          commercial_register?: string | null
          contact_person?: string | null
          rejected_at?: string | null
          review_note?: string | null
          areas?: string[]
          bio?: string | null
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
          commercial_register?: string | null
          contact_person?: string | null
          rejected_at?: string | null
          review_note?: string | null
          areas?: string[]
          bio?: string | null
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
          id: string
          lead_id: string
          project_unit_id: string | null
          property_id: string | null
          reservation_amount: number | null
          reservation_date: string | null
          review_note: string | null
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
          id?: string
          lead_id: string
          project_unit_id?: string | null
          property_id?: string | null
          reservation_amount?: number | null
          reservation_date?: string | null
          review_note?: string | null
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
          id?: string
          lead_id?: string
          project_unit_id?: string | null
          property_id?: string | null
          reservation_amount?: number | null
          reservation_date?: string | null
          review_note?: string | null
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
            foreignKeyName: "deals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
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
      lead_activities: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          kind: string
          lead_id: string
          summary: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          kind: string
          lead_id: string
          summary: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          lead_id?: string
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
      leads: {
        Row: {
          lost_reason: string | null
          stage_changed_at: string | null
          visit_at: string | null
          assigned_member_id: string | null
          assigned_staff_id: string | null
          created_by: string | null
          lead_no: number
          original_source: string
          phone_norm: string | null
          source: string
          source_note: string | null
          area: string | null
          asking_price: number | null
          assigned_broker_id: string | null
          budget: number | null
          created_at: string
          details: string | null
          follow_up_at: string | null
          id: string
          kind: string
          name: string
          notes: string | null
          phone: string
          phone_verified: boolean
          property_id: string | null
          property_type: string | null
          purpose: string | null
          size_m2: number | null
          stage: string
          updated_at: string
        }
        Insert: {
          lost_reason?: string | null
          stage_changed_at?: string | null
          visit_at?: string | null
          assigned_member_id?: string | null
          assigned_staff_id?: string | null
          created_by?: string | null
          original_source?: string
          source?: string
          source_note?: string | null
          area?: string | null
          asking_price?: number | null
          assigned_broker_id?: string | null
          budget?: number | null
          created_at?: string
          details?: string | null
          follow_up_at?: string | null
          id?: string
          kind?: string
          name: string
          notes?: string | null
          phone: string
          phone_verified?: boolean
          property_id?: string | null
          property_type?: string | null
          purpose?: string | null
          size_m2?: number | null
          stage?: string
          updated_at?: string
        }
        Update: {
          lost_reason?: string | null
          stage_changed_at?: string | null
          visit_at?: string | null
          assigned_member_id?: string | null
          assigned_staff_id?: string | null
          created_by?: string | null
          original_source?: string
          source?: string
          source_note?: string | null
          area?: string | null
          asking_price?: number | null
          assigned_broker_id?: string | null
          budget?: number | null
          created_at?: string
          details?: string | null
          follow_up_at?: string | null
          id?: string
          kind?: string
          name?: string
          notes?: string | null
          phone?: string
          phone_verified?: boolean
          property_id?: string | null
          property_type?: string | null
          purpose?: string | null
          size_m2?: number | null
          stage?: string
          updated_at?: string
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
            foreignKeyName: "leads_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
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
          baths: number | null
          broker_id: string | null
          built_size: number | null
          category: string
          city: string
          created_at: string
          description: string | null
          featured_until: string | null
          floor: string | null
          id: string
          image_url: string | null
          images: string[]
          is_demo: boolean
          is_featured: boolean
          land_size: number | null
          lat: number | null
          lng: number | null
          mall_id: string | null
          owner_lead_id: string | null
          price: number
          review_note: string | null
          review_status: Database["public"]["Enums"]["review_status"]
          rooms: number | null
          size: number
          source_url: string | null
          status: string
          title: string
          type: string
          updated_at: string
          video_urls: string[]
          zone_id: string | null
        }
        Insert: {
          activity_id?: string | null
          address?: string | null
          area: string
          baths?: number | null
          broker_id?: string | null
          built_size?: number | null
          category?: string
          city?: string
          created_at?: string
          description?: string | null
          featured_until?: string | null
          floor?: string | null
          id?: string
          image_url?: string | null
          images?: string[]
          is_demo?: boolean
          is_featured?: boolean
          land_size?: number | null
          lat?: number | null
          lng?: number | null
          mall_id?: string | null
          owner_lead_id?: string | null
          price: number
          review_note?: string | null
          review_status?: Database["public"]["Enums"]["review_status"]
          rooms?: number | null
          size?: number
          source_url?: string | null
          status: string
          title: string
          type: string
          updated_at?: string
          video_urls?: string[]
          zone_id?: string | null
        }
        Update: {
          activity_id?: string | null
          address?: string | null
          area?: string
          baths?: number | null
          broker_id?: string | null
          built_size?: number | null
          category?: string
          city?: string
          created_at?: string
          description?: string | null
          featured_until?: string | null
          floor?: string | null
          id?: string
          image_url?: string | null
          images?: string[]
          is_demo?: boolean
          is_featured?: boolean
          land_size?: number | null
          lat?: number | null
          lng?: number | null
          mall_id?: string | null
          owner_lead_id?: string | null
          price?: number
          review_note?: string | null
          review_status?: Database["public"]["Enums"]["review_status"]
          rooms?: number | null
          size?: number
          source_url?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
          video_urls?: string[]
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_owner_lead_id_fkey"
            columns: ["owner_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "properties_mall_id_fkey"
            columns: ["mall_id"]
            isOneToOne: false
            referencedRelation: "malls"
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
      subscriptions: {
        Row: {
          broker_id: string
          created_at: string
          ends_at: string | null
          id: string
          plan_id: string
          provider: string | null
          provider_ref: string | null
          starts_at: string
          status: string
        }
        Insert: {
          broker_id: string
          created_at?: string
          ends_at?: string | null
          id?: string
          plan_id: string
          provider?: string | null
          provider_ref?: string | null
          starts_at?: string
          status?: string
        }
        Update: {
          broker_id?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          plan_id?: string
          provider?: string | null
          provider_ref?: string | null
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
      admin_exists: { Args: never; Returns: boolean }
      auth_user_id_by_phone: { Args: { _phone: string }; Returns: string }
      auth_user_ids_by_phone: { Args: { _phone: string }; Returns: string[] }
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
      claim_first_admin: { Args: never; Returns: boolean }
      current_broker_id: { Args: never; Returns: string }
      current_developer_id: { Args: never; Returns: string }
      current_member_role: { Args: never; Returns: string }
      is_staff: { Args: never; Returns: boolean }
      my_member_id: { Args: never; Returns: string }
      my_membership: {
        Args: never
        Returns: {
          company_id: string
          member_name: string
          role: string
        }[]
      }
      my_phone: { Args: never; Returns: string }
      owned_company_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
      lead_stage: ["new", "contacted", "viewing", "negotiating", "won", "lost"],
      review_status: ["draft", "pending", "approved", "rejected"],
    },
  },
} as const
