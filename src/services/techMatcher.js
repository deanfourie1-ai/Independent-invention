/**
 * Fuzzy-matches OCR-extracted technician name(s) against a known technicians map.
 *
 * Handles: multiple names (up to 3), initials ("SW", "S.W."), first-name-only
 * ("Sam"), last-name-only ("Whitfield"), partial abbreviations ("Sam W"),
 * and minor OCR typos via word-level prefix matching.
 *
 * Unmatched fragments are kept verbatim so no data is silently lost.
 */

function splitNames(raw) {
  return raw
    .split(/[,/&+]|\band\b/i)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function norm(s) {
  return s.toLowerCase().replace(/[.\s]+/g, ' ').trim();
}

function scorePair(fragment, tech) {
  const f      = norm(fragment);
  const full   = norm(tech.name);
  const parts  = full.split(' ');
  const first  = parts[0] || '';
  const last   = parts.slice(1).join(' ');
  const inits  = tech.initials
    ? norm(tech.initials)
    : parts.map(w => w[0]).join('');
  const normInits = inits.replace(/[\s.]/g, '');

  // Exact full name
  if (f === full) return 1.0;

  // Initials ("SW", "S W", "S.W.")
  const fInits = f.replace(/[\s.]/g, '');
  if (fInits.length >= 2 && fInits === normInits) return 0.95;

  // First + last initial ("Sam W")
  if (last && f === `${first} ${last[0]}`) return 0.9;

  // Full name contained in fragment or fragment in full name
  if (full.includes(f) || f.includes(full)) return 0.85;

  // First name only (guard length to avoid single-letter false positives)
  if (f === first && first.length > 2) return 0.8;

  // Last name only
  if (f === last && last.length > 2) return 0.8;

  // Word-level prefix overlap (catches minor typos like "Whitfieid")
  const fWords = f.split(' ').filter(w => w.length > 2);
  const nWords = full.split(' ').filter(w => w.length > 2);
  const hits = fWords.filter(fw =>
    nWords.some(nw => nw.startsWith(fw.slice(0, 4)) || fw.startsWith(nw.slice(0, 4)))
  );
  if (hits.length > 0) {
    return 0.6 + (hits.length / Math.max(fWords.length, nWords.length)) * 0.2;
  }

  return 0;
}

/** Returns the best-matching tech object, or null if no match beats the threshold. */
export function matchTechnician(fragment, techMap) {
  if (!fragment?.trim()) return null;
  let best = null;
  let bestScore = 0;
  for (const tech of Object.values(techMap)) {
    const s = scorePair(fragment, tech);
    if (s > bestScore) { bestScore = s; best = tech; }
  }
  return bestScore >= 0.65 ? best : null;
}

/**
 * Splits rawValue on common delimiters, resolves each fragment against techMap,
 * and returns a canonical comma-separated string (max 3 names).
 * Unmatched fragments are kept verbatim.
 */
export function matchTechnicians(rawValue, techMap) {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  return splitNames(raw)
    .map(fragment => {
      const m = matchTechnician(fragment, techMap);
      return m ? m.name : fragment;
    })
    .join(', ');
}
