---
title: Juno Logic Client Platform — Product Spec
entity: Juno Logic
status: Draft v0.6 for Phil's review
date: 2026-09-11
tags: [juno-logic, product, spec]
---

# Juno Logic Client Platform — Product Spec

**Status:** Draft v0.6 · 11 Sep 2026 · working name only, product name still open

**v0.6:** build approach decided: fresh codebase, codename Ridge, built in Claude Code (section 15)
**v0.5:** ad account ownership and prepaid ad spend decided (section 8)
**v0.4:** MAX hours budget and website buyout fee decided (section 8)
**v0.3:** monthly plans, free month terms and seasonal advertising decided (section 8)
**v0.2:** commission model decided (section 8)

## 1. Summary

A done-for-you business system for one-man-band roofers. Juno Logic builds the roofer's website, runs his advertising and brings in leads. The platform books those leads into the roofer's quote days, turns site visits into quotes, schedules accepted work into his other days, and sends invoices through to his own Xero. The roofer runs everything from his phone. Juno Logic runs the marketing and admin side.

It borrows the proven pieces of the MMP dashboard (the leads pipeline, the quote builder, and the path to Xero draft invoices). It gets rebuilt as one shared, secure platform that holds many roofers, each walled off from the others.

### Decisions locked (11 Sep 2026)

| Decision | Choice |
|---|---|
| Target customer | One-man-band roofers. No multi-staff companies |
| Lead booking | Leads self-book into open quote slots from the website or a text link |
| Hosting | One shared multi-client platform, each roofer walled off with his own login |
| Accounting | Xero integration. Quotes and invoices are made in the platform and pushed to the roofer's own Xero |
| Week shape | 1–2 quote days a week, the rest are work days |
| Monthly plans | Basic $200 + GST, MAX $500 + GST. First month free, then a 3-month minimum (section 8) |
| Commission | 6% of the paid invoice ex GST, Juno-sourced jobs only, capped at $5,000 per job, 12-month tail, ad spend at cost (section 8) |
| Ad accounts | Juno Logic owns the Meta and Google ad accounts. Roofers prepay their ad spend (section 8) |
| Seasons | No winter hold. Winter advertising switches to leak repairs and roof prep ahead of coating season (section 8) |

## 2. Who it's for

**The roofer.** Sole operator, on the tools most of the day, runs the business off his phone and does the admin at night.

The following are **assumptions to test with the first pilot roofer**:

- He misses calls while he's up on a roof, and some of those leads go to whoever answers first
- He can't tell whether his advertising money is working
- Quotes go out days late because he writes them up at night
- Rain wrecks the schedule, and moving customers around is painful
- He'd rather pay a monthly fee to never think about marketing than learn another app

**Juno Logic staff.** They manage websites, ad campaigns, lead flow and client accounts across every roofer from one admin console.

**The roofer's customers.** Homeowners and landlords. They never log in. They use booking links, quote acceptance pages and payment links.

## 3. Who does what

| Area | Juno Logic does | The platform automates | The roofer does |
|---|---|---|---|
| Website | Builds and hosts it, keeps it updated | Captures enquiries straight into the CRM | Supplies photos and approves the copy |
| Advertising | Runs the Meta and Google campaigns and the budget, switching focus with the seasons | Pulls in leads and spend, works out cost per job | Approves the monthly budget |
| First contact | Sets up message templates | Sends an instant text and email with a booking link, plus follow-ups | Nothing, unless the lead calls |
| Quote visits | Sets up his quote day rules | Offers open slots, confirms, sends reminders and "on my way" texts | Turns up |
| Quoting | Builds his price book at onboarding | Builds the quote from site measurements and prices | Measures, checks the quote, sends it |
| Scheduling | — | Suggests work days, flags rain, drafts reschedule texts | Approves changes |
| Invoicing | — | Creates the invoice in his Xero, chases overdue invoices | Marks the job done |
| Reviews | — | Asks happy customers for a Google review (with consent) | — |
| Reporting | Monthly review call | Leads, win rate, cost per won job, commission statement | Reads it |

## 4. Design principles

