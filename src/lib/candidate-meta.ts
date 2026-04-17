/** Shared metadata for candidate sources — used in mission page + NoraDashboard */
export const SOURCE_META: Record<string, {
  label: string
  color: string
  bg: string
  icon: string
  urlLabel: string
}> = {
  linkedin: { label: "LinkedIn", color: "#0A66C2", bg: "rgba(10,102,194,0.08)",  icon: "in", urlLabel: "Voir profil" },
  malt:     { label: "Malt",     color: "#FC5757", bg: "rgba(252,87,87,0.08)",   icon: "M",  urlLabel: "Voir freelance" },
  apec:     { label: "APEC",     color: "#E87722", bg: "rgba(232,119,34,0.08)",  icon: "A",  urlLabel: "Voir profil" },
}
