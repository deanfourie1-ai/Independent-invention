const OCR_FIELD_CONFIG_KEY = 'tidewell.ocr.fieldConfig';

export const DEFAULT_OCR_FIELD_CONFIG = {
  date: {
    label: 'Date',
    keyMatchers: [
      '^date$',
      'job\\s*date',
      'date\\s*/\\s*year',
    ],
    minConfidence: 0.5,
  },
  invoiceNumber: {
    label: 'Invoice number',
    keyMatchers: [
      'invoice\\s*(no\\.?|number|#)?',
      '^inv\\b',
      'inv\\s*no',
      'tax\\s*invoice',
    ],
    minConfidence: 0.5,
  },
  jobAssignedTo: {
    label: 'Job Assigned To',
    keyMatchers: [
      'job\\s*assigned\\s*to',
      'assigned\\s*to',
      'technician',
      'engineer',
      '^tech$',
      'job\\s*assi',
    ],
    minConfidence: 0.5,
  },
  customerName: {
    label: 'Name',
    keyMatchers: [
      '^name$',
      'client\\s*name',
      'customer\\s*name',
    ],
    minConfidence: 0.5,
  },
  customerAddress: {
    label: 'Address',
    keyMatchers: [
      '^address$',
      'customer\\s*address',
      'site\\s*address',
    ],
    minConfidence: 0.5,
  },
  workDescription: {
    label: 'Work Description',
    keyMatchers: [
      'description\\s*of\\s*work\\s*done',
      'work\\s*done',
      '^description$',
      'iption\\s*of\\s*work\\s*done',
      'desc',
    ],
    minConfidence: 0.5,
  },
  materialsUsed: {
    label: 'Materials Used',
    keyMatchers: [
      'materials?\\s*used',
      '^material$',
      'tools?\\s*used',
      'tool\\s*used',
      '^mat',
    ],
    minConfidence: 0.5,
  },
  callOutFee: {
    label: 'Call-Out Fee',
    keyMatchers: [
      'call\\s*[-_\\s]*out\\s*(fee)?',
      '^call$',
    ],
    minConfidence: 0.5,
  },
  labour: {
    label: 'Labour',
    keyMatchers: [
      'labou?r',
      '^lab$',
    ],
    minConfidence: 0.5,
  },
  materialsOther: {
    label: 'Other costs',
    keyMatchers: [
      'materials?\\s*\\/\\s*other',
      '^mat$',
      'materials?',
      'other',
    ],
    minConfidence: 0.5,
  },
  total: {
    label: 'Total',
    keyMatchers: [
      '^total$',
      'total\\s*(amount|due|cost)?',
      'grand\\s*total',
      'amount\\s*due',
    ],
    minConfidence: 0.5,
  },
};

export const BETHLEHEM_OCR_FIELD_CONFIG = {
  ...DEFAULT_OCR_FIELD_CONFIG,
};

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_OCR_FIELD_CONFIG));
}

function normalizeConfig(input) {
  const base = cloneDefaults();
  if (!input || typeof input !== 'object') return base;

  for (const key of Object.keys(base)) {
    const source = input[key] || {};
    const patterns = Array.isArray(source.keyMatchers)
      ? source.keyMatchers.map((v) => String(v || '').trim()).filter(Boolean)
      : base[key].keyMatchers;

    base[key] = {
      ...base[key],
      ...source,
      keyMatchers: patterns.length ? patterns : base[key].keyMatchers,
      minConfidence: Number.isFinite(source.minConfidence)
        ? source.minConfidence
        : base[key].minConfidence,
    };
  }

  return base;
}

export function loadOcrFieldConfig() {
  try {
    const raw = localStorage.getItem(OCR_FIELD_CONFIG_KEY);
    if (!raw) return cloneDefaults();
    return normalizeConfig(JSON.parse(raw));
  } catch (_) {
    return cloneDefaults();
  }
}

export function saveOcrFieldConfig(config) {
  const normalized = normalizeConfig(config);
  try {
    localStorage.setItem(OCR_FIELD_CONFIG_KEY, JSON.stringify(normalized));
  } catch (_) {}
  return normalized;
}

export function resetOcrFieldConfig() {
  const defaults = cloneDefaults();
  try {
    localStorage.setItem(OCR_FIELD_CONFIG_KEY, JSON.stringify(defaults));
  } catch (_) {}
  return defaults;
}

export function loadBethlehemOcrFieldConfig() {
  const preset = normalizeConfig(BETHLEHEM_OCR_FIELD_CONFIG);
  try {
    localStorage.setItem(OCR_FIELD_CONFIG_KEY, JSON.stringify(preset));
  } catch (_) {}
  return preset;
}
