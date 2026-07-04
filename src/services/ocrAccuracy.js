/**
 * OCR accuracy feedback loop (FUTURE_IMPROVEMENTS §9, Step 1).
 *
 * buildOcrSnapshot()       — freezes the raw OCR-parsed field values (pre-edit)
 *                            so they can be stored on the job as ocrImport.snapshot.
 * buildOcrAccuracyReport() — read-only aggregation comparing each stored snapshot
 *                            against the job's *current* values, so corrections made
 *                            later in the capture flow count without extra hooks.
 */

import { matchTechnicians } from './techMatcher';

/* Values written by the import path when OCR found nothing — they are
   placeholders, not admin data, so treat them as empty when comparing. */
const PLACEHOLDER_FINALS = new Set([
  'ocr imported customer',
  'address pending admin capture',
  'address pending manual capture',
  '—',
  '-',
]);

/* Maps each OCR field key to where its final value lives on the job record
   and how the two sides should be compared. */
export const OCR_ACCURACY_FIELDS = {
  date: { label: 'Date', kind: 'date', getFinal: (job) => job.date },
  invoiceNumber: { label: 'Invoice number', kind: 'text', getFinal: (job) => job.invoiceNumber },
  jobAssignedTo: { label: 'Job assigned to', kind: 'tech', getFinal: (job) => job.jobAssignedTo },
  customerName: { label: 'Name', kind: 'text', getFinal: (job) => job.customer?.name },
  customerAddress: { label: 'Address', kind: 'text', getFinal: (job) => job.customer?.address },
  workDescription: { label: 'Work description', kind: 'text', getFinal: (job) => job.jobDone },
  materialsUsed: { label: 'Material cost', kind: 'money', getFinal: (job) => job.charges?.materialCost },
  callOutFee: { label: 'Call-out fee', kind: 'money', getFinal: (job) => job.charges?.callOutFee },
  labour: { label: 'Labour', kind: 'money', getFinal: (job) => job.charges?.labour },
  materialsOther: { label: 'Other costs', kind: 'money', getFinal: (job) => job.charges?.materialsOther },
  total: { label: 'Total', kind: 'money', getFinal: (job) => job.charges?.total },
};

export function buildOcrSnapshot(parsedFields) {
  if (!parsedFields || typeof parsedFields !== 'object') return null;
  const snapshot = {};
  for (const [key, field] of Object.entries(parsedFields)) {
    snapshot[key] = {
      value: String(field?.value ?? ''),
      confidence: Number.isFinite(field?.confidence) ? field.confidence : null,
    };
  }
  return snapshot;
}

function normText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function foldText(value) {
  return normText(value).toLowerCase();
}

/* "R 1,250.00" / "1250" / "1 250,00" → 1250 (or null if not numeric). */
function normMoney(value) {
  const cleaned = String(value ?? '').replace(/[^\d.,-]/g, '').replace(/,/g, '');
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/* dd/mm/yyyy (or dd-mm-yy etc.) and ISO both → yyyy-mm-dd; '' if unreadable.
   Mirrors normalizeDate in OcrExtractionPanel so an OCR value the import
   normalised correctly is not counted as a correction. */
function normDate(value) {
  const trimmed = normText(value);
  const dmy = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const dd = dmy[1].padStart(2, '0');
    const mm = dmy[2].padStart(2, '0');
    const yy = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${yy}-${mm}-${dd}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return '';
}

/**
 * Classifies one field on one job:
 *   'accepted'  — OCR value survived to the final record unchanged
 *   'corrected' — OCR found a value but the admin changed (or cleared) it
 *   'missed'    — OCR found nothing but the final record has a value
 *   null        — no signal (empty on both sides), excluded from the sample
 */
export function classifyField(kind, ocrRaw, finalRaw, technicians = []) {
  const ocr = normText(ocrRaw);
  let fin = normText(finalRaw);
  if (PLACEHOLDER_FINALS.has(fin.toLowerCase())) fin = '';

  if (!ocr && !fin) return null;
  if (!ocr) return 'missed';
  if (!fin) return 'corrected';

  if (kind === 'money') {
    const a = normMoney(ocr);
    const b = normMoney(fin);
    if (a !== null && b !== null) return a === b ? 'accepted' : 'corrected';
  }

  if (kind === 'date') {
    const a = normDate(ocr);
    const b = normDate(fin);
    if (a && b) return a === b ? 'accepted' : 'corrected';
  }

  if (kind === 'tech') {
    if (foldText(ocr) === foldText(fin)) return 'accepted';
    // The import path canonicalises names via the tech matcher; if the raw OCR
    // reading resolves to the same technician(s), OCR read the card correctly.
    const canonical = matchTechnicians(ocr, technicians);
    if (canonical && foldText(canonical) === foldText(fin)) return 'accepted';
    return 'corrected';
  }

  return foldText(ocr) === foldText(fin) ? 'accepted' : 'corrected';
}

/**
 * Aggregates accuracy across all jobs carrying an ocrImport.snapshot.
 * Returns { jobCount, since, rows: [{ key, label, sampled, accepted,
 * corrected, missed, accuracy, avgConfidence }] } — accuracy is
 * accepted / sampled (null when sampled is 0).
 */
export function buildOcrAccuracyReport(jobs, { technicians = [] } = {}) {
  const snapshotJobs = (Array.isArray(jobs) ? jobs : []).filter(
    (job) => job?.ocrImport?.snapshot && typeof job.ocrImport.snapshot === 'object'
  );

  const rows = Object.entries(OCR_ACCURACY_FIELDS).map(([key, def]) => {
    let accepted = 0;
    let corrected = 0;
    let missed = 0;
    const confidences = [];

    for (const job of snapshotJobs) {
      const snap = job.ocrImport.snapshot[key];
      const outcome = classifyField(def.kind, snap?.value, def.getFinal(job), technicians);
      if (outcome === 'accepted') accepted += 1;
      else if (outcome === 'corrected') corrected += 1;
      else if (outcome === 'missed') missed += 1;
      if (outcome && Number.isFinite(snap?.confidence)) confidences.push(snap.confidence);
    }

    const sampled = accepted + corrected + missed;
    return {
      key,
      label: def.label,
      sampled,
      accepted,
      corrected,
      missed,
      accuracy: sampled ? accepted / sampled : null,
      avgConfidence: confidences.length
        ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
        : null,
    };
  });

  const dates = snapshotJobs
    .map((job) => job.ocrImport?.at)
    .filter(Boolean)
    .sort();

  return {
    jobCount: snapshotJobs.length,
    since: dates[0] || null,
    rows,
  };
}
