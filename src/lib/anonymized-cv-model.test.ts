import { describe, expect, it } from "vitest"
import { buildAnonymizedModel, mergeDisplaySkills } from "./anonymized-cv-model"
import type { Candidate, ParsedCv } from "./database.types"

/**
 * CONTRAT PARSEUR → DOCUMENT.
 *
 * Ce que ce test empêche : qu'un champ extrait du CV n'atteigne jamais le
 * document remis au client, sans que personne ne s'en aperçoive.
 *
 * C'est arrivé. Les certifications étaient parsées, stockées, affichées sur la
 * fiche candidat — et absentes des quatre gabarits pendant des mois. Le
 * document restait valide et joli, simplement incomplet, donc rien ne signalait
 * la perte. Idem pour l'accroche du candidat, perdue sur ~100 % des CV.
 *
 * La cause est structurelle : `AnonymizedCvModel` est une liste d'INCLUSION.
 * Un champ ajouté au parseur n'arrive au client que si quelqu'un pense à
 * l'ajouter aussi là-bas.
 *
 * DEUX garde-fous ici, et le premier est le plus fort :
 *
 *  1. `FULL_CV` est typé `Required<ParsedCv>`. Ajouter un champ au type SANS
 *     le renseigner ici casse la compilation. On ne peut donc pas oublier.
 *
 *  2. Le test parcourt chaque champ et exige qu'il ressorte dans le document,
 *     ou qu'il figure dans `DOCUMENT_EXCLUSIONS` avec une RAISON écrite.
 *     Écarter un champ reste possible — c'est parfois juste — mais devient un
 *     choix explicite et daté, jamais un oubli.
 */

/**
 * Valeur reconnaissable par champ, cherchée ensuite dans le document.
 *
 * Volontairement PAS tout en capitales : `mergeDisplaySkills` normalise la
 * casse des libellés criards (REVIT → Revit), et une sentinelle en capitales
 * ressortait donc transformée. Le test l'a signalé au premier lancement, ce
 * qui est plutôt bon signe pour lui.
 */
const S = (k: string) => `Sentinelle-${k}`

const FULL_CV: Required<ParsedCv> = {
  full_name: S("full_name"),
  email: "sentinelle.email@example.com",
  phone: "0600000000",
  location: "12 rue de la Sentinelle, 75011 Paris",
  linkedin_url: "https://linkedin.com/in/sentinelle",
  github_url: "https://github.com/sentinelle",
  portfolio_url: "https://sentinelle.example.com",
  malt_url: "https://malt.fr/profile/sentinelle",
  current_title: S("current_title"),
  current_company: S("current_company"),
  years_experience: 1234,
  seniority_level: S("seniority_level"),
  seniority_role: S("seniority_role"),
  is_apprentice: true,
  summary: S("summary"),
  skills: [S("skills")],
  qualities: [S("qualities")],
  languages: [S("languages")],
  experience: [{
    title: S("experience"),
    company: "Entreprise Sentinelle",
    start: "2020-01",
    end: null,
    location: "Paris",
    description: "Description sentinelle.",
    highlights: ["Fait sentinelle"],
    seniority: "senior",
    counts_toward_role: true,
  }],
  education: [{
    degree: S("education"),
    school: "École Sentinelle",
    field: "Filière sentinelle",
    start: "2015",
    end: "2018",
  }],
  certifications: [S("certifications")],
  language: "fr",
  sector: "tech",
  completeness: 92,
  warnings: [S("warnings")],
  other_sections: [{ title: S("other_sections"), content: "Contenu sentinelle." }],
  source_quality: "native",
}

/**
 * Champs volontairement ABSENTS du document, avec la raison.
 *
 * Trois familles : l'anonymisation (on ne transmet pas l'identité), le
 * diagnostic interne (utile au sourceur, pas au client), et les redondances.
 * Tout ce qui n'est pas ici DOIT ressortir.
 */
const DOCUMENT_EXCLUSIONS: Partial<Record<keyof ParsedCv, string>> = {
  full_name: "Anonymisation — remplacé par la référence C-XXXX.",
  email: "Anonymisation — coordonnée directe.",
  phone: "Anonymisation — coordonnée directe.",
  linkedin_url: "Anonymisation — identifiant direct.",
  github_url: "Anonymisation — identifiant direct.",
  portfolio_url: "Anonymisation — identifiant direct.",
  malt_url: "Anonymisation — identifiant direct.",
  location: "Anonymisation — dégradée en zone (commune + département), jamais l'adresse.",
  current_company: "Redondant : l'employeur actuel apparaît dans la première expérience.",
  seniority_role: "Redondant : `taxonomy.role_family` joue ce rôle dans l'en-tête.",
  is_apprentice:
    "Écarté après arbitrage produit : le document est toujours présenté POUR une " +
    "mission, le cadre contractuel vient de là, et `years_experience` exclut déjà " +
    "l'alternance en cours.",
  language: "Technique — pilote la langue du rendu, n'est pas du contenu.",
  sector: "Classement interne du vivier, pas du contenu de CV.",
  completeness: "Diagnostic sourceur — ne regarde pas le client.",
  warnings: "Diagnostic sourceur — signale des trous au sourceur, jamais au client.",
  source_quality: "Diagnostic technique (natif / scanné).",
}

