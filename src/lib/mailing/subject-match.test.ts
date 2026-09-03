import { describe, expect, it } from "vitest"
import { normalizeSubject, jobFromSubject } from "./subject-match"

/**
 * Le rapprochement par l'objet remplace le jeton visible dans l'adresse.
 *
 * Ce qui se casse ici est silencieux : un objet mal normalisé ne rattache
 * rien, et la réponse atterrit dans la conversation la plus récente sans que
 * personne le voie. D'où le poids mis sur la normalisation — c'est elle qui
 * fait tout le travail.
 */

describe("normalizeSubject", () => {
  it("retire le préfixe de réponse", () => {
    expect(normalizeSubject("Re : Une opportunité chez Club Med"))
      .toBe("une opportunité chez club med")
  })

  it("retire les préfixes EMPILÉS, dans plusieurs langues", () => {
    // Un échange de trois tours passé par deux messageries produit ça.
    const attendu = "une opportunité"
    for (const objet of [
      "Re: Re: Une opportunité",
      "TR: Re : Une opportunité",
      "RE: FWD: Une opportunité",
      "AW: Une opportunité",        // Outlook allemand
      "Antw: Une opportunité",      // néerlandais
      "Re[2]: Une opportunité",     // compteur
    ]) {
      expect(normalizeSubject(objet)).toBe(attendu)
    }
  })

  it("aplatit les replis de ligne", () => {
    // Un objet long est replié par certaines messageries, ce qui y injecte des
    // espaces et des tabulations absents de l'original.
    expect(normalizeSubject("Une opportunité\r\n\tchez Club  Med"))
      .toBe("une opportunité chez club med")
  })

  it("ne mange pas un objet qui commence par un mot ressemblant", () => {
    // « Renouvellement » commence par « Re » — sans les deux-points, ce n'est
    // pas un préfixe, et le tronquer détruirait l'objet.
    expect(normalizeSubject("Renouvellement de contrat")).toBe("renouvellement de contrat")
    expect(normalizeSubject("Trésorerie 2026")).toBe("trésorerie 2026")
  })

  it("rend une chaîne vide pour un objet absent", () => {
    expect(normalizeSubject(null)).toBe("")
    expect(normalizeSubject("  ")).toBe("")
  })
})

const SORTANTS = [
  { job_id: "job-clubmed", subject: "Une opportunité chez Club Med", created_at: "2026-09-01T10:00:00Z" },
  { job_id: "job-bnp", subject: "Un poste d'analyste chez BNP", created_at: "2026-09-02T10:00:00Z" },
]

describe("jobFromSubject", () => {
  it("retrouve la mission malgré le préfixe de réponse", () => {
    // C'est LE cas qui compte : un candidat approché sur deux missions répond
    // à la plus ancienne. La déduction par « dernier sortant » se tromperait.
    expect(jobFromSubject("Re : Une opportunité chez Club Med", SORTANTS)).toBe("job-clubmed")
  })

  it("laisse déduire quand l'objet ne correspond à rien", () => {
    // `undefined` et non `null` : l'appelant doit distinguer « rien trouvé »
    // de « trouvé, sans mission ».
    expect(jobFromSubject("Question sans rapport", SORTANTS)).toBeUndefined()
    expect(jobFromSubject(null, SORTANTS)).toBeUndefined()
    expect(jobFromSubject("Re: Une opportunité chez Club Med", [])).toBeUndefined()
  })

  it("REFUSE de trancher quand deux missions portent le même objet", () => {
    /* Choisir au hasard rattacherait une réponse sur deux à la mauvaise
     * conversation, en silence — exactement le défaut qu'on supprime. Mieux
     * vaut rendre la main à la déduction, dont le comportement est connu. */
    const ambigu = [
      { job_id: "job-a", subject: "Opportunité chez Club Med", created_at: "2026-09-01T10:00:00Z" },
      { job_id: "job-b", subject: "Opportunité chez Club Med", created_at: "2026-09-02T10:00:00Z" },
    ]
    expect(jobFromSubject("Re: Opportunité chez Club Med", ambigu)).toBeUndefined()
  })

  it("accepte plusieurs messages de la MÊME mission", () => {
    // Une relance porte le même objet que l'approche : ce n'est pas une
    // ambiguïté, les deux désignent la même conversation.
    const relance = [
      { job_id: "job-a", subject: "Opportunité", created_at: "2026-09-01T10:00:00Z" },
      { job_id: "job-a", subject: "Opportunité", created_at: "2026-09-05T10:00:00Z" },
    ]
    expect(jobFromSubject("Re: Opportunité", relance)).toBe("job-a")
  })

  it("rattache un message hors mission sans le confondre avec un échec", () => {
    const horsMission = [{ job_id: null, subject: "Bonjour", created_at: "2026-09-01T10:00:00Z" }]
    expect(jobFromSubject("Re: Bonjour", horsMission)).toBeNull()
  })
})
