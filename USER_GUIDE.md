# Jobtool — User Guide

A simple tool for turning scanned paper job cards into clean records and capturing them into Sage Online.

---

## Starting the program

1. Double-click **`jobtoolAdmin.exe`**.
2. A black window opens (leave it open — that is the engine running).
3. Your web browser opens automatically at the Jobtool screen.

> Tip: The browser tab shows the blue Jobtool icon, so you can find it easily if you have several tabs open.

To close the program: close the browser tab **and** close the black window.

---

## The big picture

```
   ┌────────────┐     ┌────────────┐     ┌────────────┐
   │  1. SCAN   │ ──▶ │ 2. REVIEW  │ ──▶ │ 3. CAPTURE │ ──▶  Done!
   │  (OCR tab) │     │  & fix     │     │  into Sage │
   └────────────┘     └────────────┘     └────────────┘
                                                │
                                                ▼
                                         ┌────────────┐
                                         │ 4. HISTORY │
                                         │  & Export  │
                                         └────────────┘
```

The program has three tabs along the top — **OCR**, **Capture**, **History** — plus a **Settings** gear. You move left to right.

---

## Step 1 — Scan in a job card (OCR tab)

1. Open the **OCR** tab.
2. Click to upload a scanned job card. You can use a **photo/JPEG** or a **PDF**.
3. Click **Process** — the system reads the card and pulls out the details
   (customer, date, technician, work done, charges, and so on).

---

## Step 2 — Check the details (OCR tab)

1. The scanned card appears on the left, the details it read on the right.
   - If you uploaded a PDF, you can scroll through the PDF right there.
2. Compare the two and **fix anything that looks wrong**. Hand-written cards
   are not always read perfectly — anything uncertain is flagged for you.
3. When it looks right, click **Create capture record**.
4. The card moves into the **Capture** queue.

> Technician names are matched automatically to your saved technician list,
> so small spelling differences are corrected for you. Up to 3 technicians
> can be on one job.

---

## Step 3 — Capture into Sage Online (Capture tab)

1. Open the **Capture** tab. The number badge shows how many cards are waiting.
2. Pick a job from the list on the left.
3. Work through the on-screen job card, **entering each detail into Sage Online**
   and ticking it off here as you go.
4. When every item is ticked, you'll see **"Captured into Sage Online"**.
   Click **Next order** to move to the following card.
5. When the queue is empty, you get a well-done screen.

---

## Step 4 — Look back and export (History tab)

1. Open the **History** tab to see every captured job.
2. **Search** by customer, address, invoice number or reference, or filter by date.
3. Click any row to see the full details and the original scan.
4. Click **Export to Excel** to download a spreadsheet of the listed jobs.

---

## Settings (the gear icon, top right)

Open this only when something needs configuring:

- **OCR** — the keys that let the system read scanned cards.
- **OneDrive** — where the scanned images are stored.
- **Technicians** — add or remove technician names. Click **Save technicians**
  after any change.

You normally won't need to touch this day to day.

---

## Good to know

- **Your data is safe.** All job records live in a `data` folder next to the
  program. They stay put even when the program is updated.
- **Getting an update.** You'll be given a new `jobtoolAdmin.exe`. Just replace
  the old one with it — your history and settings are not affected.
- **Something not working?** Close the browser tab and the black window, then
  start the program again. If it persists, contact your developer.
