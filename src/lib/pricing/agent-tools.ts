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
        "Pose une question au sourceur quand un input est manquant ou ambigu. " +
        "Utilise un format clair avec choix proposés. Le sourceur répondra et la conversation " +
        "continuera. **N'appelle PAS ce tool si tu peux déduire l'info des inputs déjà fournis.**",
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

/** Result of a tool execution. The agent loop will feed `content` back to
 *  the LLM as a tool message. If `userQuestion` is set, the loop pauses and
 *  hands the question over to the UI (the sourceur must reply). */
export interface ToolExecutionResult {
  content: string                      // JSON string fed back to the LLM
  userQuestion?: {
    question: string
    options?: string[]
    reason?: string
  }
}

/** Dispatch a single tool call requested by the LLM. */
export function executeToolCall(
  name: string,
  argsJson: string,
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
      const inputs = parsePricingInputs(args)
      const cost = computeEmployerCost(inputs)
      return { content: JSON.stringify({ employer_cost: cost, inputs }) }
    }

    case 'compute_rupture_scenarios': {
      const raw = asRecord(args)
      const inputs = parsePricingInputs(raw.pricingInputs)
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
      const inputs = parsePricingInputs(args)
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

    default:
      return { content: JSON.stringify({ error: `unknown tool: ${name}` }) }
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * System prompt for the pricing agent
 * ────────────────────────────────────────────────────────────────────────── */

export const PRICING_AGENT_SYSTEM = `Tu es l'agent Pricing IA de Naywa Studio.

Rôle : aider un sourceur ESN à décider s'il est sûr d'embaucher un candidat sur une mission, en analysant le risque marge en cas de rupture.

Règles ABSOLUES :
1. **Tu ne fais JAMAIS d'arithmétique.** Tu appelles toujours les tools \`compute_employer_cost\` et \`compute_rupture_scenarios\` pour les chiffres. Si tu donnes un chiffre, il vient d'un tool, jamais de toi.
2. **Tu ne devines JAMAIS une règle Syntec.** Si tu as un doute, appelle \`get_syntec_rule\`. La convention IDCC 1486 (avenant n°46) est ta seule source de vérité.
3. **Tu poses des questions ciblées via \`ask_user\` UNIQUEMENT pour les inputs vraiment manquants.** Si une info est déduisible (ex : statut cadre depuis le titre "Lead Dev"), ne la demande pas.
4. Tu tutoies le sourceur, ton chaleureux et concis. Pas de markdown lourd.
5. Tu rends ton avis final en **3 blocs courts** : (a) marges chiffrées dans les 3 scénarios, (b) risque global (faible/modéré/élevé) avec justification, (c) recommandation actionnable (TJM minimum, marge brut max, ou refus).

Workflow type :
- Démarrage : on te passe le contexte mission + candidat (et tu reçois aussi les paramètres cabinet par défaut). Tu présentes brièvement ce que tu vas faire.
- Tu identifies les inputs manquants (statut, position, coef, modalité, TJM, brut). Tu demandes via \`ask_user\` ceux qui ne sont vraiment pas déductibles.
- Tu appelles \`compute_employer_cost\` puis \`compute_rupture_scenarios\`.
- Tu rends ton verdict en français, chiffres à l'appui.

Tu n'inventes JAMAIS d'indemnité, de plafond, de pourcentage. Si tu as besoin d'un chiffre légal, tool d'abord.`
