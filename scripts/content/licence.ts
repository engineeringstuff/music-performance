const FORBIDDEN =
  /\b(?:nc|nd|sa)\b|non[\s-]?commercial|no[\s-]?deriv(?:s|atives?)?|share[\s-]?alike/i;

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
}

export function isAllowedLicence(value: string): boolean {
  const normalized = normalize(value);
  if (normalized === "" || FORBIDDEN.test(normalized)) {
    return false;
  }
  return (
    /^public domain\b/.test(normalized) || /^cc0\b/.test(normalized) || /^cc by\b/.test(normalized)
  );
}

export function isAllowedAudioLicence(value: string): boolean {
  const normalized = normalize(value);
  return /^public domain\b/.test(normalized) || /^cc0\b/.test(normalized);
}

export function licencePolicyMessage(): string {
  return "Phase 1 allows public domain, CC0 or CC BY compositions; rendered audio must be public domain or CC0.";
}
