/**
 * Secteurs "seed" — liste large créée à la première visite du vivier d'une org.
 *
 * But : donner une structure immédiate (cartes secteur) et surtout des
 * DÉFINITIONS dès le départ, réinjectées dans le classement Nora
 * (lib/sector-classify) pour un rangement cohérent. Le sourceur peut ensuite
 * renommer / supprimer / en créer d'autres.
 */

export interface SectorSeed {
  name: string
  description: string
}

export const DEFAULT_SECTORS: SectorSeed[] = [
  { name: "Commercial", description: "Profils de vente, business development, négociation, relation client et développement de comptes." },
  { name: "Immobilier", description: "Métiers de l'immobilier : transaction, gestion locative, promotion, property management, immobilier d'entreprise ou de luxe." },
  { name: "Finance / Comptabilité", description: "Comptabilité, contrôle de gestion, audit, finance d'entreprise, trésorerie, consolidation." },
  { name: "Marketing / Communication", description: "Marketing, communication, growth, contenu, brand, acquisition, relations presse et digital." },
  { name: "Ressources humaines", description: "Recrutement, gestion de carrière, paie, formation, développement RH, relations sociales." },
  { name: "IT / Data", description: "Développement logiciel, data, cloud, infrastructure, cybersécurité, product et métiers techniques du numérique." },
  { name: "Ingénierie", description: "Ingénierie industrielle, mécanique, électronique, énergie, R&D, bureau d'études (hors informatique)." },
  { name: "Juridique", description: "Droit, juristes d'entreprise, avocats, compliance, contrats, propriété intellectuelle." },
  { name: "Santé", description: "Métiers du soin et de la santé : médical, paramédical, pharmaceutique, biotech, dispositifs médicaux." },
  { name: "Logistique / Supply chain", description: "Approvisionnement, transport, entreposage, planification, achats, supply chain et opérations." },
  { name: "BTP / Construction", description: "Bâtiment, travaux publics, construction, conduite de travaux, génie civil, second œuvre." },
  { name: "Hôtellerie / Restauration", description: "Hôtellerie, restauration, tourisme, accueil, événementiel et services associés." },
]
