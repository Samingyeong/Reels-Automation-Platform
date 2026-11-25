
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
            "approvals": {
                  Row: {
                    "approved_at": string,"approved_by": string,"content_hash": string,"id": string,"project_id": string,"revoked_at": string | null,"revoked_reason": string | null,"snapshot": NonNullable<Json>,"stage": Database["public"]['Enums']["approval_stage"],"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string,"approved_by": string,"content_hash": string,"id"?: string,"project_id": string,"revoked_at"?: string | null,"revoked_reason"?: string | null,"snapshot": NonNullable<Json>,"stage": Database["public"]['Enums']["approval_stage"],"version": number
                  }
                  Update: {
                    "approved_at"?: string,"approved_by"?: string,"content_hash"?: string,"id"?: string,"project_id"?: string,"revoked_at"?: string | null,"revoked_reason"?: string | null,"snapshot"?: NonNullable<Json>,"stage"?: Database["public"]['Enums']["approval_stage"],"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "approvals_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"assets": {
                  Row: {
                    "bucket": string,"created_at": string,"duration_ms": number | null,"id": string,"input_key": string | null,"kind": Database["public"]['Enums']["asset_kind"],"mime_type": string,"project_id": string | null,"provider": string,"size_bytes": number | null,"storage_path": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket"?: string,"created_at"?: string,"duration_ms"?: number | null,"id"?: string,"input_key"?: string | null,"kind": Database["public"]['Enums']["asset_kind"],"mime_type": string,"project_id"?: string | null,"provider": string,"size_bytes"?: number | null,"storage_path": string,"user_id": string
                  }
                  Update: {
                    "bucket"?: string,"created_at"?: string,"duration_ms"?: number | null,"id"?: string,"input_key"?: string | null,"kind"?: Database["public"]['Enums']["asset_kind"],"mime_type"?: string,"project_id"?: string | null,"provider"?: string,"size_bytes"?: number | null,"storage_path"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assets_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"instagram_accounts": {
                  Row: {
                    "access_token_secret_id": string,"created_at": string,"id": string,"ig_user_id": string,"scopes": (string)[],"token_expires_at": string | null,"updated_at": string,"user_id": string,"username": string
                  }
                  ComputedFields: never
                  Insert: {
                    "access_token_secret_id": string,"created_at"?: string,"id"?: string,"ig_user_id": string,"scopes"?: (string)[],"token_expires_at"?: string | null,"updated_at"?: string,"user_id": string,"username": string
                  }
                  Update: {
                    "access_token_secret_id"?: string,"created_at"?: string,"id"?: string,"ig_user_id"?: string,"scopes"?: (string)[],"token_expires_at"?: string | null,"updated_at"?: string,"user_id"?: string,"username"?: string
                  }
                  Relationships: [
                    
                  ]
                },"jobs": {
                  Row: {
                    "attempt": number,"cost_estimate_usd": number | null,"created_at": string,"dispatch_attempts": number,"dispatched_at": string | null,"error": string | null,"error_retryable": boolean | null,"external_job_id": string | null,"finished_at": string | null,"id": string,"idempotency_key": string,"kind": Database["public"]['Enums']["job_kind"],"locked_until": string | null,"max_attempts": number,"payload": NonNullable<Json>,"project_id": string,"project_revision": number,"provider": string | null,"result": Json | null,"run_after": string,"scene_id": string | null,"started_at": string | null,"status": Database["public"]['Enums']["job_status"],"trigger_run_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt"?: number,"cost_estimate_usd"?: number | null,"created_at"?: string,"dispatch_attempts"?: number,"dispatched_at"?: string | null,"error"?: string | null,"error_retryable"?: boolean | null,"external_job_id"?: string | null,"finished_at"?: string | null,"id"?: string,"idempotency_key": string,"kind": Database["public"]['Enums']["job_kind"],"locked_until"?: string | null,"max_attempts"?: number,"payload"?: NonNullable<Json>,"project_id": string,"project_revision"?: number,"provider"?: string | null,"result"?: Json | null,"run_after"?: string,"scene_id"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["job_status"],"trigger_run_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "attempt"?: number,"cost_estimate_usd"?: number | null,"created_at"?: string,"dispatch_attempts"?: number,"dispatched_at"?: string | null,"error"?: string | null,"error_retryable"?: boolean | null,"external_job_id"?: string | null,"finished_at"?: string | null,"id"?: string,"idempotency_key"?: string,"kind"?: Database["public"]['Enums']["job_kind"],"locked_until"?: string | null,"max_attempts"?: number,"payload"?: NonNullable<Json>,"project_id"?: string,"project_revision"?: number,"provider"?: string | null,"result"?: Json | null,"run_after"?: string,"scene_id"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["job_status"],"trigger_run_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "jobs_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "jobs_scene_id_fkey"
      columns: ["scene_id"]
isOneToOne: false
      referencedRelation: "scenes"
      referencedColumns: ["id"]
    }
                  ]
                },"media_insights": {
                  Row: {
                    "fetched_at": string,"id": string,"metrics": NonNullable<Json>,"publication_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "fetched_at"?: string,"id"?: string,"metrics": NonNullable<Json>,"publication_id": string
                  }
                  Update: {
                    "fetched_at"?: string,"id"?: string,"metrics"?: NonNullable<Json>,"publication_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "media_insights_publication_id_fkey"
      columns: ["publication_id"]
isOneToOne: false
      referencedRelation: "publications"
      referencedColumns: ["id"]
    }
                  ]
                },"project_events": {
                  Row: {
                    "actor": string,"created_at": string,"event": string,"from_status": Database["public"]['Enums']["project_status"],"id": number,"payload": NonNullable<Json>,"project_id": string,"to_status": Database["public"]['Enums']["project_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "actor": string,"created_at"?: string,"event": string,"from_status": Database["public"]['Enums']["project_status"],"id"?: never,"payload"?: NonNullable<Json>,"project_id": string,"to_status": Database["public"]['Enums']["project_status"]
                  }
                  Update: {
                    "actor"?: string,"created_at"?: string,"event"?: string,"from_status"?: Database["public"]['Enums']["project_status"],"id"?: never,"payload"?: NonNullable<Json>,"project_id"?: string,"to_status"?: Database["public"]['Enums']["project_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_events_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "caption": string,"created_at": string,"hashtags": (string)[],"id": string,"last_error": string | null,"options": NonNullable<Json>,"revision": number,"status": Database["public"]['Enums']["project_status"],"title": string,"topic": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "caption"?: string,"created_at"?: string,"hashtags"?: (string)[],"id"?: string,"last_error"?: string | null,"options"?: NonNullable<Json>,"revision"?: number,"status"?: Database["public"]['Enums']["project_status"],"title"?: string,"topic": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "caption"?: string,"created_at"?: string,"hashtags"?: (string)[],"id"?: string,"last_error"?: string | null,"options"?: NonNullable<Json>,"revision"?: number,"status"?: Database["public"]['Enums']["project_status"],"title"?: string,"topic"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"publications": {
                  Row: {
                    "attempt": number,"caption": string,"created_at": string,"error": string | null,"id": string,"ig_container_id": string | null,"ig_media_id": string | null,"instagram_account_id": string,"is_live": boolean,"permalink": string | null,"project_id": string,"published_at": string | null,"render_id": string,"scheduled_at": string,"share_to_feed": boolean,"status": Database["public"]['Enums']["publication_status"],"trigger_run_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt"?: number,"caption": string,"created_at"?: string,"error"?: string | null,"id"?: string,"ig_container_id"?: string | null,"ig_media_id"?: string | null,"instagram_account_id": string,"is_live": boolean,"permalink"?: string | null,"project_id": string,"published_at"?: string | null,"render_id": string,"scheduled_at": string,"share_to_feed"?: boolean,"status"?: Database["public"]['Enums']["publication_status"],"trigger_run_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "attempt"?: number,"caption"?: string,"created_at"?: string,"error"?: string | null,"id"?: string,"ig_container_id"?: string | null,"ig_media_id"?: string | null,"instagram_account_id"?: string,"is_live"?: boolean,"permalink"?: string | null,"project_id"?: string,"published_at"?: string | null,"render_id"?: string,"scheduled_at"?: string,"share_to_feed"?: boolean,"status"?: Database["public"]['Enums']["publication_status"],"trigger_run_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "publications_instagram_account_id_fkey"
      columns: ["instagram_account_id"]
isOneToOne: false
      referencedRelation: "instagram_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "publications_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "publications_render_id_fkey"
      columns: ["render_id"]
isOneToOne: false
      referencedRelation: "renders"
      referencedColumns: ["id"]
    }
                  ]
                },"renders": {
                  Row: {
                    "asset_id": string | null,"composition_hash": string,"created_at": string,"error": string | null,"id": string,"input_props": NonNullable<Json>,"is_current": boolean,"project_id": string,"status": Database["public"]['Enums']["job_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "asset_id"?: string | null,"composition_hash": string,"created_at"?: string,"error"?: string | null,"id"?: string,"input_props": NonNullable<Json>,"is_current"?: boolean,"project_id": string,"status"?: Database["public"]['Enums']["job_status"],"updated_at"?: string
                  }
                  Update: {
                    "asset_id"?: string | null,"composition_hash"?: string,"created_at"?: string,"error"?: string | null,"id"?: string,"input_props"?: NonNullable<Json>,"is_current"?: boolean,"project_id"?: string,"status"?: Database["public"]['Enums']["job_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "renders_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: false
      referencedRelation: "assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "renders_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"scenes": {
                  Row: {
                    "captions": NonNullable<Json>,"created_at": string,"duration_sec": number,"id": string,"narration": string,"narration_asset_id": string | null,"narration_duration_ms": number | null,"narration_input_hash": string | null,"narration_status": Database["public"]['Enums']["scene_part_status"],"position": number,"project_id": string,"updated_at": string,"visual_asset_id": string | null,"visual_input_hash": string | null,"visual_placeholder": Json | null,"visual_prompt": string,"visual_status": Database["public"]['Enums']["scene_part_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "captions"?: NonNullable<Json>,"created_at"?: string,"duration_sec": number,"id"?: string,"narration": string,"narration_asset_id"?: string | null,"narration_duration_ms"?: number | null,"narration_input_hash"?: string | null,"narration_status"?: Database["public"]['Enums']["scene_part_status"],"position": number,"project_id": string,"updated_at"?: string,"visual_asset_id"?: string | null,"visual_input_hash"?: string | null,"visual_placeholder"?: Json | null,"visual_prompt": string,"visual_status"?: Database["public"]['Enums']["scene_part_status"]
                  }
                  Update: {
                    "captions"?: NonNullable<Json>,"created_at"?: string,"duration_sec"?: number,"id"?: string,"narration"?: string,"narration_asset_id"?: string | null,"narration_duration_ms"?: number | null,"narration_input_hash"?: string | null,"narration_status"?: Database["public"]['Enums']["scene_part_status"],"position"?: number,"project_id"?: string,"updated_at"?: string,"visual_asset_id"?: string | null,"visual_input_hash"?: string | null,"visual_placeholder"?: Json | null,"visual_prompt"?: string,"visual_status"?: Database["public"]['Enums']["scene_part_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "scenes_narration_asset_fk"
      columns: ["narration_asset_id"]
isOneToOne: false
      referencedRelation: "assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "scenes_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "scenes_visual_asset_fk"
      columns: ["visual_asset_id"]
isOneToOne: false
      referencedRelation: "assets"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_insert_asset":
{ Args: { "p_asset": Json,"p_kind": Database["public"]['Enums']["asset_kind"],"p_project_id": string,"p_user_id": string }; Returns: string
                           },
"apply_transition":
{ Args: { "p_actor": string,"p_actor_user_id": string,"p_error"?: string,"p_event": string,"p_expected_revision": number,"p_expected_status": Database["public"]['Enums']["project_status"],"p_ops"?: Json,"p_project_id": string,"p_to_status": Database["public"]['Enums']["project_status"] }; Returns: Json
                           },
"cancel_job":
{ Args: { "p_job_id": string,"p_reason": string }; Returns: undefined
                           },
"claim_job":
{ Args: { "p_job_id": string,"p_lease_seconds"?: number }; Returns: {
              "attempt": number,
"cost_estimate_usd": number | null,
"created_at": string,
"dispatch_attempts": number,
"dispatched_at": string | null,
"error": string | null,
"error_retryable": boolean | null,
"external_job_id": string | null,
"finished_at": string | null,
"id": string,
"idempotency_key": string,
"kind": Database["public"]['Enums']["job_kind"],
"locked_until": string | null,
"max_attempts": number,
"payload": NonNullable<Json>,
"project_id": string,
"project_revision": number,
"provider": string | null,
"result": Json | null,
"run_after": string,
"scene_id": string | null,
"started_at": string | null,
"status": Database["public"]['Enums']["job_status"],
"trigger_run_id": string | null,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "jobs"
        isOneToOne: true
        isSetofReturn: false
      } },
"complete_scene_part":
{ Args: { "p_error": string,"p_failure_event": string,"p_failure_status": Database["public"]['Enums']["project_status"],"p_job_id": string,"p_ok": boolean,"p_result": Json,"p_running_status": Database["public"]['Enums']["project_status"],"p_success_event": string,"p_success_status": Database["public"]['Enums']["project_status"] }; Returns: Json
                           },
"list_dispatchable_jobs":
{ Args: { "p_limit"?: number }; Returns: {
              "attempt": number,
"cost_estimate_usd": number | null,
"created_at": string,
"dispatch_attempts": number,
"dispatched_at": string | null,
"error": string | null,
"error_retryable": boolean | null,
"external_job_id": string | null,
"finished_at": string | null,
"id": string,
"idempotency_key": string,
"kind": Database["public"]['Enums']["job_kind"],
"locked_until": string | null,
"max_attempts": number,
"payload": NonNullable<Json>,
"project_id": string,
"project_revision": number,
"provider": string | null,
"result": Json | null,
"run_after": string,
"scene_id": string | null,
"started_at": string | null,
"status": Database["public"]['Enums']["job_status"],
"trigger_run_id": string | null,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "jobs"
        isOneToOne: false
        isSetofReturn: true
      } },
"mark_job_dispatched":
{ Args: { "p_job_id": string,"p_run_id": string }; Returns: undefined
                           },
"release_job_for_retry":
{ Args: { "p_delay_seconds": number,"p_error": string,"p_job_id": string }; Returns: string
                           }
          }
          Enums: {
            "approval_stage": "script"|"scenes"|"final","asset_kind": "scene_video"|"scene_image"|"narration_audio"|"render"|"cover","job_kind": "script"|"scene_video"|"narration"|"render"|"publish"|"insights","job_status": "queued"|"running"|"succeeded"|"failed"|"canceled","project_status": "DRAFT"|"SCRIPT_GENERATING"|"SCRIPT_FAILED"|"SCRIPT_REVIEW"|"SCENES_GENERATING"|"SCENES_FAILED"|"SCENES_REVIEW"|"NARRATION_GENERATING"|"NARRATION_FAILED"|"FINAL_REVIEW"|"RENDERING"|"RENDER_FAILED"|"RENDERED"|"SCHEDULED"|"PUBLISHING"|"PUBLISH_FAILED"|"PUBLISHED","publication_status": "scheduled"|"publishing"|"published"|"failed"|"canceled","scene_part_status": "pending"|"generating"|"ready"|"failed"|"stale"
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
            "approval_stage": ["script", "scenes", "final"],"asset_kind": ["scene_video", "scene_image", "narration_audio", "render", "cover"],"job_kind": ["script", "scene_video", "narration", "render", "publish", "insights"],"job_status": ["queued", "running", "succeeded", "failed", "canceled"],"project_status": ["DRAFT", "SCRIPT_GENERATING", "SCRIPT_FAILED", "SCRIPT_REVIEW", "SCENES_GENERATING", "SCENES_FAILED", "SCENES_REVIEW", "NARRATION_GENERATING", "NARRATION_FAILED", "FINAL_REVIEW", "RENDERING", "RENDER_FAILED", "RENDERED", "SCHEDULED", "PUBLISHING", "PUBLISH_FAILED", "PUBLISHED"],"publication_status": ["scheduled", "publishing", "published", "failed", "canceled"],"scene_part_status": ["pending", "generating", "ready", "failed", "stale"]
          }
        }
} as const
