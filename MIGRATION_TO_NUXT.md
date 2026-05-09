# `forms-org` — customer template (Nuxt 3)

This is the **target repo** of a migration. It is currently empty (other
than this document). The goal is to build a Nuxt 3 + Vue 3 customer
template here, porting logic from the old Next.js implementation. Read
this document end-to-end before writing any code. Every constraint is a
deliberate decision, not a default.

---

## 0. Related repositories

There are three repos in the `debipro` GitHub org that you need to keep
straight. Local paths are how this user organizes them on disk; folder
names carry the `debi-` prefix locally but the GitHub repos do not (the
`debipro` org already implies it).

| GitHub | Local path | Stack | Purpose | Status |
|---|---|---|---|---|
| **`debipro/forms-org`** | `~/sites/debi-forms-org` | Nuxt 3 + Vue 3 (planned) | **This repo.** Customer template forked once per non-profit. Forked, deployed to Vercel, never updated upstream. | Empty; build it here. |
| `debipro/forms-vercel` | `~/sites/debi-forms-vercel` | Next.js 16 + React 19 | The original customer template. The implementation being **replaced** by this repo. Port its logic, do not depend on it at runtime. | Working; will be deprecated once this repo is ready. |
| `debipro/forms` | `~/sites/debi-forms` | Nuxt 3 + Vue 3 | Central Salesforce onboarding helper. Operated by Debi (single deployment for all customers). Hands customers their `SF_*` env vars via OAuth. **Not a dependency** of this repo. | Working. |

Why three? Two distinct deployment models that must stay separated:

- `forms` is **Debi-operated**, lives at a Debi-controlled URL, runs the
  OAuth dance for any customer. Don't touch it from here.
- `forms-org` (this repo) and `forms-vercel` are **customer-operated**: each
  non-profit forks one of them, deploys to their own Vercel, owns the fork
  forever. Today `forms-vercel` is the live one; this repo will replace it.

What this repo **shares** with the others:

- The Salesforce Connected App's Consumer Key (a constant in the source
  code, see §5). The same Connected App handles OAuth in `forms` and
  refresh tokens in `forms-vercel`/`forms-org`.
- A high-level visual style (primary color, font), but no shared CSS or
  component library — copy-paste, don't import.

What this repo **does not share**:

- No npm package, no git submodule, no Nuxt layer, no monorepo with the
  other two. Independence is intentional. See §3 for the anti-goals.

## 1. Who the customer is

