# Formularios de gestión de donación

Guía de los tres formularios que se mandan por mail a donantes que ya
existen en Salesforce:

| Formulario | Para quién | Link |
|---|---|---|
| **Reactivá tu donación** | Donante con una donación mensual cerrada o inactiva | `/flow/gestion-donacion/<id>?mode=update-recurring` |
| **Sumate todos los meses** | Donante que hizo una donación única | `/flow/gestion-donacion/<id>?mode=convert-to-recurring` |
| **Completá tu donación** | Persona que dejó el formulario de alta a mitad de camino | `/flow/gestion-donacion/<id>?mode=abandoned-cart` |

Los tres viven en la misma página (`pages/flow/gestion-donacion/[id].vue`).
Lo que cambia es el `?mode=` y el tipo de Id de Salesforce que va en
`<id>`.

---

## 1. Cómo se usan

### Qué Id va en cada link

| Formulario | `<id>` es el Id de… | Condición para que funcione |
|---|---|---|
| Reactivá tu donación | `npe03__Recurring_Donation__c` | La donación tiene un Contact vinculado. |
| Sumate todos los meses | `Opportunity` | La oportunidad tiene un Contact y **todavía no** tiene una donación recurrente vinculada. |
| Completá tu donación | `TCPagos__Formulario_TC__c` | El formulario tiene `Contacto__c` o, al menos, un email. |

Si el Id no existe o no cumple la condición, el formulario muestra un
mensaje de error y no guarda nada.

### Armar el link en el mail

El link completo es el dominio del sitio más la ruta. En una plantilla
de email de Salesforce se puede armar con el campo de combinación del
Id, por ejemplo:

```
https://donar.miorg.org/flow/gestion-donacion/{!npe03__Recurring_Donation__c.Id}?mode=update-recurring
https://donar.miorg.org/flow/gestion-donacion/{!Opportunity.Id}?mode=convert-to-recurring
https://donar.miorg.org/flow/gestion-donacion/{!TCPagos__Formulario_TC__c.Id}?mode=abandoned-cart
```

La sintaxis exacta del campo de combinación depende de la herramienta
que mande el mail (plantilla clásica, Lightning, Marketing Cloud, etc.).
Lo importante es que el resultado final tenga el Id de 15 o 18
caracteres en lugar de `<id>`.

### Qué ve el donante

- **Reactivá tu donación**: saludo con su nombre, montos de $5.000 a
  $25.000 u otro monto, y método de pago **opcional**. No elige
  frecuencia: queda la que ya tenía.
- **Sumate todos los meses**: saludo con su nombre, monto mensual y
  método de pago **obligatorio**. Siempre queda mensual.
- **Completá tu donación**: saludo con su nombre y el de la
  organización, selector de frecuencia (mensual, trimestral o anual),
  monto y método de pago **obligatorio**.

Los tres terminan con un pie con el correo de contacto.

### Qué cambia en Salesforce al enviar

| Formulario | Qué escribe |
|---|---|
| Reactivá tu donación | Actualiza la Recurring Donation: `npsp__Status__c = Active`, el monto y la frecuencia. Si el donante cargó tarjeta o CBU, crea un `TCPagos__Payment_Method__c` y lo vincula. |
| Sumate todos los meses | Crea un `TCPagos__Payment_Method__c` y una Recurring Donation mensual nueva para el Contact, en la misma moneda que la Opportunity. Vincula las dos a la Opportunity. |
| Completá tu donación | Busca o crea el Contact (por `Contacto__c` o por email), crea el `TCPagos__Payment_Method__c` y actualiza el formulario con monto, frecuencia, método de pago y contacto. El Flow de Salesforce del paquete crea el resto. |

Si el guardado falla después de crear el método de pago (por ejemplo, por
una regla de validación), el formulario borra lo que creó en ese intento
y muestra el error de Salesforce. El error también queda en el log del
servidor como `[gestion-donacion] submit failed`.

#### Campos de reactivación

Cuando la Recurring Donation no estaba `Active`, **Reactivá tu donación**
también completa estos campos, que las reglas de validación exigen para
pasar de `Closed` a `Active`:

| Campo | Valor |
|---|---|
| `Tipo_de_reactivacion__c` | `Recupero` |
| `Sede_que_reactiva__c` | `Oficina Nacional` |
| `Fecha_de_la_reactivaci_n__c` | La fecha del envío (hora de Argentina) |

