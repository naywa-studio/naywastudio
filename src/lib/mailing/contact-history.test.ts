import { describe, expect, it } from "vitest"
import { summarizeContacts, severityOf, CONTACT_ALERT_DAYS, type ContactRow } from "./contact-history"

/**
 * La mémoire du cabinet. Ce qui se casse silencieusement ici, c'est le
 * DÉPARTAGE : quel contact prime quand il y en a plusieurs, et à partir de
 * quand l'information cesse d'être une alerte. Un bandeau qui montre le
 * mauvais contact rassure à tort — et un bandeau permanent ne se lit plus.
 */

const NOW = Date.parse("2026-09-01T12:00:00Z")
const ilYA = (jours: number) => new Date(NOW - jours * 86_400_000).toISOString()

const msg = (p: Partial<ContactRow>): ContactRow => ({
  direction: "outbound", job_id: "mission-A", user_id: "louis", created_at: ilYA(3), ...p,
})

const resume = (rows: ContactRow[], jobId: string | null = "mission-A", viewer = "sophie") =>
  summarizeContacts(rows, { currentJobId: jobId, viewerId: viewer, now: NOW })

describe("qui a écrit, pour quelle mission", () => {
  it("sépare la mission ouverte des autres", () => {
    const h = resume([
      msg({ job_id: "mission-A", user_id: "louis", created_at: ilYA(2) }),
      msg({ job_id: "mission-B", user_id: "marie", created_at: ilYA(5) }),
    ])
    expect(h.sameMission?.userId).toBe("louis")
    expect(h.otherMission?.userId).toBe("marie")
  })

  it("retient le plus RÉCENT, pas le premier", () => {
    // Ce que le sourceur doit peser, c'est la fraîcheur de la dernière
    // sollicitation : un premier contact il y a deux ans n'engage plus rien.
    const h = resume([
      msg({ user_id: "ancien", created_at: ilYA(300) }),
      msg({ user_id: "recent", created_at: ilYA(2) }),
    ])
    expect(h.sameMission?.userId).toBe("recent")
    expect(h.sameMission?.daysAgo).toBe(2)
  })

  it("un message sans mission compte comme « autre », jamais comme « même »", () => {
    // Il a bien été envoyé — l'ignorer effacerait tout l'historique d'avant
    // les missions. Mais on ne peut pas prétendre qu'il concernait celle-ci.
    const h = resume([msg({ job_id: null, created_at: ilYA(4) })])
    expect(h.sameMission).toBeNull()
    expect(h.otherMission?.daysAgo).toBe(4)
  })

  it("sans mission ouverte, tout est « autre »", () => {
    const h = resume([msg({ job_id: "mission-A" })], null)
    expect(h.sameMission).toBeNull()
    expect(h.otherMission).not.toBeNull()
  })

  it("distingue ce que le lecteur a écrit lui-même", () => {
    // « Vous lui avez écrit » et « Louis lui a écrit » n'appellent pas la
    // même réaction : l'un est un rappel, l'autre un risque de doublon.
    const h = resume([msg({ user_id: "sophie" })], "mission-A", "sophie")
    expect(h.sameMission?.byViewer).toBe(true)
  })
})

describe("les réponses et le volume", () => {
  it("un message entrant ne compte pas comme un contact sortant", () => {
    const h = resume([
      msg({ direction: "outbound" }),
      msg({ direction: "inbound", created_at: ilYA(1) }),
    ])
    expect(h.outboundCount).toBe(1)
    expect(h.hasReplied).toBe(true)
  })

  it("un fil vide ne dit rien", () => {
    const h = resume([])
    expect(h).toMatchObject({ sameMission: null, otherMission: null, hasReplied: false, outboundCount: 0 })
  })
})

describe("quand l'alerte redevient une simple information", () => {
  it("alerte en deçà de la limite", () => {
    const h = resume([msg({ created_at: ilYA(CONTACT_ALERT_DAYS - 1) })])
    expect(severityOf(h.sameMission!)).toBe("alert")
  })

  it("information au-delà — réapprocher après trois mois est normal", () => {
    const h = resume([msg({ created_at: ilYA(CONTACT_ALERT_DAYS + 1) })])
    expect(severityOf(h.sameMission!)).toBe("info")
  })

  it("une date illisible n'invente pas une ancienneté", () => {
    // Une donnée abîmée ne doit pas produire un « il y a 20 000 jours » ni,
    // pire, une alerte fantôme sur un contact qui n'a peut-être jamais eu lieu.
    const h = resume([msg({ created_at: "pas-une-date" })])
    expect(h.sameMission?.daysAgo).toBe(0)
  })
})
