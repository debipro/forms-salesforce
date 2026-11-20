import { Connection } from "jsforce";
import type { DebiPaymentToken } from "~/composables/useDebiClient";

/**
 * Consumer Keys of the Salesforce Connected Apps. Production and sandbox orgs
 * are served by different Connected Apps with different Consumer Keys, so the
 * runtime selects one based on `SF_LOGIN_URL`. The Consumer Key is not a
 * secret, so these values are safe to commit. Refresh tokens minted by the
 * central onboarding helper are bound to the matching client_id.
 *
 * The refresh-token flow is configured to NOT require a Consumer Secret, so
 * the runtime acts as a public client and never needs a secret distributed to
 * the customer deploy.
 */
const SF_PRODUCTION_CLIENT_ID =
  "3MVG9riCAn8HHkYWlE8jFLOna32YIJWbJVjAocus39R7jqQUZwHtITeYr2353Z2i.wp9AsDy5RiZ.LsDqWVyL";

const SF_SANDBOX_CLIENT_ID =
  "3MVG9riCAn8HHkYWlE8jFLOna30IpkiRTPvZhq4FuEXWAAZscYkV8wFd.3Hk1O6MXFMeyh6F0VvnTHPs4FLG3";

const SANDBOX_LOGIN_URL = "https://test.salesforce.com";

function isSandboxLoginUrl(loginUrl: string): boolean {
  return loginUrl.trim().toLowerCase().startsWith(SANDBOX_LOGIN_URL);
}

/** Picks the Connected App Consumer Key matching the org's login host. */
function clientIdForLoginUrl(loginUrl: string): string {
  return isSandboxLoginUrl(loginUrl)
    ? SF_SANDBOX_CLIENT_ID
    : SF_PRODUCTION_CLIENT_ID;
}


// Default field map for NPSP-style orgs. If your Salesforce instance uses
// non-standard API names for the recurring donation amount, the payment
// method lookup, etc., edit the values below directly. There is no env-var
// override on purpose: customers customize by editing this file.
type OpportunityFieldMap = {
  amount: string;
  paymentMethod: string;
  recurringLookup: string;
};

type RecurringFieldMap = {
  sobject: string;
  amount: string;
  paymentMethod: string;
};

export type SalesforceFieldMap = {
  opportunity: OpportunityFieldMap;
  recurring: RecurringFieldMap;
};

const FIELD_MAP: SalesforceFieldMap = {
  opportunity: {
    amount: "Amount",
    paymentMethod: "TCPagos__payment_method__c",
    recurringLookup: "npe03__Recurring_Donation__c",
  },
  recurring: {
    sobject: "npe03__Recurring_Donation__c",
    amount: "npe03__Amount__c",
    paymentMethod: "Metodo_de_Pago__c",
  },
};

export type FlowRecord = {
  opportunityId: string;
  opportunityName: string | null;
  opportunityContactId: string | null;
  opportunityAmount: number | null;
  opportunityPaymentMethodId: string | null;
  recurringDonationId: string | null;
  recurringAmount: number | null;
  recurringPaymentMethodId: string | null;
};

export class FlowRequestError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = "FlowRequestError";
    this.status = status;
  }
}

/**
 * Pulls the real Salesforce error message out of a jsforce `.create()` /
 * `.update()` failure result. jsforce returns `{ success: false, errors:
 * [{ statusCode, message, fields }] }` for API-level failures (e.g.,
 * `INVALID_FIELD: No such column 'Foo__c' on entity Contact`). Without
 * this helper, our generic `"No se pudo crear ..."` swallowed the
 * statusCode and made debugging painful — especially when the org the
 * env vars point to doesn't have all the custom fields the flow writes.
 */
function formatSaveFailure(
  result: { success?: boolean; errors?: unknown },
  fallback: string,
): string {
  const errors = Array.isArray(result.errors) ? result.errors : [];
  const pieces = errors
    .map((e: unknown) => {
      if (typeof e === "string") return e;
      if (e && typeof e === "object") {
        const obj = e as { statusCode?: string; message?: string };
        const code = obj.statusCode ? `${obj.statusCode}: ` : "";
        if (obj.message) return `${code}${obj.message}`;
      }
      return "";
    })
    .filter(Boolean);
  if (pieces.length === 0) return fallback;
  return `${fallback} — ${pieces.join("; ")}`;
}

/**
 * Shape of the personal data captured by `PersonalDataStep`. Optional
 * fields stay as empty strings when the step renders without them.
 */
export type AltaPersonal = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** ISO YYYY-MM-DD (already transformed). Optional in some flows. */
  birthDate?: string;
  country?: string;
  province?: string;
};

/**
 * Free-form custom fields that a flow page may want to write straight
 * onto Contact / Opportunity / Recurring Donation. Each key must be a
 * valid Salesforce API name (e.g., `Captador__c`, `Observaciones__c`).
 *
 * The runtime forwards them unchanged: this is the escape hatch for
 * flows that need org-specific fields without growing this util.
 */
export type AltaExtraFields = {
  contact?: Record<string, string | number | boolean | null>;
  opportunity?: Record<string, string | number | boolean | null>;
  recurring?: Record<string, string | number | boolean | null>;
};

