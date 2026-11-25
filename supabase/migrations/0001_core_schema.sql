-- CreatorHub core schema
-- Money is stored in paise (integer). Times are timestamptz (UTC).

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ───────────── Enums ─────────────
create type platform_role as enum ('admin','team','creator','member');
create type creator_team_role as enum ('owner','editor','moderator','accountant');
create type creator_status as enum ('draft','waitlist','live','suspended');
create type billing_period as enum ('monthly','quarterly','yearly','lifetime');
create type membership_status as enum ('trialing','active','past_due','paused','cancelled','expired');
create type order_kind as enum ('membership','course','product','ppv','booking','event','gift','merch','service','cohort');
create type order_status as enum ('created','paid','failed','refunded','partially_refunded');
create type content_visibility as enum ('public','members','tiers','ppv');
create type publish_status as enum ('draft','scheduled','published','archived');

-- ───────────── Platform ─────────────
create table platform_settings (
  id boolean primary key default true check (id),
  company_name text not null default 'Your Company Pvt Ltd',
  brand_name text not null default 'CreatorHub',
  gstin text,
  pan text,
  state_code text not null default '27',           -- GST state code of the platform (27 = Maharashtra)
  address text,
  support_email text,
  gst_rate numeric(5,2) not null default 18,
  tds_rate numeric(5,3) not null default 0.1,       -- Sec 194-O rate in %, confirm with CA
  prices_include_gst boolean not null default true,
  default_commission_pct numeric(5,2) not null default 20,
  invoice_prefix text not null default 'INV',
  dunning_grace_days int not null default 7,
  updated_at timestamptz not null default now()
);
insert into platform_settings default values;

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext,
  phone text,
  full_name text,
  avatar_url text,
  bio text,
  role platform_role not null default 'member',
  state_code text,                                  -- buyer GST state for place of supply
  email_opt_in boolean not null default true,
  whatsapp_opt_in boolean not null default false,
  calendar_token text not null default encode(gen_random_bytes(16),'hex'),
  referral_code text unique default lower(substr(encode(gen_random_bytes(6),'hex'),1,8)),
  credit_paise int not null default 0 check (credit_paise >= 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table creators (
  id uuid primary key default gen_random_uuid(),
  slug citext unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{2,40}$'),
  name text not null,
  tagline text,
  bio text,
  category text,
  avatar_url text,
  banner_url text,
  intro_video_id uuid,
  testimonials jsonb not null default '[]',
  socials jsonb not null default '{}',
  theme jsonb not null default '{"accent":"#7c3aed"}',
  status creator_status not null default 'draft',
  launch_at timestamptz,
  verified boolean not null default false,
  commission_pct numeric(5,2),
  creator_edit_enabled boolean not null default false,   -- team manages; flip to let creator owner/editors edit
  legal_name text,
  pan text,
  gstin text,
  address text,
  kyc_status text not null default 'pending' check (kyc_status in ('pending','submitted','verified','rejected')),
  bank_account_name text,
  bank_account_last4 text,
  bank_ifsc text,
  razorpay_account_id text,
  custom_domain text unique,
  whatsapp_group_link text,
  settings jsonb not null default '{"winback_days":7,"winback_coupon":null,"pause_max_months":3,"cancel_offer_pct":20}',
  created_at timestamptz not null default now()
);

create table creator_team (
  creator_id uuid references creators(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role creator_team_role not null,
  created_at timestamptz not null default now(),
  primary key (creator_id, user_id)
);

-- ───────────── Tiers & memberships ─────────────
create table tiers (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  name text not null,
  description text,
  perks text[] not null default '{}',
  price_monthly int, price_quarterly int, price_yearly int, price_lifetime int,
  trial_days int not null default 0,
  position int not null default 0,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  razorpay_plan_ids jsonb not null default '{}',
  whatsapp_group_link text,
  merch_discount_pct int not null default 0,
  created_at timestamptz not null default now()
);

create table waitlist (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  email citext not null,
  name text, phone text,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (creator_id, email)
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete cascade,
  tier_id uuid not null references tiers(id),
  status membership_status not null default 'active',
  billing_period billing_period not null default 'monthly',
  source text not null default 'purchase' check (source in ('purchase','gift','comp','import')),
  razorpay_subscription_id text unique,
  pending_tier_id uuid references tiers(id),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  paused_until timestamptz,
  failed_attempts int not null default 0,
  last_dunning_at timestamptz,
  referred_by uuid references profiles(id),
  started_at timestamptz not null default now(),
  cancelled_at timestamptz,
  winback_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, creator_id)
);

create table cancel_feedback (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid references memberships(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  creator_id uuid references creators(id) on delete cascade,
  reason text not null,
  details text,
  outcome text not null check (outcome in ('cancelled','paused','discount','downgraded')),
  created_at timestamptz not null default now()
);

create table coupons (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  code citext not null,
  kind text not null check (kind in ('percent','flat')),
  value int not null check (value > 0),
  applies_to text not null default 'any' check (applies_to in ('any','membership','course','product','booking','event')),
  applies_ids uuid[] not null default '{}',
  max_redemptions int,
  redeemed_count int not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  internal boolean not null default false,          -- generated for win-back / cancel offers
  created_at timestamptz not null default now(),
  unique (creator_id, code)
);

-- ───────────── Money ─────────────
create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  creator_id uuid not null references creators(id),
  kind order_kind not null,
  item_id uuid,
  billing_period billing_period,
  quantity int not null default 1,
  subtotal_paise int not null,
  discount_paise int not null default 0,
  credit_used_paise int not null default 0,
  total_paise int not null,
  coupon_id uuid references coupons(id),
  status order_status not null default 'created',
  razorpay_order_id text unique,
  razorpay_subscription_id text,
  razorpay_payment_id text,
  buyer_state_code text,
  shipping_address jsonb,
  fulfillment_status text check (fulfillment_status in ('pending','shipped','delivered','cancelled')),
  tracking_info text,
  ab_variant jsonb,
  referral_code text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  membership_id uuid references memberships(id),
  user_id uuid not null references profiles(id),
  creator_id uuid not null references creators(id),
  kind order_kind not null,
  razorpay_payment_id text unique not null,
  method text,
  amount_paise int not null,        -- what the buyer paid
  taxable_paise int not null,
  gst_paise int not null,
  platform_fee_paise int not null,  -- commission on taxable value
  tds_paise int not null,
  creator_net_paise int not null,
  refunded_paise int not null default 0,
  status text not null default 'captured' check (status in ('captured','refunded','partially_refunded')),
  payout_id uuid,
  created_at timestamptz not null default now()
);

create table revenue_splits (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  item_kind order_kind not null,
  item_id uuid not null,
  partner_creator_id uuid not null references creators(id),
  pct numeric(5,2) not null check (pct > 0 and pct < 100),
  created_at timestamptz not null default now(),
  unique (item_kind, item_id, partner_creator_id)
);

create table payment_splits (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  creator_id uuid not null references creators(id),
  amount_paise int not null,
  payout_id uuid
);

create table invoice_counters (fy text primary key, last_no int not null default 0);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid unique references payments(id),
  invoice_number text unique not null,
  user_id uuid references profiles(id),
  creator_id uuid references creators(id),
  buyer jsonb not null,
  seller jsonb not null,
  line_description text not null,
  taxable_paise int not null,
  cgst_paise int not null default 0,
  sgst_paise int not null default 0,
  igst_paise int not null default 0,
  total_paise int not null,
  place_of_supply text,
  created_at timestamptz not null default now()
);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id),
  amount_paise int not null,
  reason text,
  razorpay_refund_id text unique,
  status text not null default 'initiated',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table payouts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id),
  period_start date not null,
  period_end date not null,
  gross_paise int not null,
  gst_paise int not null,
  platform_fee_paise int not null,
  tds_paise int not null,
  refunds_paise int not null default 0,
  net_paise int not null,
  status text not null default 'pending' check (status in ('pending','paid','on_hold')),
  utr text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete cascade,
  kind text not null check (kind in ('course','product','post','event','booking','cohort')),
  item_id uuid not null,
  order_id uuid references orders(id),
  created_at timestamptz not null default now(),
  unique (user_id, kind, item_id)
);

