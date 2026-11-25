# CreatorHub — managed creator membership platform

A full-stack Next.js 14 + Supabase web app where **your team runs memberships for many creators**, and each creator sees everything from their own dashboard. Members pay in INR (UPI Autopay, cards, netbanking) and get GST invoices automatically.

> **Status:** the code is complete, and the database is live on Supabase. Before launch you need to add your own service accounts (Razorpay, Mux, Zoom, Resend, WhatsApp) and deploy. Allow about 1–2 days for the setup below, plus Zoom's app review.

---

## What's included

| Area | Features |
|---|---|
| **Roles** | Platform admin/team (full control of every creator), creator owner/editor/moderator/accountant (dashboard access), members |
| **Storefront** | `yourdomain.com/<creator>` page: banner, intro video, tiers, testimonials, reviews, verified badge, waitlist with countdown, A/B-tested pricing headline and tier names |
| **Memberships** | Monthly, quarterly, yearly and lifetime tiers, free trials, coupons, Razorpay subscriptions with UPI Autopay, upgrade/downgrade, pause, cancel-flow saver (pause / discount / downgrade), win-back coupons, failed-payment dunning on email and WhatsApp |
| **Content** | Posts (text, images, gallery, video, polls, PDF downloads), scheduling, pinning, per-tier access, pay-per-view drops |
| **Video** | Mux direct upload, signed streaming, moving viewer watermark, watch-time analytics, preview clips for Instagram/Shorts with join CTA |
| **Courses** | Modules and lessons (video, text, PDF, quiz, assignment), drip release, progress, certificates (public verification), cohort batches with private spaces, assignment grading |
| **Live** | Zoom meetings auto-created, members join **inside the page** (Meeting SDK), 24h/15m reminders, auto-published replays, ticketed events |
| **1:1 bookings** | Session types, weekly availability, blocked time, paid slots, auto Zoom link, reminders |
| **Shop** | Digital products (PDFs stamped with buyer's name), merch for selected tiers with member discount, shipping and fulfilment tracking |
| **Gifting & referrals** | Gift memberships or gift cards with scheduled delivery; referral links that give 10% account credit |
| **Community** | Feed spaces with images and polls, real-time chat rooms, DMs with the creator, likes, threaded comments, reports, mute/ban, keyword filter |
| **Engagement** | Points, levels, badges (points, streaks, tenure, manual), 30-day challenges with daily check-ins, leaderboard, anniversary messages, events calendar with Google Calendar sync (private iCal feed) |
| **Messaging** | Email (Resend) + WhatsApp (Meta Cloud API) notifications, broadcasts by segment, drip sequences, automations (trigger → email/WhatsApp/DM/unlock course/badge/points/group invite/webhook) |
| **Integrations** | Signed outgoing webhooks (Zapier/Make), REST API with keys, CSV imports from Patreon/Graphy/Teachable/Telegram |
| **Finance** | Ledger per payment (GST, commission, TDS 194-O, creator net), GST tax invoices (PDF), GSTR-ready monthly CSV, refunds, payouts with UTR, collaboration revenue splits |
| **Compliance** | DPDP consent capture, data export, correction and deletion requests, legal page templates, audit log |
| **Admin** | Onboard creators, KYC/bank details, commission, verification, payments/refunds, payouts, services, users/roles, platform tax settings |

---

## 1. Database (already done)

Supabase project **creator-membership-platform** (`ivszbcegywibwsyryrgu`, Mumbai region) has every migration in `supabase/migrations` applied: tables, row-level security, storage buckets (`public`, `private`) and realtime.

**Your admin login:** anyone who signs up with an email listed in `platform_settings.admin_emails` becomes an admin automatically. It's set to `bigshotventures@gmail.com`. To change it, run this in the Supabase SQL editor:

```sql
update platform_settings set admin_emails = array['you@yourcompany.com'];
-- or promote an existing user:
update profiles set role = 'admin' where email = 'you@yourcompany.com';
```

### Supabase dashboard settings
1. **Authentication → URL configuration:** set Site URL to `https://yourdomain.com` and add `https://yourdomain.com/auth/callback` to Redirect URLs.
2. **Authentication → Email templates → Magic Link:** include `{{ .Token }}` so members get a 6-digit code. Example body: `Your code is {{ .Token }}`.
3. **Authentication → SMTP:** use Resend's SMTP so login emails aren't rate-limited.
4. **Authentication → Providers → Phone:** turn it on with an SMS provider (Twilio, MessageBird or Vonage) for mobile OTP. Indian DLT registration is required for SMS.
5. **Authentication → Providers → Google:** add a Google OAuth client ID and secret.
6. **Storage upload size:** the Free plan caps files at 50 MB. Upgrade to Pro to sell larger downloads. Videos go to Mux, so they aren't affected.
7. Copy the **service_role / secret key** (Project Settings → API keys) into `SUPABASE_SERVICE_ROLE_KEY`.

---

## 2. Third-party accounts

| Service | What to do | Env vars |
|---|---|---|
| **Razorpay** | Complete KYC. Enable **Subscriptions** and **UPI Autopay** (ask support if they're not visible). Create API keys. Add webhook `https://yourdomain.com/api/webhooks/razorpay` with events: `payment.captured`, `payment.failed`, `order.paid`, `subscription.*`, `refund.processed`. Razorpay needs your Terms, Privacy and Refund pages live (`/legal/*`). | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID` |
| **Mux** | Create an access token (Video read/write). Create a **signing key** (needed for protected playback). Add webhook `https://yourdomain.com/api/webhooks/mux`. | `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_PRIVATE_KEY`, `MUX_WEBHOOK_SECRET` |
| **Zoom** | In the Zoom Marketplace create (1) a **Server-to-Server OAuth** app with scopes `meeting:write:admin`, `meeting:read:admin`, `cloud_recording:read:admin` and event subscriptions `meeting.started`, `meeting.ended`, `recording.completed` → `https://yourdomain.com/api/webhooks/zoom`; (2) a **Meeting SDK** app, and submit it for review so non-account users can join (usually 1–3 weeks). Use a Zoom Pro/Business plan for cloud recording. | `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_SDK_KEY`, `ZOOM_SDK_SECRET`, `ZOOM_WEBHOOK_SECRET` |
| **Resend** | Verify your sending domain (SPF/DKIM). | `RESEND_API_KEY`, `EMAIL_FROM` |
| **WhatsApp** | In Meta Business Manager, set up WhatsApp Cloud API. Create a **Utility** template named `platform_update` with body `Hi {{1}}, {{2}}` and get it approved. | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG` |

Any service you haven't configured yet is skipped and logged instead of crashing the app. For example, emails are recorded in `message_log` with the status `skipped`.

---

## 3. Run locally

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
```

For local webhooks, use `ngrok http 3000` and point Razorpay, Mux and Zoom at the tunnel URL.

## 4. Deploy (Vercel, recommended)

1. Push this folder to a GitHub repo and import it in Vercel.
2. Add all env vars from `.env.example`, with `NEXT_PUBLIC_APP_URL=https://yourdomain.com`, and add a random `CRON_SECRET`.
3. Add your domain. Use the **Pro plan**, because `vercel.json` runs scheduled jobs every 5 minutes (reminders, scheduled posts, gifts, sequences), every hour (dunning, pauses, win-back, drip alerts) and daily (badges, anniversaries). Hobby only allows daily crons.
4. Set the Supabase Site URL and redirect URLs to the production domain.

## 5. Launch checklist

- [ ] Sign in with the admin email, then go to **Admin → Settings**: company name, GSTIN, PAN, state, address, GST rate, TDS rate, default commission
- [ ] Have your **CA confirm** the GST treatment (platform as supplier at 18%, SAC 999293), TDS rate under 194-O, and invoice format
- [ ] Have your **lawyer review** `/legal/terms`, `/privacy`, `/refunds`, `/creator-agreement`, `/grievance` (`src/lib/legal.ts`), and fill in the [bracketed] details
- [ ] **Admin → Creators → Onboard a creator**, then in their studio: Page settings → Tiers → Videos → Posts / Courses → Spaces → set status to *waitlist* or *live*
- [ ] Make a real ₹1 test purchase (a temporary tier or 100% coupon + ₹1) and check the invoice, ledger, welcome email and WhatsApp
- [ ] Test a subscription with UPI Autopay, then cancel it from Billing
- [ ] Schedule a test live session, join from a member account on a phone and a laptop, and check the replay appears
- [ ] Turn on Supabase **Point-in-Time Recovery** or daily backups (Pro)

## Project structure

```
supabase/migrations/     SQL schema, RLS policies, functions (already applied)
src/app/[creator]/       Public creator pages: storefront, posts, courses, live, community, shop, 1:1, challenges…
src/app/studio/[creator] Creator dashboard (team edits, creator views)
src/app/admin/           Platform admin
src/app/account, /me     Member account, billing, cancel flow, privacy
src/app/api/             Checkout, webhooks, video/zoom tokens, files, invoices, cron, REST API
src/actions/             Server actions (forms)
src/lib/                 Payments, tax, fulfilment, notifications, automations, Zoom, Mux, PDFs, cron jobs
```

## Notes & limits

- **Access control** lives in the database (RLS plus `can_read_post`, `can_read_lesson` and similar functions), so it holds even if a page has a bug. Videos use short-lived signed URLs. Zoom meeting IDs and passcodes never reach the browser.
- **Content protection:** the watermark and stamped PDFs deter sharing and let you trace leaks. A browser can't fully stop screen recording. For DRM, enable Mux DRM (paid add-on).
- **Plan changes** apply at the next renewal. Razorpay doesn't support mid-cycle plan changes for UPI mandates.
- **Retention discount** works by automatically refunding the agreed percentage of the next renewal.
- **Large broadcasts** are sent one by one inside a cron or request. For audiences over a few thousand, move sending to a queue (for example Inngest or Supabase Queues).
- Bank account numbers aren't stored, only the last 4 digits. Pay creators from your bank or RazorpayX and record the UTR.
