/**
 * Pure formatter/transformer helpers used by field primitives and steps.
 *
 * Convention:
 * - `format*` returns a *display* string the user sees while typing.
 * - `transform*` returns the *canonical* value that gets sent to the server.
 *
 * Both are pure functions (no Vue reactivity) so they can be unit-tested
 * and reused inside `<input :value>` / `@input` handlers without a wrapper.
 */

/**
 * Live formatter for DD/MM/YYYY birth-date inputs. Drops non-digits and
 * injects slashes at positions 2 and 4. Used as `<FieldText :formatter>`.
 */
export function formatBirthDateDisplay(value: string): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  let out = "";
  for (let i = 0; i < digits.length && i < 8; i++) {
    if (i === 2 || i === 4) out += "/";
    out += digits[i];
  }
  return out;
}

/**
 * Transformer: DD/MM/YYYY → YYYY-MM-DD (Salesforce-friendly ISO date).
 * Returns the original value when the input doesn't match, so callers can
 * defer the format error to a validator.
 */
export function transformBirthDateToISO(value: string): string {
  if (!value) return value;
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return value;
  const [, day, month, year] = m;
  return `${year}-${month}-${day}`;
}

/**
 * Parses a "1.234,5" or "1234.5" Spanish-AR style amount string into a
 * canonical Number suitable for `Salesforce.Amount`. Returns `NaN` on
 * unparseable input (callers should guard with `Number.isFinite`).
 */
export function parseAmountEsAR(value: string): number {
  const cleaned = String(value ?? "").replace(/[^\d.,-]/g, "");
  const normalized = cleaned.replaceAll(".", "").replace(",", ".");
  return Number(normalized);
}

/**
 * Formats a Number as "1.234,50" with 0–2 decimal digits. Used to render
 * pre-loaded amounts in inputs the user can still edit.
 */
export function formatAmountEsAR(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Formats a Number as "$1.234" for read-only labels (e.g., button presets).
 */
export function formatMoneyEsAR(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}