create table gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default upper(substr(encode(gen_random_bytes(8),'hex'),1,12)),
  creator_id uuid not null references creators(id),
  kind text not null check (kind in ('membership','credit')),
  tier_id uuid references tiers(id),
  months int,
  amount_paise int,
  purchaser_id uuid references profiles(id),
  recipient_email citext not null,
  recipient_name text,
  message text,
  occasion text,
  deliver_at timestamptz not null default now(),
  delivered_at timestamptz,
  redeemed_by uuid references profiles(id),
  redeemed_at timestamptz,
  order_id uuid references orders(id),
  status text not null default 'pending_payment' check (status in ('pending_payment','scheduled','delivered','redeemed','void')),
  created_at timestamptz not null default now()
);

create table referrals (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id),
  referrer_id uuid not null references profiles(id),
  referred_id uuid not null references profiles(id),
  order_id uuid references orders(id),
  reward_paise int not null default 0,
  created_at timestamptz not null default now(),
  unique (creator_id, referred_id)
);

-- ───────────── Content ─────────────
create table videos (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  title text not null,
  mux_upload_id text,
  mux_asset_id text unique,
  mux_playback_id text,
  duration_s numeric,
  aspect_ratio text,
  status text not null default 'waiting' check (status in ('waiting','processing','ready','errored')),
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
alter table creators add constraint creators_intro_video_fk foreign key (intro_video_id) references videos(id) on delete set null;

create table posts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  author_id uuid references profiles(id),
  title text not null,
  excerpt text,
  cover_url text,
  kind text not null default 'text' check (kind in ('text','image','video','gallery','poll','file','audio')),
  visibility content_visibility not null default 'members',
  tier_ids uuid[] not null default '{}',
  ppv_price_paise int,
  pinned boolean not null default false,
  status publish_status not null default 'draft',
  publish_at timestamptz,
  published_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

create table post_bodies (
  post_id uuid primary key references posts(id) on delete cascade,
  body text not null default '',
  images text[] not null default '{}',
  video_id uuid references videos(id) on delete set null,
  attachments jsonb not null default '[]'      -- [{name, path, stamp:boolean}]
);

create table polls (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  post_id uuid references posts(id) on delete cascade,
  space_post_id uuid,
  question text not null,
  multiple boolean not null default false,
  closes_at timestamptz,
  created_at timestamptz not null default now()
);
create table poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references polls(id) on delete cascade,
  label text not null,
  position int not null default 0
);
create table poll_votes (
  poll_id uuid references polls(id) on delete cascade,
  option_id uuid references poll_options(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, option_id, user_id)
);

