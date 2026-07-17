# Store Operations Engine — End-to-End Test Plan (UAT)

Covers every implemented feature against **PRD v1.2 (Final)**. Each test lists steps and the expected result. Tests marked **[AC-n]** map to the PRD §11 acceptance criteria.

---

## 0 · Environment & preconditions

| Item | Value |
|---|---|
| App (dev) | `cd app && npm run dev` → http://localhost:5173 |
| App (prod build) | `npm run build && npm run preview` → http://localhost:4173 (use this for PWA/service-worker tests) |
| Backend | Supabase project `store-operations-engine` (`ttgubeyxuwkwaovugkxz`, eu-west-2) |
| SQL editor | Supabase Dashboard → SQL — needed for the scheduler time-travel helpers in §12 |
| Password (all demo accounts) | `StoreOps!2026` |

**Demo accounts**

| Email | Role | Store scope |
|---|---|---|
| gareeth@storeops.demo | Owner | All 3 stores |
| maya@storeops.demo | Manager | All 3 (monitoring only) |
| ken@storeops.demo | Team Leader | Londis |
| amara@storeops.demo | Staff | Londis |
| priya@storeops.demo | Staff | General Food Store |
| remote@storeops.demo | Remote Office | All 3 |
| jess@storeops.demo | Staff | Londis (created via Admin function) |

**P-1 · Fix the geofence to your location (do this first).**
The seeded stores are geofenced to real London coordinates, so from anywhere else every geofenced flow reports *Off-site* and block-policy tasks refuse to submit — which is correct behaviour, but gets in the way of the rest of the plan.
1. Sign in as **gareeth** → **Admin → Geofence**.
2. On the **Londis** card press **Use my location** (allow the browser prompt), leave radius 100 m, press **Save**.
3. Repeat for the other two stores if you'll test Priya's flows.
   *Alternative:* keep the real coordinates and use Chrome DevTools → ⋮ → More tools → Sensors → Location override (Londis: 51.4279, −0.1235) to test both inside- and outside-fence behaviour precisely.

**P-2 · Two browsers.** Several tests need two roles side by side (realtime, messaging, push). Use a normal window for the Owner and an incognito/second browser for staff.

**P-3 · Reset between runs (optional).** Approving/submitting mutates data. Nothing here breaks re-runs, but if you want a pristine approvals queue, re-seed or accept the current state — every test below states its own precondition.

---

## 1 · Authentication & role routing

**T1.1 Login screen.** Open the app signed out. → Navy login screen with brand mark, email/password form, and 4 demo quick-select buttons.

**T1.2 Wrong password.** Enter `gareeth@storeops.demo` / `wrong`. → Inline red error ("Invalid login credentials"); no navigation.

**T1.3 Role landing (repeat per account).**
| Login | Expected landing |
|---|---|
| gareeth | `/owner` — desktop dashboard, sidebar shows 8 items incl. **Admin** |
| maya | `/owner` — dashboard, **no** "New task" button, **no** Admin nav item, approve buttons absent for her role checks in later tests |
| remote | `/owner` — dashboard; Deliveries page shows the **Review** action |
| ken | `/leader` — tablet rail with Approvals/Escalations, plus a phone icon that opens the Staff Portal |
| amara / priya / jess | `/staff` — phone-style shell, bottom tabs Home · Tasks · ➕ · Alerts · Profile |

**T1.4 Session persistence.** Sign in, refresh the tab, close and reopen the browser. → Still signed in (PWA re-login should be rare, PRD §4.2).

**T1.5 Deep-link guard.** As amara, manually visit `/owner`. → Redirected to `/staff`. As gareeth visit `/leader`. → Redirected to `/owner`.

**T1.6 Sign out.** Owner sidebar → Sign out; staff Profile → Sign out. → Return to login; presence dot for that user turns grey for others (see T9.6).

---

## 2 · Branch isolation (RLS) **[AC-7]**

**T2.1 UI scope.** As amara, open Tasks/Home. → Only Londis tasks ever appear. As priya → only General Food Store tasks.

