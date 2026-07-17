# Store Operations Engine — Try-It-Yourself Guide

This guide walks you through the whole app, step by step, in plain English. No technical knowledge needed. You'll pretend to be a shop worker, then the boss, and watch them talk to each other through the app.

**Time needed:** about 30–40 minutes for everything. You can stop at any point.

---

## Before you start (5 minutes — don't skip this)

**What you need:**
- A computer **and** a phone (or just a computer with two browser windows).
- The app: **https://jnsmxportal.vercel.app**
- The password for every pretend account is the same: **StoreOps!2026**

**The pretend people you'll play:**

| Sign in as… | Who they are |
|---|---|
| `amara@storeops.demo` | Amara — shop worker at the Londis store |
| `gareeth@storeops.demo` | Gareeth — the boss who owns all 3 stores |
| `ken@storeops.demo` | Ken — team leader at Londis |
| `remote@storeops.demo` | Rosa — the back-office person who checks invoices |

**Step A — Tell the app where "the store" is.**
The app checks that work is really done *inside the store* using your location. The demo stores are set to addresses in London — so unless you're standing in Streatham right now, the app will politely refuse your submissions. Fix this once:

1. Open the app and sign in as **gareeth@storeops.demo**.
2. In the menu on the left, click **Admin** (on a phone, tap the **☰** button first).
3. Click the **Geofence** tab at the top.
4. On the **Londis** card, click **Use my location**. If your browser asks "Allow location?", click **Allow**.
5. Click **Save**. Done — the app now thinks the Londis store is wherever you are.

**Step B — When the browser asks for permissions, say yes.**
During this guide the browser will ask to use your **location**, your **camera**, and to show **notifications**. Click **Allow** each time — that's the app doing its job.

**Step C — Open two windows.**
Keep the boss (Gareeth) signed in on one window, and use a second window (or your phone, or a private/incognito window) for the worker (Amara). Watching both at once is half the fun — things you do as Amara appear on the boss's screen *by themselves*, within a second or two.

---

## Part 1 — A morning as Amara, the shop worker

Sign in as **amara@storeops.demo** in your second window.

### 1. Look around
You should see: "Good morning, Amara", a green badge saying you're on-site at Londis, a **Due now** list of jobs, and a grid of big colourful buttons (Delivery Received, Opening Checklist, Temperature Log and so on). At the bottom: five tabs — Home, Tasks, an orange ➕, Alerts, Profile.

### 2. Do a temperature check (the happy version)
1. Tap the red **Temperature Log** button.
2. You'll see a row for each fridge and freezer. Type in normal numbers: **3** for Chiller #1, **4** for Chiller #2, **-19** for Freezer #1. Each row shows a little green "OK".
3. Tap **Submit temperature log**.

**You should see:** a green tick screen saying everything is within safe limits. Tap **Back to home**.

### 3. Do a temperature check (the bad version)
1. Open **Temperature Log** again.
2. This time type **8** for Chiller #2 — that's too warm for food safety.
3. Notice the row turns **red** and a warning box appears saying the boss will be alerted the moment you submit.
4. Submit anyway.

**You should see:** a red screen saying an escalation was raised. Now glance at the **boss's window** — within a couple of seconds, without touching anything, a red **"Chiller #2 temperature failure"** alert appears in his Escalations panel, his bell shows a new notification, and a brand-new repair job was created automatically. Nobody had to phone anybody. That's the whole point of the app.

### 4. Do the closing checklist
1. From Home, tap **Closing Checklist**.
2. Tick the simple items by tapping the square boxes — they turn green.
3. One item asks for a **photo** — tap the little camera square and take/choose any photo. It gets a green tick.
4. At the bottom, **sign with your finger** (or mouse) in the dashed box.
5. The big button only lights up orange when *everything* is done — that's deliberate; half-finished checklists can't be submitted. Tap **Submit checklist**.

**You should see:** "Checklist submitted — locked & sent to your Team Leader." It's now waiting for a manager to approve it (we'll do that in Part 2).

