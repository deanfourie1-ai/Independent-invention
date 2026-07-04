/* Reconciles a freshly uploaded outstanding-invoices sheet against the
   customers already on file. Pure module — no I/O — so commitImport stays
   thin and the rules stay testable in isolation.

   Agreed rules (daily re-import of the Sage aged-debtors export):
   - customers match by normalised name, invoices by invoice number;
   - invoice present with the same amount   → untouched;
   - invoice present with a lower amount    → amount updated + "Partially paid" note;
   - invoice present with a higher amount   → updated silently (interest/correction);
   - invoice gone from the file (or ≤ 0)    → ticked paid + "Fully paid" note;
   - invoice ticked paid here but still in the file → Sage wins: reopened silently;
   - new invoices / new customers           → added silently, as the import always did;
   - manual customers and Manual / IMP-* invoice numbers never reconcile —
     they don't exist in Sage exports and would otherwise be mass-settled.
   One aggregated interaction is logged per customer, dated on the import day. */

import { S } from './helpers.js';

export function parseMoney(v) {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  // Keep cents: round to 2 decimal places, not to whole rands.
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function isoFromDateCell(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 0) { const d = new Date(Math.round((v - 25569) * 86400000)); return isNaN(d) ? null : d.toISOString().slice(0, 10); }
  const t = Date.parse(String(v)); return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

const norm = (s) => String(s || '').trim().toLowerCase();

/* Invoice numbers that can never have come from a Sage export. */
const isSageInvoiceNo = (no) => {
  const s = String(no || '').trim();
  return Boolean(s) && !/^manual$/i.test(s) && !/^IMP-\d+$/i.test(s);
};

export function reconcileImport({ customers, dataRows, map, fileName, todayIso }) {
  /* 1. Parse + index the file: Map<customerKey, { name, invoices: Map<no, row> }> */
  const fileByCustomer = new Map();
  let rowsUsed = 0;

  dataRows.forEach((r) => {
    const name = String(r[map.customer] ?? '').trim();
    const no = String(r[map.invoice] ?? '').trim();
    if (!name || !no) return;
    const amount = parseMoney(r[map.amount]);
    const invDate = map.date != null ? isoFromDateCell(r[map.date]) : null;
    let days = 0;
    if (map.days != null) days = Math.max(0, Math.round(Number(String(r[map.days]).replace(/[^\d.-]/g, '')) || 0));
    else if (invDate) days = Math.max(0, S.daysBetween(invDate, todayIso));
    const extra = invDate ? { invoiceDate: invDate } : { importedDays: days, importedAt: todayIso };
    // Only overwrite an existing invoice's age fields when the file has age info.
    const hasAge = invDate != null || map.days != null;
    rowsUsed += 1;
    const key = norm(name);
    if (!fileByCustomer.has(key)) fileByCustomer.set(key, { name, invoices: new Map() });
    fileByCustomer.get(key).invoices.set(no, { amount, days, extra, hasAge });
  });

  const summary = {
    partial: 0, fullyPaid: 0, reopened: 0,
    newInvoices: 0, newCustomers: 0, settledCustomers: 0,
    receivedValue: 0, addedValue: 0,
  };
  const interactions = [];
  const dispDate = S.isoToDisp(todayIso);
  const time = new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  let seq = 0;

  /* Leftover (unmatched) file invoices are added by the first existing
     customer with that name, so duplicate-named customers can't add twice. */
  const leftoverClaimed = new Set();

  const nextCustomers = customers.map((c) => {
    const invoices = (c.invoices || []).map((iv) => ({ ...iv }));
    const sageInvoices = invoices.filter((iv) => isSageInvoiceNo(iv.no));
    const key = norm(c.name);
    const fileGroup = fileByCustomer.get(key) || null;

    // Manual-only customer not mentioned in the file — leave untouched.
    if (!sageInvoices.length && !fileGroup) return c;

    const paidNotes = [];
    const partialNotes = [];
    const matchedNos = new Set();

    for (const iv of sageInvoices) {
      const no = String(iv.no).trim();
      const fileInv = fileGroup ? fileGroup.invoices.get(no) : null;
      const prevAmt = Math.round((Number(iv.amount) || 0) * 100) / 100;
      const wasPaid = Boolean(iv.paid);
      if (fileInv) matchedNos.add(no);

      if (!fileInv || fileInv.amount <= 0) {
        // Gone from the export (or zero/credit balance) → fully paid.
        if (!wasPaid) {
          iv.paid = true;
          paidNotes.push(`${no} (${S.fmtR(prevAmt)})`);
          summary.fullyPaid += 1;
          summary.receivedValue += prevAmt;
        }
        continue;
      }

      if (wasPaid) {
        // Ticked paid here but Sage still lists it — Sage wins, reopen silently.
        iv.paid = false;
        summary.reopened += 1;
      }
      if (fileInv.amount < prevAmt) {
        partialNotes.push(`${no}: ${S.fmtR(prevAmt - fileInv.amount)} received, ${S.fmtR(fileInv.amount)} still outstanding`);
        summary.partial += 1;
        summary.receivedValue += prevAmt - fileInv.amount;
      }
      iv.amount = fileInv.amount; // higher amounts update silently
      if (fileInv.hasAge) {
        delete iv.invoiceDate; delete iv.importedDays; delete iv.importedAt;
        iv.days = fileInv.days;
        Object.assign(iv, fileInv.extra);
      }
    }

    // Invoices in the file we don't have yet — add silently.
    if (fileGroup && !leftoverClaimed.has(key)) {
      leftoverClaimed.add(key);
      for (const [no, fi] of fileGroup.invoices) {
        if (matchedNos.has(no)) continue;
        if (invoices.some((iv) => String(iv.no).trim() === no)) continue;
        if (fi.amount <= 0) continue;
        invoices.push({ no, amount: fi.amount, days: fi.days, ...fi.extra });
        summary.newInvoices += 1;
        summary.addedValue += fi.amount;
      }
    }

    if (paidNotes.length || partialNotes.length) {
      const parts = [];
      if (paidNotes.length) parts.push(`Fully paid — ${paidNotes.join(', ')}`);
      if (partialNotes.length) parts.push(`Partially paid — ${partialNotes.join('; ')}`);
      interactions.push({
        id: `L-IMP-${Date.now()}-${++seq}`,
        customerId: c.id,
        date: dispDate,
        time,
        by: 'Import',
        did: 'import',
        dids: ['import'],
        invoice: null,
        said: `${parts.join(' · ')} (import of ${fileName})`,
        followUpIso: null,
        followUpTime: null,
      });
    }

    /* Sage wins on totals too: recompute outstanding from what's unpaid,
       replacing any manually typed override. */
    const unpaidSum = Math.round(invoices.reduce((s, iv) => s + (iv.paid ? 0 : Number(iv.amount) || 0), 0) * 100) / 100;
    const allPaid = invoices.length > 0 && invoices.every((iv) => iv.paid);
    if (allPaid && !c.settled) summary.settledCustomers += 1;

    return {
      ...c,
      invoices,
      outstanding: unpaidSum,
      settled: allPaid,
      settledAt: allPaid ? (c.settledAt || todayIso) : null,
    };
  });

  /* 2. Customers in the file we've never seen — add them. */
  const existingKeys = new Set(customers.map((c) => norm(c.name)));
  let autoId = 0;
  for (const [key, group] of fileByCustomer) {
    if (existingKeys.has(key)) continue;
    const invs = [...group.invoices.entries()]
      .filter(([, fi]) => fi.amount > 0)
      .map(([no, fi]) => ({ no, amount: fi.amount, days: fi.days, ...fi.extra }));
    if (!invs.length) continue;
    nextCustomers.push({
      id: `C-IMP${Date.now()}-${++autoId}`,
      name: group.name,
      contact: '', phone: '', email: null,
      invoices: invs,
      outstanding: invs.reduce((s, iv) => s + iv.amount, 0),
      settled: false,
      settledAt: null,
    });
    summary.newCustomers += 1;
    summary.newInvoices += invs.length;
    summary.addedValue += invs.reduce((s, iv) => s + iv.amount, 0);
  }

  return { nextCustomers, interactions, summary, rowsUsed };
}