**T2.2 API-level proof (the real test).** In a terminal:
```powershell
$anon="sb_publishable_NakX_WLVQuSL8x2ld5dGdw_tW3kLjBf"; $base="https://ttgubeyxuwkwaovugkxz.supabase.co"
$tok=(Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers @{apikey=$anon;"Content-Type"="application/json"} -Body '{"email":"amara@storeops.demo","password":"StoreOps!2026"}').access_token
(Invoke-RestMethod -Uri "$base/rest/v1/task_instances?select=store_id" -Headers @{apikey=$anon;Authorization="Bearer $tok"}) | Select-Object -ExpandProperty store_id | Sort-Object -Unique
```
→ Exactly **one** store id (`…0002`, Londis). Repeat with gareeth → three store ids. Repeat the same pattern for `deliveries`, `escalations`, `messages` — always scoped.

**T2.3 Manager read-only.** Get maya's token, attempt `PATCH /rest/v1/task_instances?id=eq.<any>` with `{"status":"completed"}`. → 0 rows updated (RLS blocks) **[AC-15]**.

**T2.4 Secrets sealed.** With any user token: `GET /rest/v1/app_secrets`. → Empty array / permission denied — VAPID keys unreachable from clients.

---

## 3 · Staff Portal basics

**T3.1 Home layout.** As amara → greeting with her name, "Store Operations" title, green **On-site · Londis** chip (after P-1), **Due now** strip (overdue first, red-bordered), **All operations** grid of 11 tiles: Delivery Received, Opening Checklist, Closing Checklist, Temperature Log, Cash Count, Weekly Cleaning, Incident Report, Maintenance, Invoice Upload, Stock Adjustment, Staff Note.

**T3.2 My Tasks ordering.** Tasks tab. → Overdue items first (red), then by due time; a task with status *rejected* shows "Reopened — <feedback>" in amber (populated by T11.4).

**T3.3 Alerts.** Alerts tab. → Notification cards with type-coloured icons and relative times; unread dots clear ~1 s after opening the tab (auto mark-read).

**T3.4 Profile.** → Avatar, name, role + store; **Install the app** card; **Push notifications** row (tested in §13); **Sync status** "All synced ✓" when online; Sign out.

**T3.5 Create ad-hoc task.** ➕ tab → title "Restock crisps aisle", type Checklist, due tomorrow, priority Medium → Create. → Success screen "Task created"; the task appears in My Tasks and (as gareeth) in the owner's Active count.

---

## 4 · Checklist runner **[AC-8]**

*Precondition: a Closing Checklist instance for Londis exists (seeded daily; also created by the scheduler each day).*

**T4.1 Open.** Amara → Home → **Closing Checklist** tile. → Full-screen runner: back arrow, title, "0 / 5 complete", geofence chip, green progress bar at 0%.

**T4.2 Plain check.** Tap the checkbox on "Chillers & freezers closed and running". → Box turns green with a tick, label greys with strikethrough, progress bar animates, counter increments.

**T4.3 Photo evidence.** On "Till cashed up & float secured" tap the dashed camera square → pick/take a photo. → Toast "Photo captured & stamped"; a thumbnail with green tick appears; the item auto-checks. *Verify storage:* Supabase → Storage → `evidence` bucket → a new object under `<org>/<instance>/…jpg`; table `evidence` has a row with `type=photo`, GPS fields and `geofence_verdict`.

