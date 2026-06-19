# Future improvements — Customer follow-ups

Parking lot for ideas discussed but not yet built. Nothing here is committed work;
it's a reference for when we pick the next thing to tackle.

---

## 1. Risk status / "blacklist" for non-paying customers

A way to flag and reference chronic non-payers so the office can stop doing work
(or extending credit) for them.

### Reframe: tiered risk status, not a binary blacklist
A single on/off "blacklist" is blunt and risky (it wrongly brands someone who is
withholding payment over a legitimate dispute). Use a small ladder instead:

- **Watch** — slipping, keep an eye (amber)
- **Hold** — no further work / no credit until cleared (orange)
- **Blacklisted** — chronic non-payer, refuse / hand to legal (red)
- **Disputed** — *separate* state; not bad faith, must not pollute the risk list

Reuses the coloured-pill pattern already built for the "Fully paid" flag.

### The four design forks

**1. How does a customer land on it — manual, automatic, or hybrid?**
Recommended: **hybrid — system suggests, human confirms.** We can compute a simple
risk score from data we already store:
- oldest invoice age (`days`)
- size of outstanding
- **broken promises** — count of past follow-ups where a promised-to-pay date lapsed
  with no settlement (derivable from interactions)
- **silence** — many logged attempts, never settled
- **repeat offender** — was settled before, now owes again

The tool flags candidates; the admin confirms the tier. Auto-suggest stops it relying
on someone remembering; human-confirm avoids unfair auto-branding.

**2. What does an entry record?**
Tier, **reason code** (broken promises / gone silent / partial-only / refuses /
dispute), free-text note, **who flagged it + when**, outstanding-at-time, and an
optional **review date** ("revisit in 30 days"). The interaction history is the
evidence trail.

**3. Where is it referenced — inform only, or actually block?**
- (a) Pill + a "Risk" filter/group inside follow-ups (easy, self-contained).
- (b) Warning on the **Recapture / job-card side** when capturing a job for a flagged
  customer ("⚠ Flagged: bad payer (Hold)"). This is where it earns its keep — stops
  work *before* it happens.
- (c) Feed it to the technician field app so a job can't even be booked.

Catch: (b)/(c) require recognising "same customer" across the two sides — i.e. the
**customer-identity / matching** problem below. A blacklist is only as good as the
match between a job-card name and the flagged customer.

**4. How do they get off it?**
Auto-clear on full settlement, **but keep the history** ("previously flagged ×2") — a
repeat offender who always pays late is still a risk. Clearing must not erase the
pattern.

### Governance (SA / POPIA)
Keep it explicitly an **internal reference** with an audit trail of who flagged and
why. Not a credit-bureau listing. Reason codes make it defensible ("refused to pay
despite 6 contacts," not just "bad").

### Possible MVP
- Customer-level `risk: { tier, reason, note, by, at, reviewOn }`
- A manual "Flag risk" action in the customer drawer
- Coloured pill on the list + History, and a "Risk" filter
- Auto-suggested candidates from the signals above
- Defer the cross-workspace job-card warning to phase 2 (gated on customer identity)

---

## 2. Re-import should reconcile, not just append

Today "Upload Excel list" appends new invoices and skips invoice numbers it already
has. It never notices invoices that **disappeared** from the new export (= paid) and
never updates a balance that **shrank** (a partial payment). Outstanding totals drift
from reality unless the admin marks everything manually.

**Idea:** make re-import a true reconcile — close invoices that dropped off, update
changed balances. **Risk to handle:** don't wrongly close an invoice that's just
missing because someone exported a *filtered/partial* report (e.g. require a "full
export" confirmation, or only auto-close within the same aging buckets present).

---

## 3. Customer identity / matching key

Dedupe currently keys on the **normalized customer name**. This is fragile — our own
test file proved it: `Engen One Plus (Quote 2438) Dep R8392,12` vs `Engen One Plus`
would import as **two** customers with split histories/balances; meanwhile two
different "J. Smith"s would merge into one.

**Idea:** key identity on a **stable account/customer code** from the export (the
file had a code in column A) instead of the name. Decide the fallback when a row has
no code. This also unlocks cross-workspace matching (job-card ↔ follow-up customer),
which the risk-status warning (1b) depends on.

---

## 4. Multi-user accountability + proactive reminders

Two quiet assumptions today:
- Every interaction is logged as "Admin" — no record of *who* actually chased.
- The tool is passive — an overdue task only surfaces if someone opens the screen.

**Ideas:**
- Per-user identity on the log (login or a "who's logged in" selector) for trust and
  handover. The `by` field already exists in the data model.
- Active nudges — a daily "5 overdue" summary, desktop/email reminder — instead of
  waiting to be checked.

---

## 5. (Minor) Days-overdue is frozen at import time

The `days` value is captured at import and never ages forward — an invoice that was
"118 days" stays 118 until the next upload, even as real weeks pass. The day-bar ages
*follow-up dates* forward but not *invoice age*.

**Idea:** store an invoice **date** and compute age live, rather than a static number.
