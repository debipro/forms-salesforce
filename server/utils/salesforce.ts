import { Connection } from "jsforce";
import type { DebiPaymentToken } from "~/composables/useDebiClient";

/**
 * Consumer Key of Debi's `Debi_Forms_Onboarding` Connected App. The app is a
 * public client with PKCE — there's no Consumer Secret, so this value is
 * safe to commit. Refresh tokens minted by the central onboarding helper are
 * bound to this client_id, which is why the runtime hardcodes it.
 */
const SF_CLIENT_ID =
  "3MVG9rZjd7MXFdLiKsRvnOTkvFUjxpzFwIuGUncX31f4kO7SnP0FvS1Ewo_kGUR.MMiJgLqPOTgKGfGm9GpLk";

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

async function openConnection(): Promise<Connection> {
  const config = useRuntimeConfig();
  const loginUrl = requireString(config.sfLoginUrl, "SF_LOGIN_URL");
  const instanceUrl = requireString(config.sfInstanceUrl, "SF_INSTANCE_URL");
  const refreshToken = requireString(config.sfRefreshToken, "SF_REFRESH_TOKEN");

  // Refresh tokens are minted by Debi's bundled PKCE-only Connected App and
  // are bound to its Consumer Key. The Connected App is public, so no
  // client_secret is ever needed.
  const refreshParams: Record<string, string> = {
    grant_type: "refresh_token",
    client_id: SF_CLIENT_ID,
    refresh_token: refreshToken,
  };

  const tokenResponse = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(refreshParams).toString(),
    cache: "no-store",
  });

  if (!tokenResponse.ok) {
    throw new Error(
      `Falló la renovación OAuth de Salesforce: ${await tokenResponse.text()}`,
    );
  }

  const tokenJson = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenJson.access_token) {
    throw new Error(
      "La renovación OAuth de Salesforce no devolvió access_token",
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
    throw new Error("No se pudo crear el método de pago en Salesforce");
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
    throw new Error("No se pudo actualizar la Oportunidad");
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
    throw new Error("No se pudo actualizar la donación recurrente");
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