function candidateWith(cv: ParsedCv): Candidate {
  // On ne remplit QUE ce que le modèle lit : le reste du type Candidate décrit
  // des colonnes sans effet sur le document.
  return {
    id: "00000000-0000-4000-8000-000000000001",
    parsed_cv: cv,
    skills: cv.skills ?? [],
    languages: cv.languages ?? [],
    taxonomy: null,
    location: cv.location ?? null,
    full_name: cv.full_name ?? null,
    current_title: cv.current_title ?? null,
    seniority_level: cv.seniority_level ?? null,
    years_experience: cv.years_experience ?? null,
  } as unknown as Candidate
}

describe("contrat parseur → document anonymisé", () => {
  const model = buildAnonymizedModel({
    candidate: candidateWith(FULL_CV),
    reference: "C-TEST0001",
    // Options les plus PERMISSIVES : le test vérifie qu'un champ PEUT sortir,
    // pas ce que tel réglage masque. Un champ retenu derrière une case reste
    // atteignable, donc conforme au contrat.
    options: { keepNoraSummary: true, keepCandidateSummary: true },
    executiveSummary: null,
  })
  const rendered = JSON.stringify(model)

  for (const key of Object.keys(FULL_CV) as (keyof ParsedCv)[]) {
    const excuse = DOCUMENT_EXCLUSIONS[key]

    it(`« ${key} » atteint le document, ou est écarté avec une raison`, () => {
      const value = FULL_CV[key]
      const needle = typeof value === "number" ? String(value) : S(key)
      const present = rendered.includes(needle)

      if (excuse) {
        // Écarté SCIEMMENT : on vérifie juste que la raison est écrite.
        expect(excuse.length, `« ${key} » est écarté sans raison écrite`).toBeGreaterThan(20)
        return
      }

      expect(
        present,
        `« ${key} » est extrait du CV mais n'atteint PAS le document remis au ` +
        `client. Deux issues : l'exposer dans AnonymizedCvModel et le rendre ` +
        `dans les 4 gabarits + l'aperçu + le DOCX, ou l'ajouter à ` +
        `DOCUMENT_EXCLUSIONS avec la raison de l'écarter.`,
      ).toBe(true)
    })
  }
})

describe("mergeDisplaySkills", () => {
  it("fusionne les deux sources au lieu de n'en garder qu'une", () => {
    // Le défaut d'origine : `core_skills` non vide faisait jeter TOUTE la
    // colonne `skills`. Mesuré sur 198 CV — 3,3 compétences affichées au lieu
    // de 9,1, alors que tout était déjà en base.
    const out = mergeDisplaySkills(["modélisation 3D"], ["Tekla", "AutoCAD"])
    expect(out).toContain("modélisation 3D")
    expect(out).toContain("Tekla")
  })

  it("ne montre pas deux fois la même compétence à la casse près", () => {
    const out = mergeDisplaySkills(["modélisation 3D"], ["Modélisation 3D"])
    expect(out).toHaveLength(1)
  })

  it("absorbe les variantes plus détaillées d'une compétence déjà retenue", () => {
    // « calcul flexibilité » et « Calcul flexibilité (CeasarII) » sont la même
    // chose ; les afficher toutes deux donne une fiche mal relue.
    const out = mergeDisplaySkills(["calcul flexibilité"], ["Calcul flexibilité (CeasarII)"])
    expect(out).toHaveLength(1)
  })

  it("écarte la bureautique générique du COMPLÉMENT", () => {
    const out = mergeDisplaySkills(["gestion de projet"], ["Excel", "Tekla"])
    expect(out).not.toContain("Excel")
    expect(out).toContain("Tekla")
  })

  it("respecte le choix du modèle quand il a retenu la bureautique lui-même", () => {
    // Une assistante de gestion : Excel EST une compétence clé. Le filtre ne
    // s'applique qu'au complément automatique, jamais à la liste d'origine.
    const out = mergeDisplaySkills(["Excel"], [])
    expect(out).toContain("Excel")
  })

  it("normalise la casse sans casser les acronymes", () => {
    const out = mergeDisplaySkills([], ["REVIT", "BIM", "AUTOCAD"])
    expect(out).toContain("Revit")
    expect(out).toContain("AutoCAD")
    expect(out).toContain("BIM") // acronyme court : reste en capitales
  })
})
