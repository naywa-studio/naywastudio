import { redirect } from "next/navigation"

/**
 * /organisation/parametrage — redirection permanente.
 *
 * Les réglages pricing récurrents ont été fusionnés DANS la console
 * /organisation (section « Politique de pricing »), via le composant
 * PricingPolicyForm. Cette route ne fait plus que rediriger, pour ne pas
 * casser les anciens liens/marque-pages.
 */
export default function ParametrageRedirect() {
  redirect("/organisation?tab=pricing")
}