Los valores están en `REACTIVATION_DEFAULTS`, en
`server/utils/salesforce.ts`. Si tu org no tiene alguno de esos campos,
el formulario lo omite. Si los tiene con otros valores de picklist,
cambialos ahí.

---

## 2. Textos y variables de entorno

Dos variables opcionales cambian textos sin tocar el código. Se cargan
en **Vercel → Project → Settings → Environment Variables** y hacen
efecto en el próximo deploy.

| Variable | Dónde se ve | Ejemplo |
|---|---|---|
| `ORG_CONTACT_EMAIL` | Pie de los tres formularios | `socios.argentina@techo.org` |
| `ORG_NAME` | Saludo de **Completá tu donación** | `TECHO` |

Si quedan vacías, las frases se muestran sin correo o sin nombre.

Además hacen falta las 5 variables obligatorias de siempre
(`SF_INSTANCE_URL`, `SF_REFRESH_TOKEN`, `SF_LOGIN_URL`,
`DEBI_PUBLIC_KEY`, `DEBI_SECRET_KEY`). `SF_CONNECTOR_KEY` no se usa en
estos formularios.

El resto de los textos (títulos, botones, montos, mensajes de éxito)
está en `data/gestion-donacion-config.ts`, un bloque por formulario.

---

## 3. Pruebas antes de producción

Hay dos niveles: uno automático que no escribe nada y una prueba real
de punta a punta.

### 3.1 Prueba automática (no escribe en Salesforce)

`scripts/smoke-gestion.mjs` comprueba, para cada formulario:

- que la página y la API carguen un registro real;
- que un Id inexistente devuelva error;
- que los envíos inválidos (monto 0, sin frecuencia, token mal formado,
  sin método de pago cuando es obligatorio, modo inválido) se rechacen.

Todos los envíos del script son inválidos a propósito. La API los
rechaza antes de llegar a Salesforce o a Debi.

```bash
BASE_URL=http://localhost:3001 \
RD_ID=<Id de una Recurring Donation> \
OPP_ID=<Id de una Opportunity> \
FORM_ID=<Id de un TCPagos__Formulario_TC__c> \
node scripts/smoke-gestion.mjs
```

En PowerShell:

```powershell
$env:BASE_URL="http://localhost:3001"
$env:RD_ID="<Id de una Recurring Donation>"
$env:OPP_ID="<Id de una Opportunity>"
$env:FORM_ID="<Id de un TCPagos__Formulario_TC__c>"
node scripts/smoke-gestion.mjs
```

`BASE_URL` puede ser el local o la URL de un Preview de Vercel. Al
final imprime cuántas pruebas pasaron. Si alguna falla, sale con
código 1.

### 3.2 Prueba real de punta a punta

Esta prueba **sí escribe en Salesforce** y, con claves `pk_live`,
registra un método de pago real. Conviene hacerla en un sandbox o con
registros de prueba creados para eso, nunca con donantes reales.

Preparar un registro de prueba por formulario:

| Formulario | Registro a preparar |
|---|---|
| Reactivá tu donación | Un Contact de prueba con una Recurring Donation en estado cerrado. |
| Sumate todos los meses | Un Contact de prueba con una Opportunity de donación única, sin Recurring Donation vinculada. |
| Completá tu donación | Un `TCPagos__Formulario_TC__c` con nombre, apellido y un email de prueba, sin método de pago. |

Abrir cada link, completar el formulario y verificar en Salesforce:

**Reactivá tu donación**

- [ ] La página saluda con el nombre del Contact.
- [ ] Al enviar sin método de pago, aparece el mensaje de éxito.
- [ ] La Recurring Donation quedó en `Active` con el monto elegido.
- [ ] Si estaba `Closed`: tiene Tipo de reactivación `Recupero`, Sede `Oficina Nacional` y la fecha de hoy.
- [ ] La frecuencia no cambió.
- [ ] Repetir cargando tarjeta o CBU: hay un `TCPagos__Payment_Method__c` nuevo vinculado a la Recurring Donation.

**Sumate todos los meses**