create table preview_clips (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  source_video_id uuid references videos(id) on delete set null,
  clip_video_id uuid references videos(id) on delete set null,
  slug text not null,
  title text not null,
  caption text,
  start_s numeric not null,
  end_s numeric not null,
  cta_label text not null default 'Join to watch the full video',
  views int not null default 0,
  clicks int not null default 0,
  created_at timestamptz not null default now(),
  unique (creator_id, slug)
);

-- ───────────── Courses ─────────────
create table courses (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  slug text not null,
  title text not null,
  subtitle text,
  description text,
  cover_url text,
  price_paise int,                   -- null = only via tiers
  tier_ids uuid[] not null default '{}',
  is_cohort boolean not null default false,
  certificate_enabled boolean not null default true,
  status publish_status not null default 'draft',
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (creator_id, slug)
);
create table course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  title text not null,
  position int not null default 0
);
create table lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  module_id uuid not null references course_modules(id) on delete cascade,
  title text not null,
  kind text not null default 'video' check (kind in ('video','text','pdf','quiz','assignment')),
  duration_s int,
  drip_days int not null default 0,
  is_preview boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create table lesson_contents (
  lesson_id uuid primary key references lessons(id) on delete cascade,
  body text not null default '',
  video_id uuid references videos(id) on delete set null,
  file_path text,
  stamp_pdf boolean not null default true
);
create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  question text not null,
  options text[] not null,
  correct_index int not null,
  position int not null default 0
);
create table quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  answers int[] not null,
  score int not null,
  total int not null,
  created_at timestamptz not null default now()
);
create table cohorts (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  enroll_closes_at timestamptz,
  capacity int,
  price_paise int,
  space_id uuid,
  created_at timestamptz not null default now()
);
create table enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  cohort_id uuid references cohorts(id) on delete set null,
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (course_id, user_id)
);
create table lesson_progress (
  user_id uuid references profiles(id) on delete cascade,
  lesson_id uuid references lessons(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  position_s int not null default 0,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create table assignments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  cohort_id uuid references cohorts(id) on delete cascade,
  instructions text,
  due_at timestamptz,
  max_score int not null default 10
);
create table submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  body text,
  file_path text,
  score int,
  feedback text,
  graded_by uuid references profiles(id),
  submitted_at timestamptz not null default now(),
  graded_at timestamptz,
  unique (assignment_id, user_id)
);
create table certificates (
  id uuid primary key default gen_random_uuid(),
  serial text unique not null default upper(substr(encode(gen_random_bytes(6),'hex'),1,10)),
  user_id uuid not null references profiles(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  issued_at timestamptz not null default now(),
  unique (user_id, course_id)
);

-- ───────────── Shop ─────────────
create table products (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  kind text not null check (kind in ('digital','merch')),
  title text not null,
  description text,
  cover_url text,
  price_paise int not null check (price_paise >= 0),
  files jsonb not null default '[]',          -- [{name, path, stamp}]
  stock int,
  eligible_tier_ids uuid[] not null default '{}',   -- merch: restrict to tiers (empty = anyone)
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- ───────────── Live & bookings ─────────────
create table live_sessions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  duration_min int not null default 60,
  visibility content_visibility not null default 'members',
  tier_ids uuid[] not null default '{}',
  ticket_price_paise int,                 -- paid event for non-members when visibility='ppv'
  zoom_meeting_id text,
  zoom_password text,
  recording_video_id uuid references videos(id) on delete set null,
  publish_recording boolean not null default true,
  reminder_24h_sent boolean not null default false,
  reminder_15m_sent boolean not null default false,
  status text not null default 'scheduled' check (status in ('scheduled','live','ended','cancelled')),
  created_at timestamptz not null default now()
);

create table booking_types (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  title text not null,
  description text,
  duration_min int not null default 30,
  buffer_min int not null default 10,
  price_paise int not null,
  min_notice_hours int not null default 12,
  max_days_ahead int not null default 30,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table availability (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),   -- 0 = Sunday, IST
  start_time time not null,
  end_time time not null check (end_time > start_time)
);
create table availability_blocks (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null
);
create table bookings (
  id uuid primary key default gen_random_uuid(),
  booking_type_id uuid not null references booking_types(id),
  creator_id uuid not null references creators(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending_payment' check (status in ('pending_payment','confirmed','cancelled','completed','no_show')),
  notes text,
  zoom_meeting_id text,
  zoom_password text,
  order_id uuid references orders(id),
  reminder_sent boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index bookings_no_double on bookings (creator_id, starts_at) where status in ('pending_payment','confirmed');

-- ───────────── Community ─────────────
create table spaces (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  name text not null,
  description text,
  kind text not null default 'feed' check (kind in ('feed','chat')),
  tier_ids uuid[] not null default '{}',
  cohort_id uuid references cohorts(id) on delete cascade,
  members_can_post boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);
alter table cohorts add constraint cohorts_space_fk foreign key (space_id) references spaces(id) on delete set null;

create table space_posts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  images text[] not null default '{}',
  is_announcement boolean not null default false,
  pinned boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
alter table polls add constraint polls_space_post_fk foreign key (space_post_id) references space_posts(id) on delete cascade;

create table comments (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  target_type text not null check (target_type in ('post','space_post','lesson','live')),
  target_id uuid not null,
  parent_id uuid references comments(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null check (length(body) between 1 and 5000),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index on comments (target_type, target_id, created_at);

create table reactions (
  user_id uuid references profiles(id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  creator_id uuid not null references creators(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null check (length(body) between 1 and 2000),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index on chat_messages (space_id, created_at);

create table direct_messages (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  member_id uuid not null references profiles(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text not null check (length(body) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on direct_messages (creator_id, member_id, created_at);

create table reports (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  reporter_id uuid not null references profiles(id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  reason text not null,
  status text not null default 'open' check (status in ('open','actioned','dismissed')),
  resolved_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table member_restrictions (
  creator_id uuid references creators(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  kind text not null check (kind in ('muted','banned')),
  until timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  primary key (creator_id, user_id)
);

create table blocked_keywords (
  creator_id uuid references creators(id) on delete cascade,
  keyword text not null,
  primary key (creator_id, keyword)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  creator_id uuid references creators(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, created_at desc);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('creator','course','product')),
  target_id uuid not null,
  rating int not null check (rating between 1 and 5),
  body text,
  hidden boolean not null default false,
  reply text,
  created_at timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);

-- ───────────── Gamification ─────────────
create table member_stats (
  creator_id uuid references creators(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  points int not null default 0,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_active_date date,
  primary key (creator_id, user_id)
);
create table points_ledger (
  id bigint generated always as identity primary key,
  creator_id uuid not null references creators(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  points int not null,
  reason text not null,
  ref_id uuid,
  created_at timestamptz not null default now()
);
create table levels (
  creator_id uuid references creators(id) on delete cascade,
  level int not null,
  name text not null,
  min_points int not null,
  perk text,
  unlock_course_id uuid references courses(id) on delete set null,
  primary key (creator_id, level)
);
create table badges (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references creators(id) on delete cascade,   -- null = platform badge
  code text not null,
  name text not null,
  description text,
  icon text not null default '🏅',
  rule jsonb not null default '{}',     -- {"type":"points","gte":500} | {"type":"tenure_months","gte":12} | {"type":"streak","gte":7} | {"type":"manual"}
  unique (creator_id, code)
);
create table user_badges (
  user_id uuid references profiles(id) on delete cascade,
  badge_id uuid references badges(id) on delete cascade,
  creator_id uuid references creators(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);
create table challenges (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  days int not null default 30 check (days between 1 and 365),
  tier_ids uuid[] not null default '{}',
  points_per_checkin int not null default 10,
  completion_badge_id uuid references badges(id) on delete set null,
  daily_prompts text[] not null default '{}',
  created_at timestamptz not null default now()
);
create table challenge_participants (
  challenge_id uuid references challenges(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (challenge_id, user_id)
);
create table challenge_checkins (
  challenge_id uuid references challenges(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  day int not null,
  note text,
  created_at timestamptz not null default now(),
  primary key (challenge_id, user_id, day)
);

-- ───────────── Messaging & automation ─────────────
create table email_campaigns (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  subject text not null,
  body text not null,
  channel text not null default 'email' check (channel in ('email','whatsapp','both')),
  segment jsonb not null default '{"type":"all_members"}',
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  sent_count int not null default 0,
  created_at timestamptz not null default now()
);
create table sequences (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  name text not null,
  trigger text not null check (trigger in ('member_joined','waitlist_joined','member_cancelled','course_enrolled','purchase')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references sequences(id) on delete cascade,
  position int not null,
  delay_hours int not null default 24,
  channel text not null default 'email' check (channel in ('email','whatsapp')),
  subject text,
  body text not null
);
create table sequence_runs (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references sequences(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  email citext,
  next_step int not null default 0,
  next_run_at timestamptz not null,
  status text not null default 'active' check (status in ('active','done','stopped')),
  created_at timestamptz not null default now()
);
create table automations (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  name text not null,
  trigger text not null,            -- member_joined, member_cancelled, tier_changed, purchase, course_completed, challenge_completed, payment_failed, level_up
  conditions jsonb not null default '{}',   -- {"tier_id": "...", "kind": "course"}
  actions jsonb not null default '[]',      -- [{"type":"send_email","subject":"..","body":".."}, {"type":"send_whatsapp","template":".."}, {"type":"grant_course","course_id":".."}, {"type":"award_badge","badge_id":".."}, {"type":"grant_points","points":50}, {"type":"send_dm","body":".."}, {"type":"whatsapp_group_invite"}, {"type":"webhook","url":".."}]
  active boolean not null default true,
  run_count int not null default 0,
  created_at timestamptz not null default now()
);
create table automation_runs (
  id bigint generated always as identity primary key,
  automation_id uuid not null references automations(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  status text not null,
  log text,
  created_at timestamptz not null default now()
);
create table message_log (
  id bigint generated always as identity primary key,
  creator_id uuid references creators(id) on delete set null,
  user_id uuid references profiles(id) on delete set null,
  channel text not null check (channel in ('email','whatsapp')),
  recipient text not null,
  template text,
  status text not null,
  provider_id text,
  error text,
  created_at timestamptz not null default now()
);
create table webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  url text not null check (url ~ '^https://'),
  secret text not null default encode(gen_random_bytes(24),'hex'),
  events text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table webhook_deliveries (
  id bigint generated always as identity primary key,
  endpoint_id uuid not null references webhook_endpoints(id) on delete cascade,
  event text not null,
  status_code int,
  error text,
  created_at timestamptz not null default now()
);
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ───────────── Growth ─────────────
create table ab_tests (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  name text not null,
  variants jsonb not null,          -- [{"key":"A","headline":"..","tier_names":{"<tier_id>":"Pro"}}, {"key":"B",...}]
  status text not null default 'running' check (status in ('draft','running','stopped')),
  winner text,
  created_at timestamptz not null default now()
);
create table ab_events (
  id bigint generated always as identity primary key,
  test_id uuid not null references ab_tests(id) on delete cascade,
  variant text not null,
  visitor_id text not null,
  event text not null check (event in ('view','checkout','conversion')),
  created_at timestamptz not null default now()
);
create table imports (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  source text not null check (source in ('patreon','graphy','teachable','telegram','csv')),
  kind text not null check (kind in ('members','posts')),
  status text not null default 'processing',
  stats jsonb not null default '{}',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ───────────── Services, compliance, audit ─────────────
create table service_packages (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  description text,
  price_paise int not null,
  active boolean not null default true
);
insert into service_packages (code,title,description,price_paise) values
 ('course_setup','Course setup','We structure your course, upload lessons, quizzes and certificates.',1499900),
 ('video_editing','Video editing (per 10 videos)','Cuts, captions, thumbnails and intros for up to 10 videos.',999900),
 ('launch_support','Launch support','Launch plan, waitlist page, emails, WhatsApp sequence and launch-day live.',2499900);

create table service_orders (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  package_id uuid not null references service_packages(id),
  brief text,
  status text not null default 'requested' check (status in ('requested','quoted','in_progress','delivered','cancelled')),
  price_paise int not null,
  assigned_to uuid references profiles(id),
  order_id uuid references orders(id),
  created_at timestamptz not null default now()
);

create table consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  purpose text not null,          -- terms_privacy, marketing_email, whatsapp
  granted boolean not null,
  notice_version text not null default 'v1',
  created_at timestamptz not null default now()
);
create table data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('export','deletion','correction')),
  status text not null default 'open' check (status in ('open','completed','rejected')),
  note text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references profiles(id) on delete set null,
  creator_id uuid references creators(id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table video_views (
  user_id uuid references profiles(id) on delete cascade,
  video_id uuid references videos(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete cascade,
  day date not null default current_date,
  seconds int not null default 0,
  primary key (user_id, video_id, day)
);

-- Helpful indexes
create index on memberships (creator_id, status);
create index on payments (creator_id, created_at);
create index on posts (creator_id, status, published_at desc);
create index on orders (user_id, created_at desc);
create index on space_posts (space_id, created_at desc);
create index on live_sessions (creator_id, starts_at);
create index on bookings (creator_id, starts_at);
create index on sequence_runs (status, next_run_at);
