import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { buildAnonymizedModel } from "./anonymized-cv-model"
import type { Candidate } from "./database.types"

/**
 * CÂBLAGE D'UNE OPTION D'ANONYMISATION, DE BOUT EN BOUT.
 *
 * Ce que ce test empêche : livrer une case qui ne fait rien.
 *
 * C'est arrivé avec « Accroche du candidat ». L'option était déclarée, lue par
 * le rendu, et pourtant inerte : le client ne l'envoyait pas, la page ne la
 * relisait pas au montage, l'effet de sauvegarde ne la surveillait pas, et le
 * panneau shortlist l'écrasait. Trois maillons sur quatre cassés, zéro erreur
 * de compilation, zéro warning de lint. Elle s'affichait, elle se cochait, et
 * elle n'avait aucun effet — trouvé en recette, par hasard.
 *
 * Une option d'anonymisation tient sur QUATRE maillons :
 *
 *   1. ENVOI        — le client la transmet à la route de génération
 *   2. LECTURE      — la route la lit et la valide
 *   3. PERSISTANCE  — elle survit au rechargement de la page
 *   4. RENDU        — le modèle partagé en tient compte
 *
 * Les maillons 1 à 3 relient des FICHIERS entre eux : aucun test unitaire
 * classique ne les couvre, et c'est précisément là que ça a cassé. On vérifie
 * donc leur présence dans les fichiers concernés. C'est fruste, et c'est
 * assumé : un test fruste qui attrape le vrai défaut vaut mieux qu'un test
 * élégant qui le laisse passer.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..")
const read = (p: string) => readFileSync(join(SRC, p), "utf8")

/** Une option = son nom côté client (camelCase) et côté route (snake_case). */
const OPTIONS = [
  { label: "Accroche du candidat", camel: "keepCandidateSummary", snake: "keep_candidate_summary" },
  { label: "Résumé Nora", camel: "keepNoraSummary", snake: "keep_nora_summary" },
] as const

describe("câblage des options d'anonymisation", () => {
  const ficheMatch = read("app/workspace/match/[matchId]/page.tsx")
  const routeUnitaire = read("app/api/cv/[id]/anonymize/route.ts")
  const routeLot = read("app/api/jobs/[id]/anonymize-batch/route.ts")

  for (const opt of OPTIONS) {
    describe(`« ${opt.label} »`, () => {
      it("1. ENVOI — la fiche match la transmet à la génération", () => {
        expect(
          ficheMatch.includes(opt.snake),
          `La fiche match n'envoie pas « ${opt.snake} » : la route retombera sur ` +
          `son défaut et la case sera INERTE. C'est exactement le défaut de ` +
          `keepCandidateSummary, livré sans son envoi.`,
        ).toBe(true)
      })

      it("2. LECTURE — la route de génération la lit", () => {
        expect(routeUnitaire.includes(opt.snake), `Route unitaire : « ${opt.snake} » jamais lu.`).toBe(true)
      })

      it("3. PERSISTANCE — elle est relue au montage et réenregistrée", () => {
        // Deux occurrences au minimum : la lecture au chargement et l'écriture
        // dans l'effet de sauvegarde. Une seule = un aller sans retour.
        const hits = ficheMatch.split(opt.camel).length - 1
        expect(
          hits,
          `« ${opt.camel} » n'apparaît que ${hits} fois dans la fiche match. Il en ` +
          `faut au moins deux : la relire au montage ET la sauvegarder. Sinon le ` +
          `réglage revient à son défaut au rechargement, en silence.`,
        ).toBeGreaterThanOrEqual(2)
      })

      it("4. RENDU (lot) — le téléchargement groupé en tient compte", () => {
        expect(routeLot.includes(opt.camel), `Route de lot : « ${opt.camel} » ignoré.`).toBe(true)
      })
    })
  }

  it("le message d'accompagnement est porté par le CANDIDAT, pas par la mission", () => {
    // Migration 084. Le remettre sur la mission le ferait réapparaître sous les
    // douze profils d'une même shortlist — le défaut qu'on vient de corriger.
    expect(routeLot).toContain("anonymize_custom_text")
    expect(routeUnitaire).toContain("anonymize_custom_text")
    const types = read("components/workspace/anonymize/types.ts")
    const jobOptionsBlock = types.slice(
      types.indexOf("export interface JobAnonymizeOptions"),
      types.indexOf("export const INITIAL_JOB_ANONYMIZE_OPTIONS"),
    )
    expect(
      jobOptionsBlock.includes("customText"),
      "`customText` est revenu dans JobAnonymizeOptions : le message redeviendrait " +
      "commun à toute la shortlist (cf. migration 084).",
    ).toBe(false)
  })
})

/** Le 4ᵉ maillon, testable directement : le modèle honore-t-il les drapeaux ? */
describe("le rendu honore les options", () => {
  const candidate = {
    id: "00000000-0000-4000-8000-000000000002",
    parsed_cv: { summary: "Accroche écrite par le candidat." },
    skills: [], languages: [], taxonomy: null,
  } as unknown as Candidate

  const build = (options: Parameters<typeof buildAnonymizedModel>[0]["options"]) =>
    buildAnonymizedModel({ candidate, reference: "C-TEST0002", options, executiveSummary: "Résumé de Nora." })

  it("l'accroche du candidat part par défaut", () => {
    // Défaut DÉLIBÉRÉ : c'est du contenu de CV. La retirer par défaut amputait
    // le document sur ~100 % des CV.
    expect(build(null).candidateSummary).toBe("Accroche écrite par le candidat.")
  })

  it("la décocher la retire vraiment", () => {
    expect(build({ keepCandidateSummary: false }).candidateSummary).toBeNull()
  })

  it("le résumé Nora est absent par défaut et ne consomme donc rien", () => {
    expect(build(null).noraSummary).toBeNull()
  })

  it("les deux résumés sont indépendants", () => {
    // Le défaut d'origine : UNE case pilotait les DEUX. Décocher « Résumé Nora »
    // supprimait aussi l'accroche du candidat.
    const m = build({ keepNoraSummary: true, keepCandidateSummary: false })
    expect(m.noraSummary).toBe("Résumé de Nora.")
    expect(m.candidateSummary).toBeNull()

    const inverse = build({ keepNoraSummary: false, keepCandidateSummary: true })
    expect(inverse.noraSummary).toBeNull()
    expect(inverse.candidateSummary).toBe("Accroche écrite par le candidat.")
  })
})
