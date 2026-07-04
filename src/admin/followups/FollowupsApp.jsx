import { useState, useMemo, useRef, useEffect } from 'react';
import Icon from '../../components/Icon';
import { FI } from './icons';
import { S } from './helpers';
import useFollowups from '../../hooks/useFollowups';
import {
  addInteraction, patchCustomer, addCustomer, deleteCustomer,
  applyImport, undoImport, getImportUndoStatus,
} from '../../services/followups';
import { reconcileImport } from './reconcile';
import { DEFAULT_TEMPLATES } from './templates';
import { didsLabel } from './interactions';
import { ActionList, DayBar, bucketOf } from './ActionList';
import { HistoryGroups, InteractionsPopup, PrintDoc } from './HistoryView';
import CustomerDrawer from './CustomerDrawer';
import { TaskModal, SettingsModal } from './modals';
import { ImportBand, ImportMapModal, deriveColumns, MAP_KEY } from './importMapping';

const LOGGED_BY = 'Admin';
const IMPORT_KEY = 'tidewell.followups.import';
const DEFAULT_IMPORT = { file: 'Outstanding invoices list', sheet: 'Aged debtors', date: '', time: '' };
const nowTime = () => new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });

function Brand() {
  return (
    <div className="tw-brand">
      <div className="tw-logo"><Icon name="droplet" size={18} /></div>
      <div>
        <div className="tw-brand-name">Jobtool</div>
        <div className="tw-brand-sub">Admin panel</div>
      </div>
    </div>);
}

