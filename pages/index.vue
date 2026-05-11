<script setup lang="ts">
/**
 * Onboarding landing.
 *
 * Three progressive steps:
 *
 *   1. **Variables de entorno**: queries `/api/onboarding/env` (server
 *      reads `useRuntimeConfig()` and reports booleans only). Step is
 *      "done" when all 5 are set.
 *
 *   2. **Probar los flujos**: enumerates every page under `pages/flow/`
 *      using `useRouter().getRoutes()`. Each flow declares its title
 *      and description via `definePageMeta({ flowTitle, flowDescription })`
 *      so this list stays in sync without a manifest. The "done"
 *      check is manual (persisted in localStorage) — we can't detect
 *      a successful end-to-end test automatically.
 *
 *   3. **Personalizá**: renders the project `README.md` inline with a
 *      tiny home-grown markdown renderer (see `renderMarkdown`
 *      below). This avoids duplicating instructions in two places
 *      and skips an extra dependency.
 *
 * If you don't want this onboarding (e.g. you've deployed the repo
 * to production and want the landing to redirect somewhere else),
 * replace this whole file with a `<NuxtLink to="/flow/alta-techo">`
 * or whatever your default flow is. Nothing else in the repo depends
 * on this page.
 */
import { computed, onMounted, ref } from "vue";
import readmeMarkdown from "~/README.md?raw";

useHead({ title: "Configurá tu deploy · Debi Forms" });

// ---------------------------------------------------------------------
// Step 1 — env vars
// ---------------------------------------------------------------------

type EnvItem = { key: string; set: boolean; source: string; help: string };
type EnvCheck = {
  allOk: boolean;
  missing: string[];
  items: EnvItem[];
};

const { data: envCheck, refresh: refreshEnv } = await useFetch<EnvCheck>(
  "/api/onboarding/env",
);

const envDone = computed(() => envCheck.value?.allOk === true);

// ---------------------------------------------------------------------
// Step 2 — discover flows + persisted "tested" toggle
// ---------------------------------------------------------------------

type Flow = {
  path: string;
  url: string;
  title: string;
  description: string;
  needsParam: boolean;
};

