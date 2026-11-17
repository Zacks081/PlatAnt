
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "categories": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"id": string,"is_system": boolean,"kind": Database["public"]['Enums']["category_kind"],"name": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"is_system"?: boolean,"kind": Database["public"]['Enums']["category_kind"],"name": string,"user_id"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"is_system"?: boolean,"kind"?: Database["public"]['Enums']["category_kind"],"name"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"credit_cards": {
                  Row: {
                    "created_at": string,"id": string,"monthly_rate": number,"payment_day": number,"pocket_id": string,"rate_is_estimated": boolean,"statement_day": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"monthly_rate"?: number,"payment_day": number,"pocket_id": string,"rate_is_estimated"?: boolean,"statement_day": number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"monthly_rate"?: number,"payment_day"?: number,"pocket_id"?: string,"rate_is_estimated"?: boolean,"statement_day"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "credit_cards_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_cards_user_id_pocket_id_fkey"
      columns: ["user_id","pocket_id"]
isOneToOne: false
      referencedRelation: "pockets"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"debts": {
                  Row: {
                    "closed_at": string | null,"created_at": string,"due_date": string | null,"id": string,"installment_amount": number,"installments_remaining": number,"name": string,"original_amount": number,"payment_day": number,"payment_type": Database["public"]['Enums']["debt_payment_type"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "closed_at"?: string | null,"created_at"?: string,"due_date"?: string | null,"id"?: string,"installment_amount": number,"installments_remaining": number,"name": string,"original_amount": number,"payment_day": number,"payment_type"?: Database["public"]['Enums']["debt_payment_type"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "closed_at"?: string | null,"created_at"?: string,"due_date"?: string | null,"id"?: string,"installment_amount"?: number,"installments_remaining"?: number,"name"?: string,"original_amount"?: number,"payment_day"?: number,"payment_type"?: Database["public"]['Enums']["debt_payment_type"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "debts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"fixed_expenses": {
                  Row: {
                    "active": boolean,"amount": number,"category_id": string,"created_at": string,"due_day": number,"id": string,"name": string,"split": Database["public"]['Enums']["expense_split"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"amount": number,"category_id": string,"created_at"?: string,"due_day": number,"id"?: string,"name": string,"split"?: Database["public"]['Enums']["expense_split"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "active"?: boolean,"amount"?: number,"category_id"?: string,"created_at"?: string,"due_day"?: number,"id"?: string,"name"?: string,"split"?: Database["public"]['Enums']["expense_split"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fixed_expenses_user_id_category_id_fkey"
      columns: ["user_id","category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "fixed_expenses_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"goals": {
                  Row: {
                    "achieved_at": string | null,"created_at": string,"id": string,"name": string,"target_amount": number,"target_date": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "achieved_at"?: string | null,"created_at"?: string,"id"?: string,"name": string,"target_amount": number,"target_date": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "achieved_at"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"target_amount"?: number,"target_date"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "goals_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"installment_plans": {
                  Row: {
                    "created_at": string,"credit_card_id": string,"id": string,"installments_count": number,"is_initial": boolean,"kind": Database["public"]['Enums']["installment_plan_kind"],"movement_id": string | null,"name": string,"principal": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"credit_card_id": string,"id"?: string,"installments_count": number,"is_initial"?: boolean,"kind": Database["public"]['Enums']["installment_plan_kind"],"movement_id"?: string | null,"name": string,"principal": number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"credit_card_id"?: string,"id"?: string,"installments_count"?: number,"is_initial"?: boolean,"kind"?: Database["public"]['Enums']["installment_plan_kind"],"movement_id"?: string | null,"name"?: string,"principal"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "installment_plans_user_id_credit_card_id_fkey"
      columns: ["user_id","credit_card_id"]
isOneToOne: false
      referencedRelation: "credit_cards"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "installment_plans_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "installment_plans_user_id_movement_id_fkey"
      columns: ["user_id","movement_id"]
isOneToOne: false
      referencedRelation: "movements"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"movements": {
                  Row: {
                    "amount": number,"category_id": string | null,"created_at": string,"description": string | null,"id": string,"kind": Database["public"]['Enums']["movement_kind"],"occurred_on": string,"origin": Database["public"]['Enums']["movement_origin"],"pocket_id": string,"to_pocket_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"category_id"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["movement_kind"],"occurred_on": string,"origin"?: Database["public"]['Enums']["movement_origin"],"pocket_id": string,"to_pocket_id"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "amount"?: number,"category_id"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["movement_kind"],"occurred_on"?: string,"origin"?: Database["public"]['Enums']["movement_origin"],"pocket_id"?: string,"to_pocket_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "movements_user_id_category_id_fkey"
      columns: ["user_id","category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "movements_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movements_user_id_pocket_id_fkey"
      columns: ["user_id","pocket_id"]
isOneToOne: false
      referencedRelation: "pockets"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "movements_user_id_to_pocket_id_fkey"
      columns: ["user_id","to_pocket_id"]
isOneToOne: false
      referencedRelation: "pockets"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"pockets": {
                  Row: {
                    "created_at": string,"id": string,"kind": Database["public"]['Enums']["pocket_kind"],"name": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["pocket_kind"],"name": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["pocket_kind"],"name"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pockets_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"currency": string,"id": string,"monthly_income": number | null,"name": string,"onboarding_completed": boolean,"onboarding_step": number,"pay_days": (number)[],"pay_frequency": Database["public"]['Enums']["pay_frequency"],"time_zone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"currency"?: string,"id": string,"monthly_income"?: number | null,"name": string,"onboarding_completed"?: boolean,"onboarding_step"?: number,"pay_days"?: (number)[],"pay_frequency"?: Database["public"]['Enums']["pay_frequency"],"time_zone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"id"?: string,"monthly_income"?: number | null,"name"?: string,"onboarding_completed"?: boolean,"onboarding_step"?: number,"pay_days"?: (number)[],"pay_frequency"?: Database["public"]['Enums']["pay_frequency"],"time_zone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "save_credit_card":
{ Args: { "p_debt": number,"p_monthly_rate": number,"p_payment_day": number,"p_rate_is_estimated": boolean,"p_statement_day": number }; Returns: string
                           },
"seed_user_defaults":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"set_opening_balance":
{ Args: { "p_amount": number,"p_kind": Database["public"]['Enums']["pocket_kind"] }; Returns: undefined
                           }
          }
          Enums: {
            "category_kind": "expense"|"income","debt_payment_type": "single"|"monthly","expense_split": "first"|"second"|"half","installment_plan_kind": "purchase"|"advance"|"subscription","movement_kind": "expense"|"income"|"transfer","movement_origin": "manual"|"opening_balance"|"reconciliation"|"statement","pay_frequency": "biweekly"|"monthly","pocket_kind": "account"|"cash"|"credit_card"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "category_kind": ["expense", "income"],"debt_payment_type": ["single", "monthly"],"expense_split": ["first", "second", "half"],"installment_plan_kind": ["purchase", "advance", "subscription"],"movement_kind": ["expense", "income", "transfer"],"movement_origin": ["manual", "opening_balance", "reconciliation", "statement"],"pay_frequency": ["biweekly", "monthly"],"pocket_kind": ["account", "cash", "credit_card"]
          }
        }
} as const
