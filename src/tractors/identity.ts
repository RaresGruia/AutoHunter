import { normalizeText } from '../analysis/text.js';
const brands = ['UTB', 'John Deere', 'New Holland', 'Case IH', 'Massey Ferguson', 'Deutz-Fahr', 'Fendt', 'Claas', 'Zetor', 'Kubota', 'Iseki', 'Yanmar', 'Landini', 'Same', 'Fiat', 'Ford', 'Belarus', 'Lamborghini Trattori'];
const aliases: Record<string, string> = { universal: 'UTB', deutz: 'Deutz-Fahr', 'case ih': 'Case IH', 'lamborghini trattori': 'Lamborghini Trattori' };
export function tractorIdentity(input: { title: string; make?: string | null; model?: string | null }): { make: string | null; model: string | null; identityConfidence: number } {
  const canonical = (value: string) => brands.find(brand => normalizeText(brand) === normalizeText(value)) ?? aliases[normalizeText(value)] ?? null;
  const text = normalizeText(input.title);
  const detected = [...new Set([...brands, ...Object.keys(aliases)].filter(brand => new RegExp(`\\b${normalizeText(brand)}\\b`).test(text)).map(canonical).filter(Boolean))];
  if (/\bu\s*[- ]?(650|445)\b/.test(text)) detected.push('UTB');
  const explicit = input.make ? canonical(input.make) : null;
  const unique = [...new Set([...detected, ...(explicit ? [explicit] : [])])];
  if (unique.length !== 1) return { make: null, model: null, identityConfidence: unique.length > 1 ? 15 : 0 };
  const make = unique[0]!;
  let model = input.model?.trim() || null;
  if (make === 'UTB') {
    const variants = [...new Set(text.match(/\b(?:u\s*[- ]?)?(650|445)\b/g)?.map(v => v.replace(/\D/g, '')) ?? [])];
    if (variants.length > 1) return { make, model: null, identityConfidence: 30 };
    if (model) model = model.replace(/^u\s*[- ]?/i, '');
    if (model && variants[0] && model !== variants[0]) return { make, model: null, identityConfidence: 30 };
    model ??= variants[0] ?? null;
  } else if (!model) {
    const after = text.match(new RegExp(`\\b${normalizeText(make)}\\s+([a-z]*\\d{2,4}[a-z]*)\\b`));
    const candidate = after?.[1];
    if (candidate && !/^(?:19|20)\d{2}$/.test(candidate)) model = candidate.toUpperCase();
  }
  return { make, model, identityConfidence: model ? explicit && input.model ? 95 : 80 : 40 };
}
