/**
 * Caregiver prompts in the person's own language. People with dementia often
 * keep their first language longest, so a bilingual person may respond better
 * to "¿Lo escuchamos juntos?" than to English.
 */

const KNOWN: Record<string, { code: string; label: string }> = {
  english: { code: "en", label: "English" },
  spanish: { code: "es", label: "Español" },
  español: { code: "es", label: "Español" },
  indonesian: { code: "id", label: "Bahasa Indonesia" },
  "bahasa indonesia": { code: "id", label: "Bahasa Indonesia" },
  french: { code: "fr", label: "Français" },
  italian: { code: "it", label: "Italiano" },
  german: { code: "de", label: "Deutsch" },
  portuguese: { code: "pt", label: "Português" },
  tagalog: { code: "tl", label: "Tagalog" },
  filipino: { code: "fil", label: "Filipino" },
  polish: { code: "pl", label: "Polski" },
  greek: { code: "el", label: "Ελληνικά" },
  chinese: { code: "zh", label: "中文" },
  mandarin: { code: "zh", label: "中文" },
  cantonese: { code: "yue", label: "粵語" },
  japanese: { code: "ja", label: "日本語" },
  korean: { code: "ko", label: "한국어" },
  vietnamese: { code: "vi", label: "Tiếng Việt" },
  hindi: { code: "hi", label: "हिन्दी" },
  arabic: { code: "ar", label: "العربية" },
  yiddish: { code: "yi", label: "ייִדיש" },
  hebrew: { code: "he", label: "עברית" },
};

/** The first listed language that isn't English, if any. */
export function nativeLanguage(languages: string[]): string | null {
  const first = languages.map((l) => l.trim()).find((l) => l && !/^english$/i.test(l));
  return first ?? null;
}

export function langCode(name: string): string | undefined {
  return KNOWN[name.trim().toLowerCase()]?.code;
}

export function langLabel(name: string): string {
  return KNOWN[name.trim().toLowerCase()]?.label ?? name.trim();
}