1. **Phone first, one thumb.** Every roofer task works on a phone in the van. Nothing needs a desk.
2. **The week is the product.** Quote days and work days shape the calendar, the booking rules and the Today screen.
3. **The platform does the chasing.** Follow-ups, reminders and overdue invoices go out on their own. The roofer approves, he doesn't type.
4. **One login, one person.** No staff, roles, timesheets or permissions for the roofer. This is what keeps it simpler than Tradify, Fergus or ServiceM8.
5. **Show him the money.** Every screen that can show dollars does: pipeline value, quotes out, invoices owed, cost per won job.
6. **Built around the property, not only the person.** Roofing work repeats on the same roof years later, and landlords own several properties.
7. **Reuse the MMP look where it fits.** Same clarity as the MMP dashboard work: a big green button moves things forward, a big red button closes them.

## 5. The week model

This is the core idea and the main thing that sets the product apart.

### Quote days

- The roofer picks his quote days (for example Tuesday and Thursday) and hours (for example 8:00–4:00)
- Default visit length 45 minutes plus a travel buffer. Both can be changed
- **Clustering:** once a quote day has a booking, the booking page shows nearby slots first, so visits group by suburb and he drives less
- **Service area:** leads outside his area get a polite decline or go on a waitlist, set per roofer
- **Capacity cap:** a maximum number of visits per quote day, so he isn't overbooked
- If quote days fill up, the platform flags it to Juno Logic. That's a signal to slow down ad spend or offer an extra quote day

### Work days

- Accepted quotes go into a "Ready to schedule" list with an estimated number of days
- The platform suggests the next available work days and the roofer confirms
- The customer gets a confirmation text, a reminder the day before, and a heads-up if anything moves

### Weather

- Each morning, and the evening before, the platform checks the forecast at every job address
- If rain or wind is over his limits on a work day, the job gets flagged, and the Today screen offers **Move job** with the next open days
- When he confirms, the customer gets a pre-written reschedule text. Nothing is sent without his tap
- Quote visits get a softer warning. A wet roof is unsafe to walk on, so he decides

## 6. Core flows

### 01 · Lead to booked quote

1. An enquiry comes in from the website form, a Meta lead ad, a Google ad or a missed call
2. The lead is created with its source recorded (this matters for commission, see section 8)
3. Within a minute the customer gets a text and an email: "Thanks, [Roofer] here. Pick a time for a free roof check:" plus a booking link
4. The customer picks a slot, answers 3–4 quick questions (roof type, what they need, photos optional) and confirms
5. Automatic confirmation, a reminder the day before, and an "on my way" text when he taps it
6. **No booking after 4 hours:** a second text. **After 2 days:** a final nudge, then a call task for Juno Logic or the roofer. **After 7 days:** marked cold
7. **Missed call text-back:** if a call to his business number goes unanswered, the caller gets an instant text with the booking link

### 02 · Site visit to quote

1. The Today screen shows the day's visits in route order with a map link
2. On site he records roof type, material, pitch, area, condition, photos and notes. This works offline, since reception on a roof is patchy, and syncs later
3. The quote builder uses his price book (rates per m², per metre of spouting, fixed items) to produce a quote. He adjusts it and taps **Send**
4. The customer gets a link to a branded quote page with photos. They can **accept online**, with a deposit payment if he wants one
5. Quote follow-ups go out at 3 days and 7 days if it hasn't been accepted

### 03 · Accepted quote to scheduled job

1. On acceptance a job is created and lands in "Ready to schedule"
2. The platform suggests work days, checking weather and his existing bookings
3. He confirms, and the customer is notified
4. Optional: a materials list generated from the quote lines

### 04 · Job to paid

1. He marks the job done and adds completion photos
2. The invoice is created in his Xero from the quote, as a **draft for his approval** at first (same approach as the MMP portal), with automatic approval as a later setting
3. The invoice goes to the customer with a Xero online payment link
4. Overdue reminders go out at 7, 14 and 21 days
5. After payment, a review request is sent if the customer has consented

## 7. Modules and phasing

**MVP** = needed for the first paying roofer. **P2 / P3** = later phases.

