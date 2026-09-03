import { describe, expect, it } from "vitest"
import { resolveInboundRouting } from "./route-inbound"
import { replyAddressFor } from "./reply-address"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../database.types"

/**
 * Le rattachement d'une réponse entrante.
 *
 * ── Pourquoi ces tests-là et pas d'autres ─────────────────────────────────
 *
 * Tout ce qui se joue ici est SILENCIEUX. Une réponse mal rattachée s'affiche
 * dans le mauvais fil, une réponse non rattachée est indiscernable d'une
 * réponse jamais reçue — dans les deux cas le sourceur conclut que le candidat
 * ne répond pas, et rien dans les journaux ne dit le contraire.
 *
 * Trois choses doivent tenir : le suffixe l'emporte quand il est là, le repli
 * fonctionne quand il ne l'est pas (c'est le cas de tout l'existant), et un
 * jeton d'une AUTRE organisation ne rattache rien.
 */

const ORG = "org-1"
const AUTRE_ORG = "org-2"
const MATCH = "3a5fcf8d-0f0b-4190-babd-b1686de9b751"
const TOKEN = "k3f9d2a7"

interface Fixture {
  profile?: { user_id: string; organization_id: string; is_admin?: boolean } | null
  match?: { id: string; candidate_id: string; job_id: string; organization_id: string } | null
  candidate?: { id: string } | null
  lastOutboundJobId?: string | null
}

/** Client minimal : seules les formes de requête réellement utilisées. */
function fakeAdmin(f: Fixture): SupabaseClient<Database> {
  const chain = (value: unknown) => {
    const node: Record<string, unknown> = {}
    for (const method of ["select", "eq", "contains", "limit", "order"]) {
      node[method] = () => node
    }
    node.maybeSingle = () => Promise.resolve({ data: value, error: null })
    return node
  }

  return {
    from: (table: string) => {
      if (table === "profiles") return chain(f.profile ?? null)
      if (table === "match_assessments") return chain(f.match ?? null)
      if (table === "candidates") return chain(f.candidate ?? null)
      if (table === "email_messages") return chain(
        f.lastOutboundJobId ? { job_id: f.lastOutboundJobId } : null,
      )
      throw new Error(`table inattendue: ${table}`)
    },
  } as unknown as SupabaseClient<Database>
}

const SOURCEUR = { user_id: "u-sophie", organization_id: ORG }

describe("le suffixe l'emporte : on SAIT au lieu de deviner", () => {
  it("rattache au candidat et à la mission du match", async () => {
    const admin = fakeAdmin({
      profile: SOURCEUR,
      match: { id: MATCH, candidate_id: "cand-A", job_id: "job-A", organization_id: ORG },
      // Le repli désignerait une AUTRE mission : s'il gagnait, ce test le dirait.
      candidate: { id: "cand-B" }, lastOutboundJobId: "job-B",
    })

    const routing = await resolveInboundRouting(admin, {
      toAddress: replyAddressFor("sophie@reply.naywastudio.com", TOKEN),
      fromAddress: "candidat@exemple.fr",
    })

    expect(routing).toEqual({
      userId: "u-sophie", organizationId: ORG, candidateId: "cand-A", jobId: "job-A", isAdmin: false,
    })
  })

  it("le sourceur reste celui de l'adresse, pas celui du match", async () => {
    // C'est ce qui permet à un collègue de reprendre un fil : la conversation
    // appartient au cabinet, l'adresse dit seulement qui a écrit en dernier.
    const admin = fakeAdmin({
      profile: { user_id: "u-marie", organization_id: ORG },
      match: { id: MATCH, candidate_id: "cand-A", job_id: "job-A", organization_id: ORG },
    })

    const routing = await resolveInboundRouting(admin, {
      toAddress: replyAddressFor("marie@reply.naywastudio.com", TOKEN),
      fromAddress: "candidat@exemple.fr",
    })

    expect(routing.userId).toBe("u-marie")
    expect(routing.candidateId).toBe("cand-A")
  })
})

