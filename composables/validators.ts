/**
 * Form validators shared across flow steps. Ported from
 * `debi-forms/composables/validators.js` and made TypeScript-strict.
 *
 * Each validator returns `true` when the value passes. The simpler signature
 * makes them composable with the step components' `validate()` method, which
 * collects message strings keyed by field name.
 */

export function validateEmail(email: string): boolean {
  if (!email) return false;
  const re =
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(String(email).toLowerCase());
}

/** Accepts DNI (7–8 digits) and CUIT/CUIL (11 digits). Allows empty. */
export function validateCuitOrDni(value: string): boolean {
  const re = /^\d{7,11}$|^$/;
  return re.test(String(value ?? ""));
}

/** Strict CUIL: 11 digits starting with 20/23/24/27/30/33/34. */
export function validateCuil(value: string): boolean {
  if (!value || value.length > 11) return false;
  return /^(20|23|24|27|30|33|34)\d{9}$/.test(String(value));
}

/** Strict DNI: exactly 8 digits. */
export function validateDni(value: string): boolean {
  return /^\d{8}$/.test(String(value ?? ""));
}

/** Phone: ≥10 digits after stripping spaces/dashes/parens. */
export function validatePhoneNumber(phone: string): boolean {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s()-]/g, "");
  return /^\d{10,}$/.test(cleaned);
}

/**
 * Validates a DD/MM/YYYY date string. Returns a `{ valid, message }` tuple
 * because we need different messages for "empty", "wrong format" and
 * "invalid calendar date".
 */
export function validateSimpleBirthDate(
  value: string,
): { valid: true } | { valid: false; message: string } {
  if (!value) return { valid: false, message: "La fecha es obligatoria" };
  const regex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;
  if (!regex.test(value)) {
    return { valid: false, message: "Formato inválido (DD/MM/AAAA)" };
  }
  const [day, month, year] = value.split("/").map(Number);
  const date = new Date(year, month - 1, day);
  const isValidDate =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  if (!isValidDate) return { valid: false, message: "Fecha inválida" };
  return { valid: true };
}

/**
 * Verifies the donor is ≥18 years old. Expects DD/MM/YYYY; returns `true`
 * also when the value is empty or unparseable so that it composes with
 * `validateSimpleBirthDate` (which owns the format error) without doubling
 * the error message.
 */
export function isAdult(birthDate: string): boolean {
  if (!birthDate) return true;
  const regex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;
  if (!regex.test(birthDate)) return true;
  const [day, month, year] = birthDate.split("/").map(Number);
  const birth = new Date(year, month - 1, day);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 18;
}