| Module | What it does | Phase |
|---|---|---|
| **Today** | Home screen: today's visits or job, weather, leads waiting, quotes to send, money owed | MVP |
| **Leads & CRM** | Pipeline New → Booked → Visited → Quoted → Won, with Lost as a closed state. Board and list views. Customer and property records, full message history | MVP |
| **Booking & calendar** | Quote day rules, public booking page, work day scheduling, reminders | MVP |
| **Quotes** | Price book, quote builder, photos, online acceptance | MVP |
| **Jobs** | Ready-to-schedule list, scheduled jobs, completion with photos | MVP |
| **Invoices (Xero)** | Connect his Xero, push draft invoices, sync payment status | MVP |
| **Messages** | Text and email templates, automatic sequences, one conversation thread per customer | MVP |
| **Website lead capture** | Juno-built site forms go straight into the CRM | MVP |
| **Juno Logic admin console** | All clients, plans and key dates (free month, minimum term, price lock), prepaid ad balances and top-ups, onboarding checklist, lead flow, access logs, commission statements, MAX hours used | MVP |
| **Meta lead ads** | Real-time lead import from Facebook and Instagram lead forms | MVP |
| **Missed call text-back** | Business number with call forwarding, auto text on missed calls | P2 |
| **Weather reshuffle** | Forecast checks, move-job prompts, reschedule texts | P2 |
| **Marketing results** | Ad spend by campaign, cost per lead, cost per won job, return on ad spend | P2 |
| **Reviews** | Google review requests after payment | P2 |
| **Deposits** | Deposit payment on quote acceptance | P2 |
| **Unified inbox** | Facebook Messenger and Instagram DMs alongside texts and email | P3 |
| **Route planning** | Order visits by drive time on quote days | P3 |
| **Repeat work** | Maintenance reminders, for example a roof wash or recoat check years later | P3 |

## 8. Pricing and commission

Juno Logic earns a monthly fee plus commission, so the platform has to show attribution the roofer trusts. The fee is kept low on purpose: commission is where Juno Logic makes its margin, so Juno Logic only does well when the roofer does. The aim is long-term clients.

### Monthly plans (decided 11 Sep 2026)

All prices + GST.

| Basic · $200 a month | MAX · $500 a month |
|---|---|
| Website, built and hosted | Everything in Basic |
| The full platform: CRM, self-booking, calendar, quotes, Xero invoicing, automatic texts | Meta **and** Google ads, optimised weekly |
| Meta ads managed, optimised monthly | Juno Logic calls leads who don't book online |
| Monthly results report | Chasing quotes that haven't been accepted, plus sales coaching |
| | Google reviews and Google Business Profile managed |
| | Monthly review call with Juno Logic |

Ad spend is on top of either plan, prepaid by the roofer and passed on at cost.

### Ad accounts and prepaid ad spend (decided 11 Sep 2026)

- **Juno Logic owns the ad accounts.** One Meta ad account per roofer inside Juno Logic's Meta Business Portfolio, and one Google Ads account per roofer under Juno Logic's Google Ads manager account. Keeping one account per roofer keeps billing, results and commission attribution separate
- **Roofers prepay their ad spend** into an ad balance before campaigns run, including the starter campaign in the free month. Juno Logic never funds a roofer's ads
- **The platform shows the balance:** top-ups, spend to date by platform, days of spend left. A low-balance alert goes to the roofer and Juno Logic, and campaigns pause if the balance runs out
- **Client money is kept separate:** prepaid balances are held apart from Juno Logic's own money (a separate bank account, or at minimum a clear ledger), and any unspent balance is refunded when a roofer leaves
- **What stays where (recommended):** the roofer's Facebook Page and Google Business Profile stay in his name, with Juno Logic given partner access. The ad accounts, campaigns and audience data stay with Juno Logic. His leads and customer records are his and go with his data export
- **Check with the accountant:** the GST treatment of prepaid ad spend that Juno Logic pays to Meta and Google and passes on at cost


### MAX hours budget (decided 11 Sep 2026, internal only)

Each MAX client gets **4 hours of actual Juno Logic time a month**. AI drafting, pre-made ads and automated updates stretch that so it delivers the equivalent of about 10 hours. The hours stay internal. The client-facing plan lists what he gets, never hours.

| Where the 4 hours go (suggested) | Time |
|---|---|
| Weekly ad optimisation check, 15 minutes × 4 | 1 h |
| Calling leads who don't book online, and chasing unaccepted quotes, done in batches | 1.5 h |
| Monthly review call | 45 min |
| Sales coaching and Google Business Profile updates | 45 min |
| **Total** | **4 h** |

