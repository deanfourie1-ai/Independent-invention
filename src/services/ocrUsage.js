/* Tracks how many OCR pages have been analyzed this calendar month, so the
   dashboard can show usage against the Azure Document Intelligence free (F0)
   tier allowance of 500 pages/month. Stored in browser localStorage — the
   same place the Azure endpoint/key live. */

const USAGE_KEY = 'tidewell.ocr.usage.v1';
const CHANGED_EVENT = 'tidewell:ocrusage:changed';

export const FREE_TIER_PAGES = 500;
export const WARN_AT_PAGES = 450;

const currentMonth = () => new Date().toISOString().slice(0, 7);

export function getOcrUsage() {
  try {
    const raw = JSON.parse(localStorage.getItem(USAGE_KEY));
    if (raw && raw.month === currentMonth() && Number.isFinite(raw.pages)) return raw;
  } catch (_) { /* fall through */ }
  return { month: currentMonth(), pages: 0 };
}

export function recordOcrPages(pages) {
  try {
    const usage = getOcrUsage();
    usage.pages += Math.max(1, Number(pages) || 1);
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
    return usage;
  } catch (_) {
    return getOcrUsage();
  }
}

export function subscribeOcrUsage(listener) {
  window.addEventListener(CHANGED_EVENT, listener);
  return () => window.removeEventListener(CHANGED_EVENT, listener);
}
