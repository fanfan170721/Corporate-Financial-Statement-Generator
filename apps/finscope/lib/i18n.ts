import { frEntry } from './locales/fr-entry';
import { frResearch } from './locales/fr-research';
import { frPlanning } from './locales/fr-planning';
import { frCommon } from './locales/fr-common';

export type Locale = 'en-CA' | 'fr-CA';
export const LOCALE_COOKIE = 'finscope-locale';
export type TranslationValues = Record<string, string | number | null | undefined>;
export const frenchMessages: Record<string, string> = { ...frCommon, ...frPlanning, ...frResearch, ...frEntry };
export function validLocale(value: unknown): value is Locale { return value === 'en-CA' || value === 'fr-CA'; }
export function resolveLocale(value: unknown, fallback: unknown = 'en-CA'): Locale { return validLocale(value) ? value : validLocale(fallback) ? fallback : 'en-CA'; }
const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const numericPlaceholders=new Set(['count','remaining','limit','percent','present','expected','periods','years','year']);
const templates = Object.entries(frenchMessages).filter(([key]) => /\{\w+\}/.test(key)).map(([key, value]) => {
  const names: string[] = [];
  const pattern = key.split(/(\{\w+\})/).map(part => {
    if(!/^\{\w+\}$/.test(part))return escapePattern(part);
    const name=part.slice(1,-1);names.push(name);
    return numericPlaceholders.has(name)?'([\\d.,\\s\\u00a0\\u202f−-]+)':'(.+?)';
  }).join('');
  return { pattern: new RegExp(`^${pattern}$`), names, value };
});
const interpolate = (text: string, values: TranslationValues) => text.replace(/\{(\w+)\}/g, (match, key: string) => Object.hasOwn(values,key) ? String(values[key] ?? '') : match);

/** Curated UI messages only; user notes, company identities and filing quotations stay intact. */
export function tr(locale: Locale, source: string, values: TranslationValues = {}): string {
  if (locale !== 'fr-CA') return interpolate(source, values);
  if (Object.hasOwn(frenchMessages, source)) return interpolate(frenchMessages[source], values);
  const trimmed = source.trim();
  if (trimmed !== source && Object.hasOwn(frenchMessages, trimmed)) return source.slice(0,source.indexOf(trimmed)) + interpolate(frenchMessages[trimmed], values) + source.slice(source.indexOf(trimmed)+trimmed.length);
  // Saved, deterministic summaries can contain values rendered by an older version.
  // Match complete known templates, never perform substring replacement in evidence.
  for (const template of templates) {
    const match = template.pattern.exec(trimmed);
    if (match) return interpolate(template.value, { ...Object.fromEntries(template.names.map((key,index)=>[key,match[index+1]])), ...values });
  }
  return interpolate(source, values);
}