**T4.4 Evidence immutability (FR-4.2).** In SQL editor as a normal role (or via REST with amara's token) attempt `UPDATE evidence SET storage_path='x'` or `DELETE FROM evidence`. → 0 rows — append-only by design.

**T4.5 Signature gate.** Check all items but leave the signature pad empty. → Submit button stays grey: "Complete all items & sign to submit". Draw a signature (mouse/touch), Clear works, draw again. → Button turns orange "Submit checklist".

**T4.6 Geofence block [AC-5].** Using DevTools sensor override, set a location > 200 m away and reopen the runner. → Chip shows red **Off-site**; red banner; submit button reads "Blocked — outside geofence" and is disabled. Restore the on-site location → chip green **On-site · N m**, submit enabled.

**T4.7 Submit.** Press Submit. → Success screen "Checklist submitted … Verified on-site"; the task leaves My Tasks; it appears in Ken's and Gareeth's approval queues (§11) with status *Submitted*, locked from staff edits.

---

## 5 · Structured Temperature Log **[AC-10]**

**T5.1 Unit list.** Amara → **Temperature Log** tile. → One row per configured Londis unit (Chiller #1, Chiller #2, Freezer #1) showing "Safe limit ≤ 5°C · escalates > 7°C" (freezer: ≤ −18 / > −3) — exactly what Admin → Units defines.

**T5.2 Validation.** Submit disabled until every unit has a reading ("Enter every reading to submit").

**T5.3 In-range submit.** Enter 3, 4, −19 → all rows show green OK state → Submit. → Success "All readings within safe limits"; instance *Submitted* in the approvals queue; readings stored as `evidence` rows (`type=metadata`, per-unit value + `breach:false`).

**T5.4 Breach → instant escalation [AC-10].** Open the tile again, enter Chiller #2 = **8** (>7). → Row turns red, warning banner "Temperature failure detected… will be auto-created and escalated". Submit. → Success screen in red "Logged · escalation raised". Verify all of:
1. Owner dashboard (already open in the second browser) shows a **new critical escalation** "Chiller #2 temperature failure" within ~2 s, no refresh **[AC-9]**.
2. A new task "Repair: Chiller #2 temperature failure" (category maintenance, priority critical) exists — FR-6.3 auto-workflow.
3. Gareeth's bell and Amara's Alerts both received "Temperature failure…" notifications (Owner + submitting staff, FR-7.2a).
4. If push is enabled (§13), an OS notification arrives.

---

## 6 · Delivery workflow, 3 roles, zero manual reassignment **[AC-4]**

**T6.1 Staff wizard.** Amara → **Delivery Received**. Step 1: supplier Booker, invoice `9001`, green "Location verified on-site" panel, note that staff name/timestamp are auto-captured. Step 2: capture ≥ 2 photos. Step 3: discrepancy `3` → amber warning "will flag an escalation"; remarks "3 cases of water short". Step 4: review card shows every value; "What happens next" shows the 3-step chain. Submit. → Success "Delivery submitted"; toast about Remote Office.

**T6.2 Auto-assignment + SLA.** Check `deliveries` row: `status=review`, `review_due_at` ≈ submitted_at + **36 h** (FR-6.4a). Rosa (remote@) and Gareeth both received a "Delivery logged — Booker" notification without anyone assigning anything.

**T6.3 Discrepancy escalation.** Owner → Escalations. → "Delivery discrepancy — Booker (Inv #9001)", level high, stage Owner.

**T6.4 Remote Office verify.** Sign in as **remote** → Deliveries. The #9001 row shows a blue **Review** button (no approve/reject). Open it → enter cost `1450.00`, final quantity `21`, tick **EPOS updated**, shortages pre-filled from the discrepancy → **Complete verification**. → Status chip becomes *Verified*; Gareeth notified "awaiting your approval".

**T6.5 Owner approve.** As gareeth → Deliveries. #9001 now shows ✓ / ✗ (only at this stage, and not for maya). Approve. → Toast "approved · staged for EPOS sync"; status *Approved*; audit_log rows exist for `delivery.submitted`, `delivery.verified`, `delivery.approved`.

**T6.6 Reject path.** Repeat T6.1 with a second delivery and have the owner ✗ reject at the verified stage. → Status *Rejected*.

---

## 7 · Incident reporting (24 h SLA)

**T7.1 Standard incident.** Amara → **Incident Report** → type "Equipment fault", description "Ice buildup in freezer door seal", priority High, 1 photo → Report. → Success "Routed to your Team Leader with a 24h action deadline"; escalation created at stage **Team Leader**; Ken and Gareeth both notified; `action_due_at` = now + 24 h (FR-6.5a).

**T7.2 Critical incident.** Repeat with priority **Critical** (button turns red). → Success says "escalated to the Owner instantly"; escalation level critical, stage **Owner**.

**T7.3 Reviewer resolves.** As gareeth → Escalations → the incident card → **Investigate** (status chip logic: button label becomes "Investigating…") → **Mark resolved**. → Card disappears from open escalations; `resolved_at`/`resolved_by` set.

---

## 8 · Invoice Upload (FR-4.1a / FR-6.6) **[AC-13]**

**T8.1 Scan & enhance.** Amara → **Invoice Upload** tile → supplier Booker, invoice `INV-77` → **Scan invoice** → choose a photo of any document. → Toast "Scan enhanced"; grayscale, contrast-stretched preview appears.

**T8.2 File as PDF.** Press **File invoice as PDF**. → Success "filed under Londis / Booker / <yyyy-MM>. Immediately searchable — no Remote Office step needed."

**T8.3 Owner folder.** As gareeth → Deliveries → **Invoice folder** section. → Row for Booker `#INV-77` with the path `Londis/Booker/<yyyy-MM>/INV-77.pdf` → **Open PDF** opens a signed URL in a new tab rendering the enhanced A4 PDF. Confirm no Remote-Office task or notification was created for it.

---

## 9 · Inbox messaging (FR-11) **[AC-14]**

Two browsers: gareeth (A) and amara (B).

**T9.1 Compose.** A → Inbox → **New message** → recipient "Amara Okafor · staff · online" → body "The chiller photo on today's opening list is blurred — please retake." → Send. → Thread appears in A's list.

**T9.2 Staff receipt.** B: chat icon on Home shows a badge within ~2 s; Alerts gains "New message"; if push enabled, an OS notification. Open Inbox → thread listed with unread badge.

**T9.3 Read receipt.** B opens the thread. → In A's conversation view the ✓✓ on the sent bubble turns **green** (read_at set) without refresh.

**T9.4 Reply.** B types "Will do — retaking now." → appears instantly in A's pane; A gets a notification.

**T9.5 Isolation.** Sign in as priya → Inbox. → Empty; and via REST her token returns 0 messages (T2.2 pattern). Staff cannot delete messages (no delete path in UI; REST `DELETE` → 0 rows) — FR-11.4 audit retention.

**T9.6 Presence.** Sign amara out. → Her dot in A's Inbox/Users list turns grey (Offline) on next refresh of presence.

---

## 10 · Owner dashboard **[AC-9]**

As gareeth, with amara active in a second browser:

**T10.1 KPI tiles.** Five tiles — Active, Completed today, Pending review, Overdue, Compliance % — with left accent bars. Have amara complete + submit any task. → Pending review increments within ~2 s without refresh.

**T10.2 Store switcher.** Click "Londis". → Title area unchanged, but KPI numbers, deliveries, overdue, escalations all narrow to Londis; "All stores" restores the rollup.

**T10.3 Store status cards.** One card per store: compliance % (colour-coded green/amber/red), Opening chip (Done ✓ once today's opening list is submitted), Closing "Tonight", online-user count.

**T10.4 Today's deliveries.** Matches the Deliveries page rows: supplier, store, discrepancy in red when > 0, status chips (Review amber / Verified blue / Approved green).

**T10.5 Overdue & missed.** Lists overdue instances with red dot, store + assignee, "Nm overdue" / "Missed cutoff".

**T10.6 Pending approvals mini-queue.** Cards show kind icon, priority badge, evidence summary line and **Approve / Reject / Reopen** — exercise these in §11 instead to observe the staff side.

**T10.7 Escalations panel + Compliance bars.** Open escalations with level chips and stage; per-store compliance bars mirror the store cards.

**T10.8 Notifications bell.** Badge shows unread count; opening the popover lists items with icons and times and clears the badge; the highlighted (unread) rows lose their tint.

**T10.9 Manager view.** As maya: dashboard renders, but no "New task" button and no Admin nav; approve/verify controls absent on Deliveries **[AC-15]**.

---

## 11 · Approvals — Owner page & Team Leader tablet **[AC-6 feedback loop]**

*Precondition: at least one submitted task from §4/§5.*

**T11.1 Owner Approvals page.** Full-width cards: icon, priority, store, submitter, time, evidence thumbnails, three actions. Sidebar badge count matches the card count.

**T11.2 Team Leader scope.** As ken → `/leader`. → Only **Londis** submissions appear ("N awaiting review"); a Gareeth-store temp log submitted by priya/ken's colleagues elsewhere never shows.

**T11.3 Approve.** Ken approves the Opening checklist. → Toast "Approved · archived & staged for EPOS sync"; card leaves the queue; instance `status=completed`, `completed_at` set; amara's Alerts gains "…approved"; owner's Completed-today KPI ticks up.

**T11.4 Reject with mandatory feedback.** On another submission press **Reject** → modal; Confirm disabled until text is entered → type "Fridge photo missing — please redo item 3" → Reject. → Toast; instance `status=rejected` with `review_feedback`; **staff side:** the task is back in amara's My Tasks flagged "Reopened — Fridge photo missing…", and she received a push/in-app notification instantly.

**T11.5 Reopen.** Third submission → **Reopen** + feedback. → Instance returns to `assigned` and reappears in staff My Tasks (amber), reviewer recorded in `approvals` table.

---

## 12 · Scheduler engine (recurrence, reminders, missed, escalation) **[AC-3, AC-11, AC-12]**

The engine runs every minute (`cron.job` rows: `ops-scheduler`, `push-fanout-sweep`, `email-digest-daily`). Rather than waiting on the wall clock, drive it with SQL — run each snippet in the Supabase SQL editor, then `select app.scheduler_tick();` and check the UI.

**T12.1 Daily materialization + dedup [AC-3].**
```sql
select app.scheduler_tick();  -- run twice
select count(*) from task_instances where generated_key like 'c0000000-0000-4000-8000-000000000001%' and due_at::date = current_date;
```
→ Exactly one Temperature Log instance per store for today (3 rows); the second tick creates **no duplicates** (`generated_key` unique).

**T12.2 Template → checklist expansion.** For today's materialized Opening Checklist instance: `select count(*) from checklist_items where instance_id='<id>'` → 7 items, matching the template.

**T12.3 30-minute reminder.**
```sql
update task_instances set due_at = now() + interval '10 minutes',
  reminder_sent_at=null, overdue_notified_at=null where id='<an assigned Londis task>';
select app.scheduler_tick();
```
→ Amara receives "Due soon: …" (assignee, or all store staff when unassigned); `reminder_sent_at` set; a second tick sends nothing again.

**T12.4 Overdue alert (staff + TL).** Set `due_at = now() - interval '5 minutes'` on the same row, tick. → "Overdue: …" notification to amara **and** ken.

**T12.5 Missed + owner escalation [AC-6 timing analogue].** Set `cutoff_at = now() - interval '1 minute'`, tick. → status becomes **missed**; a new escalation "Missed: …" (stage owner); Gareeth + assignee notified; the Owner dashboard Overdue/Escalations update live.

**T12.6 Month-end pending-until-complete [AC-12].** Temporarily point the A5 template at today:
```sql
-- simulate: create the instance the way month-end would, cutoff on the "5th"
update task_instances set cutoff_at = now() - interval '1 minute'
 where template_id='c0000000-0000-4000-8000-000000000005' and status='assigned';
select app.scheduler_tick();
```
→ Escalation "Still pending: Paper-round billing…" raised, but status **stays `assigned`** — never auto-expired. (On a real month boundary, verify the instance appears on the last day.)

**T12.7 Clock-in trigger [AC-11].** Insert a roster row with `clock_in_at = now()` for jess at Londis, tick. → A "Routine tasks (per-staff)" instance assigned to **jess**, `due_at` = her `shift_end` (template A7), visible in her My Tasks.

**T12.8 Day-exclusion (A4).** On a Wednesday (or by editing the template's `except_days` to today's ISO weekday), tick. → No instance materializes for that template today; revert and it does.

**T12.9 Admin loop.** Create a fresh template in **Admin → Templates** (daily, a time earlier than now, 2 checklist items), wait ≤ 1 minute (or tick manually). → Instance + items appear for the scoped store; the plain-language summary on the card matches what you configured.

---

## 13 · Web Push **[AC-2]**

Use the **production build** (http://localhost:4173 — SW registered) in Chrome/Edge.

**T13.1 Subscribe.** As amara → Profile → Push notifications → **Enable** → allow the permission prompt. → Row shows "Enabled ✓"; `push_subscriptions` has a row for her with endpoint + keys.

**T13.2 Foreground/closed delivery.** From the Owner browser send amara an Inbox message (or create a task assigned to her). → Within ~10 s an **OS notification** appears ("New message" / "New task: …") — instant path is the client-triggered fan-out; the per-minute cron sweep is the fallback. Now fully close amara's browser window and trigger another notification; the OS notification still arrives (service-worker push event).

**T13.3 Deep link.** Click the notification. → The PWA focuses/opens at the notification's deep link (e.g. `/staff/inbox`); `notifications.sent_at`/`delivered_at` are stamped (FR-5.5 tracking).

**T13.4 Dead-subscription pruning.** Delete the browser's notification permission (site settings → reset), trigger a push, run the fan-out again. → The now-invalid (410) subscription row is deleted from `push_subscriptions`.

**T13.5 iOS gate (needs an iPhone, iOS ≥ 16.4).** Open the site in Safari → Profile. → The Enable button is replaced by "Install first ↓" and a 4-step Add-to-Home-Screen walkthrough. After installing and reopening from the Home Screen the Enable button appears and subscribing works.

**T13.6 VAPID from secrets.** `POST /functions/v1/push-fanout` with the anon bearer. → `{processed,sent,failed}` JSON, no key errors (keys read from `app_secrets`).

---

## 14 · Offline & PWA installability **[AC-1]**

Use the production build.

**T14.1 Install.** Chrome address-bar install icon (or Profile → Add to Home Screen with the captured prompt). → App installs with the orange storefront icon, standalone window, correct name/theme (#0F1420). Manifest check: DevTools → Application → Manifest — no errors, icons 192/512 + maskable, shortcuts "My Tasks" / "New Delivery".

**T14.2 Offline shell.** DevTools → Network → Offline, reload the installed app. → App shell loads from the SW precache (login/staff UI render; data shows cached results from the NetworkFirst API cache).

**T14.3 Offline temp log queue [AC-1 analogue].** As amara online, open Temperature Log; go Offline (or airplane mode on a phone); enter readings; Submit. → Amber success screen **"Saved offline ⟳ … will sync automatically."** Profile → Sync status shows offline state.

**T14.4 Reconnect sync.** Go back online (stay in the app). → Toast "1 offline submission synced ✓"; the submission appears in the owner's queue; if a reading breached, the escalation fires now. Repeat for Delivery and Incident (all three queue offline).

**T14.5 SW update flow.** Rebuild with any small change, reload twice. → New service worker activates (prompt-based registration; no stale white screen).

**T14.6 Lighthouse.** Chrome Lighthouse → PWA category against :4173. → Installable checks pass (HTTPS check is satisfied by localhost).

---

## 15 · QR verification (FR-4.3)

**T15.1 Generate & print.** As gareeth → Admin → QR codes. → A card per unit/zone per store (payload `storeops:asset:<store-id>:<zone>`); **Print sheet** opens the print dialog with a clean grid.

**T15.2 Scan-to-check.** Display one Londis code on another screen. As amara open a checklist with a QR-required item ("Scan freezer QR…") → tap **Scan QR at asset** → camera view with green targeting frame → point at the code. → Scanner closes, toast "QR verified · presence confirmed", button turns green "QR verified ✓", item checks; an `evidence` row `type=qr` stores the payload + geofence verdict.

**T15.3 Denied camera.** Block camera permission and reopen the scanner. → Friendly in-scanner error, Cancel returns to the runner, item stays unchecked.

---

## 16 · Reports & exports (FR-9)

As gareeth → Reports:

**T16.1 Live figures.** Completion-rate bars per store and the By-category breakdown change after you approve tasks in §11 (re-open the page).

**T16.2 CSV / Excel.** Press CSV → `task-report-<date>.csv` downloads; open it → header row + one row per task instance with title/store/category/priority/status/times, values with commas properly quoted. Excel button → same data as `.xls`, opens in Excel.

**T16.3 PDF.** Export PDF → `compliance-report-<date>.pdf` with title, timestamp, per-store completion and the summary counts.

---

## 17 · Admin section (Owner only)

**T17.1 Access control.** Nav item visible only to gareeth; maya/remote hitting `/owner/admin` directly get no route (redirect).

**T17.2 Template builder — every control.** New template → set title/instructions; category + priority chips; store scope; each schedule mode in turn and confirm the **plain-language summary** in the header updates: Daily + times "07:30" + except **Wed** → "Daily except Wed at 07:30"; Weekly + Mon/Thu + 21:00 → "Every Mon & Thu at 21:00"; Month-end → explanatory panel; On clock-in → deadline-rel dropdown. Toggle evidence chips and geofence policy; add 3 checklist items, mark one photo-required, one temp with limit `5`, one QR; reorder with ↑↓; delete one; Save. → Card appears in the list with the correct summary; scheduler materializes it (T12.9); Edit reloads every value faithfully; Delete removes it.

**T17.3 Users.** Add member (email `test1@storeops.demo`, name, role Staff, store Londis) → account created; sign in with it in an incognito window. Edit: change role to Team Leader + stores → their landing surface changes accordingly on next login. Non-owner API call to `admin-users` → 403 (T2 pattern).

**T17.4 Units ↔ temp log.** Change Londis Chiller #1 `escalate >` from 7 to **6**, then as amara submit a reading of 6.5. → Breach fires (proves thresholds are live config, FR-7.2a "Owner-configurable"). Add a unit → it appears in the staff temp log immediately; delete it → gone.

**T17.5 Geofence editor.** Change Londis radius to 30 m and move the pin ~500 m away (paste coordinates). → Staff geofenced flows now report Off-site/blocked; restore with **Use my location** → verified again. Radius slider preview scales with the value.

---

## 18 · Email digest fallback

**T18.1 Dry-run (no key).** `POST /functions/v1/email-digest` with the anon bearer. → JSON `{users: N, sent: 0, configured: false, note: "RESEND_API_KEY not configured…", wouldSend:[…]}` listing each user's unread count — correct no-op.

**T18.2 Live send (optional).** Insert a Resend key: `insert into app_secrets values ('RESEND_API_KEY','re_…'),('EMAIL_FROM','Store Ops <ops@yourdomain>')` → call again. → `sent > 0`; digest email arrives listing the unread notification titles. Cron `email-digest-daily` fires at 06:00 UTC.

---

## 19 · Audit trail & data integrity

**T19.1 Audit coverage.** After running §§4–8: `select action, entity, actor, created_at from audit_log order by id desc limit 20;` → rows for `task.submitted`, `task.approved/rejected/reopened`, `templog.submitted`, `delivery.submitted/verified/approved`, `incident.reported`, `invoice.uploaded`, `user.created/updated` — each with actor and detail.

**T19.2 Staff can't read audit.** Amara's token → `GET /rest/v1/audit_log` → empty (management only).

**T19.3 Approvals history.** `approvals` table has one row per verdict from §11 with reviewer + feedback.

**T19.4 Notification delivery tracking.** After §13, `notifications` rows show `sent_at`/`delivered_at`/`read_at` progressing (FR-5.5).

---

## 20 · Acceptance-criteria traceability (PRD §11)

| AC | Covered by | Status expectation |
|---|---|---|
| 1 PWA install + offline sync | T14.1–T14.4 | Pass |
| 2 Push to locked device ≤ 10 s, deep link | T13.2–T13.3 | Pass (Android/desktop; iOS via T13.5) |
| 3 Recurrence auto-appear + missed record | T12.1, T12.5 | Pass |
| 4 Delivery workflow, 3 roles, zero reassignment | §6 | Pass |
| 5 Geofence block + on-site stamp in audit | T4.6, T4.3 | Pass |
| 6 Escalation chain w/ evidence | T12.4–T12.5, §7 | Pass (timing configurable) |
| 7 Branch isolation at API level | §2 | Pass |
| 8 First-time staff completes checklist < 3 min | §4 timed run | Measure |
| 9 Dashboard realtime < 2 s | T10.1, T5.4 | Pass |
| 10 Temp breach → instant Owner escalation | T5.4 | Pass |
| 11 Clock-in task + shift-relative timing | T12.7 | Pass |
| 12 Month-end stays Pending, escalates on 5th | T12.6 | Pass |
| 13 Invoice → PDF, filed, no Remote Office | §8 | Pass |
| 14 Message + push + read receipt + audit | §9 | Pass |
| 15 Manager view-only | T2.3, T10.9 | Pass |

**Known scope notes (expected "not implemented"):** notification quiet-hours preferences UI, custom workflow-chain builder, background (app-closed) geofencing (PWA platform limit — Capacitor wrapper is the documented path), WhatsApp channel, EPOS API sync.
