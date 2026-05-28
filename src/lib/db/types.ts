/**
 * Database types — minimal hand-written subset used by the UI.
 *
 * NOTE: This is NOT auto-generated. Once we have Docker + supabase login,
 * regenerate via `pnpm db:types` for the full strongly-typed schema.
 * Until then we keep just enough shape so the UI compiles cleanly.
 */

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

interface BrandRow {
  id: string;
  workspace_id: string;
  slug: string;
  name: string;
  niche: string | null;
  voice_config: Json;
  target_personas: Json;
  default_platforms: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

interface OfferRow {
  id: string;
  workspace_id: string;
  brand_id: string;
  type: string;
  name: string;
  url: string | null;
  tracking_base_url: string | null;
  pitch_1_sentence: string | null;
  pitch_3_sentences: string | null;
  pitch_1_paragraph: string | null;
  cta_collection: Json;
  pricing_info: Json;
  is_primary: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface ContentRow {
  id: string;
  workspace_id: string;
  brand_id: string;
  offer_id: string | null;
  type: string;
  status: string;
  hook: string | null;
  script: string | null;
  caption: string | null;
  hashtags: string[];
  assets: Json;
  generation_meta: Json;
  cost_eur: number;
  created_at: string;
  updated_at: string;
}

interface PostRow {
  id: string;
  workspace_id: string;
  content_id: string;
  account_id: string;
  scheduled_at: string;
  published_at: string | null;
  status: string;
  posting_provider: string;
  platform_post_url: string | null;
  created_at: string;
  updated_at: string;
}

interface AccountRow {
  id: string;
  workspace_id: string;
  brand_id: string;
  platform: string;
  handle: string;
  status: string;
  health_score: number;
  created_at: string;
  updated_at: string;
}

interface WorkspaceRow {
  id: string;
  name: string;
  plan: string;
  monthly_budget_eur: number;
  created_at: string;
  updated_at: string;
}

type Insert<T> = Omit<T, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};
type Update<T> = Partial<T>;

export type Database = {
  public: {
    Tables: {
      brand: { Row: BrandRow; Insert: Insert<BrandRow>; Update: Update<BrandRow> };
      offer: { Row: OfferRow; Insert: Insert<OfferRow>; Update: Update<OfferRow> };
      content: { Row: ContentRow; Insert: Insert<ContentRow>; Update: Update<ContentRow> };
      post: { Row: PostRow; Insert: Insert<PostRow>; Update: Update<PostRow> };
      account: { Row: AccountRow; Insert: Insert<AccountRow>; Update: Update<AccountRow> };
      workspace: {
        Row: WorkspaceRow;
        Insert: Insert<WorkspaceRow>;
        Update: Update<WorkspaceRow>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
