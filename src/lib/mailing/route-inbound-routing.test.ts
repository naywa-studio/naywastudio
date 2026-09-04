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
  /** Les sortants réels, quand le test porte sur le rapprochement par l'objet. */
  outbound?: { job_id: string | null; subject: string | null; created_at: string }[]
  /** L'adresse dédiée à une mission, quand elle existe. */
  alias?: { user_id: string; organization_id: string; job_id: string } | null
}

/**
 * Client minimal : seules les formes de requête réellement utilisées.
 *
 * Le nœud est CHAÎNABLE et THENABLE — certaines requêtes se terminent par
 * `.maybeSingle()`, d'autres s'attendent directement pour obtenir une liste.
 * Un faux qui ne couvrirait que la première forme échouerait sur la seconde
 * avec une erreur qui ne dit rien du vrai sujet.
 */
function fakeAdmin(f: Fixture): SupabaseClient<Database> {
  const chain = (single: unknown, list: unknown[] = []) => {
    const node: Record<string, unknown> = {}
    for (const method of ["select", "eq", "ilike", "contains", "limit", "order"]) {
      node[method] = () => node
    }
    node.maybeSingle = () => Promise.resolve({ data: single, error: null })
    node.then = (resolve: (v: unknown) => unknown) => resolve({ data: list, error: null })
    return node
  }

  const sortants = f.outbound ?? (f.lastOutboundJobId
    ? [{ job_id: f.lastOutboundJobId, subject: null, created_at: "2026-09-01T10:00:00Z" }]
    : [])

  return {
    from: (table: string) => {
      if (table === "mailing_inbox_aliases") return chain(f.alias ?? null)
      if (table === "profiles") return chain(f.profile ?? null)
      if (table === "match_assessments") return chain(f.match ?? null)
      if (table === "candidates") return chain(f.candidate ?? null)
      if (table === "email_messages") return chain(sortants[0] ?? null, sortants)
      throw new Error(`table inattendue: ${table}`)
    },
  } as unknown as SupabaseClient<Database>
}

const SOURCEUR = { user_id: "u-sophie", organization_id: ORG }

describe("l'adresse dédiée à une mission : le chemin infaillible", () => {
  it("tranche même quand l'objet et la chronologie désignent une AUTRE mission", async () => {
    /* Le cas que l'objet ne pouvait pas résoudre : deux missions au même
     * intitulé, donc au même objet. L'adresse, elle, ne désigne qu'un seul
     * couple (sourceur, mission) — c'est ce qui la rend infaillible. */
    const admin = fakeAdmin({
      alias: { user_id: "u-sophie", organization_id: ORG, job_id: "job-vrai" },
      profile: SOURCEUR,
      candidate: { id: "cand-A" },
      outbound: [
        { job_id: "job-homonyme", subject: "Commercial", created_at: "2026-09-02T10:00:00Z" },
      ],
    })

    const routing = await resolveInboundRouting(admin, {
      toAddress: "sophie.commercial-2@reply.naywastudio.com",
      fromAddress: "candidat@exemple.fr",
      subject: "Re: Commercial",
    })

    expect(routing.jobId).toBe("job-vrai")
    expect(routing.candidateId).toBe("cand-A")
    expect(routing.userId).toBe("u-sophie")
  })

  it("rattache la mission même quand le candidat est inconnu du vivier", async () => {
    // L'adresse dit la mission ; l'expéditeur dit le candidat. L'un ne doit
    // pas faire tomber l'autre.
    const admin = fakeAdmin({
      alias: { user_id: "u-sophie", organization_id: ORG, job_id: "job-vrai" },
      profile: SOURCEUR,
      candidate: null,
    })

    const routing = await resolveInboundRouting(admin, {
      toAddress: "sophie.commercial@reply.naywastudio.com",
      fromAddress: "inconnu@exemple.fr",
    })

    expect(routing.jobId).toBe("job-vrai")
    expect(routing.candidateId).toBeNull()
  })

  it("une adresse d'une AUTRE organisation ne rattache pas sa mission", async () => {
    /* Même garde que pour l'ancien jeton : l'adresse circule chez les
     * candidats. Un alias appartenant à un autre cabinet ne doit pas injecter
     * sa mission dans le fil de celui-ci. */
    const admin = fakeAdmin({
      alias: { user_id: "u-sophie", organization_id: AUTRE_ORG, job_id: "job-espion" },
      profile: SOURCEUR,
      candidate: { id: "cand-A" },
      outbound: [{ job_id: "job-legitime", subject: "X", created_at: "2026-09-01T10:00:00Z" }],
    })

    const routing = await resolveInboundRouting(admin, {
      toAddress: "sophie.espion@reply.naywastudio.com",
      fromAddress: "candidat@exemple.fr",
    })

    expect(routing.jobId).toBe("job-legitime")
  })
})

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

  it("l'OBJET l'emporte sur la chronologie — c'est ce qui remplace le jeton", async () => {
    /* Le cas qui a motivé tout le mécanisme : un candidat approché sur deux
     * missions répond à la PLUS ANCIENNE. La déduction par « dernier sortant »
     * la rattacherait à la plus récente, en silence. */
    const admin = fakeAdmin({
      profile: SOURCEUR,
      candidate: { id: "cand-A" },
      outbound: [
        { job_id: "job-recent", subject: "Un poste chez BNP", created_at: "2026-09-02T10:00:00Z" },
        { job_id: "job-ancien", subject: "Une opportunité chez Club Med", created_at: "2026-09-01T10:00:00Z" },
      ],
    })

    const routing = await resolveInboundRouting(admin, {
      toAddress: "sophie@reply.naywastudio.com",
      fromAddress: "candidat@exemple.fr",
      subject: "Re : Une opportunité chez Club Med",
    })

    expect(routing.jobId).toBe("job-ancien")
  })

  it("sans objet exploitable, la chronologie reprend la main", async () => {
    // Un objet réécrit par le candidat ne doit pas faire disparaître sa
    // réponse : mieux vaut un rattachement approximatif que rien.
    const admin = fakeAdmin({
      profile: SOURCEUR,
      candidate: { id: "cand-A" },
      outbound: [
        { job_id: "job-recent", subject: "Un poste chez BNP", created_at: "2026-09-02T10:00:00Z" },
      ],
    })

    const routing = await resolveInboundRouting(admin, {
      toAddress: "sophie@reply.naywastudio.com",
      fromAddress: "candidat@exemple.fr",
      subject: "Question",
    })

    expect(routing.jobId).toBe("job-recent")
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