The "customer" is a **Salesforce admin / non-profit operations person** at a
charity or foundation that uses Salesforce + Debi (a payments processor for
Argentina, https://debi.pro). They are **non-technical**:

- They can fork a GitHub repo and click "Deploy to Vercel".
- They can paste values into the Vercel "Environment Variables" UI.
- They can edit text, colors and copy in code files **with the help of an
  AI assistant** (Cursor, v0, etc.). They do not write code from scratch.
- They will **ask Vercel v0** (the AI built into Vercel's dashboard) to walk
  them through deployment and customization. The README must be written in
  a way that v0 can read and use as a guide.

They typically deploy **once** and keep the deployment running for years.

## 2. What we facilitate

A donation form that donors land on (e.g. `/flow/<opportunityId>`), fill in,
and submit. The submission updates Salesforce (Opportunity + recurring
donation record) and creates a payment method in Debi (tokenizes a card or
CBU and stores the token in a custom Salesforce object).

Today there is **one flow**: "payment-method-change" — donor updates their
amount and optionally their card/CBU. In the future Debi will release more
flows (new donor signup, one-time donation update, etc.).

When a new flow is released, **we hand the customer the bare minimum**:

- One Vue page file (e.g. `pages/flow/new-donor-signup.vue`)
- One server route file (e.g. `server/api/flow/new-donor-signup.post.ts`)
- Optionally one components file if the flow has shared subcomponents

The customer drops these files into their existing fork, commits, pushes,
and Vercel auto-deploys. **That is the entire update mechanism.**

## 3. What we explicitly do NOT do

These are non-goals. Do **not** introduce them, even if they seem helpful:

- ❌ **No Nuxt layers.** No `extends:` in `nuxt.config.ts`. The whole project
  has to be visible in the customer's repo. No magic indirection.
- ❌ **No npm package** for shared code, templates, or flows. We do not
  publish to a registry. We do not consume from one.
- ❌ **No git submodules, no fork-syncing automation, no GitHub App, no
  Renovate**. The customer's fork is theirs forever. We do not push to it.
- ❌ **No JSON config files** for "personalization" (no `forms.config.json`,
  no `theme.json`). The customer customizes by editing `.vue` files and
  CSS variables directly.
- ❌ **No per-flow feature flags / env vars** to toggle flows. Every flow
  the customer has installed is active. Removing a flow = deleting its
  files.
- ❌ **No continuous improvement of the boilerplate.** This template ships
  once. We do not maintain a stream of upstream commits the customer needs
  to absorb. If a security fix is critical, we tell them to update the
  affected file and they paste the new content in.

The mental model is: **this template is a starter, not a framework**. After
the customer deploys, the template is "their code". They own it. We send
them new files when we release new flows; that's the whole relationship.

## 4. Architecture target

### Stack

- **Nuxt 3**, latest stable (currently 3.15+).
- **Vue 3** with `<script setup>`.
- **TypeScript**.
- **Tailwind 4** via `@nuxtjs/tailwindcss` or via `@import "tailwindcss"`
  in CSS (mirroring the current `globals.css` setup; whichever the agent
  finds cleanest with Tailwind 4 + Nuxt 3).
- **`jsforce`** for Salesforce (works server-side, framework-agnostic).
- **Debi JS SDK** loaded from `https://js.debi.pro/v1/` (client-side, via
  `app.head.script` in `nuxt.config.ts`).
- **Input masking**: replace `cleave.js/react` with [`maska`](https://github.com/beholdr/maska)
  (Vue 3 native, tiny, MIT) or plain `cleave.js` with a thin Vue wrapper.
  Pick whatever feels less weird in `<script setup>`.
- **Theme switcher**: use `@nuxtjs/color-mode` if the agent considers it
  worth the dependency, otherwise port the existing manual implementation
  to a `<ClientOnly>` Vue component. Either is fine. Keep light/dark/system.

Deployment target: **Vercel**. Nuxt 3 ships a Vercel preset out of the box,
no config required. The repo will have zero Vercel-specific files.

### File layout

```
debi-forms-org/                     (this repo; root of the customer template)
├── nuxt.config.ts
├── package.json
├── tsconfig.json
├── .env.example                    (5 variables, all documented inline)
├── README.md                       (Spanish, customer-facing, v0-friendly)
├── assets/
│   └── css/
│       └── main.css                (Tailwind import + theme tokens)
├── public/                         (static assets, favicon)
├── pages/
│   ├── index.vue                   (landing: explains URL pattern)
│   └── flow/
│       └── [oppId].vue             (default flow: payment-method-change)
├── server/
│   ├── api/
│   │   └── flow/
│   │       ├── [oppId].get.ts      (GET handler — reads Opportunity)
│   │       └── [oppId].post.ts     (POST handler — submits update)
│   └── utils/
│       └── salesforce.ts           (port of src/lib/salesforce.ts)
├── components/
│   ├── FlowForm.vue                (port of FlowFormClient.tsx)
│   ├── PaymentMethodForm.vue       (port of PaymentMethodForm.tsx)
│   └── ThemeSwitcher.vue
└── composables/
    └── useDebiClient.ts            (port of src/lib/debi-client.ts)
```

**Drop-in flow contract**: when Debi releases a new flow called
`new-donor-signup`, the customer adds:

- `pages/flow/new-donor-signup.vue`
- `server/api/flow/new-donor-signup.post.ts` (and `.get.ts` if needed)

That's the whole "delivery". Two or three files, copied as-is. They start
working immediately, and the customer can edit them visually as a starting
template.

For this contract to hold, every flow file must:

- Be self-contained: its own state, its own UI, its own validation. **It
  may import from `server/utils/salesforce.ts`, `composables/useDebiClient.ts`,
  and `components/PaymentMethodForm.vue`** (the shared primitives), but
  nothing else.
- Not require a config file change to register. Nuxt's filesystem routing
  handles it automatically.
- Not require an env var change to activate.

## 5. Environment variables — exactly five

The customer pastes these five values into Vercel → Settings → Environment
Variables, and **nothing else**. No optional variables. No advanced flags.
No "for sandboxes use…" footnotes. Five pastes, deploy, done.

| Variable | Required | Source |
|---|---|---|
| `SF_INSTANCE_URL` | yes | Debi onboarding helper (URL provided by Debi support) |
| `SF_REFRESH_TOKEN` | yes | Debi onboarding helper |
| `SF_LOGIN_URL` | yes | Debi onboarding helper (`https://login.salesforce.com` for prod, `https://test.salesforce.com` for sandbox) |
| `DEBI_PUBLIC_KEY` | yes | Customer's developer panel at https://debi.pro/dashboard/developers (the `pk_live_*` value — used in the browser to tokenize cards/CBUs) |
| `DEBI_SECRET_KEY` | yes | Customer's developer panel at https://debi.pro/dashboard/developers (the `sk_live_*` value — server-side only, used by current and future flows that talk to Debi from the backend) |

`SF_LOGIN_URL` is **mandatory in this template**, even though it has a
sensible default. Reason: making it mandatory removes the "if you have a
sandbox, also set..." asterisk that confuses non-technical users. The Debi
onboarding helper already gives them the right value, so the customer just
copies it.

**Why these names don't follow the `NUXT_PUBLIC_*` convention.** The names
are intentionally framework-agnostic so the customer never sees framework
details. This means Nuxt's auto-mapping of `NUXT_PUBLIC_*` env vars into
`runtimeConfig.public` does not apply, so the agent must wire each variable
explicitly in `nuxt.config.ts` using `process.env`:

```ts
export default defineNuxtConfig({
  runtimeConfig: {
    sfInstanceUrl: process.env.SF_INSTANCE_URL,
    sfRefreshToken: process.env.SF_REFRESH_TOKEN,
    sfLoginUrl: process.env.SF_LOGIN_URL,
    debiSecretKey: process.env.DEBI_SECRET_KEY,
    public: {
      debiPublicKey: process.env.DEBI_PUBLIC_KEY,
    },
  },
})
```

The browser then accesses the publishable key via
`useRuntimeConfig().public.debiPublicKey`. Server-only secrets stay on
`runtimeConfig` (top-level) and are never sent to the client.

### Variables to **remove** during migration

The current Next.js `.env.example` lists these — **delete them, do not port**:

- `SF_FIELD_MAP` — too complex for non-technical users. Inline the default
  NPSP field map directly in `server/utils/salesforce.ts` as a const. If
  a customer with non-standard field names appears in the future, they
  edit that const in their fork. (Bonus: this removes ~50 lines of JSON
  parsing/validation code from `field-map.ts`.)
- `NEXT_PUBLIC_DEBI_ENDPOINT` — never used in practice; SDK has a sane
  default.

Note: `DEBI_SECRET_KEY` was previously listed as "reserved for future
flows" and unused. It is now **promoted to a required env var** — the
customer must always paste it during onboarding, even if no current flow
consumes it. This avoids forcing future flows to ask the customer to add a
new env var when they need a server-side Debi call.

### `SF_CLIENT_ID` stays hardcoded

The Salesforce Connected App's Consumer Key is a constant in the source
code (see `~/sites/debi-forms-vercel/src/lib/salesforce.ts` line 14). Keep
that pattern. The Connected
App is a public client (PKCE-only, no Consumer Secret), so the Consumer Key
is safe to commit.

```ts
const SF_CLIENT_ID =
  "3MVG9rZjd7MXFdLiKsRvnOTkvFUjxpzFwIuGUncX31f4kO7SnP0FvS1Ewo_kGUR.MMiJgLqPOTgKGfGm9GpLk";
```

## 6. Onboarding flow (what the README must explain)

The customer's first-deploy journey, in order:

1. Customer clicks the **"Deploy to Vercel"** button at the top of the
   README. Vercel asks them to fork the repo into their GitHub and pre-fills
   a form with the five env var names empty.
2. Customer pastes five values:
   - To get `SF_INSTANCE_URL`, `SF_REFRESH_TOKEN`, `SF_LOGIN_URL`: the
     README tells them to **ask Debi support for the onboarding URL**, log
     in there with their Salesforce, and the helper returns the three
     values ready to copy.
   - To get `DEBI_PUBLIC_KEY` and `DEBI_SECRET_KEY`: the README points them
     to https://debi.pro/dashboard/developers and tells them to copy both
     the `pk_live_*` (publishable) and the `sk_live_*` (secret) values.
3. Customer clicks Deploy. Two minutes later, the form is live at
   `https://<project>.vercel.app/flow/<opportunityId>`.

### Critical: do NOT hardcode the onboarding URL

The current README references `https://forms.tc-cloud-partners.net/connect`.
**That URL is going to change.** Hosting it might move to a different
domain, or to a Debi subdomain.

Instead, the README must say:

> Pedile a Debi la URL del asistente de onboarding. Te la van a enviar
> directamente. Cuando la abras, te logueás con tu Salesforce y la pantalla
> final te muestra los 3 valores listos para copiar.

This delegates the URL to Debi support, who can hand out whatever URL is
current. Stable instructions, mobile target.

### Vercel v0 prompt (include in README)

The customer will not read 30 sections of docs. They will paste the README
into Vercel v0 (or Cursor) and say "ayudame a deployar esto". Make this
work by:

1. Putting a short prompt at the top of the README they can copy-paste:

   ```markdown
   ## Si vas a usar Vercel v0 o Cursor

   Pegá este texto al chat de IA:

   > Tengo un fork del template `debipro/forms-org`. Ayudame a deployarlo
   > en Vercel. Necesito configurar 5 variables de entorno: SF_INSTANCE_URL,
   > SF_REFRESH_TOKEN, SF_LOGIN_URL, DEBI_PUBLIC_KEY y DEBI_SECRET_KEY.
   > Para los 3 primeros tengo que pedir a Debi la URL del asistente de
   > onboarding y seguir el flujo que ahí me indican. Para los 2 últimos
   > tengo que ir a mi panel de desarrolladores en debi.pro y copiar el
   > pk_live_* (publishable) y el sk_live_* (secret). Guiame paso a paso.
   ```

2. Writing the rest of the README in clean, structured Spanish that
   summarizes what each variable is for. v0 reads READMEs verbatim and
   uses them as context.

## 7. Porting notes (concrete, file-by-file)

The current Next.js source is at `~/sites/debi-forms-vercel/src/`. Read each
file, port to Nuxt as listed:

| Next.js source | Nuxt destination | Notes |
|---|---|---|
| `src/app/layout.tsx` | `app.vue` + `nuxt.config.ts` (head/script) | Move the `theme-init` inline script and the Debi SDK `<script>` to `nuxt.config.ts` `app.head.script`. Move `<ThemeSwitcher>` into the layout used by `app.vue`. |
| `src/app/page.tsx` | `pages/index.vue` | Trivial. |
| `src/app/not-found.tsx` | `error.vue` | Nuxt's convention for 404/error pages. |
| `src/app/globals.css` | `assets/css/main.css` | Keep `:root` and `[data-theme="dark"]` tokens. Tailwind 4 `@theme inline` block stays the same. |
| `src/app/flow/[oppId]/page.tsx` | `pages/flow/[oppId].vue` | Use `useRoute().params.oppId`. |
| `src/app/api/flow/[oppId]/route.ts` | `server/api/flow/[oppId].get.ts` + `server/api/flow/[oppId].post.ts` | Split GET and POST into separate files (Nitro convention). Use `defineEventHandler`, `getRouterParam`, `readBody`, `createError`. |
| `src/lib/salesforce.ts` | `server/utils/salesforce.ts` | Port directly. **Inline the default field map here** (delete `field-map.ts`). Replace `process.env.X` with `useRuntimeConfig().X` if convenient, or keep `process.env` (works in `server/` too). |
| `src/lib/field-map.ts` | (deleted) | Inline its `defaultMap` const into `salesforce.ts`. Drop the env var override. |
| `src/lib/debi-client.ts` | `composables/useDebiClient.ts` | Read the public key from `useRuntimeConfig().public.debiPublicKey`. Same SDK shape (`window.Debi`). |
| `src/lib/theme.ts` | `composables/useThemePreference.ts` (or inline in switcher) | Or replace with `@nuxtjs/color-mode` — agent's call. |
| `src/components/FlowFormClient.tsx` | `components/FlowForm.vue` | Replace `useState/useEffect/useRef` with `ref/onMounted/templateRef`. Replace `<Cleave>` with `maska` directives or equivalent. |
| `src/components/PaymentMethodForm.tsx` | `components/PaymentMethodForm.vue` | Replace `forwardRef + useImperativeHandle` with `defineExpose`. The exposed method is `tokenizeIfApplicable()`. |
| `src/components/ThemeSwitcher.tsx` | `components/ThemeSwitcher.vue` | Trivial port. |
| `src/components/ThemeInitScript.tsx` | inline in `nuxt.config.ts` `app.head.script` (`hid: 'theme-init'`, `body: '...'` runs before hydration) | Or use a Nuxt plugin with `enforce: 'pre'`. |

### Things that don't change

- All UI text stays in Spanish (es-AR). The customer is Argentinian.
- Comments and docs are in English (per workspace `AGENTS.md` rule).
- Default branding: primary color `#0092dd` (Debi blue), Montserrat font.
- The donor URL pattern `/flow/<opportunityId>` is preserved exactly. Any
  customer that already shared a link will not see a 404.
- `SF_CLIENT_ID` constant value (the Connected App's Consumer Key) is
  unchanged.

### Things to drop

- The `package.json` `"name": "sf-flow-app"` is generic. Rename to
  `forms-org` or `@debipro/forms-org` to match repo identity.
- Port script defaults: configure `npm run dev` to bind to port **3001**.
  Reason: `debipro/forms` (the central onboarding, also Nuxt 3) uses port
  3000 with a Salesforce OAuth callback registered for `localhost:3000`. If
  this repo also defaulted to 3000, the user couldn't run both side-by-side
  during development. Set 3001 here in `nuxt.config.ts` (or via
  `--port 3001` in the `dev` script) so both apps coexist on this machine.
  This template's runtime doesn't perform any OAuth callback, so no port
  needs to be registered in Salesforce.
- The legacy `eslint-config-next` and `next` deps. Replace with whatever
  Nuxt 3 ships with by default.
- The `.sfdx/` and `token-response.json` artifacts in the workspace are
  Salesforce CLI scratchpad files; ensure they stay in `.gitignore` (they
  already are).

## 8. Customization model (what the customer touches)

After deploy, the customer customizes by:

| Want to change | Edit |
|---|---|
| Primary color / brand color | `assets/css/main.css` → `--primary` in `:root` and `[data-theme="dark"]` |
| Body font | `assets/css/main.css` → `--font-sans-stack` (and load a different `next/font` equivalent via `nuxt.config.ts` head; or use `@nuxtjs/google-fonts`) |
| UI copy / form labels / instructions | the `.vue` files in `pages/` and `components/` directly |
| Add a new flow | drop in 2-3 new files (page + server route, optionally component) |
| Salesforce field names | edit the inlined map in `server/utils/salesforce.ts` |
| Sentry / analytics | add their own (out of scope for this template) |

There is **no config file** for any of these. Customers (with v0/Cursor's
help) edit Vue/CSS/TS directly. This is intentional: it keeps the surface
area minimal and predictable. Touching real code with AI help is fine
today; trying to invent a JSON DSL just gives the customer two layers
of indirection to misunderstand.

## 9. Boilerplate is shipped once

After the customer deploys, **Debi does not push commits to their fork**.
There is no automation that opens PRs against their fork. There is no
"sync upstream" expectation.

When a new flow is released by Debi:

1. Debi sends the customer 2-3 files via email or via the customer dashboard
   ("here are the files for the new flow X").
2. Customer (or their AI assistant) drops them into their fork.
3. Customer commits + pushes. Vercel deploys.

When Debi makes a security fix to a shared utility (e.g. `salesforce.ts`):

1. Debi posts the new file content publicly (e.g. on docs).
2. Customer copy-pastes the new file content over their old one.
3. Customer commits + pushes. Vercel deploys.

This model has obvious downsides (no reuse mechanism, customers diverge,
fixes are manual). The user has explicitly chosen these trade-offs to keep
the customer's mental model trivially small. **Do not work around this.**

## 10. Out-of-scope for this migration

These are NOT part of the migration; do not invent them:

- A CLI to scaffold new flows.
- A "Deploy a new flow" interactive page in v0.
- A registry of available flows.
- Telemetry / analytics in the template.
- A test suite (we don't have one today; not a goal here).
- A monorepo combining the customer template and the central onboarding.
- A shared utility package between this repo and `debipro/forms` or
  `debipro/forms-vercel` (npm or otherwise).

## 11. Recommended migration order

1. Bootstrap Nuxt 3 + Tailwind 4 + TypeScript in a new folder (or in this
   repo after deleting Next files).
2. Configure `runtimeConfig` for the 5 env vars.
3. Port `assets/css/main.css` (theme tokens) — visual sanity check first.
4. Port `app.vue` + `ThemeSwitcher.vue`.
5. Port `server/utils/salesforce.ts` (with inlined field map).
6. Port `server/api/flow/[oppId].get.ts` + `.post.ts`.
7. Port `composables/useDebiClient.ts`.
8. Port `components/PaymentMethodForm.vue`.
9. Port `components/FlowForm.vue`.
10. Port `pages/flow/[oppId].vue` and `pages/index.vue`.
11. Port `error.vue`.
12. Write `.env.example` with the 5 variables and inline comments.
13. Write the customer-facing README (Spanish, includes Deploy button and
    v0 prompt).
14. Test locally with the test credentials in `.env` (today's `.env` works:
    same Salesforce + Debi account).
15. Delete every Next.js file (`src/`, `next.config.*`, `eslint.config.*`,
    `next-env.d.ts`, `.next/`).
16. Update `package.json` name, scripts, deps.
17. Verify `npm run build` produces a Nuxt build with the Vercel preset.

When done, the repo should have:

- One `nuxt.config.ts`, one `package.json`, one `README.md`.
- 5 env vars documented.
- 1 working flow at `/flow/[oppId]`.
- Drop-in contract documented (in the README and/or a short `add_a_flow.md`).
- Zero references to the old `forms.tc-cloud-partners.net` URL.
- Zero references to `SF_FIELD_MAP`, `DEBI_ENDPOINT`, or `SF_CLIENT_ID` env
  var (the latter is a hardcoded constant, not an env var).

## 12. Useful files to read before starting

### Source repo for the migration: `debipro/forms-vercel` (`~/sites/debi-forms-vercel`)

This is where the working Next.js implementation lives. Port logic from
here. Files worth reading first:

- `AGENTS.md` — workspace rules. Especially the "Branding" section.
- `src/lib/salesforce.ts` — most important file to port; has the
  Connected App constant, the OAuth refresh logic, the SOQL queries, and
  the submission flow. ~330 lines.
- `src/components/FlowFormClient.tsx` — the donor-facing form. ~240 lines.
- `src/components/PaymentMethodForm.tsx` — card/CBU input + Debi
  tokenization. ~250 lines.
- `.env` — has working test credentials for the Techo (Argentinian
  charity) test account. Useful for local dev verification (copy the
  values into this repo's local `.env` once it's scaffolded).

### Reference repo for Nuxt 3 conventions: `debipro/forms` (`~/sites/debi-forms`)

This is the central onboarding helper, **not** the destination of the
migration. It happens to also be Nuxt 3, so its setup is the closest in-org
reference for Nuxt config and dependencies. Files worth peeking at:

- `nuxt.config.ts` — see how an existing Nuxt 3 project in this org is
  configured (modules, runtimeConfig shape, head/script registration).
- `package.json` — Nuxt + dependency versions to mirror.
- `add_new_form.md` — internal docs about how `forms` registers new flows;
  some of the Nuxt patterns transfer, but **do not import or extend from
  `forms`** (per anti-goals in §3).

### Destination of the migration: this repo (`debipro/forms-org`)

That's the repo this document is currently in. Build the new template here.

## 13. Definition of done

The migration is complete when **all** of these are true:

- [ ] Customer can fork the repo, deploy to Vercel by clicking the
      "Deploy" button, paste the 5 env vars, and the donor URL works.
- [ ] The donor URL (`/flow/<oppId>`) renders the same form, behaves the
      same way, and writes to Salesforce + Debi correctly.
- [ ] Theme switching (light/dark/system) works.
- [ ] Tailwind utility classes used in the React version still work in Vue.
- [ ] No Next.js code remains in the repo.
- [ ] No references to `SF_FIELD_MAP`, `NEXT_PUBLIC_DEBI_ENDPOINT`, or
      `forms.tc-cloud-partners.net` remain.
- [ ] README is in Spanish, has the v0 prompt, has the Deploy button, and
      explains the 5 env vars (with "ask Debi for the onboarding URL"
      phrasing for the SF ones).
- [ ] A "how to add a new flow" section (one paragraph + example) exists
      either in README or in a short `add_a_flow.md`. The example is
      something like "create `pages/flow/<name>.vue` and
      `server/api/flow/<name>.post.ts` and they will be live at
      `/flow/<name>` on next deploy."
- [ ] `npm run dev` starts a working dev server on port 3001 (so it
      coexists with `debipro/forms` on 3000).
- [ ] `npm run build` produces a Vercel-ready Nuxt build with no errors.
