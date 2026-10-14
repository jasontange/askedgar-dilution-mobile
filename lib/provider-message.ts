// The coverage notice is intentionally omitted from the UI. Keep other messages.
export function providerMessage(value:unknown):string|null {
  if(typeof value!=='string')return null;
  const message=value.replace(/Our audited data is currently only available for companies with market cap under \$1B\.?\s*(?:Affected numeric fields return null for larger companies\.?)?/gi,'').trim();
  return message||null;
}
