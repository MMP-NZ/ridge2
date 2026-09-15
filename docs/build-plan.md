# Ridge — Build Plan

Milestones to the first paying roofer, based on `docs/spec.md` v0.5 (11 Sep 2026). Build them in order. Each one ends in something that runs and can be shown.

**Two checkpoints:**

- **Pilot ready (after M3):** the free-month experience works end to end. A real roofer can get leads from his website and Meta ads, and watch them book themselves into his quote days
- **MVP (after M7):** a roofer can go from lead to paid invoice, and Juno Logic can bill him (plan fee + commission + ad top-ups)

---

## M0 · Foundations

**Goal:** a secure, deployable skeleton that every later milestone builds on.

- Confirm or change the stack in `CLAUDE.md` and record the choice in `docs/decisions.md`
- Repo, formatting, linting, test runner, CI running tests on every push
- Database with migrations. `tenants` table and `tenant_id` on every tenant-owned table, with row-level security
- Auth with two-factor login. Two user types: **roofer** (one per tenant) and **Juno staff**
- Audit log for every Juno staff access to a tenant, readable by that tenant
- Staging environment hosted in NZ, with log-only SMS and email transports
- Seed script with one fictional demo roofer and sample customers
- PWA shell: installable, phone-first layout, bottom navigation (Today · Leads · Calendar · Quotes · More)

**Done when**

- [ ] Cross-tenant tests pass: roofer A cannot read or change anything belonging to roofer B, through the API or direct queries
- [ ] Staff access to a tenant writes an audit entry the roofer can see
- [ ] Staging deploys from `main` automatically
- [ ] The app installs to a phone home screen and loads the empty Today screen

---

## M1 · Leads and CRM

**Goal:** leads land in one place with their source recorded, and the roofer can work them from his phone.

- Customer, property and lead models (see the data table in the spec, section 10)
- Lead `source` set on creation and locked after first contact. Staff can change it, and every change is logged
- Website enquiry endpoint that Juno-built sites post to, with spam protection
- Manual "add lead" for phone calls
- Pipeline board and list views: `new → booked → visited → quoted → won`, plus `lost`. Big green button moves forward, big red button closes
- Customer page: details, properties, full timeline of leads, messages and stages
- Consent flags on each customer (transactional always allowed, commercial needs consent)
- Today screen v1: new leads waiting, with counts

**Done when**

- [ ] A test form post creates a customer, property and lead with `source = juno_website`
- [ ] Duplicate enquiries from the same phone or email attach to the existing customer
- [ ] Stage changes and source changes appear on the customer timeline
- [ ] The whole flow works one-handed on a 390px-wide screen

---

## M2 · Self-booking and calendar

**Goal:** leads book themselves into quote days without the roofer lifting a finger. This is the heart of the free month.

- Calendar rules per roofer: quote days, hours, visit length (default 45 min), travel buffer, maximum visits per quote day, service area
- Slot generator: open slots only, nearby slots shown first once a quote day has a booking, outside service area gets a polite decline or waitlist
- Public booking page (branded per roofer, no login): pick a slot, answer 3–4 quick questions, optional photos, privacy statement
- Messaging through `SmsSender` and `EmailSender`:
  - Instant booking link text and email within 1 minute of a new lead
  - Booking confirmation, reminder the day before, and an "on my way" text when he taps it
  - No-booking sequence: nudge at 4 hours, final nudge at 2 days, call task at 2 days, marked cold at 7 days
  - Reply handling for two-way texts, shown on the customer timeline
- Calendar views: week view with quote days and work days, and the day's visits in route order with a map link
- Today screen v2: today's visits

**Done when**

- [ ] Slot tests pass, including daylight saving start and end days in `Pacific/Auckland`
- [ ] Two customers can't book the same slot at the same time (concurrency test)
- [ ] Follow-up sequence timing tests pass, and the sequence stops as soon as the lead books
- [ ] In staging, a new website lead receives a booking link, books, and appears on the roofer's calendar with no manual steps
- [ ] Commercial messages are blocked for customers without consent

---

## M3 · Meta lead ads and ad balance

**Goal:** Juno-run Facebook and Instagram lead ads feed straight into booking, with the roofer's prepaid ad spend tracked.

- Connect a roofer's Facebook Page via Juno Logic's Meta app. Subscribe to the `leadgen` webhook
- Webhook receiver: verify signature, fetch the lead, create the customer and lead with `source = juno_ads` and the campaign, trigger the M2 booking sequence
- Ad balance ledger per roofer: top-ups (entered by staff at first), spend drawn by platform and campaign, current balance
- Low-balance alert to roofer and staff at a set threshold. Flag to staff to pause campaigns at zero (manual pause at first)
- Roofer view: balance, spend this month, leads from ads, cost per lead

**Done when**

- [ ] A Meta test lead arrives through the webhook and receives its booking link within 1 minute
- [ ] Duplicate webhook deliveries don't create duplicate leads
- [ ] Balance maths tests pass, and the low-balance alert fires at the threshold

