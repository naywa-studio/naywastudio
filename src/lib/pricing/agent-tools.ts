/**
 * Naywa Pricing IA — tools déterministes exposés au LLM via function calling.
 *
 * Règle absolue : **le LLM n'effectue jamais d'arithmétique**. Il appelle ces
 * fonctions JS qui s'occupent du calcul exact, basé sur le barème Syntec
 * (docs/syntec-bareme-2026.json) et les inputs collectés auprès du sourceur.
 *
 * L'agent IA pose des questions, retrouve les règles, appelle les compute,
 * et verbalise. Les chiffres sortent toujours d'ici, pas du modèle.
 */

import type { ORTool } from '@/lib/openrouter'
import bareme from './syntec-bareme-2026.json'
import {
  computeEmployerCost,
  computeRuptureScenarios,
  validateAgainstMinimum,
  type PricingInputs,
  type Statut,
  type Modalite,
  type Lieu,
  type Avantages,
  type TypeContrat,
} from './syntec'

/* ──────────────────────────────────────────────────────────────────────────
 * JSON Schemas — les contrats stricts entre le LLM et nos fonctions JS
 * ────────────────────────────────────────────────────────────────────────── */

const PRICING_INPUTS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['brutAnnuel', 'statut', 'position', 'coefficient', 'modalite', 'lieu', 'joursFacturablesParMois'],
  properties: {
    brutAnnuel:     { type: 'number', description: 'Brut annuel négocié avec le candidat (€). Ex: 55000.' },
    statut:         { type: 'string', enum: ['etam', 'etam_assimile_cadre', 'cadre'] },
    position:       { type: 'string', description: 'Position Syntec ex: "2.2", "3.1", "1.4.1".' },
    coefficient:    { type: 'integer', description: 'Coefficient Syntec, ex: 130 (cadre senior), 280 (ETAM coef 275-500).' },
    modalite:       { type: 'string', enum: ['modalite_1', 'modalite_2', 'modalite_3'] },
    lieu:           { type: 'string', enum: ['paris_petite_couronne', 'idf_grande_couronne', 'lyon', 'province'] },
    joursFacturablesParMois: { type: 'number', description: 'Jours facturés moyens / mois. Standard ESN: 17-18.' },
    avantages: {
      type: 'object',
      properties: {
        ticketsResto:                   { type: 'number' },
        mutuellePremium:                { type: 'number' },
        transport:                      { type: 'number' },
        forfaitMobilite:                { type: 'number' },
        treiziemeMois:                  { type: 'boolean' },
        primeCooptationAnnuelle:        { type: 'number' },
        urssafIndemniteJour:            { type: 'number' },
        medecineDuTravailAnnuel:        { type: 'number' },
        indemniteKilometriqueAnnuelle:  { type: 'number' },
        expatriationMensuelle:          { type: 'number' },
        autresMensuels:                 { type: 'number' },
      },
      additionalProperties: false,
    },
  },
}

/* ──────────────────────────────────────────────────────────────────────────
 * Tool definitions surfaced to the LLM
 * ────────────────────────────────────────────────────────────────────────── */

