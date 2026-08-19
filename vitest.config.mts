import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

/**
 * Tests unitaires — Vitest.
 *
 * Périmètre volontairement étroit : on ne teste PAS le rendu (le PDF se vérifie
 * à l'œil, en recette) mais les CONTRATS qui se cassent en silence. Deux
 * familles, nées de deux défauts réellement rencontrés :
 *
 *  1. `anonymized-cv-model` — tout ce que le parseur extrait doit atteindre le
 *     document remis au client, ou figurer dans une liste d'exclusion
 *     JUSTIFIÉE. Les certifications sont restées invisibles des mois parce que
 *     rien ne vérifiait ce contrat.
 *
 *  2. Le câblage d'une option de bout en bout. Une case livrée avec trois de
 *     ses quatre maillons cassés reste silencieuse : elle s'affiche, elle se
 *     coche, et elle ne fait rien.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
