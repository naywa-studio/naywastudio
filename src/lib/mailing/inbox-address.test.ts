import { describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../database.types"
import { ensureInboxAddress, fromHeader, inboxDomainFor, slugifyLocalPart, type InboxOrg } from "./inbox-address"

/**
 * L'adresse de réception d'un sourceur, et sa bascule d'un domaine à l'autre.
 *
 * Ce que ces tests protègent tient en une phrase : **une organisation qui
 * active son domaine ne doit pas perdre les réponses en cours.** C'est le
 * risque le plus cher du chantier mailing, et le plus discret — un message non
 * rattaché est indiscernable d'un message jamais envoyé. Le sourceur conclut
 * que son candidat ne répond pas, et relance quelqu'un qui a déjà dit oui.
 */

/* ── Un faux client Supabase, juste assez pour ce fichier ─────────────────── */

interface FakeProfile {
  user_id: string
  first_name: string | null
  inbox_address: string | null
  inbox_aliases: string[]
}

function fakeAdmin(rows: FakeProfile[], authEmail = "sophie.durand@exemple.fr") {
  const builder = () => {
    let scope = [...rows]
    let update: Partial<FakeProfile> | null = null
    const self = {
      select: () => self,
      update: (v: Partial<FakeProfile>) => { update = v; return self },
      eq: (col: keyof FakeProfile, v: unknown) => {
        scope = scope.filter((r) => r[col] === v)
        return apply()
      },
      neq: (col: keyof FakeProfile, v: unknown) => {
        scope = scope.filter((r) => r[col] !== v)
        return self
      },
      contains: (col: "inbox_aliases", v: string[]) => {
        scope = scope.filter((r) => v.every((x) => r[col].includes(x)))
        return self
      },
      limit: () => self,
      single: () => Promise.resolve({ data: scope[0] ?? null }),
      maybeSingle: () => Promise.resolve({ data: scope[0] ?? null }),
      then: undefined,
    }
    // `.eq()` termine aussi bien une lecture qu'une écriture : si un update est
    // en attente, on l'applique et on renvoie un objet awaitable.
    const apply = () => {
      if (update) for (const r of scope) Object.assign(r, update)
      return self
    }
    return self
  }

  return {
    from: () => builder(),
    auth: { admin: { getUserById: () => Promise.resolve({ data: { user: { email: authEmail } } }) } },
  } as unknown as SupabaseClient<Database>
}

const ORG_ACTIVE = {
  trial_ends_at: null,
  subscription_status: "active",
  current_period_end: null,
  subscription_has_mailing: true,
  mailing_status: "active",
  mailing_sending_domain: "careers.cabinet-durand.fr",
} satisfies InboxOrg

const ORG_SANS_OPTION = { ...ORG_ACTIVE, subscription_has_mailing: false } satisfies InboxOrg

/* ── Le domaine retenu ────────────────────────────────────────────────────── */

describe("inboxDomainFor", () => {
  it("prend le domaine du cabinet quand il est vérifié ET payé", () => {
    expect(inboxDomainFor(ORG_ACTIVE)).toBe("careers.cabinet-durand.fr")
  })

  it("reste sur Naywa si l'option n'est pas acquise", () => {
    expect(inboxDomainFor(ORG_SANS_OPTION)).toBe("mail.naywastudio.com")
  })

  it("reste sur Naywa tant que le DNS n'est pas vérifié", () => {
    // Le point qui compte : payer ne suffit pas. Sans clés DKIM publiées, une
    // adresse sur ce domaine ne recevrait rien.
    expect(inboxDomainFor({ ...ORG_ACTIVE, mailing_status: "awaiting_dns" })).toBe("mail.naywastudio.com")
  })

  it("reste sur Naywa sans organisation", () => {
    expect(inboxDomainFor(null)).toBe("mail.naywastudio.com")
  })
})

/* ── L'attribution et la bascule ──────────────────────────────────────────── */

describe("ensureInboxAddress", () => {
  it("crée l'adresse au premier usage, à partir du prénom", async () => {
    const rows: FakeProfile[] = [{ user_id: "u1", first_name: "Sophie", inbox_address: null, inbox_aliases: [] }]
    const addr = await ensureInboxAddress(fakeAdmin(rows), "u1", ORG_SANS_OPTION)
    expect(addr).toBe("sophie@mail.naywastudio.com")
    expect(rows[0].inbox_address).toBe(addr)
  })

  it("retombe sur l'email de connexion si le profil n'a pas de prénom", async () => {
    const rows: FakeProfile[] = [{ user_id: "u1", first_name: null, inbox_address: null, inbox_aliases: [] }]
    const addr = await ensureInboxAddress(fakeAdmin(rows), "u1", null)
    expect(addr).toBe("sophie.durand@mail.naywastudio.com")
  })

  it("ne rappelle rien quand l'adresse est déjà sur le bon domaine", async () => {
    const rows: FakeProfile[] = [
      { user_id: "u1", first_name: "Sophie", inbox_address: "sophie@mail.naywastudio.com", inbox_aliases: [] },
    ]
    const addr = await ensureInboxAddress(fakeAdmin(rows), "u1", ORG_SANS_OPTION)
    expect(addr).toBe("sophie@mail.naywastudio.com")
    expect(rows[0].inbox_aliases).toEqual([])
  })

  it("bascule sur le domaine du cabinet EN GARDANT la partie locale", async () => {
    // Le sourceur recevait sur « sophie@ » : cette partie figure dans les
    // signatures et dans la tête des gens. Seul le domaine doit bouger.
    const rows: FakeProfile[] = [
      { user_id: "u1", first_name: "Sophie", inbox_address: "sophie@mail.naywastudio.com", inbox_aliases: [] },
    ]
    const addr = await ensureInboxAddress(fakeAdmin(rows), "u1", ORG_ACTIVE)
    expect(addr).toBe("sophie@careers.cabinet-durand.fr")
  })

  it("CONSERVE l'ancienne adresse en alias lors de la bascule", async () => {
    // LE test de ce fichier. Sans cette ligne, toutes les réponses aux
    // messages déjà envoyés tombent dans le vide, sans erreur nulle part.
    const rows: FakeProfile[] = [
      { user_id: "u1", first_name: "Sophie", inbox_address: "sophie@mail.naywastudio.com", inbox_aliases: [] },
    ]
    await ensureInboxAddress(fakeAdmin(rows), "u1", ORG_ACTIVE)
    expect(rows[0].inbox_aliases).toContain("sophie@mail.naywastudio.com")
  })

  it("empile les alias sur plusieurs bascules, sans doublon", async () => {
    const rows: FakeProfile[] = [
      { user_id: "u1", first_name: "Sophie", inbox_address: "sophie@ancien.fr", inbox_aliases: ["sophie@mail.naywastudio.com"] },
    ]
    await ensureInboxAddress(fakeAdmin(rows), "u1", ORG_ACTIVE)
    expect(rows[0].inbox_aliases).toEqual(
      expect.arrayContaining(["sophie@mail.naywastudio.com", "sophie@ancien.fr"]),
    )
    expect(new Set(rows[0].inbox_aliases).size).toBe(rows[0].inbox_aliases.length)
  })

  it("ne se réattribue jamais une adresse qu'un COLLÈGUE a abandonnée", async () => {
    // Réattribuer une adresse alias enverrait les réponses d'un ancien fil au
    // mauvais sourceur : pire qu'une réponse perdue, c'est une fuite entre
    // deux collaborateurs de la même organisation.
    const rows: FakeProfile[] = [
      { user_id: "u1", first_name: "Sophie", inbox_address: null, inbox_aliases: [] },
      { user_id: "u2", first_name: "Autre", inbox_address: "x@y.fr", inbox_aliases: ["sophie@mail.naywastudio.com"] },
    ]
    const addr = await ensureInboxAddress(fakeAdmin(rows), "u1", ORG_SANS_OPTION)
    expect(addr).toBe("sophie2@mail.naywastudio.com")
  })

  it("évite aussi l'adresse COURANTE d'un collègue", async () => {
    const rows: FakeProfile[] = [
      { user_id: "u1", first_name: "Sophie", inbox_address: null, inbox_aliases: [] },
      { user_id: "u2", first_name: "Sophie", inbox_address: "sophie@mail.naywastudio.com", inbox_aliases: [] },
    ]
    const addr = await ensureInboxAddress(fakeAdmin(rows), "u1", ORG_SANS_OPTION)
    expect(addr).toBe("sophie2@mail.naywastudio.com")
  })
})

/* ── Parties locales et en-tête ───────────────────────────────────────────── */

describe("slugifyLocalPart", () => {
  it("retire les accents et normalise", () => {
    expect(slugifyLocalPart("Amélie Röder")).toBe("amelie.roder")
  })

  it("ne renvoie jamais une partie locale vide", () => {
    expect(slugifyLocalPart("€€€")).toBe("sourceur")
    expect(slugifyLocalPart("")).toBe("sourceur")
  })

  it("borne la longueur", () => {
    expect(slugifyLocalPart("a".repeat(80)).length).toBeLessThanOrEqual(32)
  })
})

describe("fromHeader", () => {
  it("compose un en-tête lisible", () => {
    expect(fromHeader("Sophie", "sophie@cabinet.fr")).toBe("Sophie <sophie@cabinet.fr>")
  })

  it("refuse qu'un prénom referme l'en-tête pour en injecter un autre", () => {
    const out = fromHeader('Sophie" <x@evil.com>\r\nBcc: tout@le-monde.fr', "sophie@cabinet.fr")
    expect(out).not.toMatch(/[\r\n]/)
    expect(out.match(/@/g)?.length).toBe(1)
    expect(out.match(/</g)?.length).toBe(1)
  })

  it("retombe sur un nom neutre plutôt que sur un en-tête sans nom", () => {
    expect(fromHeader(null, "a@b.fr")).toBe("Naywa Studio <a@b.fr>")
  })
})