export const PRICING_TOOLS: ORTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_syntec_rule',
      description:
        "Retourne une section du barème Syntec 2026 (convention IDCC 1486). " +
        "Utilise ce tool quand tu as un doute sur une règle légale ou un seuil. " +
        "Catégories disponibles : 'periode_essai', 'preavis_cdi', 'indemnite_licenciement', " +
        "'indemnite_fin_cdd', 'grille_etam_2026', 'grille_cadres_2026', 'cotisations_patronales', " +
        "'prime_vacances_art_31', 'minimums_cnc', '_all_keys' pour lister toutes les clés.",
      parameters: {
        type: 'object',
        required: ['category'],
        properties: {
          category: { type: 'string', description: 'Clé exacte ou "_all_keys".' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compute_employer_cost',
      description:
        "Calcule le coût mensuel total employeur pour un candidat donné " +
        "(brut + 13e + prime vacances + charges patronales + avantages). " +
        "Retourne la breakdown détaillée. À appeler dès que tu as TOUS les inputs.",
      parameters: PRICING_INPUTS_SCHEMA,
    },
  },
  {
    type: 'function',
    function: {
      name: 'compute_rupture_scenarios',
      description:
        "Calcule l'évolution de la marge sur 24 mois pour 3 scénarios rupture " +
        "(nominal sans rupture, préavis 1 mois amiable, préavis Syntec intégral). " +
        "Retourne pour chaque mois t : marge € moyenne et %, cumul €. " +
        "À appeler une fois que tu as les inputs ET le TJM client. " +
        "Le résultat est échantillonné aux mois clés (1, 3, 6, fin_essai, 8, 12, 24).",
      parameters: {
        type: 'object',
        required: ['pricingInputs', 'tjm'],
        properties: {
          pricingInputs: PRICING_INPUTS_SCHEMA,
          tjm:           { type: 'number', description: 'TJM client (€/jour HT).' },
          typeContrat:   { type: 'string', enum: ['cdi', 'cdd'], description: 'Défaut CDI.' },
          dureeCDD:      { type: 'number', description: 'Durée CDD en mois. Requis si typeContrat=cdd.' },
          startMonthIndex: { type: 'integer', minimum: 0, maximum: 11, description: 'Mois calendaire de démarrage (0=jan, 11=déc). Optionnel.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'validate_minimum_conventionnel',
      description:
        "Vérifie que le brut proposé respecte le minimum conventionnel Syntec " +
        "(grille ETAM/Cadre × modalité). Retourne ok + écart si non-conforme.",
      parameters: PRICING_INPUTS_SCHEMA,
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description:
        "Pose UNE question ouverte au sourceur (texte libre) quand tu ne peux vraiment pas déduire " +
        "une info des données déjà fournies. **N'utilise PAS ce tool pour valider des déductions** " +
        "(utilise propose_deductions à la place).",
      parameters: {
        type: 'object',
        required: ['question'],
        properties: {
          question: { type: 'string', description: 'La question en français, claire et courte.' },
          options:  { type: 'array', items: { type: 'string' }, description: 'Optionnel : suggestions de réponses.' },
          reason:   { type: 'string', description: 'Optionnel : pourquoi tu as besoin de cette info.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_deductions',
      description:
        "Présente au sourceur les valeurs que tu AS DÉDUITES depuis le contexte mission + candidat. " +
        "Chaque déduction inclut la valeur, la raison et la source. Le sourceur voit une carte avec " +
        "tous les champs et peut soit tout confirmer en un clic, soit corriger ligne par ligne. " +
        "**APPELLE TOUJOURS CE TOOL EN PREMIER**, avant tout calcul, dès que tu as un contexte " +
        "mission+candidat. La conversation se met en pause jusqu'à la validation du sourceur.",
      parameters: {
        type: 'object',
        required: ['deductions'],
        properties: {
          deductions: {
            type: 'array',
            description: 'Liste des champs déduits. Inclus TOUS les champs nécessaires au calcul, même ceux que tu juges évidents.',
            items: {
              type: 'object',
              required: ['field', 'value', 'reasoning'],
              properties: {
                field:     { type: 'string', description: "Clé du champ : 'statut' | 'position' | 'coefficient' | 'modalite' | 'lieu' | 'brutAnnuel' | 'tjm' | 'typeContrat' | 'dureeMois' | 'treiziemeMois' | 'autre'." },
                label:     { type: 'string', description: 'Libellé lisible en français, ex: "Statut Syntec".' },
                value:     { description: 'Valeur déduite (string ou number selon le champ).' },
                reasoning: { type: 'string', description: 'Phrase courte expliquant la déduction.' },
                confidence:{ type: 'string', enum: ['haute', 'moyenne', 'faible'], description: 'Confiance dans la déduction.' },
                source:    { type: 'string', description: "D'où vient l'info : 'contexte_mission' | 'contexte_candidat' | 'parametres_cabinet' | 'convention_syntec' | 'inference'." },
              },
            },
          },
          summary: { type: 'string', description: "Phrase d'intro avant la carte, ex: 'Voici ce que je déduis du profil :'" },
        },
      },
    },
  },
]

/* ──────────────────────────────────────────────────────────────────────────
 * Tool dispatch — exécute la fonction JS correspondante au tool call du LLM
 * ────────────────────────────────────────────────────────────────────────── */

/** Helper : narrowing for unknown JSON parsed object. */
function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
}

/** Validate + normalize a PricingInputs object from the LLM. */
function parsePricingInputs(raw: unknown): PricingInputs {
  const o = asRecord(raw)
  const avantages = asRecord(o.avantages)
  return {
    brutAnnuel:               Number(o.brutAnnuel ?? 0),
    statut:                   (o.statut ?? 'cadre') as Statut,
    position:                 String(o.position ?? '2.1'),
    coefficient:              Number(o.coefficient ?? 115),
    modalite:                 (o.modalite ?? 'modalite_1') as Modalite,
    lieu:                     (o.lieu ?? 'paris_petite_couronne') as Lieu,
    joursFacturablesParMois:  Number(o.joursFacturablesParMois ?? 18),
    avantages: {
      ticketsResto:                  avantages.ticketsResto                  != null ? Number(avantages.ticketsResto)                  : undefined,
      mutuellePremium:               avantages.mutuellePremium               != null ? Number(avantages.mutuellePremium)               : undefined,
      transport:                     avantages.transport                     != null ? Number(avantages.transport)                     : undefined,
      forfaitMobilite:               avantages.forfaitMobilite               != null ? Number(avantages.forfaitMobilite)               : undefined,
      treiziemeMois:                 avantages.treiziemeMois                 != null ? Boolean(avantages.treiziemeMois)                : undefined,
      primeCooptationAnnuelle:       avantages.primeCooptationAnnuelle       != null ? Number(avantages.primeCooptationAnnuelle)       : undefined,
      urssafIndemniteJour:           avantages.urssafIndemniteJour           != null ? Number(avantages.urssafIndemniteJour)           : undefined,
      medecineDuTravailAnnuel:       avantages.medecineDuTravailAnnuel       != null ? Number(avantages.medecineDuTravailAnnuel)       : undefined,
      indemniteKilometriqueAnnuelle: avantages.indemniteKilometriqueAnnuelle != null ? Number(avantages.indemniteKilometriqueAnnuelle) : undefined,
      expatriationMensuelle:         avantages.expatriationMensuelle         != null ? Number(avantages.expatriationMensuelle)         : undefined,
      autresMensuels:                avantages.autresMensuels                != null ? Number(avantages.autresMensuels)                : undefined,
    } as Avantages,
  }
}

/** A single deduction proposed by the agent. The UI renders these as a
 *  card with confirm-all + edit-per-row controls. */
export interface DeductionField {
  field: string
  label?: string
  value: unknown
  reasoning: string
  confidence?: 'haute' | 'moyenne' | 'faible'
  source?: string
}

/** Result of a tool execution. The agent loop will feed `content` back to
 *  the LLM as a tool message. If `userQuestion` or `deductions` is set, the
 *  loop pauses and hands the interaction over to the UI. */
export interface ToolExecutionResult {
  content: string                      // JSON string fed back to the LLM
  userQuestion?: {
    question: string
    options?: string[]
    reason?: string
  }
  deductions?: {
    summary?: string
    fields: DeductionField[]
  }
}

/** Contexte d'exécution serveur passé à chaque tool call. Permet
 *  d'injecter automatiquement les défauts du cabinet (avantages, jours
 *  facturables…) si le LLM oublie de les passer — empêche silencieusement
 *  les chiffres d'être faussés faute de paramètres. */
export interface ToolExecutionContext {
  cabinetAvantages?: Avantages
  cabinetJoursFacturables?: number
  cabinetLieuDefault?: Lieu
  cabinetModaliteDefault?: Modalite
}

/** Merge les défauts cabinet dans les inputs LLM. Le LLM gagne s'il a
 *  explicitement passé une valeur ; sinon on prend la valeur du cabinet. */
function mergeWithCabinetDefaults(
  llmInputs: PricingInputs,
  ctx: ToolExecutionContext,
): PricingInputs {
  // Avantages : merge clé par clé (le LLM peut surcharger un champ précis)
  const cab = ctx.cabinetAvantages ?? {}
  const llm = llmInputs.avantages ?? {}
  const mergedAvantages: Avantages = {
    ticketsResto:                  llm.ticketsResto                  ?? cab.ticketsResto,
    mutuellePremium:               llm.mutuellePremium               ?? cab.mutuellePremium,
    transport:                     llm.transport                     ?? cab.transport,
    forfaitMobilite:               llm.forfaitMobilite               ?? cab.forfaitMobilite,
    treiziemeMois:                 llm.treiziemeMois                 ?? cab.treiziemeMois,
    primeCooptationAnnuelle:       llm.primeCooptationAnnuelle       ?? cab.primeCooptationAnnuelle,
    urssafIndemniteJour:           llm.urssafIndemniteJour           ?? cab.urssafIndemniteJour,
    medecineDuTravailAnnuel:       llm.medecineDuTravailAnnuel       ?? cab.medecineDuTravailAnnuel,
    indemniteKilometriqueAnnuelle: llm.indemniteKilometriqueAnnuelle ?? cab.indemniteKilometriqueAnnuelle,
    expatriationMensuelle:         llm.expatriationMensuelle         ?? cab.expatriationMensuelle,
    autresMensuels:                llm.autresMensuels                ?? cab.autresMensuels,
  }
  return {
    ...llmInputs,
    avantages: mergedAvantages,
    joursFacturablesParMois: llmInputs.joursFacturablesParMois || ctx.cabinetJoursFacturables || 18,
    lieu: llmInputs.lieu || ctx.cabinetLieuDefault || 'paris_petite_couronne',
    modalite: llmInputs.modalite || ctx.cabinetModaliteDefault || 'modalite_1',
  }
}

/** Dispatch a single tool call requested by the LLM. */
export function executeToolCall(
  name: string,
  argsJson: string,
  ctx: ToolExecutionContext = {},
): ToolExecutionResult {
  let args: unknown = {}
  try { args = JSON.parse(argsJson) } catch { /* keep empty */ }

  switch (name) {
    case 'get_syntec_rule': {
      const cat = String(asRecord(args).category ?? '')
      if (cat === '_all_keys') {
        return { content: JSON.stringify({ keys: Object.keys(bareme) }) }
      }
      const b = bareme as Record<string, unknown>
      if (!(cat in b)) {
        return {
          content: JSON.stringify({
            error: `category not found: "${cat}"`,
            available_keys: Object.keys(b),
          }),
        }
      }
      return { content: JSON.stringify({ [cat]: b[cat] }) }
    }

    case 'compute_employer_cost': {
      const rawInputs = parsePricingInputs(args)
      const inputs = mergeWithCabinetDefaults(rawInputs, ctx)
      const cost = computeEmployerCost(inputs)
      const injectedDefaults = JSON.stringify(rawInputs.avantages) !== JSON.stringify(inputs.avantages)
      return {
        content: JSON.stringify({
          employer_cost: cost,
          inputs_used: inputs,
          _note: injectedDefaults
            ? "Les avantages cabinet (tickets, mutuelle, transport, médecine…) ont été automatiquement injectés depuis les paramètres car ils manquaient dans ta requête. C'est ce qui explique le coût total."
            : undefined,
        }),
      }
    }

    case 'compute_rupture_scenarios': {
      const raw = asRecord(args)
      const rawInputs = parsePricingInputs(raw.pricingInputs)
      const inputs = mergeWithCabinetDefaults(rawInputs, ctx)
      const tjm = Number(raw.tjm ?? 0)
      const typeContrat = (raw.typeContrat ?? 'cdi') as TypeContrat
      const dureeCDD = raw.dureeCDD != null ? Number(raw.dureeCDD) : undefined
      const startMonthIndex = raw.startMonthIndex != null ? Number(raw.startMonthIndex) : undefined
      const scenarios = computeRuptureScenarios(inputs, 24, tjm, {
        typeContrat, dureeCDD, startMonthIndex,
      })
      // Échantillonne aux mois utiles plutôt que de noyer le LLM avec 24 × 3 points.
      const keyMonths = [1, 3, scenarios.finEssaiMois, scenarios.finEssaiMois + 1, 8, 12, 18, 24]
        .filter((m, i, arr) => m >= 1 && m <= 24 && arr.indexOf(m) === i)
        .sort((a, b) => a - b)
      const samplePoint = (curve: typeof scenarios.nominal, m: number) => {
        const p = curve.find((x) => x.mois === m) ?? curve[m - 1]
        return p ? {
          mois: p.mois,
          marge_eur_par_mois: Math.round(p.margeMois),
          marge_pct: +p.margePct.toFixed(2),
          marge_cumulee_eur: Math.round(p.margeCumulee),
        } : null
      }
      const sample = (curve: typeof scenarios.nominal) => keyMonths.map((m) => samplePoint(curve, m)).filter(Boolean)
      return {
        content: JSON.stringify({
          fin_essai_mois: scenarios.finEssaiMois,
          preavis_max_syntec_mois: scenarios.preavisMois,
          preavis_mild_mois: scenarios.preavisMildMois,
          nominal_sans_rupture:  sample(scenarios.nominal),
          mild_preavis_1_mois:   sample(scenarios.mild),
          worst_preavis_syntec:  sample(scenarios.worstCase),
        }),
      }
    }

    case 'validate_minimum_conventionnel': {
      const rawInputs = parsePricingInputs(args)
      const inputs = mergeWithCabinetDefaults(rawInputs, ctx)
      const check = validateAgainstMinimum(inputs)
      return { content: JSON.stringify(check) }
    }

    case 'ask_user': {
      const o = asRecord(args)
      const question = String(o.question ?? '')
      const options = Array.isArray(o.options) ? o.options.map(String) : undefined
      const reason = o.reason != null ? String(o.reason) : undefined
      // Pas de "content" calculé ici : on signale à la boucle agent de
      // suspendre et de remonter la question à l'UI.
      return {
        content: JSON.stringify({ _user_question: true, question, options, reason }),
        userQuestion: { question, options, reason },
      }
    }

    case 'propose_deductions': {
      const o = asRecord(args)
      const summary = o.summary != null ? String(o.summary) : undefined
      const rawFields = Array.isArray(o.deductions) ? o.deductions : []
      const fields: DeductionField[] = rawFields.map((f) => {
        const r = asRecord(f)
        return {
          field:      String(r.field ?? ''),
          label:      r.label != null ? String(r.label) : undefined,
          value:      r.value,
          reasoning:  String(r.reasoning ?? ''),
          confidence: ['haute', 'moyenne', 'faible'].includes(String(r.confidence))
            ? (r.confidence as DeductionField['confidence'])
            : undefined,
          source:     r.source != null ? String(r.source) : undefined,
        }
      }).filter((f) => f.field !== '')

      return {
        content: JSON.stringify({
          _proposed_deductions: true,
          summary,
          fields,
          instruction_for_llm: 'En attente de validation du sourceur. Quand il aura confirmé ou corrigé, il reviendra avec un message texte. Continue le workflow à ce moment-là.',
        }),
        deductions: { summary, fields },
      }
    }

    default:
      return { content: JSON.stringify({ error: `unknown tool: ${name}` }) }
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * System prompt for the pricing agent
 * ────────────────────────────────────────────────────────────────────────── */

export const PRICING_AGENT_SYSTEM = `Tu es l'agent Pricing IA de Naywa Studio.

Rôle : aider un sourceur ESN à décider s'il est sûr d'embaucher un candidat sur une mission, en analysant le risque marge en cas de rupture.

═══ RÈGLES ABSOLUES ═══

1. **Tu ne fais JAMAIS d'arithmétique.** Si tu donnes un chiffre, il vient d'un tool, jamais de toi.
2. **Tu ne devines JAMAIS une règle Syntec.** Pour toute règle légale, tool \`get_syntec_rule\` d'abord.
3. Tu tutoies, ton chaleureux et concis. Pas de markdown lourd.

═══ WORKFLOW OBLIGATOIRE ═══

**ÉTAPE 1 — DÉDUIRE ET FAIRE VALIDER** (tour de chat n°1, OBLIGATOIRE)

Dès le premier message du sourceur, tu DOIS appeler \`propose_deductions\` avec TOUTES les valeurs nécessaires au calcul, déduites du contexte. **NE POSE PAS DE QUESTIONS OUVERTES EN PREMIER.** Le sourceur valide en un clic ou corrige.

Déductions à proposer systématiquement (en analysant le contexte mission+candidat) :
- \`statut\` : 'cadre' si titre contient "lead/architect/senior/manager/expert/principal" OU years_experience ≥ 7, sinon 'etam'
- \`position\` : '1.2' (junior, 0-3 ans) / '2.1' (confirmé 4-6 ans) / '2.2' (senior 7-10 ans) / '3.1' (lead 11+ ans)
- \`coefficient\` : 100 / 115 / 130 / 170 selon position
- \`modalite\` : 'modalite_3' (forfait jours) si cadre ≥ 7 ans XP, sinon 'modalite_1'
- \`lieu\` : depuis mission.location ('paris_petite_couronne' si Paris, 'lyon' si Lyon, 'province' sinon) — fallback paramètres cabinet
- \`typeContrat\` : 'cdi' ou 'cdd' depuis mission.contract_type
- \`dureeMois\` : depuis mission.duration_months
- \`brutAnnuel\` : depuis mission.target_gross_salary (si rempli), sinon estimation selon position/coef × 12 + 20% (à valider !)
- \`tjm\` : milieu de [client_tjm_min, client_tjm_max] depuis la mission
- \`treiziemeMois\` : depuis paramètres cabinet
- \`startMonthIndex\` : mois calendaire de mission.start_date (0-11), ou mois courant

Pour chaque déduction, mets une \`confidence\` ('haute' / 'moyenne' / 'faible') et une \`source\` claire. Si tu n'as VRAIMENT aucun signal pour un champ, mets confidence='faible' et propose la valeur la plus probable — le sourceur corrigera.

**ÉTAPE 2 — CALCULER** (après confirmation du sourceur)

Une fois que le sourceur a renvoyé un message texte de confirmation/correction, appelle dans l'ordre :
1. \`compute_employer_cost\` avec les inputs validés
2. \`compute_rupture_scenarios\` avec les mêmes inputs + tjm

**ÉTAPE 3 — VERDICT** (réponse texte finale)

Format OBLIGATOIRE, 3 blocs. Tu cites TOUJOURS les 3 scénarios pour chaque mois — c'est le cœur de l'analyse de risque rupture :

**📊 Marges aux mois clés**

| Mois | Sans rupture | Préavis 1 mois | Préavis Syntec max |
|---|---|---|---|
| 1 | X €/mois (X%) | X €/mois (X%) | X €/mois (X%) |
| Fin essai (m N) | X (X%) | X (X%) | X (X%) |
| Mois 12 | X (X%) | X (X%) | X (X%) |
| Mois 24 | X (X%) | X (X%) | X (X%) |

(Les chiffres viennent EXACTEMENT du tool \`compute_rupture_scenarios\` — nominal_sans_rupture, mild_preavis_1_mois, worst_preavis_syntec.)

**🎯 Risque global** : faible / modéré / élevé + 1 phrase chiffrée (cite le worst case mois fin_essai+1).

**💡 Recommandation** : actionnable — soit "viser TJM ≥ X €/j", soit "limiter brut à X €/an", soit "refuser ce candidat sur cette mission, raison : Y".

═══ INTERDIT ═══
- Donner un chiffre sans tool
- Inventer une indemnité ou un seuil
- Ne montrer que la marge nominale — tu DOIS afficher les 3 scénarios
- Sauter l'étape 1 (déductions à valider) — même si tu penses tout savoir, le sourceur DOIT voir et valider
- Poser plusieurs questions ouvertes successives au lieu d'utiliser \`propose_deductions\``