- [ ] La página saluda con el nombre del Contact.
- [ ] Sin método de pago, no deja enviar.
- [ ] Con método de pago, aparece el mensaje de éxito.
- [ ] Hay una Recurring Donation nueva, mensual, con el monto elegido y el Contact correcto.
- [ ] La Opportunity quedó vinculada a esa Recurring Donation y al método de pago nuevo.
- [ ] Volver a abrir el mismo link y enviar: muestra que la oportunidad ya tiene una donación recurrente.

**Completá tu donación**

- [ ] La página saluda con el nombre y con `ORG_NAME`.
- [ ] El selector de frecuencia arranca en la frecuencia guardada (o en Mensual).
- [ ] Sin método de pago, no deja enviar.
- [ ] Con método de pago, aparece el mensaje de éxito.
- [ ] El formulario quedó con monto, frecuencia, método de pago y `Contacto__c`.
- [ ] Salesforce aceptó el valor de frecuencia (Mensual, Trimestral o Anual) en la lista de selección.
- [ ] El Flow del paquete creó la Recurring Donation y la Opportunity.

En los tres:

- [ ] El pie muestra `ORG_CONTACT_EMAIL` y el link abre el cliente de correo.
- [ ] Se ve bien en el celular.

Al terminar, borrar o cerrar los registros de prueba y dar de baja los
métodos de pago de prueba en Debi.

---

## 4. Pasar a producción

1. Commitear y pushear los cambios a la rama del repo conectada a Vercel.
2. Vercel arma un **Preview**. Correr ahí la prueba automática con
   `BASE_URL=<url-del-preview>`.
3. Cargar `ORG_CONTACT_EMAIL` y `ORG_NAME` en Vercel para el entorno
   **Production** (y en **Preview**, si se quiere probar con los
   mismos textos).
4. Hacer la prueba real de la sección 3.2.
5. Promover el deploy a producción (o mergear a `main`).
6. Abrir la página de inicio del sitio: tienen que aparecer las tres
   tarjetas nuevas con su link.

---

## 5. Si tu organización ya tiene el repositorio

Si ya hiciste fork de `debipro/forms-salesforce` y lo tenés deployado,
estos formularios llegan como una actualización del repo original.

### 5.1 Traer la actualización

Configurar el repo original como `upstream` (solo la primera vez):

```bash
git remote add upstream https://github.com/debipro/forms-salesforce.git
```

Traerla en una rama aparte, para revisarla antes de publicar:

```bash
git fetch upstream
git checkout -b gestion-donacion
git merge upstream/main
git push -u origin gestion-donacion
```

Abrir un Pull Request de `gestion-donacion` a `main` en GitHub. Vercel
arma un Preview de esa rama para probar antes de mergear.

### 5.2 Qué archivos trae

Archivos **nuevos**, que no deberían dar conflicto:

- `pages/flow/gestion-donacion/[id].vue`
- `server/api/flow/gestion-donacion/[id].get.ts`
- `server/api/flow/gestion-donacion/[id].post.ts`
- `data/gestion-donacion-config.ts`
- `scripts/smoke-gestion.mjs`
- `docs/gestion-donacion.md`

Archivos **modificados**, que pueden dar conflicto si los personalizaste:

| Archivo | Qué cambió |
|---|---|
| `server/utils/salesforce.ts` | Se agregaron funciones al final para los tres modos. Si cambiaste `FIELD_MAP`, conservá tus valores. |
| `components/steps/AmountStep.vue` | Nuevo prop opcional `frequencyLabel`. |
| `components/fields/FieldButtonGroup.vue` | La etiqueta se oculta si viene vacía. |
| `nuxt.config.ts` | Lee `ORG_CONTACT_EMAIL` y `ORG_NAME`. |
| `pages/index.vue` | Lista los tres formularios nuevos. |
| `README.md`, `.env.example` | Documentación y variables nuevas. |

Si Git marca conflictos, abrir cada archivo, quedarse con tus cambios
más las partes nuevas, y después `git add <archivo>` y `git commit`.

### 5.3 Después de mergear

1. Cargar `ORG_CONTACT_EMAIL` y `ORG_NAME` en Vercel.
2. Redeployar.
3. Correr la prueba automática contra el sitio.
4. Hacer la prueba real con registros de prueba.
5. Empezar a mandar los links por mail.

Los formularios no afectan a los flujos que ya usás. Si no mandás los
links, nadie llega a ellos.
