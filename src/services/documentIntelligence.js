import { parseJobCardText } from './jobCardParser';

const API_VERSION = '2024-11-30';
const MODEL_ID = 'prebuilt-layout';
const MODEL_FEATURES = ['keyValuePairs'];
const MAX_POLL_ATTEMPTS = 25;
const POLL_INTERVAL_MS = 1200;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeEndpoint(endpoint) {
  return (endpoint || '').trim().replace(/\/$/, '');
}

function normalizePolygon(polygon) {
  if (!Array.isArray(polygon)) return [];
  const points = [];
  for (let i = 0; i < polygon.length; i += 2) {
    points.push({ x: polygon[i], y: polygon[i + 1] });
  }
  return points;
}

function normalizeAnalyzeResult(analyzeResult) {
  const pages = Array.isArray(analyzeResult?.pages) ? analyzeResult.pages : [];
  const sourcePairs = Array.isArray(analyzeResult?.keyValuePairs)
    ? analyzeResult.keyValuePairs
    : [];

  const lines = [];
  const words = [];

  pages.forEach((page) => {
    const pageNumber = page?.pageNumber ?? null;

    (page?.lines || []).forEach((line, lineIndex) => {
      lines.push({
        id: `p${pageNumber}-l${lineIndex + 1}`,
        pageNumber,
        content: line?.content || '',
        confidence: Number.isFinite(line?.confidence) ? line.confidence : null,
        boundingPolygon: normalizePolygon(line?.polygon),
      });
    });

    (page?.words || []).forEach((word, wordIndex) => {
      words.push({
        id: `p${pageNumber}-w${wordIndex + 1}`,
        pageNumber,
        content: word?.content || '',
        confidence: Number.isFinite(word?.confidence) ? word.confidence : null,
        boundingPolygon: normalizePolygon(word?.polygon),
      });
    });
  });

  const keyValuePairs = sourcePairs.map((pair, idx) => ({
    id: `kv-${idx + 1}`,
    key: pair?.key?.content || '',
    value: pair?.value?.content || '',
    confidence: Number.isFinite(pair?.confidence) ? pair.confidence : null,
  }));

  return {
    content: analyzeResult?.content || '',
    lines,
    words,
    keyValuePairs,
    averageWordConfidence:
      words.length > 0
        ? words.reduce((acc, w) => acc + (w.confidence ?? 0), 0) / words.length
        : null,
  };
}

function buildAnalyzeUrl(endpoint) {
  const params = new URLSearchParams({
    'api-version': API_VERSION,
    features: MODEL_FEATURES.join(','),
  });
  return `${normalizeEndpoint(endpoint)}/documentintelligence/documentModels/${MODEL_ID}:analyze?${params.toString()}`;
}

async function extractError(res) {
  try {
    const body = await res.json();
    return body?.error?.message || body?.message || `Request failed (${res.status})`;
  } catch (_) {
    return `Request failed (${res.status})`;
  }
}

async function pollAnalyzeResult(operationLocation, apiKey) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const pollResponse = await fetch(operationLocation, {
      method: 'GET',
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
      },
    });

    if (!pollResponse.ok) {
      throw new Error(await extractError(pollResponse));
    }

    const payload = await pollResponse.json();
    const status = (payload?.status || '').toLowerCase();

    if (status === 'succeeded') {
      return payload?.analyzeResult || payload;
    }

    if (status === 'failed' || status === 'canceled') {
      const reason = payload?.error?.message || 'Azure Read operation failed.';
      throw new Error(reason);
    }

    await wait(POLL_INTERVAL_MS);
  }

  throw new Error('Timed out waiting for Azure Document Intelligence response.');
}

export async function analyzeJobCardImage({ endpoint, apiKey, file, fieldConfig }) {
  if (!endpoint || !apiKey) {
    throw new Error('Azure endpoint and API key are required.');
  }
  if (!file) {
    throw new Error('Please choose an image file before running OCR.');
  }

  const analyzeUrl = buildAnalyzeUrl(endpoint);

  const startResponse = await fetch(analyzeUrl, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!startResponse.ok && startResponse.status !== 202) {
    throw new Error(await extractError(startResponse));
  }

  const operationLocation = startResponse.headers.get('operation-location');

  let analyzeResult;
  if (operationLocation) {
    analyzeResult = await pollAnalyzeResult(operationLocation, apiKey);
  } else {
    const payload = await startResponse.json();
    analyzeResult = payload?.analyzeResult || payload;
  }

  const normalized = normalizeAnalyzeResult(analyzeResult);
  const parsed = parseJobCardText(normalized, fieldConfig);

  return {
    apiVersion: API_VERSION,
    modelId: MODEL_ID,
    extractedAt: new Date().toISOString(),
    ...normalized,
    parsed,
  };
}