const router = useRouter();
const flows = computed<Flow[]>(() => {
  return router
    .getRoutes()
    .filter((r) => r.path.startsWith("/flow/") && r.path !== "/flow")
    .map((r) => {
      const needsParam = r.path.includes(":");
      // Replace `:oppId` etc. with a placeholder so the URL string in the
      // UI is copy-pasteable; the actual link target uses the original.
      const url = needsParam
        ? r.path.replace(/:(\w+)/g, "<$1>")
        : r.path;
      const meta = r.meta as {
        flowTitle?: string;
        flowDescription?: string;
      };
      // Fallbacks let a flow page omit the meta and still get a row
      // here — useful while you're scaffolding a new flow.
      const fallbackTitle = r.path
        .replace(/^\/flow\//, "")
        .replace(/\/.*$/, "")
        .replaceAll("-", " ");
      return {
        path: r.path,
        url,
        title: meta.flowTitle ?? fallbackTitle,
        description:
          meta.flowDescription ??
          "Sin descripción. Agregá `definePageMeta({ flowTitle, flowDescription })` en el .vue del flow para personalizar este texto.",
        needsParam,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
});

const TESTED_STORAGE_KEY = "debi-forms.onboarding.flowsTested";
const CUSTOMIZED_STORAGE_KEY = "debi-forms.onboarding.customized";
const flowsTested = ref(false);
const customized = ref(false);

onMounted(() => {
  flowsTested.value =
    globalThis.localStorage?.getItem(TESTED_STORAGE_KEY) === "1";
  customized.value =
    globalThis.localStorage?.getItem(CUSTOMIZED_STORAGE_KEY) === "1";
});

function toggleTested() {
  flowsTested.value = !flowsTested.value;
  globalThis.localStorage?.setItem(
    TESTED_STORAGE_KEY,
    flowsTested.value ? "1" : "0",
  );
}

function toggleCustomized() {
  customized.value = !customized.value;
  globalThis.localStorage?.setItem(
    CUSTOMIZED_STORAGE_KEY,
    customized.value ? "1" : "0",
  );
}

// ---------------------------------------------------------------------
// Step 3 — render the README inline
// ---------------------------------------------------------------------

const readmeOpen = ref(false);

/**
 * Minimal markdown-to-HTML converter. Handles the subset of CommonMark
 * the project's `README.md` actually uses: headings, paragraphs, fenced
 * code blocks, inline code, bold, italic, links, ordered/unordered
 * lists, blockquotes, tables, horizontal rules.
 *
 * We deliberately don't pull in `marked` / `markdown-it` to keep the
 * deploy zero-extra-deps. README content is controlled by us, so the
 * limited feature set is fine. If you want full CommonMark / GFM
 * support, swap this for `marked.parse(readmeMarkdown, { gfm: true })`
 * after `npm install marked` — the rest of the page stays identical.
 */
function renderMarkdown(md: string): string {
  const escapeHtml = (s: string): string =>
    s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  // Stash fenced code blocks first so inline markdown doesn't touch them.
  const codeBlocks: string[] = [];
  let s = md.replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    (_, _lang: string, code: string) => {
      const idx = codeBlocks.length;
      codeBlocks.push(
        `<pre class="md-pre"><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`,
      );
      return `\u0000CODE${idx}\u0000`;
    },
  );

  // Inline span replacements: bold, italic, code, links, autolinks.
  const inline = (line: string): string =>
    line
      .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>")
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
      )
      .replace(
        /<(https?:\/\/[^>]+)>/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
      );

  // Tables. Detect a header row + separator + body rows.
  s = s.replace(
    /(^\|.+\|\n\|[-:\s|]+\|\n(?:\|.+\|\n?)+)/gm,
    (block) => {
      const rows = block.trim().split("\n");
      const header = rows[0]
        .split("|")
        .slice(1, -1)
        .map((c) => `<th>${inline(c.trim())}</th>`)
        .join("");
      const body = rows
        .slice(2)
        .map((r) => {
          const cells = r
            .split("|")
            .slice(1, -1)
            .map((c) => `<td>${inline(c.trim())}</td>`)
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");
      return `<table class="md-table"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
    },
  );

  // Headings.
  s = s.replace(/^###### (.+)$/gm, "<h6>$1</h6>");
  s = s.replace(/^##### (.+)$/gm, "<h5>$1</h5>");
  s = s.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
  s = s.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  s = s.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  s = s.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Horizontal rule.
  s = s.replace(/^---+$/gm, "<hr>");

  // Unordered lists.
  s = s.replace(/((?:^- .+(?:\n|$))+)/gm, (m) => {
    const items = m
      .trim()
      .split("\n")
      .map((line) => `<li>${inline(line.replace(/^- /, ""))}</li>`)
      .join("");
    return `<ul class="md-ul">${items}</ul>\n`;
  });

  // Ordered lists.
  s = s.replace(/((?:^\d+\. .+(?:\n|$))+)/gm, (m) => {
    const items = m
      .trim()
      .split("\n")
      .map(
        (line) =>
          `<li>${inline(line.replace(/^\d+\. /, ""))}</li>`,
      )
      .join("");
    return `<ol class="md-ol">${items}</ol>\n`;
  });

  // Blockquotes (1 level deep).
  s = s.replace(/((?:^> .*(?:\n|$))+)/gm, (m) => {
    const text = m
      .split("\n")
      .map((l) => l.replace(/^> ?/, ""))
      .join(" ")
      .trim();
    return `<blockquote class="md-quote">${inline(text)}</blockquote>\n`;
  });

  // Paragraphs: anything that's still raw text becomes <p>.
  s = s
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (/^<(h\d|ul|ol|table|blockquote|pre|hr)/.test(trimmed)) return trimmed;
      if (trimmed.startsWith("\u0000CODE")) return trimmed;
      return `<p>${inline(trimmed.replace(/\n/g, " "))}</p>`;
    })
    .join("\n\n");

  // Restore stashed code blocks.
  s = s.replace(/\u0000CODE(\d+)\u0000/g, (_, i: string) => codeBlocks[+i]);

  return s;
}

const readmeHtml = computed(() => renderMarkdown(readmeMarkdown));

// ---------------------------------------------------------------------
// Aggregate progress
// ---------------------------------------------------------------------

const completedSteps = computed(() => {
  let n = 0;
  if (envDone.value) n++;
  if (envDone.value && flowsTested.value) n++;
  if (envDone.value && flowsTested.value && customized.value) n++;
  return n;
});
const totalSteps = 3;
</script>

<template>
  <main class="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
    <header class="mb-6 space-y-2">
      <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Onboarding · {{ completedSteps }} de {{ totalSteps }} listos
      </p>
      <h1 class="text-xl font-semibold text-foreground sm:text-2xl">
        Configurá tu deploy
      </h1>
      <p class="text-sm leading-relaxed text-muted-foreground">
        Esta pantalla te guía en los 3 pasos que faltan para tener los
        formularios funcionando contra tu Salesforce. Apenas termines,
        podés borrar este archivo (<code class="rounded bg-muted px-1 py-0.5 text-xs">pages/index.vue</code>)
        o reemplazarlo por un redirect a tu flow principal.
      </p>
    </header>

    <!-- ============================================================== -->
    <!-- Step 1 — env vars                                                 -->
    <!-- ============================================================== -->
    <section
      class="mb-4 rounded-xl border border-border bg-background p-4 sm:p-5"
      :aria-label="`Paso 1: variables de entorno (${envDone ? 'listo' : 'pendiente'})`"
    >
      <header class="flex items-start gap-3">
        <span
          :class="[
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
            envDone
              ? 'bg-primary text-primary-foreground'
              : 'border-2 border-border bg-background text-muted-foreground',
          ]"
        >
          <span v-if="envDone" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="h-4 w-4 fill-current">
              <path d="M9 16.2l-3.5-3.5-1.4 1.4L9 19l11-11-1.4-1.4z" />
            </svg>
          </span>
          <span v-else>1</span>
        </span>
        <div class="flex-1 space-y-1">
          <h2 class="text-sm font-semibold text-foreground">
            Variables de entorno
          </h2>
          <p class="text-sm leading-relaxed text-muted-foreground">
            <template v-if="envDone">
              Las 5 variables obligatorias están seteadas. Podés pasar al
              paso 2.
            </template>
            <template v-else>
              Te faltan
              <strong>{{ envCheck?.missing.length ?? 5 }}</strong>
              variables. Completalas en
              <strong>Vercel → Project → Settings → Environment Variables</strong>
              y volvé a esta pantalla.
            </template>
          </p>
        </div>
        <button
          type="button"
          class="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
          @click="refreshEnv()"
        >
          Reintentar
        </button>
      </header>

      <ul class="mt-4 space-y-2">
        <li
          v-for="item in envCheck?.items ?? []"
          :key="item.key"
          class="rounded-lg border border-border bg-muted/30 p-3"
        >
          <div class="flex items-center gap-2">
            <span
              :class="[
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                item.set
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-background text-muted-foreground',
              ]"
              aria-hidden="true"
            >
              <span v-if="item.set">✓</span>
              <span v-else>·</span>
            </span>
            <code class="font-mono text-xs font-semibold text-foreground">{{ item.key }}</code>
            <span class="ml-auto text-xs text-muted-foreground">
              {{ item.source }}
            </span>
          </div>
          <p v-if="!item.set" class="mt-1.5 ml-6 text-xs leading-relaxed text-muted-foreground">
            {{ item.help }}
          </p>
        </li>
      </ul>

      <div
        v-if="!envDone"
        class="mt-3 rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground"
      >
        Si estás usando un agente (Cursor, Vercel v0, Copilot Chat),
        pegale el contenido de
        <code class="rounded bg-background px-1 py-0.5">AGENTS.md</code>
        y va a saber qué URLs visitar para conseguir cada variable.
      </div>
    </section>

    <!-- ============================================================== -->
    <!-- Step 2 — probar los flujos                                       -->
    <!-- ============================================================== -->
    <section
      :class="[
        'mb-4 rounded-xl border border-border bg-background p-4 sm:p-5 transition',
        !envDone && 'opacity-60',
      ]"
      :aria-disabled="!envDone || undefined"
      :aria-label="`Paso 2: probar los flujos (${envDone && flowsTested ? 'listo' : 'pendiente'})`"
    >
      <header class="flex items-start gap-3">
        <span
          :class="[
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
            envDone && flowsTested
              ? 'bg-primary text-primary-foreground'
              : 'border-2 border-border bg-background text-muted-foreground',
          ]"
        >
          <span v-if="envDone && flowsTested" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="h-4 w-4 fill-current">
              <path d="M9 16.2l-3.5-3.5-1.4 1.4L9 19l11-11-1.4-1.4z" />
            </svg>
          </span>
          <span v-else>2</span>
        </span>
        <div class="flex-1 space-y-1">
          <h2 class="text-sm font-semibold text-foreground">
            Probá los flujos
          </h2>
          <p class="text-sm leading-relaxed text-muted-foreground">
            Hacé al menos una vez cada flow de punta a punta. Después
            verificá en Salesforce que se haya creado el Contact, la
            Opportunity, la Recurring Donation y el método de pago. Más
            detalle en la sección
            <strong>"Probá los flujos"</strong> del README (paso 3).
          </p>
        </div>
      </header>

      <ul class="mt-4 space-y-2">
        <li
          v-for="flow in flows"
          :key="flow.path"
          class="rounded-lg border border-border bg-muted/30 p-3"
        >
          <div class="flex flex-wrap items-start gap-2">
            <div class="min-w-0 flex-1 space-y-1">
              <p class="text-sm font-semibold text-foreground">
                {{ flow.title }}
              </p>
              <p class="text-xs leading-relaxed text-muted-foreground">
                {{ flow.description }}
              </p>
              <p
                class="truncate font-mono text-[11px] text-muted-foreground/80"
                :title="flow.url"
              >
                {{ flow.url }}
              </p>
            </div>
            <template v-if="flow.needsParam">
              <span
                class="rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground"
              >
                Requiere id real
              </span>
            </template>
            <NuxtLink
              v-else
              :to="flow.path"
              target="_blank"
              class="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              Probar
            </NuxtLink>
          </div>
        </li>
        <li v-if="flows.length === 0" class="text-xs text-muted-foreground">
          No detectamos flujos en
          <code class="rounded bg-muted px-1 py-0.5">pages/flow/</code>.
          Agregá un `.vue` ahí y refrescá la pantalla.
        </li>
      </ul>

      <label
        class="mt-3 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"
      >
        <input
          type="checkbox"
          :checked="flowsTested"
          :disabled="!envDone"
          class="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary/30"
          @change="toggleTested"
        />
        <span>
          Probé los flujos y verifiqué los registros en Salesforce.
        </span>
      </label>
    </section>

    <!-- ============================================================== -->
    <!-- Step 3 — personalizá                                             -->
    <!-- ============================================================== -->
    <section
      :class="[
        'mb-4 rounded-xl border border-border bg-background p-4 sm:p-5 transition',
        !(envDone && flowsTested) && 'opacity-60',
      ]"
      :aria-disabled="!(envDone && flowsTested) || undefined"
      :aria-label="`Paso 3: personalizá según necesidades (${envDone && flowsTested && customized ? 'listo' : 'pendiente'})`"
    >
      <header class="flex items-start gap-3">
        <span
          :class="[
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
            envDone && flowsTested && customized
              ? 'bg-primary text-primary-foreground'
              : 'border-2 border-border bg-background text-muted-foreground',
          ]"
        >
          <span v-if="envDone && flowsTested && customized" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="h-4 w-4 fill-current">
              <path d="M9 16.2l-3.5-3.5-1.4 1.4L9 19l11-11-1.4-1.4z" />
            </svg>
          </span>
          <span v-else>3</span>
        </span>
        <div class="flex-1 space-y-1">
          <h2 class="text-sm font-semibold text-foreground">
            Adaptá los flujos a tu organización
          </h2>
          <p class="text-sm leading-relaxed text-muted-foreground">
            Cambiá colores, copy, presets de monto y campos. Agregá flows
            nuevos copiando archivos. Todo está explicado en el README
            del repo — para no repetirlo, te lo mostramos acá abajo
            directamente.
          </p>
        </div>
        <button
          type="button"
          class="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
          @click="readmeOpen = !readmeOpen"
        >
          {{ readmeOpen ? "Ocultar README" : "Ver README" }}
        </button>
      </header>

      <div
        v-if="readmeOpen"
        class="readme mt-4 rounded-lg border border-border bg-muted/30 p-4 sm:p-5"
      >
        <!-- README rendered via the home-grown markdown above. The HTML
             is generated from our own controlled `README.md`, so v-html
             is safe here. Don't pass user-supplied markdown through
             this code path without sanitization. -->
        <div v-html="readmeHtml"></div>
      </div>

      <label
        class="mt-3 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"
      >
        <input
          type="checkbox"
          :checked="customized"
          :disabled="!(envDone && flowsTested)"
          class="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary/30"
          @change="toggleCustomized"
        />
        <span>
          Personalicé colores/copy/flujos según las necesidades de mi
          organización.
        </span>
      </label>
    </section>

    <p class="mt-6 text-xs leading-relaxed text-muted-foreground">
      Una vez que terminás los 3 pasos, podés borrar
      <code class="rounded bg-muted px-1 py-0.5">pages/index.vue</code>
      (esta pantalla) o reemplazarla por un redirect a tu flow principal
      — el resto del repo no depende de ella.
    </p>
  </main>
</template>

<style scoped>
/*
  Tiny prose styles for the rendered README. We intentionally don't pull
  in `@tailwindcss/typography` (it's heavy and v4 still needs separate
  setup). These rules cover the subset of markdown the renderer above
  actually emits.
*/
.readme :deep(h1) {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 1.25rem 0 0.5rem;
  color: var(--foreground);
}
.readme :deep(h1:first-child) {
  margin-top: 0;
}
.readme :deep(h2) {
  font-size: 1.05rem;
  font-weight: 600;
  margin: 1.25rem 0 0.5rem;
  color: var(--foreground);
}
.readme :deep(h3) {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 1rem 0 0.4rem;
  color: var(--foreground);
}
.readme :deep(h4),
.readme :deep(h5),
.readme :deep(h6) {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0.75rem 0 0.3rem;
  color: var(--foreground);
}
.readme :deep(p) {
  font-size: 0.875rem;
  line-height: 1.65;
  margin: 0 0 0.75rem;
  color: var(--foreground);
}
.readme :deep(strong) {
  font-weight: 600;
  color: var(--foreground);
}
.readme :deep(em) {
  font-style: italic;
}
.readme :deep(.md-code) {
  font-family: var(--font-mono-stack);
  font-size: 0.75rem;
  padding: 0.1rem 0.3rem;
  border-radius: 0.25rem;
  background: var(--muted);
  color: var(--foreground);
}
.readme :deep(.md-pre) {
  font-family: var(--font-mono-stack);
  font-size: 0.75rem;
  line-height: 1.55;
  padding: 0.75rem;
  border-radius: 0.5rem;
  background: var(--muted);
  color: var(--foreground);
  overflow-x: auto;
  margin: 0.75rem 0;
}
.readme :deep(.md-pre code) {
  background: transparent;
  padding: 0;
  border-radius: 0;
}
.readme :deep(.md-ul),
.readme :deep(.md-ol) {
  padding-left: 1.25rem;
  margin: 0 0 0.75rem;
  font-size: 0.875rem;
  line-height: 1.6;
}
.readme :deep(.md-ul) {
  list-style: disc;
}
.readme :deep(.md-ol) {
  list-style: decimal;
}
.readme :deep(.md-ul li),
.readme :deep(.md-ol li) {
  margin-bottom: 0.25rem;
}
.readme :deep(.md-quote) {
  border-left: 3px solid color-mix(in srgb, var(--primary) 60%, transparent);
  padding: 0.25rem 0 0.25rem 0.75rem;
  margin: 0.75rem 0;
  color: var(--muted-foreground);
  font-size: 0.875rem;
  line-height: 1.6;
}
.readme :deep(.md-table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
  margin: 0.75rem 0;
}
.readme :deep(.md-table th),
.readme :deep(.md-table td) {
  border: 1px solid var(--border);
  padding: 0.4rem 0.6rem;
  text-align: left;
  vertical-align: top;
}
.readme :deep(.md-table th) {
  background: var(--muted);
  font-weight: 600;
}
.readme :deep(a) {
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.readme :deep(hr) {
  border: 0;
  border-top: 1px solid var(--border);
  margin: 1rem 0;
}
</style>
