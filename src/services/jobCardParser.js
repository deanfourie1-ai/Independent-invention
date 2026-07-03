const FIELD_CONFIDENCE_FALLBACK = 0.5;

function normalizeText(value) {
  return (value || '').toString().trim();
}

function splitLines(text) {
  return normalizeText(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function average(nums) {
  if (!nums.length) return null;
  return nums.reduce((acc, n) => acc + n, 0) / nums.length;
}

function confidenceForValue(value, words) {
  const tokenSet = normalizeText(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);

  if (!tokenSet.length) return null;

  const matched = words
    .filter((w) => tokenSet.includes((w.content || '').toLowerCase()))
    .map((w) => w.confidence)
    .filter((c) => Number.isFinite(c));

  if (!matched.length) return FIELD_CONFIDENCE_FALLBACK;
  return average(matched);
}

function extractLabeledValue(fullText, labels) {
  for (const label of labels) {
    const pattern = new RegExp(`(?:^|\\n)\\s*${label}\\s*[:#-]?\\s*(.+)$`, 'im');
    const match = fullText.match(pattern);
    if (match?.[1]) return normalizeText(match[1]);
  }
  return '';
}

function extractWorkDescription(lines) {
  const startRx = /(work\s*(done|description|carried\s*out)|job\s*done|description\s*of\s*work\s*done|work\s*done)/i;
  const stopRx = /^(job\s*(id|ref|reference|no)|date|technician|engineer|status|materials|customer|address|phone|call\s*[-:]?|lab\s*[-:]?|mat\s*[-:]?)\b/i;

  const startIndex = lines.findIndex((line) => startRx.test(line));
  if (startIndex === -1) return '';

  const initial = lines[startIndex].replace(startRx, '').replace(/^[:\-\s]+/i, '').trim();
  const collected = initial ? [initial] : [];

  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) break;
    if (stopRx.test(line)) break;
    collected.push(line);
  }

  return normalizeText(collected.join(' '));
}

function extractMaterials(lines) {
  const startRx = /(materials?\s*used|tool\s*used|tools\s*used)/i;
  const stopRx = /^(call\s*[-:]?|lab\s*[-:]?|mat\s*[-:]?|status|completed|job\s*(id|ref|reference)|date)\b/i;

  const startIndex = lines.findIndex((line) => startRx.test(line));
  if (startIndex === -1) return '';

  const initial = lines[startIndex].replace(startRx, '').replace(/^[:\-\s]+/i, '').trim();
  const collected = initial ? [initial] : [];

  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) break;
    if (stopRx.test(line)) break;
    collected.push(line);
  }

  return normalizeText(collected.join(' '));
}

function extractSingleLineField(lines, startRx) {
  const idx = lines.findIndex((line) => startRx.test(line));
  if (idx === -1) return '';
  const same = normalizeText(lines[idx].replace(startRx, '').replace(/^[:\-\s]+/i, ''));
  if (same) return same;
  return normalizeText(lines[idx + 1] || '');
}

function extractMultiLineField(lines, startRx, stopRx) {
  const idx = lines.findIndex((line) => startRx.test(line));
  if (idx === -1) return '';

  const first = normalizeText(lines[idx].replace(startRx, '').replace(/^[:\-\s]+/i, ''));
  const collected = first ? [first] : [];

  for (let i = idx + 1; i < lines.length; i += 1) {
    const line = normalizeText(lines[i]);
    if (!line) continue;
    if (stopRx.test(line)) break;
    collected.push(line);
    if (collected.length >= 3) break;
  }

  return normalizeText(collected.join(' '));
}

function extractByPattern(fullText, patterns) {
  for (const rx of patterns) {
    const match = fullText.match(rx);
    if (match?.[1]) return normalizeText(match[1]);
    if (match?.[0]) return normalizeText(match[0]);
  }
  return '';
}

function extractChargeValue(text, patterns) {
  const source = normalizeText(text);
  for (const rx of patterns) {
    const match = source.match(rx);
    if (!match) continue;
    const value = normalizeText(match[1] || match[0]);
    if (value) return value;
  }
  return '';
}

function toRegex(matcher) {
  if (matcher instanceof RegExp) return matcher;
  const source = String(matcher || '').trim();
  if (!source) return null;
  try {
    return new RegExp(source, 'i');
  } catch (_) {
    return null;
  }
}

