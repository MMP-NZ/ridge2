# Ridge — Juno Logic client platform

**Ridge** is a codename. The product name is on hold until the Juno Logic trade mark is cleared, so don't put "Ridge" in customer-facing text. Use a single `PRODUCT_NAME` config value instead.

## What this is

A done-for-you business platform for **one-man-band roofers** in New Zealand. Juno Logic builds each roofer's website, runs his Meta and Google ads, and brings in leads. The platform:

1. Captures leads and lets them **self-book** into the roofer's quote days
2. Turns site visits into quotes the customer accepts online
3. Schedules accepted work into his work days
4. Sends invoices to **his own Xero**
5. Tracks Juno Logic's commission

The roofer uses it on his phone. Juno Logic staff run everything across all roofers from an admin console.

## Read first

- `docs/spec.md` — the full product spec (source of truth for what to build)
- `docs/build-plan.md` — milestones in order, with done-when checks. **Work one milestone at a time**

If the spec and this file disagree, stop and ask.

## Locked decisions (don't redesign these)

| Area | Decision |
|---|---|
| Customer | One-man-band roofers only. One login per roofer business. No staff, roles, crews or timesheets on the roofer side |
| Hosting | One shared multi-tenant app. Customer data hosted in NZ |
| Booking | Leads self-book into open quote slots from the website or a text link |
| Week shape | Roofer sets 1–2 quote days a week, the rest are work days |
| Accounting | Xero integration. Invoices are pushed to the roofer's own Xero as drafts for his approval. Never build a ledger |
| Plans | Basic $200/mo, MAX $500/mo, + GST. First month free, then a 3-month minimum. Founding price lock for the first 10 roofers for 24 months |
| Commission | 6% of **paid** invoice value ex GST, on **Juno-sourced** jobs only, capped at **$5,000 per job**, 12-month tail per customer from the original lead date |
| Ad accounts | Juno Logic owns them. Roofers **prepay** ad spend into a balance, passed on at cost. Campaigns pause when the balance runs out |
| Website | Stays Juno Logic's until the roofer has paid 12 months. $2,000 + GST buyout to keep it earlier |
| MAX hours | 4 real hours a month per MAX client, logged in the admin console. Internal only, never shown to clients |

## Non-negotiables

- **Tenant isolation is enforced in the database**, not just in app code (for example Postgres row-level security keyed on `tenant_id`). Every tenant-owned table carries `tenant_id`. There must be automated tests proving one roofer can never read or write another roofer's data
- **Money is stored as integer cents.** Store amounts ex GST with GST as a separate field. NZ GST is 15%. Commission is always calculated on ex GST amounts
- **Time zone is `Pacific/Auckland`.** Store UTC, display local. Booking slots must handle daylight saving changes correctly
- **NZ English** in all UI and message text (colour, organise, metres)
- **Phone first.** Every roofer screen must work one-handed at 390px wide. It's an installable PWA. **The interface quality bar is a mature paid product** — a roofer paying $200-500/mo shouldn't be looking at a prototype. Build on the shared primitives in `src/components/ui/` rather than hand-rolling markup, and check screens in a real browser at 375px, not just in the code
- **An internet connection is assumed for most functions.** Site visit capture works offline and syncs later (built in M4) because a roof genuinely has no signal — but offline is a nice-to-have everywhere else, not a requirement. Don't build offline handling into new features by default; put that effort into functionality and interface instead (decision of 15 Sep 2026, see `docs/decisions.md`)
- **Messaging rules** (Unsolicited Electronic Messages Act 2007): booking confirmations, reminders, quote replies and invoice messages are transactional. Review requests, promotions and reminders to book further work are commercial: only send those when the customer's consent flag is set, and include sender ID and a working unsubscribe. Non-urgent texts go out in daytime hours only
- **Privacy:** every public form and booking page names the roofer and Juno Logic and links a privacy statement. Log every Juno Logic staff access to a roofer's account, and show that log to the roofer. Any roofer can export all his data
- **Xero data is never used to train or feed any AI or machine learning model** (Xero developer terms)
- **Secrets only in environment variables.** Never commit keys, tokens or real customer data. Seed data is fictional
- **No outbound message is sent to a real person from dev or staging.** Use a sandbox or log-only transport outside production

## Stack (confirm in Milestone 0)

Recommended default, to be confirmed or changed in Milestone 0 before any feature work:

- TypeScript end to end
- Next.js (App Router) for the roofer PWA, public booking and quote pages, and admin console
- PostgreSQL with row-level security, and a typed query layer/migrations (Drizzle or Prisma)
- Background job queue for reminders, follow-up sequences, Xero sync and webhooks
- Hosting in NZ: AWS Asia Pacific (New Zealand) region in Auckland, or Catalyst Cloud
- SMS through an NZ-capable provider with NZ virtual numbers for two-way texting (Twilio does not offer NZ long numbers)
- Transactional email provider, sending from each roofer's own domain

Integrations are wrapped behind small internal interfaces (`SmsSender`, `EmailSender`, `XeroClient`, `MetaLeadSource`, `WeatherSource`) so they can be faked in tests and swapped later.

## Domain language

Use these names in code, database and UI so everything matches the spec:

- **Tenant / roofer account**: one roofer business
- **Customer**: homeowner or landlord. **Property**: an address with roof details. One customer can have many properties
- **Lead**: an enquiry, with a `source`: `juno_ads`, `juno_website`, `juno_referral` or `roofer_own`
- **Lead stages**: `new → booked → visited → quoted → won`, with `lost` as a closed state
- **Quote day / work day**: set in the roofer's calendar rules
- **Visit**: a booked quote appointment. **Quote → Job → Invoice**: the rest of the flow
- **Commission entry**: created per payment received on a Juno-sourced invoice
- **Ad balance**: the roofer's prepaid ad spend ledger

## How to work

- Start each milestone in plan mode: restate the goal, list the files and tables you'll touch, and flag anything unclear in the spec before writing code
- Small, focused commits with clear messages. Keep `main` deployable
- Write tests alongside features. **Always test** tenant isolation, commission maths, booking slot generation, and follow-up sequence timing
- Don't build later-phase features (P2/P3 in the spec) early, even if they look easy
- Ask before adding a major dependency or a new external service
- Keep this file current when a decision changes, and note it in `docs/decisions.md`

## Commission test cases (must pass)

| Case | Expected commission |
|---|---|
| $800 paid, Juno-sourced | $48.00 |
| $7,000 paid, Juno-sourced | $420.00 |
| $20,000 paid, Juno-sourced | $1,200.00 |
| $30,000 paid, Juno-sourced | $1,800.00 |
| $100,000 paid, Juno-sourced | $5,000.00 (capped) |
| $7,000 paid, `roofer_own` source | $0.00 |
| $90,000 invoice paid in two parts: $40,000 then $50,000, Juno-sourced | $2,400.00 then $2,600.00 (cap reached, total $5,000.00) |
| $7,000 paid then $2,000 credit note | $420.00 then −$120.00 (net $300.00) |
| Further job for a Juno-sourced customer, quoted 11 months after the original lead date | Commission applies |
| Further job for a Juno-sourced customer, quoted 13 months after the original lead date | $0.00 |

All amounts ex GST.
