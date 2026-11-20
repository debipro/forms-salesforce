// Read-only smoke test for the three gestión forms.
//
// Every POST below is invalid on purpose: the API rejects it during
// validation, before touching Salesforce or Debi. Nothing is written.
//
// Usage:
//   BASE_URL=http://localhost:3001 \
//   RD_ID=<Recurring Donation id> \
//   OPP_ID=<Opportunity id> \
//   FORM_ID=<TCPagos__Formulario_TC__c id> \
//   node scripts/smoke-gestion.mjs
//
// Any id can be omitted; that mode's load checks are skipped.

const BASE_URL = (process.env.BASE_URL || "http://localhost:3001").replace(/\/$/, "");

const MODES = [
  { mode: "update-recurring", id: process.env.RD_ID, title: "Reactivá tu donación", dataKey: "recurringDonationId" },
  { mode: "convert-to-recurring", id: process.env.OPP_ID, title: "Sumate todos los meses", dataKey: "opportunityId" },
  { mode: "abandoned-cart", id: process.env.FORM_ID, title: "Completá tu donación", dataKey: "formularioId" },
];

const VALID_SHAPED_ID = "a0D000000000000AAA";

let passed = 0;
let failed = 0;
let skipped = 0;

function report(ok, name, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "OK  " : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function getJson(path) {
  const res = await fetch(`${BASE_URL}${path}`, { cache: "no-store" });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function postJson(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function expectRejected(name, path, body) {
  const { status, json } = await postJson(path, body);
  report(status === 400 && json?.error === true, name, `${status} ${json?.message ?? ""}`);
}

for (const { mode, id, title, dataKey } of MODES) {
  console.log(`\n# ${title} (${mode})`);

  if (!id) {
    skipped++;
    console.log("SKIP  carga con Id real — falta la variable de entorno del Id");
  } else {
    const api = await getJson(`/api/flow/gestion-donacion/${id}?mode=${mode}`);
    report(
      api.status === 200 && api.json?.error === false && Boolean(api.json?.data?.[dataKey]),
      "GET carga el registro",
      api.json?.message ?? `${api.status}`,
    );

    const page = await fetch(`${BASE_URL}/flow/gestion-donacion/${id}?mode=${mode}`);
    const html = await page.text();
    report(page.status === 200 && html.includes(title), "la página responde con el título correcto", `${page.status}`);
  }

  const missing = await getJson(`/api/flow/gestion-donacion/${VALID_SHAPED_ID}?mode=${mode}`);
  report(missing.json?.error === true && missing.status >= 400, "GET con Id inexistente devuelve error", `${missing.status}`);

  const path = `/api/flow/gestion-donacion/${id || VALID_SHAPED_ID}`;
  const token = { id: "pm_smoke_invalid", type: "card" };

  await expectRejected("POST con monto 0 se rechaza", path, { mode, amount: 0, frequency: "Mensual", paymentMethodToken: token });
  await expectRejected("POST sin frecuencia se rechaza", path, { mode, amount: 5000, paymentMethodToken: token });
  await expectRejected("POST con token mal formado se rechaza", path, { mode, amount: 5000, frequency: "Mensual", paymentMethodToken: { id: "", type: "" } });

  if (mode !== "update-recurring") {
    await expectRejected("POST sin método de pago se rechaza", path, { mode, amount: 5000, frequency: "Mensual" });
  }
}

console.log("\n# General");
await expectRejected("POST con modo inválido se rechaza", `/api/flow/gestion-donacion/${VALID_SHAPED_ID}`, { mode: "otro", amount: 5000, frequency: "Mensual" });
const badMode = await getJson(`/api/flow/gestion-donacion/${VALID_SHAPED_ID}?mode=otro`);
report(badMode.status === 400 && badMode.json?.error === true, "GET con modo inválido se rechaza", `${badMode.status}`);

console.log(`\n${passed} OK, ${failed} fallaron, ${skipped} omitidas`);
process.exit(failed > 0 ? 1 : 0);