| What stretches it (no Juno Logic time) |
|---|
| AI-drafted ad copy and image variations from a pre-made seasonal ad library |
| Monthly results report generated by the platform |
| Automatic quote follow-up texts and Google review requests |
| AI-drafted Google Business Profile posts and website updates, approved in a few minutes |

- The admin console tracks hours used per MAX client each month and flags anyone running over
- Lead callbacks are the most likely item to run over. Keep them in fixed batches with a set number of attempts per lead

### First month free

The free month is there to show and impress. It runs the full lead-to-booked-quote loop, because watching quote visits land in his calendar on their own is what sells it. Ad volume and the extras are held back, and he's shown what switches on once he's paying.

| Included in the free month | Starts once paid |
|---|---|
| Website live | Full ad volume |
| Lead capture and self-booking into quote days | Missed call text-back |
| CRM, calendar and quotes | Weather reshuffle |
| Xero connection and invoicing | Google review requests |
| A starter Meta campaign (his ad spend, at cost) | Monthly results report |
| | All MAX extras |

This split is a starting point and can be adjusted after the pilot.

**Free month terms**

- **3-month minimum after the free month.** Ads need about 2–3 months to learn what works, so he needs to stay long enough to see results
- **Ad spend prepaid at cost from day one,** including the free month. Juno Logic doesn't fund his ads
- **Commission applies to leads from the free month,** including when the invoice is paid after the free month ends
- **The website stays Juno Logic's until he's paid for 12 months.** If he leaves before then, the site comes down or he pays **$2,000 + GST** to keep it. After 12 paid months, it's his

### Keeping clients long term

- **Founding client price lock:** the first 10 roofers keep their Basic or MAX price for 24 months
- **Month-to-month after the minimum term,** with an easy full data export. Clients stay longer when leaving isn't scary
- **Upgrade prompt:** when a Basic roofer's quote days keep filling up, the platform flags him to Juno Logic as ready for MAX
- **No winter hold. Advertising changes with the seasons instead:**

| Season | Advertising focus |
|---|---|
| Winter | Leak repairs, plus roof prep work (cleaning, treatment, repairs) that lines up coating jobs for the warmer months |
| Warmer months | Roof coating and painting |

The platform supports this with seasonal campaign templates and price book items for leak repairs and prep work, so quote days stay full year-round.

### Example month

Job counts and ad spend below are assumptions, checked against the 10–12% health check further down.

| | Basic | MAX |
|---|---|---|
| Juno jobs a month × $7,000 | 3 = $21,000 | 6 = $42,000 |
| Monthly fee | $200 | $500 |
| Commission at 6% | $1,260 | $2,520 |
| Ad spend at cost (assumed) | $800 | $1,500 |
| **Roofer's total cost** | **$2,260 (10.8%)** | **$4,520 (10.8%)** |
| **Juno Logic's income** | **$1,460** | **$3,020** |

### Commission (decided 11 Sep 2026)

| Term | Setting |
|---|---|
| Rate | **6%** of the invoice value, excluding GST |
| Charged on | **Paid invoices only.** Commission follows money received. Part payments earn commission as they come in, and credit notes or refunds reduce it |
| Which jobs | **Juno-sourced leads only** (Juno ads, Juno website, Juno referral). Nothing on the roofer's own word of mouth or existing customers |
| Cap | **$5,000 commission per job**, across all payments on that job |
| Tail | Further jobs for a Juno-sourced customer count if quoted within **12 months of the original lead date**. After that the customer is the roofer's |
| Ad spend | Prepaid by the roofer, passed on **at cost**, shown separately, no markup |
| GST | Commission is calculated ex GST. Juno Logic's commission invoice adds GST if Juno Logic is GST registered |

### Worked examples

| Job | Invoice ex GST | 6% | Commission |
|---|---|---|---|
| Small repair | $800 | $48 | $48 |
| Roof paint, 150 m² | $7,000 | $420 | $420 |
| Colorsteel re-roof | $20,000 | $1,200 | $1,200 |
| Auckland metal tile re-roof | $30,000 | $1,800 | $1,800 |
| Large job at the cap | $83,334+ | $5,000+ | $5,000 |

At 6%, the $5,000 cap only takes effect on jobs above about $83,300 ex GST, so typical residential work pays the full 6%.

### Health check