function extractFromKeyValuePairs(pairs, keyMatchers) {
  if (!Array.isArray(pairs) || pairs.length === 0) return { value: '', confidence: null };

  const matchers = (Array.isArray(keyMatchers) ? keyMatchers : [])
    .map(toRegex)
    .filter(Boolean);

  if (matchers.length === 0) return { value: '', confidence: null };

  for (const pair of pairs) {
    const key = normalizeText(pair?.key).toLowerCase();
    const value = normalizeText(pair?.value);
    if (!key || !value) continue;

    const matched = matchers.some((matcher) => matcher.test(key));
    if (matched) {
      return {
        value,
        confidence: Number.isFinite(pair?.confidence) ? pair.confidence : null,
      };
    }
  }

  return { value: '', confidence: null };
}

export function parseJobCardText(readResult, fieldConfig = {}) {
  const content = normalizeText(readResult?.content);
  const lines = splitLines(content);
  const words = Array.isArray(readResult?.words) ? readResult.words : [];
  const keyValuePairs = Array.isArray(readResult?.keyValuePairs) ? readResult.keyValuePairs : [];
  const dateLine = lines.find((line) => /\bdate\b\s*:/i.test(line)) || '';
  const completedLine = lines.find((line) => /\bcompleted\b\s*:/i.test(line)) || '';
  const completedIndex = lines.findIndex((line) => /\bcompleted\b\s*:/i.test(line));
  const completedNext = completedIndex >= 0 ? lines[completedIndex + 1] || '' : '';
  const assignedLine = lines.find((line) => /\bassigned\s*to\b\s*:/i.test(line)) || '';
  const assignedIndex = lines.findIndex((line) => /\bassigned\s*to\b\s*:/i.test(line));
  const assignedNext = assignedIndex >= 0 ? lines[assignedIndex + 1] || '' : '';

  const kvDate = extractFromKeyValuePairs(keyValuePairs, fieldConfig?.date?.keyMatchers);
  const kvInvoiceNumber = extractFromKeyValuePairs(keyValuePairs, fieldConfig?.invoiceNumber?.keyMatchers);
  const kvAssigned = extractFromKeyValuePairs(keyValuePairs, fieldConfig?.jobAssignedTo?.keyMatchers);
  const kvCustomerName = extractFromKeyValuePairs(keyValuePairs, fieldConfig?.customerName?.keyMatchers);
  const kvCustomerAddress = extractFromKeyValuePairs(keyValuePairs, fieldConfig?.customerAddress?.keyMatchers);
  const kvWork = extractFromKeyValuePairs(keyValuePairs, fieldConfig?.workDescription?.keyMatchers);
  const kvMaterials = extractFromKeyValuePairs(keyValuePairs, fieldConfig?.materialsUsed?.keyMatchers);
  const kvStatus = extractFromKeyValuePairs(keyValuePairs, fieldConfig?.status?.keyMatchers);
  const kvCallOutFee = extractFromKeyValuePairs(keyValuePairs, fieldConfig?.callOutFee?.keyMatchers);
  const kvLabour = extractFromKeyValuePairs(keyValuePairs, fieldConfig?.labour?.keyMatchers);
  const kvMaterialsOther = extractFromKeyValuePairs(keyValuePairs, fieldConfig?.materialsOther?.keyMatchers);
  const kvTotal = extractFromKeyValuePairs(keyValuePairs, fieldConfig?.total?.keyMatchers);

  const date =
    kvDate.value ||
    extractByPattern(dateLine, [
      /\b([0-3]?\d[\/\-.][01]?\d[\/\-.](?:19|20)?\d{2})\b/,
      /\b((?:19|20)\d{2}-[01]\d-[0-3]\d)\b/,
    ]) ||
    extractLabeledValue(content, ['job\\s*date', 'date']) ||
    extractByPattern(content, [
      /\b([0-3]?\d[\/\-.][01]?\d[\/\-.](?:19|20)?\d{2})\b/,
      /\b((?:19|20)\d{2}-[01]\d-[0-3]\d)\b/,
    ]);

  const invoiceNumber =
    kvInvoiceNumber.value ||
    extractLabeledValue(content, ['invoice\\s*(no\\.?|number|#)?', 'inv\\s*no', 'tax\\s*invoice']);

  const jobAssignedTo =
    kvAssigned.value ||
    extractSingleLineField(lines, /^job\s*assigned\s*to\s*[:\-]?/i) ||
    normalizeText(assignedLine.replace(/^.*?assigned\s*to\s*[:\-]?\s*/i, '')) ||
    normalizeText(assignedNext) ||
    extractLabeledValue(content, ['technician', 'engineer', 'tech']) ||
    extractByPattern(content, [/\b(?:technician|engineer|tech)\s*[:#-]?\s*([A-Za-z][A-Za-z' -]{2,})\b/i]);

  const customerName =
    kvCustomerName.value ||
    extractSingleLineField(lines, /^name\s*[:\-]?/i) ||
    extractLabeledValue(content, ['name']);

  const customerAddress =
    kvCustomerAddress.value ||
    extractMultiLineField(
      lines,
      /^address\s*[:\-]?/i,
      /^(contact\s*person|tel\s*number|email\s*address|description\s*of\s*work\s*done|work\s*done)\b/i
    ) ||
    extractLabeledValue(content, ['address']);

  const workDescription = kvWork.value || extractWorkDescription(lines);
  const materialsUsed = kvMaterials.value || extractMaterials(lines);

  const callOutFee =
    kvCallOutFee.value ||
    extractChargeValue(content, [
      /\bcall\s*[-_\s]*out\s*(?:fee)?\s*[:\-]?\s*([0-9][0-9.,]*)\b/i,
      /\bcall\s*[:\-]?\s*([0-9][0-9.,]*)\b/i,
    ]);

  const labour =
    kvLabour.value ||
    extractChargeValue(content, [
      /\blabou?r\s*[:\-]?\s*([0-9][0-9.,xX*\s]*)\b/i,
      /\blab\s*[:\-]?\s*([0-9][0-9.,xX*\s]*)\b/i,
    ]);

  const materialsOther =
    kvMaterialsOther.value ||
    extractChargeValue(content, [
      /\bmaterials?\s*\/\s*other\s*[:\-]?\s*([0-9][0-9.,]*)\b/i,
      /\bother\s*costs?\s*[:\-]?\s*([0-9][0-9.,]*)\b/i,
      // Handwritten "Mat - 150.00"; Azure often misreads it as "Mout"/"Maut".
      /\bm[ao]u?t\.?\s*[:\-]?\s*([0-9][0-9.,]*)\b/i,
    ]);

  const total =
    kvTotal.value ||
    extractChargeValue(content, [
      /\btotal\s*[:\-]?\s*([0-9][0-9.,]*)\b/i,
      /\bamount\s*due\s*[:\-]?\s*([0-9][0-9.,]*)\b/i,
    ]);

  const completedMarker = `${completedLine} ${completedNext}`.toUpperCase();
  const completedNo = /\bN\b/.test(completedMarker) || /\bNO\b/.test(completedMarker);
  const completedYes = /\bY\b/.test(completedMarker) || /\bYES\b/.test(completedMarker);

  const status =
    kvStatus.value ||
    (completedYes && 'finished') ||
    (completedNo && 'draft') ||
    extractLabeledValue(content, ['status']) ||
    extractByPattern(content, [/\b(draft|finished|synced|sync failed|printed|open|closed)\b/i]);

  const fields = {
    date: {
      value: date,
      confidence: kvDate.confidence ?? confidenceForValue(date, words),
      found: Boolean(date),
    },
    invoiceNumber: {
      value: invoiceNumber,
      confidence: kvInvoiceNumber.confidence ?? confidenceForValue(invoiceNumber, words),
      found: Boolean(invoiceNumber),
    },
    jobAssignedTo: {
      value: jobAssignedTo,
      confidence: kvAssigned.confidence ?? confidenceForValue(jobAssignedTo, words),
      found: Boolean(jobAssignedTo),
    },
    customerName: {
      value: customerName,
      confidence: kvCustomerName.confidence ?? confidenceForValue(customerName, words),
      found: Boolean(customerName),
    },
    customerAddress: {
      value: customerAddress,
      confidence: kvCustomerAddress.confidence ?? confidenceForValue(customerAddress, words),
      found: Boolean(customerAddress),
    },
    workDescription: {
      value: workDescription,
      confidence: kvWork.confidence ?? confidenceForValue(workDescription, words),
      found: Boolean(workDescription),
    },
    materialsUsed: {
      value: materialsUsed,
      confidence: kvMaterials.confidence ?? confidenceForValue(materialsUsed, words),
      found: Boolean(materialsUsed),
    },
    callOutFee: {
      value: callOutFee,
      confidence: kvCallOutFee.confidence ?? confidenceForValue(callOutFee, words),
      found: Boolean(callOutFee),
    },
    labour: {
      value: labour,
      confidence: kvLabour.confidence ?? confidenceForValue(labour, words),
      found: Boolean(labour),
    },
    materialsOther: {
      value: materialsOther,
      confidence: kvMaterialsOther.confidence ?? confidenceForValue(materialsOther, words),
      found: Boolean(materialsOther),
    },
    total: {
      value: total,
      confidence: kvTotal.confidence ?? confidenceForValue(total, words),
      found: Boolean(total),
    },
  };

  return {
    content,
    lines,
    fields,
  };
}
