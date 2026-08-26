/**
 * mNotify's SMS API expects the local Ghana format ("0XXXXXXXXX", 10 digits)
 * for every recipient number - confirmed against the current API docs
 * (every example in https://developer.bms.africa uses this form, e.g.
 * "0241234567"), not international "+233..."/"233...". Phone fields
 * throughout this app (PharmacyPatient.phone, HotelGuest.phone, etc.) are
 * free text with zero format validation, so anything reaching mNotify has
 * to be normalized here first rather than trusted as-is.
 */
export function normalizeGhanaPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return digits;
  if (digits.length === 12 && digits.startsWith("233")) return `0${digits.slice(3)}`;
  if (digits.length === 9 && !digits.startsWith("0")) return `0${digits}`;
  return null;
}