function requireString(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Falta la variable de entorno obligatoria: ${label}`);
  }
  return value;
}

function escapeSoql(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function sanitizeOppId(oppId: string): string {
  if (!/^[a-zA-Z0-9]{15,18}$/.test(oppId)) {
    throw new Error("El formato del ID de Oportunidad no es válido");
  }
  return oppId;
}

/** True when two Salesforce ids refer to the same record (15-char key). */
function sameSalesforceId(a: string, b: string): boolean {
  return a.slice(0, 15).toLowerCase() === b.slice(0, 15).toLowerCase();
}

/**
 * Maps a Salesforce OAuth error (from the token endpoint) to a clear,
 * actionable message. Salesforce returns terse codes like `invalid_client`
 * or `invalid_grant`; without this mapping the raw JSON leaked straight to
 * the form, which was confusing for both donors and the person deploying.
 */
function friendlySalesforceAuthMessage(
  code: string,
  description: string,
): string {
  switch (code) {
    case "invalid_client":
    case "invalid_client_id":
      return "No pudimos conectar con Salesforce: las credenciales de la aplicación son inválidas. Revisá que el SF_CLIENT_ID coincida con el Consumer Key de la Connected App y que corresponda al entorno correcto (producción vs. sandbox).";
    case "invalid_grant":
      return "No pudimos conectar con Salesforce: la conexión expiró o fue revocada. Hay que volver a generar el SF_REFRESH_TOKEN desde el asistente de conexión y actualizarlo en las variables de entorno.";
    case "inactive_user":
      return "No pudimos conectar con Salesforce: el usuario asociado a la conexión está inactivo. Activalo en Salesforce o generá el token con otro usuario.";
    case "inactive_org":
      return "No pudimos conectar con Salesforce: la organización de Salesforce está inactiva o suspendida.";
    default: {
      const detail = description || code || "error desconocido";
      return `No pudimos conectar con Salesforce (${detail}). Revisá la configuración de la conexión.`;
    }
  }
}

async function openConnection(): Promise<Connection> {
  const config = useRuntimeConfig();
  const loginUrl = requireString(config.sfLoginUrl, "SF_LOGIN_URL");
  const instanceUrl = requireString(config.sfInstanceUrl, "SF_INSTANCE_URL");
  const refreshToken = requireString(config.sfRefreshToken, "SF_REFRESH_TOKEN");

  // The Connected Apps allow the refresh-token flow without a client_secret
  // ("Require Secret for Refresh Token Flow" is disabled), so the runtime
  // refreshes as a public client with just the Consumer Key + refresh token.
  // The Consumer Secret stays server-side at Debi's onboarding helper and is
  // never distributed to customer deploys.
  const refreshParams: Record<string, string> = {
    grant_type: "refresh_token",
    client_id: clientIdForLoginUrl(loginUrl),
    refresh_token: refreshToken,
  };

  const tokenResponse = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(refreshParams).toString(),
    cache: "no-store",
  });

  if (!tokenResponse.ok) {
    const raw = await tokenResponse.text();
    let oauthError = "";
    let oauthDescription = "";
    try {
      const parsed = JSON.parse(raw) as {
        error?: string;
        error_description?: string;
      };
      oauthError = parsed.error ?? "";
      oauthDescription = parsed.error_description ?? "";
    } catch {
      oauthDescription = raw;
    }
    // Keep the raw Salesforce payload in the server logs (Vercel) for
    // debugging; the user only sees the friendly message below.
    console.error("[salesforce] OAuth refresh failed", {
      status: tokenResponse.status,
      loginUrl,
      error: oauthError,
      description: oauthDescription,
    });
    throw new FlowRequestError(
      friendlySalesforceAuthMessage(oauthError, oauthDescription),
      502,
    );
  }

  const tokenJson = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenJson.access_token) {
    throw new FlowRequestError(
      "No pudimos conectar con Salesforce: la respuesta de autenticación no incluyó un token de acceso. Reintentá en unos minutos y, si persiste, revisá la configuración de la Connected App.",
      502,
    );
  }

  return new Connection({
    instanceUrl,
    accessToken: tokenJson.access_token,
  });
}

async function withSalesforceConnection<R>(
  work: (conn: Connection) => Promise<R>,
): Promise<R> {
  return work(await openConnection());
}

function pickContactId(opp: Record<string, unknown>): string | null {
  const c = opp.ContactId;
  if (typeof c === "string" && c.length > 0) return c;
  const npsp = opp.npsp__Primary_Contact__c;
  if (typeof npsp === "string" && npsp.length > 0) return npsp;
  return null;
}

async function queryOpportunityRow(
  conn: Connection,
  map: SalesforceFieldMap,
  safeOppId: string,
): Promise<Record<string, unknown>> {
  const core = `Id, Name, ContactId, ${map.opportunity.amount}, ${map.opportunity.paymentMethod}, ${map.opportunity.recurringLookup}`;
  const run = (extraField: string) =>
    conn.query<Record<string, unknown>>(
      `SELECT ${core}${extraField} FROM Opportunity WHERE Id = '${safeOppId}' LIMIT 1`,
    );

  try {
    const row = (await run(", npsp__Primary_Contact__c")).records[0];
    if (!row) throw new Error("No se encontró la oportunidad");
    return row;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!/INVALID_FIELD|No such column/i.test(msg)) throw error;
    const row = (await run("")).records[0];
    if (!row) throw new Error("No se encontró la oportunidad");
    return row;
  }
}

async function loadFlowRecord(
  conn: Connection,
  map: SalesforceFieldMap,
  oppId: string,
): Promise<FlowRecord> {
  const safeId = escapeSoql(sanitizeOppId(oppId));
  const opp = await queryOpportunityRow(conn, map, safeId);
  const recurringId = (opp[map.opportunity.recurringLookup] as string) || null;

  const record: FlowRecord = {
    opportunityId: opp.Id as string,
    opportunityName: (opp.Name as string) || null,
    opportunityContactId: pickContactId(opp),
    opportunityAmount: (opp[map.opportunity.amount] as number) ?? null,
    opportunityPaymentMethodId:
      (opp[map.opportunity.paymentMethod] as string) ?? null,
    recurringDonationId: recurringId,
    recurringAmount: null,
    recurringPaymentMethodId: null,
  };

  if (!recurringId) return record;

  const rec = (
    await conn.query<Record<string, unknown>>(
      `SELECT Id, ${map.recurring.amount}, ${map.recurring.paymentMethod}
       FROM ${map.recurring.sobject}
       WHERE Id = '${escapeSoql(recurringId)}'
       LIMIT 1`,
    )
  ).records[0];

  if (rec) {
    record.recurringAmount = (rec[map.recurring.amount] as number) ?? null;
    record.recurringPaymentMethodId =
      (rec[map.recurring.paymentMethod] as string) ?? null;
  }
  return record;
}

export async function getFlowRecord(oppId: string): Promise<FlowRecord> {
  return withSalesforceConnection((conn) =>
    loadFlowRecord(conn, FIELD_MAP, oppId),
  );
}

function paymentMethodPayload(
  debiToken: DebiPaymentToken,
  contactId: string,
): Record<string, string | number | null | undefined> {
  const typePayload = debiToken[debiToken.type] || {};
  const last4 = typePayload.last_four_digits || "";
  const networkOrType = typePayload.network || debiToken.type;
  const funding = typePayload.funding || "";

  return {
    Name: `Flow - ${networkOrType} ${last4}`.trim(),
    TCPagos__Tu_cuota_Id__c: debiToken.id,
    TCPagos__type__c: debiToken.type,
    TCPagos__last_four_digits__c: last4 || null,
    TCPagos__Fingerprint__c: typePayload.fingerprint || null,
    TCPagos__Funding__c: funding || null,
    TCPagos__Issuer__c: typePayload.issuer || null,
    TCPagos__Network__c: networkOrType || null,
    TCPagos__brand__c: networkOrType || null,
    TCPagos__bank__c: typePayload.bank || null,
    TCPagos__expiration_month__c:
      debiToken.type === "card"
        ? (debiToken.card?.expiration_month ?? null)
        : null,
    TCPagos__expiration_year__c:
      debiToken.type === "card"
        ? (debiToken.card?.expiration_year ?? null)
        : null,
    TCPagos__Contact__c: contactId,
  };
}

async function createPaymentMethod(
  conn: Connection,
  debiToken: DebiPaymentToken,
  contactId: string,
): Promise<string> {
  const createResult = await conn
    .sobject("TCPagos__Payment_Method__c")
    .create(paymentMethodPayload(debiToken, contactId));

  if (!createResult.success || !createResult.id) {
    throw new FlowRequestError(
      formatSaveFailure(
        createResult,
        "No se pudo crear el método de pago en Salesforce",
      ),
    );
  }
  return createResult.id;
}

async function updateOpportunityAndRecurring(
  conn: Connection,
  map: SalesforceFieldMap,
  record: FlowRecord,
  amount: number,
  salesforcePaymentMethodId: string | null,
): Promise<boolean> {
  const oppUpdateResult = salesforcePaymentMethodId
    ? await conn.sobject("Opportunity").update({
        Id: record.opportunityId,
        [map.opportunity.amount]: amount,
        [map.opportunity.paymentMethod]: salesforcePaymentMethodId,
      })
    : await conn.sobject("Opportunity").update({
        Id: record.opportunityId,
        [map.opportunity.amount]: amount,
      });

  if (!oppUpdateResult.success) {
    throw new FlowRequestError(
      formatSaveFailure(
        oppUpdateResult,
        "No se pudo actualizar la Oportunidad",
      ),
    );
  }

  if (!record.recurringDonationId) return false;

  const recurringUpdateResult = salesforcePaymentMethodId
    ? await conn.sobject(map.recurring.sobject).update({
        Id: record.recurringDonationId,
        [map.recurring.amount]: amount,
        [map.recurring.paymentMethod]: salesforcePaymentMethodId,
      })
    : await conn.sobject(map.recurring.sobject).update({
        Id: record.recurringDonationId,
        [map.recurring.amount]: amount,
      });

  if (!recurringUpdateResult.success) {
    throw new FlowRequestError(
      formatSaveFailure(
        recurringUpdateResult,
        "No se pudo actualizar la donación recurrente",
      ),
    );
  }
  return true;
}

const SF_CONTACT_ID = /^[a-zA-Z0-9]{15,18}$/;

export async function submitFlow(input: {
  oppId: string;
  amount: number;
  /** Omit to update amount only (payment method fields unchanged in Salesforce). */
  paymentMethodToken?: DebiPaymentToken;
  /** From GET `/api/flow/:oppId`; skips a duplicate SOQL load when present and matches `oppId`. */
  record?: FlowRecord;
}): Promise<{
  salesforcePaymentMethodId: string | null;
  recurringUpdated: boolean;
}> {
  return withSalesforceConnection(async (conn) => {
    const safeOpp = sanitizeOppId(input.oppId);
    let record: FlowRecord;
    if (input.record != null) {
      if (!sameSalesforceId(input.record.opportunityId, safeOpp)) {
        throw new FlowRequestError(
          "El registro no coincide con esta oportunidad",
          400,
        );
      }
      record = input.record;
    } else {
      record = await loadFlowRecord(conn, FIELD_MAP, safeOpp);
    }

    const token = input.paymentMethodToken;
    let salesforcePaymentMethodId: string | null = null;

    if (token) {
      const contactId = record.opportunityContactId?.trim() ?? "";
      if (!contactId || !SF_CONTACT_ID.test(contactId)) {
        throw new FlowRequestError(
          "La oportunidad no tiene un ID de Contacto; vinculá un contacto en la oportunidad (o extendé la consulta de la API para el contacto principal de NPSP).",
          400,
        );
      }
      salesforcePaymentMethodId = await createPaymentMethod(
        conn,
        token,
        contactId,
      );
    }

    const recurringUpdated = await updateOpportunityAndRecurring(
      conn,
      FIELD_MAP,
      record,
      input.amount,
      salesforcePaymentMethodId,
    );

    return { salesforcePaymentMethodId, recurringUpdated };
  });
}

// ---------------------------------------------------------------------------
// Alta (new donor): create Contact + Opportunity + (optional) Recurring
// Donation + Payment Method, all linked together.
// ---------------------------------------------------------------------------

/**
 * Contact field map — kept in this file (not in `FIELD_MAP`) because most
 * orgs use the standard names (`FirstName`, `LastName`, `Email`, etc.).
 * Override here if the org renamed them.
 */
const CONTACT_FIELDS = {
  firstName: "FirstName",
  lastName: "LastName",
  email: "Email",
  phone: "MobilePhone",
  birthDate: "Birthdate",
  country: "MailingCountry",
  province: "MailingState",
} as const;

/**
 * Opportunity defaults for new altas. `StageName` is required by Salesforce
 * on every Opportunity insert. Override the constants in this section to
 * match your sales process.
 *
 * `procesador_de_pagos__c = "TuCuota"` is what makes the org's Flow create
 * the `TCPagos__Pago__c` charge; without it the Opportunity is never billed.
 */
const ALTA_OPP_DEFAULTS = {
  stageName: "Pledged",
  /** DeveloperName of the Opportunity RecordType; `null` uses the user's default. */
  recordTypeDeveloperName: "General" as string | null,
  /** Charges created after this day of the month move to the 1st of next month. */
  lastChargeDayOfMonth: 25,
  fields: { procesador_de_pagos__c: "TuCuota" } as Record<string, string>,
};

/**
 * Recurring Donation defaults. The org's validation rule requires day 1 when
 * the processor is TuCuota.
 */
const ALTA_RECURRING_DEFAULTS = {
  fields: {
    Procesador_de_pagos__c: "TuCuota",
    npsp__Day_of_Month__c: "1",
    npsp__RecurringType__c: "Open",
    npsp__Status__c: "Active",
  } as Record<string, string>,
  /** The org's Flow creates the current-month Opportunity only between these days. */
  currentMonthOppFromDay: 2,
  currentMonthOppToDay: 20,
};

/**
 * Written when a closed Recurring Donation goes back to Active. The org's
 * validation rules require a reactivation type, plus date and office for
 * Argentina. Fields missing from the org are skipped (see
 * `existingRecurringFields`), so orgs without them keep working.
 */
const REACTIVATION_DEFAULTS = {
  fields: {
    Tipo_de_reactivacion__c: "Recupero",
    Sede_que_reactiva__c: "Oficina Nacional",
  } as Record<string, string>,
  dateField: "Fecha_de_la_reactivaci_n__c",
};

/**
 * In multi-currency orgs Salesforce rejects linking an Opportunity to a
 * Recurring Donation in a different currency, and a new RD otherwise gets
 * the integration user's default currency. Single-currency orgs have no
 * `CurrencyIsoCode` field, so the query fails and we return null.
 */
async function opportunityCurrency(
  conn: Connection,
  oppId: string,
): Promise<string | null> {
  try {
    const result = await conn.query<{ CurrencyIsoCode?: string }>(
      `SELECT CurrencyIsoCode FROM Opportunity WHERE Id = '${escapeSoql(oppId)}' LIMIT 1`,
    );
    return result.records[0]?.CurrencyIsoCode ?? null;
  } catch {
    return null;
  }
}

let recurringFieldNames: Set<string> | null = null;

async function existingRecurringFields(
  conn: Connection,
  names: string[],
): Promise<string[]> {
  if (!recurringFieldNames) {
    const described = await conn.sobject(FIELD_MAP.recurring.sobject).describe();
    recurringFieldNames = new Set(described.fields.map((f) => f.name));
  }
  return names.filter((name) => recurringFieldNames!.has(name));
}

/**
 * Removes records created earlier in a submit that failed later, so a
 * failed attempt doesn't leave a Payment Method (or RD) with nothing
 * pointing at it. Failures are logged, not thrown: the original error is
 * the one the donor needs to see.
 */
async function discardCreated(
  conn: Connection,
  sobject: string,
  ids: Array<string | null | undefined>,
): Promise<void> {
  const toDelete = ids.filter((id): id is string => Boolean(id));
  if (toDelete.length === 0) return;
  try {
    await conn.sobject(sobject).destroy(toDelete);
  } catch (error) {
    console.error("[salesforce] cleanup after failed submit failed", {
      sobject,
      ids: toDelete,
      error: error instanceof Error ? error.message : error,
    });
  }
}

/**
 * NPSP validation rules reject a Contact with an email or mobile phone but
 * no preferred email / phone picklist value.
 */
function contactPreferenceFields(
  email: string,
  phone: string | null | undefined,
): Record<string, string> {
  const fields: Record<string, string> = {
    npe01__HomeEmail__c: email,
    npe01__Preferred_Email__c: "Particular",
  };
  if (phone) fields.npe01__PreferredPhone__c = "Mobile";
  return fields;
}

/** Writes the donor's document number where the org's AFIP formulas read it. */
const CONTACT_DOCUMENT_FIELDS = {
  documentNumber: "N_de_documento__c",
  cuit: "CUIT__c",
};
const OPPORTUNITY_DOCUMENT_FIELD = "CUIT__c";

async function findContactByEmail(
  conn: Connection,
  email: string,
): Promise<string | null> {
  const safe = escapeSoql(email);
  const result = await conn.query<{ Id: string }>(
    `SELECT Id FROM Contact WHERE Email = '${safe}' LIMIT 1`,
  );
  return result.records[0]?.Id ?? null;
}

/**
 * Find or create a Contact for the donor. Lookup is by email; if no
 * existing contact matches, we insert a new one with whatever personal
 * data the flow page collected.
 */
export async function findOrCreateContact(input: {
  personal: AltaPersonal;
  extra?: AltaExtraFields["contact"];
}): Promise<{ contactId: string; created: boolean }> {
  if (!input.personal.email) {
    throw new FlowRequestError(
      "Falta el email del donante para crear el contacto.",
      400,
    );
  }
  return withSalesforceConnection(async (conn) => {
    const existing = await findContactByEmail(conn, input.personal.email);
    if (existing) {
      return { contactId: existing, created: false };
    }

    const payload: Record<string, unknown> = {
      [CONTACT_FIELDS.firstName]: input.personal.firstName,
      [CONTACT_FIELDS.lastName]: input.personal.lastName,
      [CONTACT_FIELDS.email]: input.personal.email,
      [CONTACT_FIELDS.phone]: input.personal.phone,
      ...contactPreferenceFields(input.personal.email, input.personal.phone),
    };
    if (input.personal.birthDate) {
      payload[CONTACT_FIELDS.birthDate] = input.personal.birthDate;
    }
    if (input.personal.country) {
      payload[CONTACT_FIELDS.country] = input.personal.country;
    }
    if (input.personal.province) {
      payload[CONTACT_FIELDS.province] = input.personal.province;
    }
    if (input.extra) Object.assign(payload, input.extra);

    const result = await conn.sobject("Contact").create(payload);
    if (!result.success || !result.id) {
      throw new FlowRequestError(
        formatSaveFailure(
          result,
          "No se pudo crear el contacto en Salesforce",
        ),
      );
    }
    return { contactId: result.id, created: true };
  });
}

function todayPlusDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Salesforce date formulas (`TODAY()`) run in the org's timezone, not UTC. */
const ORG_TIMEZONE = "America/Argentina/Buenos_Aires";

function orgToday(): { iso: string; year: number; month: number; day: number } {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: ORG_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [year, month, day] = iso.split("-").map(Number);
  return { iso, year, month, day };
}

/** Today, or the 1st of next month once the month's charge window closed. */
function altaCloseDate(): string {
  const today = orgToday();
  if (today.day <= ALTA_OPP_DEFAULTS.lastChargeDayOfMonth) return today.iso;
  const year = today.month === 12 ? today.year + 1 : today.year;
  const month = today.month === 12 ? 1 : today.month + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

async function findOpportunityRecordTypeId(
  conn: Connection,
  developerName: string | null,
): Promise<string | null> {
  if (!developerName) return null;
  const result = await conn.query<{ Id: string }>(
    `SELECT Id FROM RecordType WHERE SobjectType = 'Opportunity' AND DeveloperName = '${escapeSoql(developerName)}' AND IsActive = true LIMIT 1`,
  );
  return result.records[0]?.Id ?? null;
}

// ---------------------------------------------------------------------------
// Gestión de donación: Three modes with different entry points
// ---------------------------------------------------------------------------

/**
 * Frequency map: UI labels to Salesforce Installment Period values.
 */
const FREQUENCY_TO_INSTALLMENT: Record<string, string> = {
  Mensual: "Monthly",
  Trimestral: "Quarterly",
  Anual: "Yearly",
};

// ---------------------------------------------------------------------------
// Mode 1: update-recurring — Reactivate an existing Recurring Donation
// ---------------------------------------------------------------------------

/**
 * Record shape for update-recurring mode.
 * Loads from npe03__Recurring_Donation__c with linked Contact.
 */
export type UpdateRecurringRecord = {
  recurringDonationId: string;
  recurringAmount: number | null;
  recurringStatus: string | null;
  recurringInstallmentPeriod: string | null;
  recurringPaymentMethodId: string | null;
  contactId: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
};

/**
 * Load a Recurring Donation for the update-recurring mode.
 * Pre-fills form and personalizes greeting with contact name.
 */
export async function getUpdateRecurringRecord(
  rdId: string,
): Promise<UpdateRecurringRecord> {
  return withSalesforceConnection(async (conn) => {
    const safeId = escapeSoql(sanitizeOppId(rdId));
    const map = FIELD_MAP;

    const rdQuery = `
      SELECT 
        Id,
        ${map.recurring.amount},
        ${map.recurring.paymentMethod},
        npe03__Installment_Period__c,
        npsp__Status__c,
        npe03__Contact__c,
        npe03__Contact__r.FirstName,
        npe03__Contact__r.LastName,
        npe03__Contact__r.Email
      FROM ${map.recurring.sobject}
      WHERE Id = '${safeId}'
      LIMIT 1
    `;

    const result = await conn.query<Record<string, unknown>>(rdQuery);
    const rd = result.records[0];

    if (!rd) {
      throw new FlowRequestError("No se encontró la donación recurrente", 404);
    }

    const contact = rd["npe03__Contact__r"] as Record<string, unknown> | null;

    return {
      recurringDonationId: rd.Id as string,
      recurringAmount: (rd[map.recurring.amount] as number) ?? null,
      recurringStatus: (rd["npsp__Status__c"] as string) ?? null,
      recurringInstallmentPeriod:
        (rd["npe03__Installment_Period__c"] as string) ?? null,
      recurringPaymentMethodId:
        (rd[map.recurring.paymentMethod] as string) ?? null,
      contactId: (rd["npe03__Contact__c"] as string) ?? null,
      contactFirstName: (contact?.FirstName as string) ?? null,
      contactLastName: (contact?.LastName as string) ?? null,
      contactEmail: (contact?.Email as string) ?? null,
    };
  });
}

/**
 * Reactivate an existing Recurring Donation.
 * Sets status to Active and optionally updates amount, frequency, payment method.
 */
export async function submitUpdateRecurring(input: {
  rdId: string;
  amount: number;
  frequency: string;
  paymentMethodToken?: DebiPaymentToken;
  record?: UpdateRecurringRecord;
}): Promise<{
  recurringDonationId: string;
  paymentMethodId: string | null;
}> {
  return withSalesforceConnection(async (conn) => {
    const safeId = sanitizeOppId(input.rdId);
    const map = FIELD_MAP;

    let record = input.record;
    if (!record) {
      record = await getUpdateRecurringRecord(safeId);
    }

    const contactId = record.contactId?.trim() ?? "";
    let paymentMethodId: string | null = null;

    // Create new payment method if token provided
    if (input.paymentMethodToken) {
      if (!contactId || !SF_CONTACT_ID.test(contactId)) {
        throw new FlowRequestError(
          "La donación recurrente no tiene un contacto vinculado.",
          400,
        );
      }
      paymentMethodId = await createPaymentMethod(
        conn,
        input.paymentMethodToken,
        contactId,
      );
    }

    try {
      const installmentPeriod = FREQUENCY_TO_INSTALLMENT[input.frequency];

      const updatePayload: { Id: string; [key: string]: unknown } = {
        Id: safeId,
        [map.recurring.amount]: input.amount,
        npsp__Status__c: "Active", // Always activate
      };

      if (installmentPeriod) {
        updatePayload["npe03__Installment_Period__c"] = installmentPeriod;
      }

      if (paymentMethodId) {
        updatePayload[map.recurring.paymentMethod] = paymentMethodId;
      }

      if (record.recurringStatus !== "Active") {
        const reactivationFields = await existingRecurringFields(conn, [
          ...Object.keys(REACTIVATION_DEFAULTS.fields),
          REACTIVATION_DEFAULTS.dateField,
        ]);
        for (const field of reactivationFields) {
          updatePayload[field] =
            field === REACTIVATION_DEFAULTS.dateField
              ? orgToday().iso
              : REACTIVATION_DEFAULTS.fields[field];
        }
      }

      const updateResult = await conn
        .sobject(map.recurring.sobject)
        .update(updatePayload);

      if (!updateResult.success) {
        throw new FlowRequestError(
          formatSaveFailure(updateResult, "No se pudo reactivar la donación"),
        );
      }
    } catch (error) {
      await discardCreated(conn, "TCPagos__Payment_Method__c", [paymentMethodId]);
      throw error;
    }

    return { recurringDonationId: safeId, paymentMethodId };
  });
}

// ---------------------------------------------------------------------------
// Mode 2: convert-to-recurring — Create RD from an existing Opportunity
// ---------------------------------------------------------------------------

/**
 * Record shape for convert-to-recurring mode.
 * Loads from Opportunity with linked Contact.
 */
export type ConvertToRecurringRecord = {
  opportunityId: string;
  opportunityName: string | null;
  opportunityAmount: number | null;
  contactId: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  /** If already has a recurring donation linked, show it */
  existingRecurringId: string | null;
};

/**
 * Load an Opportunity for the convert-to-recurring mode.
 */
export async function getConvertToRecurringRecord(
  oppId: string,
): Promise<ConvertToRecurringRecord> {
  return withSalesforceConnection(async (conn) => {
    const safeId = escapeSoql(sanitizeOppId(oppId));
    const map = FIELD_MAP;

    // Try with npsp__Primary_Contact__c first, fallback to ContactId
    const baseFields = `
      Id, Name, ${map.opportunity.amount}, ContactId,
      ${map.opportunity.recurringLookup}
    `;

    let opp: Record<string, unknown> | undefined;
    let hasNpspContact = false;

    try {
      const result = await conn.query<Record<string, unknown>>(`
        SELECT ${baseFields}, npsp__Primary_Contact__c,
               npsp__Primary_Contact__r.FirstName,
               npsp__Primary_Contact__r.LastName,
               npsp__Primary_Contact__r.Email
        FROM Opportunity
        WHERE Id = '${safeId}'
        LIMIT 1
      `);
      opp = result.records[0];
      hasNpspContact = true;
    } catch {
      // Fallback without NPSP fields
      const result = await conn.query<Record<string, unknown>>(`
        SELECT ${baseFields}
        FROM Opportunity
        WHERE Id = '${safeId}'
        LIMIT 1
      `);
      opp = result.records[0];
    }

    if (!opp) {
      throw new FlowRequestError("No se encontró la oportunidad", 404);
    }

    // Get contact info
    let contactId =
      (opp["npsp__Primary_Contact__c"] as string) ||
      (opp["ContactId"] as string) ||
      null;
    let contactFirstName: string | null = null;
    let contactLastName: string | null = null;
    let contactEmail: string | null = null;

    if (hasNpspContact && opp["npsp__Primary_Contact__r"]) {
      const c = opp["npsp__Primary_Contact__r"] as Record<string, unknown>;
      contactFirstName = (c.FirstName as string) ?? null;
      contactLastName = (c.LastName as string) ?? null;
      contactEmail = (c.Email as string) ?? null;
    } else if (contactId) {
      // Fetch contact separately
      const contactResult = await conn.query<Record<string, unknown>>(`
        SELECT FirstName, LastName, Email
        FROM Contact
        WHERE Id = '${escapeSoql(contactId)}'
        LIMIT 1
      `);
      const c = contactResult.records[0];
      if (c) {
        contactFirstName = (c.FirstName as string) ?? null;
        contactLastName = (c.LastName as string) ?? null;
        contactEmail = (c.Email as string) ?? null;
      }
    }

    return {
      opportunityId: opp.Id as string,
      opportunityName: (opp.Name as string) ?? null,
      opportunityAmount: (opp[map.opportunity.amount] as number) ?? null,
      contactId,
      contactFirstName,
      contactLastName,
      contactEmail,
      existingRecurringId:
        (opp[map.opportunity.recurringLookup] as string) ?? null,
    };
  });
}

/**
 * Convert a one-time Opportunity to recurring.
 * Creates a new Recurring Donation and Payment Method, links to Opp.
 */
export async function submitConvertToRecurring(input: {
  oppId: string;
  amount: number;
  frequency: string;
  paymentMethodToken: DebiPaymentToken;
  record?: ConvertToRecurringRecord;
}): Promise<{
  recurringDonationId: string;
  paymentMethodId: string;
}> {
  return withSalesforceConnection(async (conn) => {
    const safeOppId = sanitizeOppId(input.oppId);
    const map = FIELD_MAP;

    let record = input.record;
    if (!record) {
      record = await getConvertToRecurringRecord(safeOppId);
    }

    const contactId = record.contactId?.trim() ?? "";
    if (!contactId || !SF_CONTACT_ID.test(contactId)) {
      throw new FlowRequestError(
        "La oportunidad no tiene un contacto vinculado.",
        400,
      );
    }

    // Check if already has a recurring donation
    if (record.existingRecurringId) {
      throw new FlowRequestError(
        "Esta oportunidad ya tiene una donación recurrente vinculada.",
        400,
      );
    }

    // Create payment method
    const paymentMethodId = await createPaymentMethod(
      conn,
      input.paymentMethodToken,
      contactId,
    );

    // Create recurring donation
    const installmentPeriod =
      FREQUENCY_TO_INSTALLMENT[input.frequency] || "Monthly";

    const rdPayload: Record<string, unknown> = {
      Name: `RD ${contactId} ${todayPlusDays(0)}`,
      npe03__Contact__c: contactId,
      [map.recurring.amount]: input.amount,
      [map.recurring.paymentMethod]: paymentMethodId,
      npe03__Installment_Period__c: installmentPeriod,
      npe03__Date_Established__c: todayPlusDays(0),
      ...ALTA_RECURRING_DEFAULTS.fields,
    };

    const currency = await opportunityCurrency(conn, safeOppId);
    if (currency) rdPayload.CurrencyIsoCode = currency;

    let recurringDonationId: string | null = null;
    try {
      const rdResult = await conn
        .sobject(map.recurring.sobject)
        .create(rdPayload);

      if (!rdResult.success || !rdResult.id) {
        throw new FlowRequestError(
          formatSaveFailure(rdResult, "No se pudo crear la donación recurrente"),
        );
      }
      recurringDonationId = rdResult.id;

      // Link RD to Opportunity and update payment method
      const oppUpdateResult = await conn.sobject("Opportunity").update({
        Id: safeOppId,
        [map.opportunity.recurringLookup]: recurringDonationId,
        [map.opportunity.paymentMethod]: paymentMethodId,
      });

      if (!oppUpdateResult.success) {
        throw new FlowRequestError(
          formatSaveFailure(
            oppUpdateResult,
            "No se pudo vincular la donación recurrente a la oportunidad",
          ),
        );
      }
    } catch (error) {
      await discardCreated(conn, map.recurring.sobject, [recurringDonationId]);
      await discardCreated(conn, "TCPagos__Payment_Method__c", [paymentMethodId]);
      throw error;
    }

    return {
      recurringDonationId,
      paymentMethodId,
    };
  });
}

// ---------------------------------------------------------------------------
// Mode 3: abandoned-cart — Complete a TCPagos__Formulario_TC__c
// ---------------------------------------------------------------------------

/**
 * Record shape for abandoned-cart mode.
 * Loads from TCPagos__Formulario_TC__c.
 */
export type AbandonedCartRecord = {
  formularioId: string;
  nombre: string | null;
  apellido: string | null;
  email: string | null;
  telefono: string | null;
  monto: number | null;
  frecuencia: string | null;
  dni: string | null;
  fechaNacimiento: string | null;
  /** Whether the form already has a payment method */
  hasPaymentMethod: boolean;
};

/**
 * Load a TCPagos__Formulario_TC__c for the abandoned-cart mode.
 * Queries only the standard fields that exist in the managed package.
 */
export async function getAbandonedCartRecord(
  formId: string,
): Promise<AbandonedCartRecord> {
  return withSalesforceConnection(async (conn) => {
    const safeId = escapeSoql(sanitizeOppId(formId));

    // Query only the core fields from the managed package
    const result = await conn.query<Record<string, unknown>>(`
      SELECT 
        Id,
        TCPagos__Nombre__c,
        TCPagos__Apellido__c,
        TCPagos__Correo_electr_nico__c,
        TCPagos__Tel_fono__c,
        TCPagos__Monto_de_la_donaci_n__c,
        TCPagos__Frecuencia_de_la_donaci_n__c,
        TCPagos__N_mero_de_identificaci_n__c,
        TCPagos__Fecha_de_nacimiento__c
      FROM TCPagos__Formulario_TC__c
      WHERE Id = '${safeId}'
      LIMIT 1
    `);

    const form = result.records[0];
    if (!form) {
      throw new FlowRequestError("No se encontró el formulario", 404);
    }

    return {
      formularioId: form.Id as string,
      nombre: (form["TCPagos__Nombre__c"] as string) ?? null,
      apellido: (form["TCPagos__Apellido__c"] as string) ?? null,
      email: (form["TCPagos__Correo_electr_nico__c"] as string) ?? null,
      telefono: (form["TCPagos__Tel_fono__c"] as string) ?? null,
      monto: (form["TCPagos__Monto_de_la_donaci_n__c"] as number) ?? null,
      frecuencia:
        (form["TCPagos__Frecuencia_de_la_donaci_n__c"] as string) ?? null,
      dni: (form["TCPagos__N_mero_de_identificaci_n__c"] as string) ?? null,
      fechaNacimiento:
        (form["TCPagos__Fecha_de_nacimiento__c"] as string) ?? null,
      hasPaymentMethod: false, // Will be set by the submit via Debi API
    };
  });
}

/**
 * Complete an abandoned cart by:
 * 1. Finding or creating a Contact (from Contacto__c or by email)
 * 2. Creating a TCPagos__Payment_Method__c linked to the Contact
 * 3. Updating TCPagos__Formulario_TC__c with the payment method and other data
 *
 * The Salesforce Flow will then trigger and create RD, Opportunity, etc.
 */
export async function submitAbandonedCart(input: {
  formId: string;
  amount: number;
  frequency: string;
  paymentMethodToken: DebiPaymentToken;
  /** Pre-loaded record to get contact info */
  record?: AbandonedCartRecord;
}): Promise<{
  formularioId: string;
  paymentMethodId: string;
  contactId: string;
}> {
  return withSalesforceConnection(async (conn) => {
    const safeId = sanitizeOppId(input.formId);

    // First, get the form to find or create the contact
    const formResult = await conn.query<Record<string, unknown>>(`
      SELECT 
        Id,
        Contacto__c,
        TCPagos__Nombre__c,
        TCPagos__Apellido__c,
        TCPagos__Correo_electr_nico__c,
        TCPagos__Tel_fono__c
      FROM TCPagos__Formulario_TC__c
      WHERE Id = '${escapeSoql(safeId)}'
      LIMIT 1
    `);

    const form = formResult.records[0];
    if (!form) {
      throw new FlowRequestError("No se encontró el formulario", 404);
    }

    // Get or create contact
    let contactId = form["Contacto__c"] as string | null;

    if (!contactId) {
      // Try to find contact by email or create one
      const email = form["TCPagos__Correo_electr_nico__c"] as string;
      if (!email) {
        throw new FlowRequestError(
          "El formulario no tiene email para crear el contacto",
          400,
        );
      }

      // Search for existing contact
      const existingContact = await conn.query<{ Id: string }>(`
        SELECT Id FROM Contact 
        WHERE Email = '${escapeSoql(email)}' 
        LIMIT 1
      `);

      if (existingContact.records[0]) {
        contactId = existingContact.records[0].Id;
      } else {
        // Create new contact
        const firstName = form["TCPagos__Nombre__c"] as string || "";
        const lastName = form["TCPagos__Apellido__c"] as string || "Sin Apellido";
        const phone = form["TCPagos__Tel_fono__c"] as string || "";

        const contactResult = await conn.sobject("Contact").create({
          FirstName: firstName,
          LastName: lastName,
          Email: email,
          MobilePhone: phone,
          ...contactPreferenceFields(email, phone),
        });

        if (!contactResult.success || !contactResult.id) {
          throw new FlowRequestError(
            formatSaveFailure(contactResult, "No se pudo crear el contacto"),
          );
        }
        contactId = contactResult.id;
      }
    }

    // Create the Payment Method linked to the contact
    const paymentMethodSfId = await createPaymentMethod(
      conn,
      input.paymentMethodToken,
      contactId,
    );

    // Update the form with all the data
    const updatePayload: { Id: string; [key: string]: unknown } = {
      Id: safeId,
      TCPagos__Monto_de_la_donaci_n__c: input.amount,
      TCPagos__Frecuencia_de_la_donaci_n__c: input.frequency,
      TCPagos__ID_M_todo_de_pago__c: input.paymentMethodToken.id,
      TCPagos__M_todo_de_pago__c: input.paymentMethodToken.type,
      TCPagos__TC_Metodo_de_Pago__c: paymentMethodSfId,
      Contacto__c: contactId,
    };

    try {
      const updateResult = await conn
        .sobject("TCPagos__Formulario_TC__c")
        .update(updatePayload);

      if (!updateResult.success) {
        throw new FlowRequestError(
          formatSaveFailure(
            updateResult,
            "No se pudo actualizar el formulario",
          ),
        );
      }
    } catch (error) {
      await discardCreated(conn, "TCPagos__Payment_Method__c", [paymentMethodSfId]);
      throw error;
    }

    return {
      formularioId: safeId,
      paymentMethodId: paymentMethodSfId,
      contactId,
    };
  });
}

/**
 * Creates the donation chain for an alta:
 *
 *   Contact (must exist) → Payment Method → Recurring Donation (mensual)
 *                                         → Opportunity (única vez)
 *
 * The Payment Method, Opportunity and Recurring Donation all have to share
 * the Contact's Account (the payment package rejects mismatches).
 *
 * Monthly altas create only the Recurring Donation: NPSP and the org's Flows
 * generate its Opportunities, and the org rejects a second Opportunity for
 * the same Recurring Donation in the same month.
 */
export async function createDonationChain(input: {
  contactId: string;
  amount: number;
  /** `"Mensual"` triggers RD creation; anything else creates a one-time Opp. */
  frequency: string;
  paymentMethodToken: DebiPaymentToken;
  campaign?: string | null;
  /** DNI / CUIT, written to the Contact (and to the Opportunity for one-time gifts). */
  documentNumber?: string | null;
  /** Free text — written to `Description` on the one-time Opportunity if provided. */
  observations?: string | null;
  extra?: AltaExtraFields;
  /** Override the default `StageName` for the Opportunity. */
  stageName?: string;
}): Promise<{
  opportunityId: string | null;
  recurringDonationId: string | null;
  paymentMethodId: string;
}> {
  return withSalesforceConnection(async (conn) => {
    const isRecurring = input.frequency === "Mensual";
    const map = FIELD_MAP;
    const today = orgToday();

    const contact = (
      await conn.query<{ AccountId: string | null; CUIT__c: string | null }>(
        `SELECT AccountId, ${CONTACT_DOCUMENT_FIELDS.cuit} FROM Contact WHERE Id = '${escapeSoql(input.contactId)}' LIMIT 1`,
      )
    ).records[0];
    if (!contact) {
      throw new FlowRequestError("No se encontró el contacto del donante.", 404);
    }
    const accountId = contact.AccountId;
    if (!accountId) {
      throw new FlowRequestError(
        "El contacto no tiene una cuenta asociada en Salesforce.",
      );
    }

    const documentNumber = input.documentNumber?.trim() || null;
    const contactUpdate: Record<string, unknown> = { ...input.extra?.contact };
    if (documentNumber) {
      contactUpdate[CONTACT_DOCUMENT_FIELDS.documentNumber] = documentNumber;
      if (!contact.CUIT__c) {
        contactUpdate[CONTACT_DOCUMENT_FIELDS.cuit] = documentNumber;
      }
    }
    if (Object.keys(contactUpdate).length > 0) {
      const contactResult = await conn
        .sobject("Contact")
        .update({ Id: input.contactId, ...contactUpdate });
      if (!contactResult.success) {
        throw new FlowRequestError(
          formatSaveFailure(
            contactResult,
            "No se pudo actualizar el contacto en Salesforce",
          ),
        );
      }
    }

    const paymentMethodId = await createPaymentMethod(
      conn,
      input.paymentMethodToken,
      input.contactId,
    );

    if (isRecurring) {
      const recurringPayload: Record<string, unknown> = {
        Name: `RD ${input.contactId} ${today.iso}`,
        npe03__Contact__c: input.contactId,
        npe03__Organization__c: accountId,
        [map.recurring.amount]: input.amount,
        [map.recurring.paymentMethod]: paymentMethodId,
        npe03__Installment_Period__c: "Monthly",
        npe03__Date_Established__c: today.iso,
        npsp__StartDate__c: today.iso,
        Crear_oportunidad_mes_en_curso__c:
          today.day >= ALTA_RECURRING_DEFAULTS.currentMonthOppFromDay &&
          today.day <= ALTA_RECURRING_DEFAULTS.currentMonthOppToDay,
        ...ALTA_RECURRING_DEFAULTS.fields,
      };
      if (input.campaign) {
        recurringPayload["npe03__Recurring_Donation_Campaign__c"] =
          input.campaign;
      }
      if (input.extra?.recurring) {
        Object.assign(recurringPayload, input.extra.recurring);
      }
      const rdResult = await conn
        .sobject(map.recurring.sobject)
        .create(recurringPayload);
      if (!rdResult.success || !rdResult.id) {
        throw new FlowRequestError(
          formatSaveFailure(
            rdResult,
            "No se pudo crear la donación recurrente",
          ),
        );
      }
      return {
        opportunityId: null,
        recurringDonationId: rdResult.id,
        paymentMethodId,
      };
    }

    const closeDate = altaCloseDate();
    const oppPayload: Record<string, unknown> = {
      Name: `Donación única - ${closeDate}`,
      AccountId: accountId,
      ContactId: input.contactId,
      npsp__Primary_Contact__c: input.contactId,
      StageName: input.stageName ?? ALTA_OPP_DEFAULTS.stageName,
      CloseDate: closeDate,
      [map.opportunity.amount]: input.amount,
      [map.opportunity.paymentMethod]: paymentMethodId,
      ...ALTA_OPP_DEFAULTS.fields,
    };
    const recordTypeId = await findOpportunityRecordTypeId(
      conn,
      ALTA_OPP_DEFAULTS.recordTypeDeveloperName,
    );
    if (recordTypeId) {
      oppPayload["RecordTypeId"] = recordTypeId;
    }
    if (documentNumber) {
      oppPayload[OPPORTUNITY_DOCUMENT_FIELD] = documentNumber;
    }
    if (input.campaign) {
      oppPayload["CampaignId"] = input.campaign;
    }
    if (input.observations) {
      oppPayload["Description"] = input.observations;
    }
    if (input.extra?.opportunity) {
      Object.assign(oppPayload, input.extra.opportunity);
    }

    const oppResult = await conn.sobject("Opportunity").create(oppPayload);
    if (!oppResult.success || !oppResult.id) {
      throw new FlowRequestError(
        formatSaveFailure(
          oppResult,
          "No se pudo crear la oportunidad en Salesforce",
        ),
      );
    }

    return {
      opportunityId: oppResult.id,
      recurringDonationId: null,
      paymentMethodId,
    };
  });
}