### 5. Log a delivery
1. Tap **Delivery Received**.
2. Step 1: pick supplier **Booker**, type any invoice number, notice the green "Location verified on-site" box. Tap Continue.
3. Step 2: tap the camera square a couple of times to "photograph" the goods. Continue.
4. Step 3: in "Quantity discrepancy" type **2** — meaning 2 items were missing. An orange warning appears. Add a remark like "two cases of water missing". Continue.
5. Step 4: check the summary, note the little diagram showing what happens next (you → back office → boss). Tap **Submit delivery**.

**You should see:** a blue success screen. Behind the scenes the back-office person just got the job automatically, with a 36-hour deadline — and because items were missing, the boss got an alert too.

### 6. Report a problem
1. Tap **Incident Report**.
2. Pick **Equipment fault**, describe it ("Freezer door seal is torn"), pick priority **High**, add a photo. Tap **Report incident**.

**You should see:** confirmation that it went to the Team Leader and boss with a 24-hour deadline.

### 7. File an invoice
1. Tap **Invoice Upload**.
2. Pick a supplier, type an invoice number, tap **Scan invoice** and photograph any piece of paper with text on it.
3. The app cleans the image up (straightens the contrast so it's readable) and shows a preview. Tap **File invoice as PDF**.

**You should see:** "Invoice filed" with the folder it went into (store / supplier / month). No spreadsheets, no emailing photos to anyone.

### 8. Check your other tabs
- **Tasks**: your to-do list, most urgent at the top.
- **Alerts**: everything the app has told you today.
- The **envelope icon** at the top of Home is your Inbox — leave it for now, the boss is about to message you.

---

## Part 2 — Being the boss (Gareeth)

Switch to the window where Gareeth is signed in.

### 9. The dashboard
You should see: five big numbers (active tasks, completed today, waiting for review, overdue, compliance %), a card for each store with its health score, today's deliveries, anything overdue, things waiting for approval, and open alerts. Try the store buttons at the top (**All stores / Gareeth / Londis / General Food Store**) — everything filters instantly. Everything you did as Amara in Part 1 is already here.

### 10. Approve and reject work
1. Click **Approvals** in the left menu (it has a number badge).
2. Find Amara's closing checklist. You can see what evidence she attached.
3. Click **Approve** on one item — it disappears, and Amara instantly gets a "approved ✓" alert in her window.
4. On another item, click **Reject with feedback**. You *must* type a reason — try "Photo is too dark, please retake". Confirm.

**Now look at Amara's window:** the task is back on her list, marked **"Reopened — Photo is too dark, please retake"**. That's the no-chasing loop: reject → instant bounce-back with your note.

### 11. Finish the delivery
1. Sign in as **remote@storeops.demo** (Rosa, back office) — use a third window or sign out/in.
2. Go to **Deliveries**. Amara's Booker delivery has a blue **Review** button. Click it.
3. Fill in the cost, the final quantity, tick "EPOS updated", click **Complete verification**.
4. Back as **Gareeth**: the delivery now shows ✓ and ✗ buttons — only for him, and only now. Click **✓**.

**You should see:** status changes to **Approved**. That was the full chain — worker → back office → boss — with the app passing the baton automatically each time.

### 12. Deal with the fridge alarm
Go to **Escalations**. There's the "Chiller #2 temperature failure" from Part 1. Click **Investigate**, then when you're satisfied, **Mark resolved**. It disappears from the open list (but stays in the records forever).

### 13. Message a worker
1. Click **Inbox** → **New message**.
2. Pick Amara (notice the green dot — she's online), write "Nice work this morning — but please retake the till photo", send.
3. **Amara's window:** the envelope icon shows a red badge. Open it, read the message.
4. **Back in Gareeth's window:** the two little ticks on your message just turned **green** — you know she's read it. She can reply; you'll see it instantly.

### 14. Download a report
Click **Reports**. Then click **CSV** — a spreadsheet of every task downloads. **Export PDF** gives you a one-page summary you could hand to an inspector.

### 15. Set up the shop (Admin)
Click **Admin**. Five tabs:
- **Templates** — the repeating jobs. Click **New template**, call it "Test sweep", set Schedule to **Daily**, type a time *earlier than right now* (e.g. if it's 3 pm, type `09:00`), add a checklist item or two, Save. **Wait one minute**, then look at Approvals→Dashboard or Amara's task list: the app has *created the actual task by itself*. That's the scheduler doing its job. (Delete the template after, if you like.)
- **Users** — add a real colleague: **Add member**, their email, a name, role Staff, pick a store, Create. They can sign in immediately with the password you set.
- **Units** — the list of fridges/freezers and their alarm temperatures. Change a number here and the Temperature Log screen updates to match.
- **QR codes** — printable labels to stick on fridges; workers must scan the right one to prove they were really standing there. **Print sheet** gives you the printable page.
- **Geofence** — what you did in Step A.

### 16. A quick look as Ken (team leader)
Sign in as **ken@storeops.demo**. He gets a simpler screen: just the things *his* store's staff have submitted, with Approve/Reject. He never sees the other two stores — try to find them; you can't. Each store's staff and leaders only ever see their own store.

---

## Part 3 — On your phone

### 17. Install it like a real app
- **Android (Chrome):** open https://jnsmxportal.vercel.app → a "Install app" prompt appears (or tap ⋮ → *Add to Home screen*). 
- **iPhone (Safari):** tap the **Share** button (square with arrow) → **Add to Home Screen** → Add.

**You should see:** an orange shop icon on your home screen. Open it — it launches full-screen like a normal app, no browser bars.

### 18. Turn on notifications
1. In the installed app, sign in as **amara@storeops.demo** → **Profile** tab → next to "Push notifications" tap **Enable** → Allow.
   *(iPhone note: the Enable button only appears **after** you've installed to the Home Screen — that's an Apple rule, and the app walks you through it.)*
2. Now **close the app completely** (swipe it away).
3. On your computer, as Gareeth, send Amara a message.

**You should see:** a real notification pop up on the phone — with the app closed. Tap it: the app opens straight to the inbox.

### 19. The no-signal test (the fun one)
1. On the phone, open the app as Amara and go to **Temperature Log**.
2. Turn on **Airplane mode** ✈️.
3. Enter readings and Submit.

**You should see:** an orange screen — **"Saved offline ⟳ — will sync automatically."** The reading is safely stored *on the phone*.

4. Turn Airplane mode off and open the app again.

**You should see:** a little message "1 offline submission synced ✓" — and the reading appears on the boss's dashboard. This is how a worker in a walk-in freezer with no signal still gets their log recorded.

### 20. Does it look right on a phone?
Quick eyeball as Gareeth on the phone: there's a **☰** button (the menu slides in from the left), the five big numbers sit two per row, tables slide sideways with a finger inside their box, and nothing ever forces the whole page to scroll sideways.

---

## If something looks wrong

| Problem | Fix |
|---|---|
| The app looks old / broken / squashed | You may have an old version cached. Close the app or tab **completely**, reopen it, and pull to refresh once. It updates itself from then on. |
| "Off-site" in red, or Submit is blocked | The app thinks you're not at the store. Redo **Step A** (boss → Admin → Geofence → Use my location → Save), and make sure location permission is allowed. |
| Camera square does nothing | The browser blocked the camera. Tap the padlock/ⓘ icon in the address bar → allow Camera. |
| No notification arrived | Check you tapped **Enable** in Profile *and* allowed the permission. On iPhone, the app must be installed to the Home Screen first. Notifications can take up to a minute in the worst case. |
| Signed in as the wrong person | Profile tab (worker) or bottom of the left menu (boss) → **Sign out**. |
| Something else | Note which pretend person you were, which button you pressed, and what you expected — that's everything a developer needs. |

---

*Everything in this guide is safe to do — it's all demo data. Approve, reject, break the fridge, report incidents: nothing real is affected, and nothing you do can damage the app.*