Each month the platform totals the roofer's monthly fee, commission and ad spend against the revenue from Juno-sourced jobs. If that total goes much past **10–12%**, Juno Logic reviews one of the three with him. This is an internal guideline, not a contract term.

### How the platform handles it

- Every lead records its **source**: Juno ads · Juno website · Juno referral · the roofer's own (word of mouth, repeat customer)
- Source is set automatically when it can be and locked after the first contact. Juno Logic can change it, and every change is logged and visible to the roofer
- The 12-month tail runs per customer from the original lead date, so later quotes for that customer inherit the Juno source automatically
- A commission entry is created whenever a payment on a Juno-sourced invoice syncs from Xero, with a running per-job total that stops at the $5,000 cap
- Monthly commission statement: each job, its source, amount paid, rate, commission and cap status, visible to both sides
- Juno Logic's own invoice to the roofer is generated from the statement in Juno Logic's Xero, with ad spend at cost as a separate line
- **Contract:** the client agreement needs the plan terms (free month, 3-month minimum, website ownership and the $2,000 buyout, price lock), Juno Logic's ownership of the ad accounts, how prepaid ad balances are held and refunded, the source rules, the 12-month tail, commission on free-month leads, and a right to check invoices on Juno-sourced customers, so work done off the platform still counts

## 9. Integrations

| Integration | Purpose | Notes |
|---|---|---|
| **Xero** | Each roofer connects his own Xero. Contacts, draft invoices, payment status | Xero moved to tiered developer pricing on 2 Mar 2026, priced in AUD. Starter: free, 5 connections. Core: A$35/mo, 50 connections. Plus: A$245/mo, 1,000 connections, needs app certification. Each roofer's Xero counts as a connection. **Plan:** Core covers the first ~50 roofers. Start certification before reaching 50. Xero's terms ban using API data to train AI models |
| **Meta lead ads** | Real-time lead import | Subscribe to the `leadgen` webhook on each roofer's Facebook Page. Needs `leads_retrieval`, `pages_manage_metadata`, `pages_show_list`, `pages_read_engagement` and `ads_management` permissions |
| **Google Ads** | Lead form and call leads, spend data. One account per roofer under Juno Logic's manager account | Google Local Services Ads are not offered in NZ (per a 2026 guide listing eligible countries; recheck before planning), so standard search ads and lead forms apply |
| **SMS** | Booking links, reminders, two-way replies | Use an NZ-capable provider with NZ virtual numbers for two-way texting. Kudosity offers NZ virtual numbers; Modica is an NZ SMS gateway (confirm its two-way number options). Twilio doesn't support NZ long code numbers, only short codes that take 5–6 weeks to provision |
| **Email** | Confirmations, quotes, invoices | Any transactional email service. Send from the roofer's own domain, set up with the website |
| **Weather** | Work day rain and wind checks | MetService Point Forecast API: free Starter tier with 50,000 units a month, paid plans from US$30/mo, covers NZ by coordinates. Open-Meteo's free API is **non-commercial only**, so it would need a paid plan |
| **Maps** | Addresses, clustering, route links | Address autocomplete and travel time. Pricing not yet checked |
| **Payments** | Invoice payment, deposits | Invoices use Xero's online payment options. Deposit handling to be decided in P2 |

## 10. Architecture outline

- **One app, many roofers.** Every record carries the roofer's account ID, and separation is enforced in the database itself (for example Postgres row-level security), not only in the app code
- **Hosted in NZ.** The AWS Asia Pacific (New Zealand) region opened in Auckland on 1 Sep 2025 with three availability zones. NZ-owned options such as Catalyst Cloud are the alternative. Customer data stays onshore either way
- **Not on the home NUC.** The MMP dashboard's home server setup is fine for MMP's own tools, but paying clients' customer records need proper hosting, backups and uptime
- **Phone app approach:** start as an installable web app (PWA). One codebase, installs to the home screen, works offline for site visits. A native app only if push notifications or offline needs outgrow it
- **Security basics:** two-factor login, encrypted backups, audit log of every Juno Logic staff access to a roofer's account (visible to the roofer), full data export for any roofer who leaves
- **Reuse from the MMP dashboard:** pipeline stages and board/list UI, green/red action pattern, quote builder logic, Xero draft invoice flow

### Core data (first pass)