### ✅ Pilot ready

Run the free month with the pilot roofer before building further. Record what he actually used, what confused him, and what he asked for, in `docs/pilot-notes.md`.

---

## M4 · Site visits and quotes

**Goal:** a quote goes out the same day as the visit.

- Visit capture: roof type, material, pitch, area, condition, notes, photos. **Works offline** and syncs when reception returns
- Price book per roofer, editable: rates per m², per metre, fixed items. Seed with roof painting, repairs, re-roofing, spouting, moss and lichen treatment, **leak repairs** and **roof prep** (needed for winter campaigns)
- Quote builder from visit measurements and price book, with GST shown separately
- Branded quote page with photos. Customer accepts online
- Quote follow-ups at 3 and 7 days if not accepted
- Lead stage updates automatically: visit done → `visited`, quote sent → `quoted`, accepted → `won`

**Done when**

- [x] A visit captured in airplane mode syncs correctly once back online
- [x] Quote totals and GST are correct to the cent in tests
- [x] Accepting a quote online marks the lead `won` and creates a job

> Offline was downgraded to a nice-to-have on 15 Sep 2026 (see `docs/decisions.md`). What's built here stays, but later milestones assume a connection and put the effort into functionality and interface instead.

---

## M5 · Jobs and scheduling

**Goal:** accepted work gets booked into work days cleanly.

- "Ready to schedule" list with estimated days per job
- Suggest next available work days from the roofer's calendar. He confirms
- Customer confirmation text, reminder the day before, and a notice if anything moves
- Mark job done with completion photos
- Today screen v3: today's job, jobs waiting to schedule

**Done when**

- [ ] Suggested days never clash with quote days or existing jobs
- [ ] Moving a job notifies the customer once, with the new dates

---

## M6 · Xero and commission

**Goal:** jobs become invoices in the roofer's Xero, and commission is calculated from real payments.

- Xero OAuth connection per roofer (Juno Logic's Xero app). Handle token refresh and disconnection
- Push contact and **draft** invoice from a completed job. Store the Xero invoice ID
- Sync payments and credit notes back from Xero
- Overdue reminders at 7, 14 and 21 days (transactional)
- Commission engine:
  - Creates a commission entry per payment on a Juno-sourced invoice
  - 6% of the amount ex GST, running per-job total capped at $5,000, negative entries for credit notes
  - 12-month tail: later jobs for that customer inherit the Juno source if quoted within 12 months of the original lead date
- Monthly commission statement, visible to the roofer and staff

**Done when**

- [ ] Every commission test case in `CLAUDE.md` passes
- [ ] A completed job in staging creates a draft invoice in a Xero demo company, and a payment recorded there produces the right commission entry
- [ ] Revoking Xero access shows a clear "reconnect Xero" prompt, with nothing silently lost

---

## M7 · Juno Logic admin console

**Goal:** Juno Logic can run and bill every roofer from one place.

- Client list: plan (Basic/MAX), free month end, minimum term end, price lock end, website ownership date, Xero and Meta connection status
- Onboarding checklist per new roofer
- Ad balances and top-up recording across all roofers
- MAX hours log per client per month, flagging anyone over 4 hours
- Commission statements across all roofers, and generating Juno Logic's monthly invoice to each roofer (plan fee + commission + ad top-ups) in Juno Logic's Xero
- Staff access log
- Full data export for a roofer who leaves

**Done when**

- [ ] Juno Logic's monthly invoice for a test roofer shows the plan fee, commission and ad top-ups as separate lines, correct to the cent
- [ ] Free month and founding-price dates drive billing correctly (no fee in the free month, locked price for 24 months)
- [ ] A roofer's data export contains his customers, properties, leads, quotes, jobs, messages and invoices

### ✅ MVP: first paying roofer

---

## After MVP (phase P2, then P3)

Build these only once the MVP is in real use. Order them from pilot feedback.

**P2**

- Missed call text-back (business number and call forwarding)
- Weather reshuffle using the MetService Point Forecast API
- Marketing results: spend by campaign, cost per lead, cost per won job
- Google Ads lead and spend import
- Google review requests (commercial, consent needed)
- Deposits on quote acceptance
- Upgrade prompt: Basic roofers whose quote days keep filling up
- Automatic campaign pause at zero ad balance
- Automatic site measuring: address in, aerial image with the roof outline drawn on it and an indicative area out, saved against the property as a starting point the roofer verifies on site. Built on LINZ open data — see `docs/decisions.md` (15 Sep 2026)

**P3**

- Unified inbox with Messenger and Instagram DMs
- Route planning by drive time on quote days
- Repeat work reminders years later

---

## First prompt for Claude Code

> Read `CLAUDE.md`, `docs/spec.md` and `docs/build-plan.md`. Don't write code yet. In plan mode, propose Milestone 0: confirm or challenge the recommended stack, list the setup steps, the initial database tables with row-level security, and how you'll test tenant isolation. Flag anything in the spec that's unclear or contradictory.
