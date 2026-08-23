import { describe, expect, it } from "vitest"
import { hasPricingAccess, hasMailingAccess } from "./subscription"

/**
 * Les deux options payantes : Suite Pricing et Mailing.
 *
 * ── Ce que ces tests protègent ───────────────────────────────────────────
 *
 * `subscription_has_pricing` et `subscription_has_mailing` restent à `true`
 * quand un paiement échoue : le webhook Stripe pose le verrouillage mais ne
 * démonte pas les lignes d'abonnement. Sans contrôle d'accès actif, une
 * organisation en défaut gardait donc ses options — l'accès de base coupé,
 * mais le supplément payant ouvert.
 *
 * Sur le Mailing, l'enjeu est plus concret encore : elle pouvait déclarer un
 * domaine et nous faire créer une zone Route 53, facturée 0,50 $/mois par un
 * client qui ne paie plus.
 *
 * Les deux fonctions sont testées ENSEMBLE, et c'est délibéré : les corriger
 * séparément recréerait l'écart qu'on cherche à supprimer.
 */

const paid = { trial_ends_at: null, subscription_status: "active" as const, current_period_end: null }
const impaye = { trial_ends_at: null, subscription_status: "past_due" as const, current_period_end: null }
const resilie = { trial_ends_at: null, subscription_status: "canceled" as const, current_period_end: null }
const enEssai = {
  trial_ends_at: new Date(Date.now() + 5 * 86400e3).toISOString(),
  subscription_status: null,
  current_period_end: null,
}

const cases = [
  { nom: "Suite Pricing", fn: hasPricingAccess, on: { subscription_has_pricing: true }, off: { subscription_has_pricing: false } },
  { nom: "Mailing", fn: hasMailingAccess, on: { subscription_has_mailing: true }, off: { subscription_has_mailing: false } },
] as const

for (const c of cases) {
  describe(c.nom, () => {
    it("est ouverte à un abonnement actif qui l'a prise", () => {
      expect(c.fn({ ...paid, ...c.on } as never)).toBe(true)
    })

    it("reste fermée à un abonnement actif qui ne l'a pas prise", () => {
      expect(c.fn({ ...paid, ...c.off } as never)).toBe(false)
    })

    it("SE FERME sur impayé, même si la colonne dit encore true", () => {
      // Le cœur du correctif : la colonne survit au défaut de paiement.
      expect(c.fn({ ...impaye, ...c.on } as never)).toBe(false)
    })

    it("SE FERME sur résiliation, même si la colonne dit encore true", () => {
      expect(c.fn({ ...resilie, ...c.on } as never)).toBe(false)
    })

    it("est ouverte pendant l'essai gratuit", () => {
      // L'essai donne tout : c'est la règle produit, et elle ne change pas.
      expect(c.fn({ ...enEssai, ...c.off } as never)).toBe(true)
    })

    it("reste ouverte à un admin Naywa, quel que soit l'état", () => {
      expect(c.fn({ ...resilie, ...c.off } as never, { isAdmin: true })).toBe(true)
    })

    it("refuse sans organisation", () => {
      expect(c.fn(null, { isAdmin: false })).toBe(false)
    })
  })
}
