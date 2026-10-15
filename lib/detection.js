const crypto = require('crypto');
const { diffWordsWithSpace } = require('diff');
function normalize(text, noise = true) {
  let s = text.normalize('NFKC').replace(/\r/g, '');
  if (noise) s = s
    .replace(/\b\d{4}-\d\d-\d\d(?:[T ][\d:.]+Z?)?\b/g, '[date]')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?\b/gi, '[time]')
    .replace(/\b\d+\s*(seconds?|minutes?)\s+ago\b/gi, '[relative time]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '[token]')
    .replace(/\b[0-9a-f]{24,}\b/gi, '[token]')
    .replace(/\b\d[\d,]*\s+(views|visitors|online|likes)\b/gi, '[counter] $1');
  return s.split('\n').map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean).join('\n');
}
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
function compare(before, after) {
  const parts = diffWordsWithSpace(before, after);
  const changed = parts.filter(p=>p.added||p.removed).reduce((n,p)=>n+p.value.length,0);
  const pct = Math.min(100, 100*changed/Math.max(1, before.length+after.length));
  const added = parts.filter(p=>p.added).map(p=>p.value.trim()).filter(Boolean).join(' ');
  const removed = parts.filter(p=>p.removed).map(p=>p.value.trim()).filter(Boolean).join(' ');
  return {parts, pct, summary: (added ? `Added: ${added.slice(0,160)}` : '') + (added && removed ? ' · ' : '') + (removed ? `Removed: ${removed.slice(0,160)}` : '') || 'Page content changed.'};
}

/**
 * Generate a concise AI-style one-line change summary from a diff.
 * Uses heuristic NLP patterns to produce human-readable descriptions.
 */
function smartSummary(before, after, rawSummary) {
  if (!before || !after) return rawSummary || 'Initial baseline captured.';
  const parts = diffWordsWithSpace(before, after);
  const addedParts = parts.filter(p => p.added).map(p => p.value.trim()).filter(Boolean);
  const removedParts = parts.filter(p => p.removed).map(p => p.value.trim()).filter(Boolean);

  // Detect price changes
  const priceRegex = /[\$€£¥₹]\s*[\d,]+(?:\.\d{1,2})?|\d[\d,]*(?:\.\d{1,2})?\s*(?:USD|EUR|GBP)/gi;
  const oldPrices = before.match(priceRegex) || [];
  const newPrices = after.match(priceRegex) || [];
  if (oldPrices.length && newPrices.length && oldPrices[0] !== newPrices[0]) {
    return `Price changed from ${oldPrices[0]} to ${newPrices[0]}.`;
  }

  // Detect version/release changes
  const versionRegex = /v?\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?/g;
  const oldVersions = before.match(versionRegex) || [];
  const newVersions = after.match(versionRegex) || [];
  const newVers = newVersions.filter(v => !oldVersions.includes(v));
  if (newVers.length) {
    return `New version detected: ${newVers[0]}.`;
  }

  // Detect availability/status changes
  const statusWords = /\b(available|unavailable|sold out|in stock|out of stock|coming soon|discontinued|released|launched|deprecated|removed|added|updated|changed|new)\b/gi;
  const addedText = addedParts.join(' ');
  const statusMatches = addedText.match(statusWords);
  if (statusMatches && statusMatches.length) {
    const keyword = statusMatches[0].toLowerCase();
    const context = addedText.slice(0, 80).replace(/\s+/g, ' ');
    return `Status update: "${context.trim()}".`;
  }

  // Detect new sections/content additions
  if (addedParts.length && !removedParts.length) {
    const snippet = addedParts.join(' ').slice(0, 70).replace(/\s+/g, ' ').trim();
    return `New content added: "${snippet}".`;
  }

  // Detect content removals
  if (!addedParts.length && removedParts.length) {
    const snippet = removedParts.join(' ').slice(0, 70).replace(/\s+/g, ' ').trim();
    return `Content removed: "${snippet}".`;
  }

  // Detect text replacements
  if (addedParts.length && removedParts.length) {
    const oldSnippet = removedParts.join(' ').slice(0, 40).replace(/\s+/g, ' ').trim();
    const newSnippet = addedParts.join(' ').slice(0, 40).replace(/\s+/g, ' ').trim();
    return `Text changed: "${oldSnippet}" → "${newSnippet}".`;
  }

  return rawSummary || 'Page content changed.';
}

/**
 * Extract trackable numbers from text content.
 * Returns an array of {label, value} objects for number tracking charts.
 */
function extractNumbers(text) {
  const numbers = [];
  const lines = text.split('\n');

  for (const line of lines) {
    // Match price patterns: $29.99, €15, £100
    const priceMatches = line.matchAll(/([\w\s]{1,30}?)\s*[:：]?\s*([\$€£¥₹]\s*[\d,]+(?:\.\d{1,2})?)/g);
    for (const m of priceMatches) {
      const label = m[1].trim() || 'Price';
      const value = parseFloat(m[2].replace(/[^\d.]/g, ''));
      if (!isNaN(value)) numbers.push({ label: label.slice(0, 50), value, type: 'price' });
    }

    // Match "label: number" patterns
    const labelNum = line.matchAll(/\b([\w\s]{2,25}?)\s*[:：]\s*([\d,]+(?:\.\d{1,2})?)\s*(%|users?|members?|items?|pages?|results?)?/gi);
    for (const m of labelNum) {
      const label = m[1].trim();
      const value = parseFloat(m[2].replace(/,/g, ''));
      const unit = m[3] || '';
      if (!isNaN(value) && label.length > 1) numbers.push({ label: `${label}${unit ? ' (' + unit + ')' : ''}`.slice(0, 50), value, type: 'metric' });
    }

    // Match standalone large numbers with context
    const standalone = line.matchAll(/\b([\w\s]{2,20}?)\s+([\d,]{2,}(?:\.\d{1,2})?)\b/g);
    for (const m of standalone) {
      const label = m[1].trim();
      const value = parseFloat(m[2].replace(/,/g, ''));
      if (!isNaN(value) && value >= 1 && label.length > 2 && !/date|time|year|token|id/i.test(label)) {
        numbers.push({ label: label.slice(0, 50), value, type: 'number' });
      }
    }
  }

  // Deduplicate by label, keep last occurrence
  const seen = new Map();
  for (const n of numbers) seen.set(n.label, n);
  return [...seen.values()].slice(0, 20);
}

module.exports = {normalize, hash, compare, smartSummary, extractNumbers};