export default function FollowupsApp({ workspaceSwitch }) {
  const { ready, customers, interactions } = useFollowups();

  const [tab, setTab] = useState('todo');
  const [drawerId, setDrawerId] = useState(null);
  const [popupId, setPopupId] = useState(null);
  const [printCust, setPrintCust] = useState(null);
  const [histQuery, setHistQuery] = useState('');
  const [showTask, setShowTask] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [workDate, setWorkDate] = useState(S.TODAY_ISO);
  const [toast, setToast] = useState(null);
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [importMeta, setImportMeta] = useState(() => {
    try { return JSON.parse(localStorage.getItem(IMPORT_KEY)) || DEFAULT_IMPORT; } catch { return DEFAULT_IMPORT; }
  });
  const [importDraft, setImportDraft] = useState(null);
  const [undoInfo, setUndoInfo] = useState({ available: false, at: null });
  const [savedMap, setSavedMap] = useState(() => {
    try { return JSON.parse(localStorage.getItem(MAP_KEY)) || null; } catch { return null; }
  });
  const toastTimer = useRef(null);
  const fileRef = useRef(null);

  // Movable "today" — set before any memo reads S.fuStatus.
  S.setToday(workDate);

  useEffect(() => { try { localStorage.setItem(IMPORT_KEY, JSON.stringify(importMeta)); } catch (_) {} }, [importMeta]);

  useEffect(() => {
    fetch('/api/templates')
      .then((r) => r.json())
      .then((saved) => { if (Array.isArray(saved) && saved.length) setTemplates(saved); })
      .catch(() => {});
    getImportUndoStatus()
      .then((st) => setUndoInfo({ available: !!st?.available, at: st?.at || null }))
      .catch(() => {});
  }, []);

  const custById = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);
  const nameById = (id) => (custById[id] || {}).name || id;

  const histByCust = useMemo(() => {
    const m = {};
    for (const a of interactions) (m[a.customerId] = m[a.customerId] || []).push(a);
    return m;
  }, [interactions]);

  const rows = useMemo(() => {
    const list = customers
      .filter((c) => S.owed(c) > 0 || (histByCust[c.id] || []).length > 0)
      .map((c) => {
        const h = histByCust[c.id] || [];
        const real = h.filter((x) => x.did !== 'task');
        const last = real[0] || null;
        const plannedEntry = h.find((x) => x.followUpIso) || null;
        const planned = plannedEntry ? plannedEntry.followUpIso : null;
        const plannedTime = plannedEntry ? plannedEntry.followUpTime : null;
        const plannedIsTask = !!plannedEntry && plannedEntry.did === 'task';
        const neverContacted = real.length === 0;
        const resolved = !!c.settled;
        const sortKey = (resolved ? '9999-99-99' : (planned || workDate));
        return { c, planned, plannedTime, last, neverContacted, plannedIsTask, resolved, sortKey };
      });
    return list.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : S.oldestDays(b.c) - S.oldestDays(a.c)));
  }, [customers, histByCust, workDate]);

  const histGroups = useMemo(() => {
    const m = new Map();
    for (const a of interactions) {
      if (a.did === 'task') continue;
      if (!m.has(a.customerId)) m.set(a.customerId, { id: a.customerId, name: nameById(a.customerId), settled: !!custById[a.customerId]?.settled, settledAt: custById[a.customerId]?.settledAt || null, entries: [] });
      m.get(a.customerId).entries.push(a);
    }
    return [...m.values()];
  }, [interactions, custById]);
  const filteredGroups = useMemo(() => {
    const s = histQuery.trim().toLowerCase();
    if (!s) return histGroups;
    return histGroups.filter((g) => (g.name + ' ' + g.entries.map((e) => e.said + ' ' + (e.invoice || '')).join(' ')).toLowerCase().includes(s));
  }, [histGroups, histQuery]);
  const totalOwed = customers.filter((c) => !c.settled).reduce((s, c) => s + S.owed(c), 0);
  const owingCount = customers.filter((c) => !c.settled && S.owed(c) > 0).length;
  const openInvCount = customers.filter((c) => !c.settled).reduce((s, c) => s + S.openInvoices(c).length, 0);
  const openTaskCount = rows.filter((r) => !r.resolved).length;

  const flash = (msg) => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 3000); };

  const saveLog = async ({ dids, said, followUpIso, followUpTime, outstanding, invoicePaid }) => {
    const c = custById[drawerId];
    if (!c) return;
    const affected = (c.invoices || []).filter((iv) => !(invoicePaid && invoicePaid[iv.no])).map((iv) => iv.no);
    const entry = {
      id: 'L-' + Date.now(), customerId: c.id, date: S.isoToDisp(S.TODAY_ISO), time: nowTime(),
      by: LOGGED_BY, did: dids[0], dids, invoice: affected.length === 1 ? affected[0] : null, said,
      followUpIso: followUpIso || null, followUpTime: followUpTime || null,
    };
    const clearedOut = typeof outstanding === 'number' && outstanding <= 0;
    const settled = clearedOut || !followUpIso;
    const newInvoices = (c.invoices || []).map((iv) => ({ ...iv, paid: !!(invoicePaid && invoicePaid[iv.no]) }));
    setDrawerId(null);
    await addInteraction(entry);
    await patchCustomer(c.id, {
      invoices: newInvoices,
      outstanding: typeof outstanding === 'number' ? outstanding : c.outstanding,
      settled,
      // Date the account was settled — kept from the first time it settled,
      // cleared again if the customer is reopened.
      settledAt: settled ? (c.settledAt || S.TODAY_ISO) : null,
    });
    flash(clearedOut
      ? c.name + ' — fully paid, removed from the list'
      : followUpIso
        ? didsLabel(entry) + ' ' + c.name + ' — next follow-up ' + S.isoToDisp(followUpIso)
        : c.name + ' marked settled — removed from the list');
  };

  const deleteTask = async (id) => {
    const target = custById[id];
    setDrawerId(null);
    await deleteCustomer(id);
    flash(`${target?.name || 'Follow-up'} deleted`);
  };

  const saveCustomerDetails = async (id, { contact, phone, email, address }) => {
    await patchCustomer(id, { contact: (contact || '').trim(), phone: phone.trim(), email: email.trim() || null, address: address.trim() || null });
    flash('Contact details saved');
  };
  const addCustomerFromSettings = async ({ name, contact, phone, email, address }) => {
    await addCustomer({
      id: 'C-S' + Date.now(), name, contact: (contact || '').trim(), phone: phone.trim(), email: email.trim() || null,
      address: address.trim() || null, invoices: [],
    });
    flash(name + ' added to customers');
  };

  const saveTask = async ({ customerId, newCustomer, note, followUpIso, followUpTime }) => {
    let cid = customerId;
    let cname;
    if (newCustomer) {
      cid = 'C-M' + Date.now();
      cname = newCustomer.name;
      await addCustomer({
        id: cid, name: newCustomer.name, contact: '', phone: newCustomer.phone || '', email: null,
        invoices: newCustomer.amount ? [{ no: 'Manual', amount: newCustomer.amount, days: 0 }] : [],
      });
    } else {
      cname = (custById[cid] || {}).name || 'customer';
      if (custById[cid]?.settled) await patchCustomer(cid, { settled: false, settledAt: null });
    }
    await addInteraction({
      id: 'L-' + Date.now(), customerId: cid, date: S.isoToDisp(S.TODAY_ISO), time: nowTime(),
      by: LOGGED_BY, did: 'task', invoice: null, said: note || 'Follow-up task',
      followUpIso: followUpIso || null, followUpTime: followUpTime || null,
    });
    setShowTask(false);
    setTab('todo');
    flash('Task added for ' + cname + ' — follow up ' + S.isoToDisp(followUpIso));
  };

  const exportCsv = (cust, entries) => {
    const header = ['Date', 'Time', 'Type', 'Invoice', 'What was said / agreed', 'Next follow-up', 'Logged by'];
    const esc = (s) => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
    const lines = entries.map((a) => [a.date, a.time, didsLabel(a), a.invoice || '', a.said,
      a.followUpIso ? S.isoToDisp(a.followUpIso) + (a.followUpTime ? ' ' + a.followUpTime : '') : '', a.by]);
    const csv = [header, ...lines].map((r) => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Interactions - ${cust.name}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    flash(`Exported ${entries.length} interaction${entries.length === 1 ? '' : 's'} for ${cust.name} to CSV`);
  };

  const exportOpenActionsReport = async () => {
    const openRows = rows.filter((r) => !r.resolved);
    if (!openRows.length) { flash('No open actions to export.'); return; }

    const xlsx = await import('xlsx');
    const today = S.isoToDisp(S.TODAY_ISO);

    const aoa = [];
    const customerRowSet = new Set();
    let rowIdx = 0;

    aoa.push(['Open follow-up actions report', '', '', '', '', '']); rowIdx++;
    aoa.push(['Generated:', today, `${openRows.length} open task${openRows.length === 1 ? '' : 's'}`, '', S.fmtR(totalOwed) + ' total outstanding', '']); rowIdx++;
    aoa.push([]); rowIdx++;

    for (const { c, planned, plannedTime } of openRows) {
      const entries = (histByCust[c.id] || []).filter((e) => e.did !== 'task');
      const amtOwed = S.owed(c);
      const contact = [c.contact, c.phone, c.email].filter((x) => x && x !== '—').join(' · ') || '—';
      const nextFu = planned
        ? (S.isoToDisp(planned) + (plannedTime ? ', ' + plannedTime : ''))
        : 'Not planned';
      const openInvs = S.openInvoices(c);

      // Customer header row — bold, col A = name, cols B–G = summary
      customerRowSet.add(rowIdx);
      aoa.push([
        c.name,
        contact,
        amtOwed > 0 ? S.fmtR(amtOwed) + ' outstanding' : 'No outstanding amount',
        'Next follow-up: ' + nextFu,
        openInvs.length + ' open invoice' + (openInvs.length !== 1 ? 's' : ''),
        openInvs.length ? 'Oldest: ' + S.oldestDays(c) + 'd' : '',
        '',
      ]); rowIdx++;

      if (!entries.length) {
        // col A = customer name, col B = message
        aoa.push([c.name, '(No interactions logged yet)', '', '', '', '', '']); rowIdx++;
      } else {
        // Sub-header: col A = customer name, cols B–G = column labels
        aoa.push([c.name, 'Type', 'Date & time', 'Invoice', 'What was said / agreed', 'Next follow-up', 'Logged by']); rowIdx++;
        for (const e of entries) {
          const fuDisp = e.followUpIso
            ? S.isoToDisp(e.followUpIso) + (e.followUpTime ? ', ' + e.followUpTime : '')
            : '—';
          // col A = customer name repeated for every log row → filterable in Excel
          aoa.push([
            c.name,
            didsLabel(e),
            e.date + (e.time ? ' ' + e.time : ''),
            e.invoice || '—',
            e.said,
            fuDisp,
            e.by,
          ]); rowIdx++;
        }
      }

      aoa.push([]); rowIdx++; // blank separator
    }

    const ws = xlsx.utils.aoa_to_sheet(aoa);

    // Bold the customer header rows
    const wsRange = xlsx.utils.decode_range(ws['!ref'] || 'A1');
    for (const r of customerRowSet) {
      for (let col = wsRange.s.c; col <= wsRange.e.c; col++) {
        const addr = xlsx.utils.encode_cell({ r, c: col });
        if (ws[addr]) ws[addr].s = { font: { bold: true } };
      }
    }

    ws['!cols'] = [
      { wch: 28 },  // A: Customer name (repeated)
      { wch: 30 },  // B: Contact / type
      { wch: 22 },  // C: Amount / date & time
      { wch: 18 },  // D: Next fu summary / invoice
      { wch: 50 },  // E: Notes / next fu header
      { wch: 22 },  // F: Invoice count / next fu
      { wch: 16 },  // G: Oldest / logged by
    ];

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Open Actions');
    xlsx.writeFile(wb, `Open follow-up actions - ${today}.xlsx`);
    flash(`Exported ${openRows.length} customer${openRows.length === 1 ? '' : 's'} to Excel`);
  };

  const printInteractions = (cust) => {
    setPrintCust(cust);
    setTimeout(() => { window.print(); }, 60);
  };

  // Step 1 of import: read the sheet as raw rows and open the column mapper.
  const handleImportFile = async (file) => {
    if (!file) return;
    try {
      const xlsx = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = xlsx.read(buf, { type: 'array', cellDates: true });
      const sheetName = wb.SheetNames.find((n) => /debtor|aged|outstand|invoice|invorder/i.test(n)) || wb.SheetNames[0];
      const aoa = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' })
        .filter((r) => Array.isArray(r) && r.some((c) => c !== '' && c != null));
      if (!aoa.length) { flash('That sheet looks empty.'); return; }
      setImportDraft({ fileName: file.name, sheetName, aoa });
    } catch (err) {
      flash('Could not read that file: ' + (err?.message || 'unknown error'));
    }
  };

  // Step 2 of import: reconcile the file against what's on record — payments
  // show up as lower amounts (partially paid) or missing invoices (fully
  // paid) — then apply everything in one atomic request the server can undo.
  const commitImport = async ({ map, hasHeader }) => {
    if (!importDraft) return;
    const { dataRows, columns } = deriveColumns(importDraft.aoa, hasHeader);
    const { nextCustomers, interactions: newInteractions, summary, rowsUsed } = reconcileImport({
      customers,
      dataRows,
      map,
      fileName: importDraft.fileName,
      todayIso: S.TODAY_ISO,
    });
    if (!rowsUsed) { flash('No rows imported — check the Customer, Amount and Invoice columns.'); return; }

    /* Tripwire: a stale or wrong file would look like a mass payment.
       One confirm before settling a big slice of the book in one go. */
    const openBefore = customers.filter((c) => !c.settled && S.owed(c) > 0).length;
    const settling = summary.settledCustomers;
    if (settling >= 10 || (settling > 2 && openBefore > 0 && settling / openBefore > 0.5)) {
      const ok = window.confirm(
        `This file would mark ${settling} of ${openBefore} owing customer${openBefore === 1 ? '' : 's'} as FULLY PAID.\n\n` +
        'Is this definitely today\'s outstanding-invoices list?\n\n' +
        'OK applies it (you can still undo afterwards). Cancel stops the import.'
      );
      if (!ok) return;
    }

    try {
      await applyImport(nextCustomers, newInteractions);
    } catch (err) {
      flash('Import failed: ' + (err?.message || 'could not save'));
      return;
    }
    setUndoInfo({ available: true, at: new Date().toISOString() });

    const nextMap = { ...map, hasHeader, colCount: columns.length };
    try { localStorage.setItem(MAP_KEY, JSON.stringify(nextMap)); } catch (_) {}
    setSavedMap(nextMap);
    setImportMeta({ file: importDraft.fileName, sheet: importDraft.sheetName, date: S.isoToDisp(S.TODAY_ISO), time: nowTime() });
    setImportDraft(null);

    const parts = [];
    if (summary.fullyPaid) parts.push(`${summary.fullyPaid} invoice${summary.fullyPaid > 1 ? 's' : ''} fully paid`);
    if (summary.partial) parts.push(`${summary.partial} partially paid`);
    if (summary.receivedValue) parts.push(`${S.fmtR(summary.receivedValue)} received`);
    if (summary.settledCustomers) parts.push(`${summary.settledCustomers} customer${summary.settledCustomers > 1 ? 's' : ''} settled`);
    if (summary.newCustomers) parts.push(`${summary.newCustomers} new customer${summary.newCustomers > 1 ? 's' : ''}`);
    if (summary.newInvoices) parts.push(`${summary.newInvoices} new invoice${summary.newInvoices > 1 ? 's' : ''} (+${S.fmtR(summary.addedValue)})`);
    if (summary.reopened) parts.push(`${summary.reopened} reopened (still owing in Sage)`);
    if (!parts.length) parts.push('no changes — everything matches');
    flash('Import applied · ' + parts.join(' · '));
  };

  const undoLastImport = async () => {
    try {
      await undoImport();
      setUndoInfo({ available: false, at: null });
      flash('Last import undone — customers and notes restored.');
    } catch (_) {
      setUndoInfo({ available: false, at: null });
      flash('Nothing to undo — no import snapshot on file.');
    }
  };

  const drawerCust = drawerId ? custById[drawerId] : null;
  const popupCust = popupId ? custById[popupId] : null;
  const popupEntries = popupId ? (histByCust[popupId] || []).filter((a) => a.did !== 'task') : [];
  const printEntries = printCust ? (histByCust[printCust.id] || []).filter((a) => a.did !== 'task') : [];

  if (!ready) {
    return (
      <div className="tw" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--ink-2)' }}>
          <Icon name="sync" size={36} className="spin" />
          <p style={{ marginTop: 12, fontWeight: 600 }}>Loading follow-ups…</p>
        </div>
      </div>);
  }

  return (
    <>
      <div className="tw">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 22px', background: 'var(--surface)', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
          <Brand />
          {workspaceSwitch}
          <button className="tw-btn tw-icbtn" title="Customer settings" onClick={() => setShowSettings(true)}><FI.gear /></button>
        </div>

        <div style={{ padding: '16px 22px 0', flexShrink: 0 }}>
          <h1 className="tw-h1">Customer follow-ups</h1>
          <div className="tw-sub">Chase outstanding payments · one task per customer</div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '14px 22px 22px' }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; handleImportFile(f); }} />
          <ImportBand meta={importMeta} count={owingCount} total={totalOwed} invoiceCount={openInvCount} onReimport={() => fileRef.current?.click()} onUndo={undoInfo.available ? undoLastImport : null} />

          <div className="sl-tabrow">
            <div className="tw-tabs" style={{ gap: 6 }}>
              <button className={'tw-tab' + (tab === 'todo' ? ' is-active' : '')} onClick={() => setTab('todo')} style={{ borderRadius: '9px 9px 0 0', marginBottom: -1 }}>
                <FI.list />To follow up
                <span className={'tw-count' + (openTaskCount ? ' tw-count--alert' : '')}>{openTaskCount}</span>
              </button>
              <button className={'tw-tab' + (tab === 'history' ? ' is-active' : '')} onClick={() => setTab('history')} style={{ borderRadius: '9px 9px 0 0', marginBottom: -1 }}>
                <FI.history />History
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="tw-btn" onClick={exportOpenActionsReport}><FI.excel />Export report</button>
              <button className="tw-btn tw-btn--primary sl-newtask" onClick={() => setShowTask(true)}><FI.plus />New task</button>
            </div>
          </div>

          {tab === 'todo'
            ? <>
                <DayBar workDate={workDate} onSet={setWorkDate}
                  counts={{
                    overdue: rows.filter((r) => bucketOf(r) === 'overdue').length,
                    today: rows.filter((r) => bucketOf(r) === 'today' || bucketOf(r) === 'first').length,
                    upcoming: rows.filter((r) => bucketOf(r) === 'upcoming').length,
                  }} />
                <ActionList rows={rows} onOpen={setDrawerId} />
              </>
            : <>
                <div className="sl-histbar">
                  <div className="tw-search" style={{ maxWidth: 400 }}>
                    <FI.search />
                    <input placeholder="Search history — customer, note, invoice…" value={histQuery} onChange={(e) => setHistQuery(e.target.value)} />
                    {histQuery && <button className="sl-clear" title="Clear" onClick={() => setHistQuery('')}><FI.x /></button>}
                  </div>
                </div>
                <HistoryGroups groups={filteredGroups} query={histQuery} onOpen={setPopupId} />
              </>}
        </div>

        <CustomerDrawer customer={drawerCust} history={drawerId ? (histByCust[drawerId] || []) : []} onClose={() => setDrawerId(null)} onSave={saveLog} onDelete={deleteTask} templates={templates} />
        <TaskModal open={showTask} customers={customers} onClose={() => setShowTask(false)} onSave={saveTask} />
        <SettingsModal open={showSettings} customers={customers} onClose={() => setShowSettings(false)}
          onSaveCustomer={saveCustomerDetails} onAddCustomer={addCustomerFromSettings} />
        <InteractionsPopup customer={popupCust} entries={popupEntries} onClose={() => setPopupId(null)}
          onPrint={printInteractions} onExport={exportCsv} onLog={(id) => { setPopupId(null); setDrawerId(id); }} />
        {importDraft && <ImportMapModal draft={importDraft} savedMap={savedMap} onCancel={() => setImportDraft(null)} onConfirm={commitImport} />}
        <div className={'sl-toast' + (toast ? ' show' : '')}><FI.check />{toast}</div>
      </div>
      <PrintDoc customer={printCust} entries={printEntries} />
    </>);
}