| Record | Key fields |
|---|---|
| Roofer account | Business name, service area, quote day rules, price book, Xero connection, plan (Basic/MAX), free month end, minimum term end, price lock end, website ownership date, commission rate (default 6%), commission cap (default $5,000) |
| Customer | Name, phone, email, consent flags, source |
| Property | Address, coordinates, roof type, material, pitch, area, photos, history |
| Lead | Customer, property, source, campaign, stage, timestamps |
| Visit | Lead, slot, status, site notes, measurements |
| Quote | Lines, total, status, sent/accepted dates, deposit |
| Job | Quote, scheduled days, status, completion photos |
| Invoice | Job, Xero invoice ID, status, paid date |
| Message | Customer, channel, direction, template, sent/delivered |
| Commission entry | Invoice, payment, source, rate, amount, running job total, cap reached, statement month |
| Ad spend | Roofer, platform, campaign, date, spend, leads |
| Ad balance | Roofer, top-ups, spend drawn, current balance, low-balance threshold, refunds |

## 11. Privacy and messaging rules

**Not legal advice.** Have a lawyer review the client contract and privacy terms before the first paying client.

- **Privacy Act 2020.** Juno Logic holds the roofer's customer data on his behalf. The client contract needs to say who is responsible for what, how breaches are handled and notified, and that the roofer owns his customer list
- **IPP3A (in force 1 May 2026)** requires telling people when their information is collected from someone other than them. Leads who fill in a form themselves are collected directly. Meta lead forms, referral partners or bought lists may count as indirect collection. Name the roofer (and Juno Logic as its service provider) on every form, booking page and website privacy statement, so people already know. That should cover the notice requirement, but confirm with the lawyer
- **Unsolicited Electronic Messages Act 2007.** Replies to quote requests, confirmations of agreed bookings and account or invoice messages are **not** commercial messages under DIA's guidance. Review requests, "time for a roof check" reminders and promotions **are** commercial, so they need consent, sender identification and a working unsubscribe. The platform stores consent per customer and blocks commercial sends without it
- **SMS etiquette:** daytime sending only for anything non-urgent, and opt-in before marketing, in line with carrier and provider guidelines
- **Xero data:** not used to train any AI or machine learning model, per Xero's developer terms

## 12. What it deliberately won't do

- Multiple staff, crews, roles or timesheets
- Payroll, inventory or detailed job costing
- Commercial tenders or project management for large builds
- Trades other than roofing, at least until the roofing version is proven
- Replace Xero. Accounting stays in the roofer's Xero

## 13. How we'll know it works

| Measure | Why it matters |
|---|---|
| Time from enquiry to first contact | Speed wins jobs. Target: under a minute, automated |
| Lead → booked quote rate | Shows the booking flow works |
| Quote days filled | Too empty means more ads, too full means pull back |
| Quote → won rate | Quote quality and follow-up |
| Cost per won job | The number that proves Juno Logic's value to the roofer |
| Days from job done to paid | Invoicing and reminders working |
| Roofer admin hours per week | The core promise. Ask him at onboarding and again at 90 days |
| Free month → paying client | Whether the free month shows enough to convert |
| Client retention | Whether the model holds |
| Basic → MAX upgrades | Whether results grow into the bigger plan |

## 14. How it compares

| | ServiceM8 | Tradify | Fergus | **Juno Logic** |
|---|---|---|---|---|
| Solo operator price (NZD/mo) | $29 Starter, 50 jobs | $48–62 per user, ex GST | From $53 | $200 Basic or $500 MAX + GST, first month free, website included, plus 6% commission on Juno-sourced jobs (capped at $5,000) |
| Job management, quotes, invoices | Yes | Yes | Yes | Yes, simplified for one person |
| Website | No | Basic add-on | No | **Built and run for him** |
| Advertising and lead generation | No | No | No | **Run for him** |
| Automatic lead follow-up and self-booking | No | No | No | **Yes** |
| Who does the work | The tradie | The tradie | The tradie | **Juno Logic plus automation** |

The pitch isn't "cheaper software", it's "you just quote and roof". Price against the jobs won, not against the software.

## 15. Open questions for Phil