describe("un jeton d'une autre organisation ne rattache rien", () => {
  it("retombe sur la déduction, bornée à l'organisation du destinataire", async () => {
    /* Le jeton voyage dans une adresse, donc chez le candidat, donc à la
     * portée de quiconque reçoit un de nos messages. Sans le contrôle
     * d'organisation, un jeton recopié injecterait un message dans la
     * conversation d'un autre cabinet. */
    const admin = fakeAdmin({
      profile: SOURCEUR,
      match: { id: MATCH, candidate_id: "cand-espion", job_id: "job-espion", organization_id: AUTRE_ORG },
      candidate: { id: "cand-legitime" }, lastOutboundJobId: "job-legitime",
    })

    const routing = await resolveInboundRouting(admin, {
      toAddress: replyAddressFor("sophie@reply.naywastudio.com", TOKEN),
      fromAddress: "candidat@exemple.fr",
    })

    expect(routing.candidateId).toBe("cand-legitime")
    expect(routing.jobId).toBe("job-legitime")
  })

  it("un jeton qui ne correspond à aucun match ne fait pas perdre le message", async () => {
    const admin = fakeAdmin({
      profile: SOURCEUR, match: null,
      candidate: { id: "cand-legitime" }, lastOutboundJobId: "job-legitime",
    })

    const routing = await resolveInboundRouting(admin, {
      toAddress: replyAddressFor("sophie@reply.naywastudio.com", TOKEN),
      fromAddress: "candidat@exemple.fr",
    })

    expect(routing.candidateId).toBe("cand-legitime")
  })
})

describe("le repli, qui reste le chemin de tout l'existant", () => {
  it("une adresse sans suffixe déduit comme avant", async () => {
    const admin = fakeAdmin({
      profile: SOURCEUR, candidate: { id: "cand-A" }, lastOutboundJobId: "job-A",
    })

    const routing = await resolveInboundRouting(admin, {
      toAddress: "sophie@reply.naywastudio.com",
      fromAddress: "candidat@exemple.fr",
    })

    expect(routing).toEqual({
      userId: "u-sophie", organizationId: ORG, candidateId: "cand-A", jobId: "job-A", isAdmin: false,
    })
  })

  it("remonte le statut admin du destinataire", async () => {
    /* Le chemin entrant n'a pas de session : sans cette valeur, l'analyse de
     * la réponse par Nora est refusée à une organisation admin, avec un
     * « quota épuisé » alors qu'elle est à zéro action consommée. C'était le
     * seul appel à un modèle du produit qui ne transmettait pas ce bypass. */
    const admin = fakeAdmin({
      profile: { user_id: "u-elyas", organization_id: ORG, is_admin: true },
      candidate: { id: "cand-A" },
    })

    const routing = await resolveInboundRouting(admin, {
      toAddress: "elyas@reply.naywastudio.com",
      fromAddress: "candidat@exemple.fr",
    })

    expect(routing.isAdmin).toBe(true)
  })

  it("un candidat inconnu au vivier laisse un message sans rattachement, pas une erreur", async () => {
    const admin = fakeAdmin({ profile: SOURCEUR, candidate: null })

    const routing = await resolveInboundRouting(admin, {
      toAddress: "sophie@reply.naywastudio.com",
      fromAddress: "inconnu@exemple.fr",
    })

    expect(routing).toMatchObject({ userId: "u-sophie", candidateId: null, jobId: null })
  })

  it("une adresse qui n'est pas la nôtre n'est pas notre courrier", async () => {
    const admin = fakeAdmin({ profile: null })

    const routing = await resolveInboundRouting(admin, {
      toAddress: "quelquun@ailleurs.fr",
      fromAddress: "candidat@exemple.fr",
    })

    expect(routing).toEqual({
      userId: null, organizationId: null, candidateId: null, jobId: null, isAdmin: false,
    })
  })
})
