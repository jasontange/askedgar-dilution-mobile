export type OfferingAbilityPart = {text: string; tone?: 'green' | 'orange' | 'red'; bold?: boolean};

// Keep the provider's wording intact and highlight only recognized capacity values.
export function offeringAbilityParts(description: string): OfferingAbilityPart[] {
  const pattern = /\b(Shelf\s+Capacity\s*:\s*|ATM\s+Capacity\s*:\s*|Equity\s+Line\s+Capacity\s*:\s*)(\$?\s*(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?:[ \t]*(billion|million|thousand|[BKM])\b)?)|\bPending\s+S[-‑– ]?1\b/gi;
  const parts: OfferingAbilityPart[] = [];
  let cursor = 0;
  for (const match of description.matchAll(pattern)) {
    const start = match.index!;
    if (start > cursor) parts.push({text: description.slice(cursor, start)});
    if (match[1]) {
      const unit = match[4]?.toLowerCase();
      const multiplier = unit === 'b' || unit === 'billion' ? 1e9 : unit === 'm' || unit === 'million' ? 1e6 : unit === 'k' || unit === 'thousand' ? 1e3 : 1;
      const amount = Number(match[3].replaceAll(',', '')) * multiplier;
      parts.push({text: match[1]});
      parts.push({text: match[2], tone: amount >= 5e6 ? 'green' : amount >= 1e6 ? 'orange' : 'red'});
    } else {
      parts.push({text: match[0], tone: 'green'});
    }
    cursor = start + match[0].length;
  }
  if (cursor < description.length) parts.push({text: description.slice(cursor)});
  return parts;
}

export function offeringAbilityLines(description: string): OfferingAbilityPart[][] {
  // Split between offering types, never at the thousands separators in amounts.
  const lines = description.split(/,\s*(?=(?:No\s+|Pending\s+)?(?:Shelf\b|ATM\b|Equity\s+Line\b|S[-‑– ]?1\b))|;\s*|\r?\n+/i).map(line => line.trim()).filter(Boolean);
  return lines.map(line => offeringAbilityParts(line).flatMap(part => {
    if (part.tone) return [part];
    return part.text.split(/(\b(?:Shelf(?:\s+Capacity)?|ATM(?:\s+Capacity)?|Equity\s+Line(?:\s+Capacity)?|S[-‑– ]?1(?:\s+Offering)?)\b:?)/gi)
      .map((text, index) => index % 2 ? {text, bold: true} : {text})
      .filter(part => part.text !== '');
  }));
}
