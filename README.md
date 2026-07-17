# Store Operations Engine

Task & checklist management PWA for convenience store chains — implementation of **PRD v1.2 (Final)**, styled after the approved Claude Design prototype (`Store Operations Engine.dc.html`).

## Stack

- **Frontend:** React 18 + TypeScript + Vite, Tailwind CSS, Phosphor icons, TanStack Query, React Router
- **Backend:** Supabase (project `store-operations-engine`, ref `ttgubeyxuwkwaovugkxz`, eu-west-2) — Postgres with RLS branch isolation, Auth, Storage (`evidence` bucket), Realtime
- **PWA:** vite-plugin-pwa — installable manifest, service worker with precache + runtime caching, app shortcuts

## Run

```bash
cd app
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
npm run preview    # serve production build (http://localhost:4173)
```

Supabase URL/key are in `.env` (already configured).

## Demo accounts (password: `StoreOps!2026`)

| Account | Role | Surface |
|---|---|---|
| gareeth@storeops.demo | Owner | Desktop dashboard (all 3 stores) |
| maya@storeops.demo | Manager | Monitoring dashboard (read-oriented) |
| ken@storeops.demo | Team Leader (Londis) | Tablet approvals + can open Staff Portal |
| amara@storeops.demo | Staff (Londis) | Phone Staff Portal |
| priya@storeops.demo | Staff (General Food Store) | Phone Staff Portal |
| remote@storeops.demo | Remote Office | Deliveries review |

## What's implemented (Sprint 1 + parts of Sprint 2/3)

- **Auth & roles:** email/password, session persistence, role-based routing, RLS-enforced branch isolation (verified at API level — staff cannot read other stores' data)
- **Data model:** full PRD §7.2 schema (templates, instances, checklist items, evidence, deliveries, invoices, messages, approvals, escalations, notifications, push subscriptions, append-only audit log) + Appendix A seeded task pack
- **Staff surface:** home grid ("Store Operations"), due-now strip, My Tasks (overdue-first), Alerts, Profile with PWA install; checklist runner (check rows, camera photo upload → Storage + evidence rows, QR check, temp fields, signature canvas, progress bar, geofence block policy); structured Temperature Log with per-unit thresholds and breach detection; 4-step Delivery wizard (36h Remote-Office SLA); Incident report (24h SLA)
- **Escalation engine (client-side v1):** temp breach → instant Owner escalation + auto-created maintenance task; delivery discrepancy → Owner escalation; incidents → TL/Owner with action deadline
- **Owner desktop:** live KPI tiles (Active/Completed/Pending/Overdue/Compliance), store switcher, store status cards, deliveries, overdue & missed, pending approvals (approve / reject-with-feedback / reopen), escalations (investigate/resolve), compliance bars, reports page, stores & geofence page, create-task modal, notifications popover
- **Team Leader tablet:** approvals grid scoped to their store, escalations view
- **Realtime:** postgres_changes subscription → dashboards update without refresh
- **Geofencing:** point-of-action verification (Haversine vs. store fence, accuracy-aware), verdict stamped on submissions and evidence
- **PWA:** manifest, icons, shortcuts, service worker (precache, network-first API cache)

## Week 2–3 additions (implemented)

- **Scheduler engine (pg_cron, every minute):** materializes recurring instances from templates — daily times, day exclusions (ISO weekday), multi-day weekly patterns, month-end *pending-until-complete* tasks, and clock-in-triggered routine tasks with shift-relative deadlines from the in-app roster. Sends 30-min reminders, overdue alerts (staff + Team Leader), and cutoff escalations to the Owner (marking non-PUC tasks *Missed*). Checklist items auto-expand from templates via DB trigger.
- **Web Push end-to-end:** VAPID keypair, `push-fanout` Edge Function (web-push over `push_subscriptions` for unsent notifications, prunes dead endpoints, tracks sent/delivered), custom injectManifest service worker with `push`/`notificationclick` deep-link handlers, "Enable notifications" in staff Profile, instant client-side fan-out trigger + every-minute pg_cron sweep.
- **Offline queue (Dexie):** temp log / delivery / incident submissions queue locally when offline ("Saved offline ⟳" state) and flush automatically on reconnect or app start.
- **Inbox (FR-11):** owner/manager two-pane messaging with compose, staff thread list + conversation view, presence dots (Available/Offline), unread badges, read receipts (✓✓), push + in-app notification on new message. RLS: only sender/recipient (and Owner) can read a thread.
- **Invoice Upload (FR-4.1a / FR-6.6):** camera scan → client-side contrast enhancement → embedded into an A4 PDF (jsPDF) → uploaded to the `invoices` bucket filed by `store/supplier/yyyy-MM` + `invoices` row; Remote-Office step skipped. Owner sees the invoice folder (signed-URL PDF open) under Deliveries.
- **Real QR scanning:** camera scanner (jsQR) for "QR required" checklist items; payload stored as evidence with geofence verdict.
- **Report exports:** real CSV/Excel download of the task register and a generated PDF compliance summary.

## Backlog round (implemented)

- **Admin section** (`/owner/admin`, Owner-only nav): **Template builder** — full editor with plain-language recurrence summary ("Every Mon & Thu at 21:00", "Daily except Wed"), day-exclusion/weekday toggles, times/deadline/escalate-at, month-end and clock-in modes, evidence toggles, geofence policy, and a reorderable checklist-item editor with per-item photo/temp-limit/QR flags; templates feed the scheduler within a minute (verified end-to-end). **Users** — list with presence, create accounts (owner-only `admin-users` Edge Function using the service role; staff callers get 403), edit role/name/store assignments. **Units** — chiller/freezer registry CRUD with safe-limit and escalation thresholds. **QR codes** — generated per store unit/zone (`storeops:asset:{store}:{zone}` payloads scanned by the checklist runner) with a printable sheet. **Geofence** — lat/lng editor with "use my location", radius slider with live preview.
- **Remote-Office delivery review (FR-6.4 step 2):** Review modal capturing cost per original invoice, final quantity, EPOS-updated flag and stock shortages → marks the delivery *Verified* and pushes an approval request to the Owner; Owner approve/reject buttons now appear only at the correct workflow stage.
- **iOS install-then-enable onboarding (PWA-6):** on iOS Safari outside standalone mode, the push toggle is replaced with a guided Add-to-Home-Screen walkthrough; Enable unlocks after install.
- **Email digest fallback (FR-5.2):** `email-digest` Edge Function (daily 06:00 cron) groups each user's unread notifications into a digest, sent via Resend when `RESEND_API_KEY` is present in `app_secrets` (or env); until then it no-ops and reports what it would send.
- **Secrets hardening:** VAPID keys moved to the service-role-only `app_secrets` table (RLS enabled, zero policies); `push-fanout` v2 reads from it with env-var override.

## Remaining backlog

- Notification preferences / quiet hours UI (post-launch per PRD §10)
- Workflow chain builder for custom multi-step approval paths (delivery + incident chains are built-in)
- Capacitor wrapper for OS-level background geofencing / app-store presence
- EPOS integration (Phase 4), WhatsApp channel (client nice-to-have, separate quote)
- Configure `RESEND_API_KEY` + `EMAIL_FROM` in `app_secrets` to activate the email digest