1. **Product name.** The Juno Logic trade mark still needs an attorney. Sort this before any client-facing branding
2. **Pilot roofer.** Who's the first client, and does he already use Tradify, Fergus or ServiceM8?
3. **Business phone number.** Port his existing number, or forward it to a new platform number for missed call text-back?
4. **Price book scope.** Which services at launch: roof painting, repairs, re-roofing, spouting, moss and lichen treatment? Leak repairs and prep work are needed for winter campaigns
5. **MMP crossover.** Would roofers on the platform order coatings through MMP? Worth raising with David early, since it touches your MMP role and the planned buy-in

### Decided

- **Commission basis** (11 Sep 2026): 6% of paid invoices ex GST on Juno-sourced jobs, capped at $5,000 per job. See section 8
- **Monthly fee** (11 Sep 2026): Basic $200, MAX $500, + GST, first month free, 3-month minimum, founding price lock. See section 8
- **MAX hours** (11 Sep 2026): 4 actual hours a month, stretched to about 10 with AI and pre-made ads. Internal only. See section 8
- **Website buyout** (11 Sep 2026): $2,000 + GST to keep the site if leaving within 12 paid months. See section 8
- **Ad accounts** (11 Sep 2026): Juno Logic owns the Meta and Google ad accounts. Roofers prepay ad spend. See section 8
- **Build approach** (11 Sep 2026): a fresh codebase, codename Ridge, built with Claude Code. Reuses MMP dashboard patterns but not its code, since this needs multi-tenant NZ cloud hosting. Milestone plan in [[juno-logic-platform-build-plan]]
- **Seasonal approach** (11 Sep 2026): no winter hold. Winter ads target leak repairs and roof prep ahead of coating season. See section 8

## Sources

Checked 11 Sep 2026.

- [Xero Developer — Pricing](https://developer.xero.com/pricing)
- [Xero Developer — Pricing and policy FAQs](https://developer.xero.com/faq/pricing-and-policy-updates)
- [Meta — Webhooks for Lead Ads](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-leadgen/)
- [Office of the Privacy Commissioner — IPP3A](https://www.privacy.org.nz/resources-and-learning/a-z-topics/ipp3a/)
- [DIA — Spam law for businesses](https://www.dia.govt.nz/Spam-NZ-Spam-Law-for-Businesses)
- [Twilio — New Zealand SMS guidelines](https://www.twilio.com/en-us/guidelines/nz/sms)
- [Kudosity — NZ SMS compliance checklist](https://kudosity.com/resources/articles/sms-compliance-checklist-for-businesses-in-new-zealand-a-practical-guide)
- [Modica Group — SMS Gateway API](https://www.modicagroup.com/sms-gateway-api)
- [MetService — Point Forecast API](https://data.metservice.com/product/point-forecast-api)
- [Open-Meteo — Terms](https://open-meteo.com/en/terms)
- [DCD — AWS launches cloud region in New Zealand](https://www.datacenterdynamics.com/en/news/aws-launches-cloud-region-in-new-zealand/)
- [ServiceM8 NZ — Pricing](https://www.servicem8.com/nz/pricing)
- [Kove — Tradify pricing in NZ](https://kove.nz/insights/tradify-pricing-nz)
- [Horton Taylor — ServiceM8 vs Tradify vs Fergus (Jul 2026)](https://hortontaylor.co.nz/blog/servicem8-vs-tradify-vs-fergus-nz/)
- [SearchScope — Google Local Service Ads guide (2026)](https://searchscope.com.au/local-seo/google-local-service-ads-for-businesses/)
- [Find Painters — Roof painting cost NZ 2026](https://www.findpainters.co.nz/blog/roof-painting-cost-nz/) (commission examples)
- [TradieTools — Roof replacement cost NZ 2026](https://tradietools.nz/articles/roof-replacement-cost-nz/) (commission examples)
- [King Tide — Google Ads cost NZ (Jul 2026)](https://kingtide.nz/blog/google-ads-cost-nz) (ad learning period, management fees)
- [Hands Free Marketing — Google Ads manager cost NZ 2026](https://www.handsfreemarketing.com/2026/05/25/google-ads-manager-cost-nz/)
- [Lucid Media — Website cost NZ 2026](https://www.lucidmedia.co.nz/blog/website-cost-new-zealand-2026)
- [Fairweb — Website maintenance cost NZ](https://fairweb.co.nz/blog/website-maintenance-cost-nz/)
