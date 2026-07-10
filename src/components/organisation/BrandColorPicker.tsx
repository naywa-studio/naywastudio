"use client"

/**
 * BrandColorPicker — sélecteur de couleur principale + secondaire
 * pour le branding cabinet. Trois sources de couleurs proposées :
 *
 *   1. **Couleurs extraites du logo** (si un logo est uploadé) :
 *      analyse pixel via canvas, regroupement par bucket grossier,
 *      tri par fréquence. On présente les 5 dominantes.
 *
 *   2. **Palette curated** : 14 couleurs sobres couvrant les
 *      directions usuelles (corporate, tech, warmth, créative).
 *
 *   3. **Bouton "Off / non configurée"** : remet le champ à NULL en
 *      DB ; le PDF sera rendu en noir (#000000) côté serveur.
 *
 * Pas de color picker libre — un sourceur n'a pas besoin de choisir
 * #B5736F. Soit il prend une couleur de son logo, soit une couleur
 * de la palette curated. Précis, rapide, pas frustrant.
 *
 * Option bicolore : toggle "Ajouter une couleur secondaire" qui
 * révèle une seconde rangée de sélection identique à la première.
 */

import { useEffect, useRef, useState } from "react"

const OFF_COLOR = "#000000"

/**
 * Palette curated — 14 couleurs sobres pour usage B2B.
 * On évite les fluo et les pastels trop juvéniles.
 */
const CURATED_PALETTE: Array<{ hex: string; name: string }> = [
  { hex: "#0F172A", name: "Encre" },
  { hex: "#1E40AF", name: "Bleu profond" },
  { hex: "#0369A1", name: "Bleu acier" },
  { hex: "#0E7490", name: "Sarcelle" },
  { hex: "#15803D", name: "Forêt" },
  { hex: "#65A30D", name: "Olive" },
  { hex: "#CA8A04", name: "Ocre" },
  { hex: "#C2410C", name: "Cuivre" },
  { hex: "#B91C1C", name: "Carmin" },
  { hex: "#BE185D", name: "Magenta" },
  { hex: "#7C3AED", name: "Violet" },
  { hex: "#4F46E5", name: "Indigo" },
  { hex: "#4B5563", name: "Graphite" },
  { hex: "#7C63C8", name: "Naywa" },
]

interface BrandColorPickerProps {
  primary: string | null      // valeur DB (hex sans rendu visuel actuel)
  secondary: string | null
  isOwner: boolean
  /** URL signed du logo cabinet pour extraire ses couleurs.
   *  Null si pas de logo uploadé. */
  logoUrl: string | null
  /** Persiste sur DB via PATCH /api/cabinet. Le composant ne pousse
   *  pas la requête lui-même — il délègue au parent pour mutualiser
   *  busy/error state. */
  onSave: (patch: { brand_color?: string | null; brand_color_secondary?: string | null }) => Promise<void>
  /** Sauvegarde en cours côté parent (pour disabled). */
  saving?: boolean
}

export function BrandColorPicker({
  primary, secondary, isOwner, logoUrl, onSave, saving = false,
}: BrandColorPickerProps) {
  const [logoColors, setLogoColors] = useState<string[]>([])
  const [extracting, setExtracting] = useState(false)
  const [bicolore, setBicolore] = useState<boolean>(secondary !== null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Extraction des couleurs dominantes depuis le logo via canvas.
  // Algo léger : on échantillonne 1 px sur 4 par axe, bucket 32 niveaux
  // par canal, on garde les 5 plus fréquents. Filtre les trop clairs
  // (background) et trop sombres (anti-aliasing).
  useEffect(() => {
    if (!logoUrl) { setLogoColors([]); return }
    let cancelled = false
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      if (cancelled) return
      setExtracting(true)
      try {
        const canvas = canvasRef.current ?? document.createElement("canvas")
        const maxDim = 120
        const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1)
        const w = Math.max(1, Math.floor(img.width * ratio))
        const h = Math.max(1, Math.floor(img.height * ratio))
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext("2d", { willReadFrequently: true })
        if (!ctx) { setExtracting(false); return }
        ctx.drawImage(img, 0, 0, w, h)
        const pixels = ctx.getImageData(0, 0, w, h).data
        const buckets: Record<string, number> = {}
        for (let i = 0; i < pixels.length; i += 16) {
          const a = pixels[i + 3]
          if (a < 128) continue // transparent
          const r = pixels[i]
          const g = pixels[i + 1]
          const b = pixels[i + 2]
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
          if (lum > 240 || lum < 18) continue // trop clair/foncé
          const rb = r >> 5
          const gb = g >> 5
          const bb = b >> 5
          const key = `${rb}-${gb}-${bb}`
          buckets[key] = (buckets[key] ?? 0) + 1
        }
        const top = Object.entries(buckets)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([k]) => {
            const [rb, gb, bb] = k.split("-").map(Number)
            const r = Math.min(255, rb * 32 + 16)
            const g = Math.min(255, gb * 32 + 16)
            const b = Math.min(255, bb * 32 + 16)
            return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase()}`
          })
        // Dédoublonnage soft : on évite 2 couleurs trop proches.
        const dedup: string[] = []
        for (const c of top) {
          const close = dedup.some((d) => colorDistance(c, d) < 40)
          if (!close) dedup.push(c)
          if (dedup.length === 5) break
        }
        setLogoColors(dedup)
      } finally {
        setExtracting(false)
      }
    }
    img.onerror = () => { setExtracting(false); setLogoColors([]) }
    img.src = logoUrl
    return () => { cancelled = true }
  }, [logoUrl])

  const setPrimary = async (hex: string | null) => {
    if (!isOwner) return
    await onSave({ brand_color: hex })
  }
  const setSecondary = async (hex: string | null) => {
    if (!isOwner) return
    await onSave({ brand_color_secondary: hex })
  }
  const toggleBicolore = async () => {
    if (!isOwner) return
    if (bicolore) {
      // Off → on nullifie la secondary aussi
      await setSecondary(null)
      setBicolore(false)
    } else {
      setBicolore(true)
    }
  }

  const isOff = !primary

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <canvas ref={canvasRef} style={{ display: "none" }} aria-hidden />

      {/* Aperçu courant */}
      <CurrentColorPreview
        label="Couleur principale"
        hex={primary ?? OFF_COLOR}
        isOff={isOff}
      />

      {/* Couleurs extraites du logo */}
      {logoUrl && (
        <PaletteRow
          title="Couleurs de votre logo"
          colors={logoColors}
          selected={primary}
          onSelect={setPrimary}
          empty={extracting ? "Extraction en cours…" : "Aucune couleur dominante détectée."}
          disabled={!isOwner || saving}
        />
      )}

      {/* Palette curated */}
      <PaletteRow
        title="Palette suggérée"
        colors={CURATED_PALETTE.map((c) => c.hex)}
        labels={CURATED_PALETTE.map((c) => c.name)}
        selected={primary}
        onSelect={setPrimary}
        disabled={!isOwner || saving}
      />

      {/* Off button */}
      {!isOff && (
        <button
          type="button"
          onClick={() => setPrimary(null)}
          disabled={!isOwner || saving}
          style={{
            alignSelf: "flex-start",
            fontSize: 11.5, color: "#6B7280", fontWeight: 600,
            background: "transparent", border: "1px solid #E5E7EB",
            borderRadius: 8, padding: "6px 12px",
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Réinitialiser (noir)
        </button>
      )}

      {/* Toggle bicolore */}
      <div style={{
        marginTop: 8, paddingTop: 14,
        borderTop: "1px solid #F0ECF8",
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: isOwner ? "pointer" : "default" }}>
          <input
            type="checkbox"
            checked={bicolore}
            onChange={toggleBicolore}
            disabled={!isOwner || saving}
            style={{ accentColor: "#7C63C8" }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
            Ajouter une couleur secondaire
          </span>
          <span style={{ fontSize: 11.5, color: "#6B7280" }}>
            (titres de section, accents)
          </span>
        </label>

        {bicolore && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingLeft: 4 }}>
            <CurrentColorPreview
              label="Couleur secondaire"
              hex={secondary ?? OFF_COLOR}
              isOff={!secondary}
            />
            {logoUrl && logoColors.length > 0 && (
              <PaletteRow
                title="Couleurs de votre logo"
                colors={logoColors}
                selected={secondary}
                onSelect={setSecondary}
                disabled={!isOwner || saving}
                small
              />
            )}
            <PaletteRow
              title="Palette suggérée"
              colors={CURATED_PALETTE.map((c) => c.hex)}
              labels={CURATED_PALETTE.map((c) => c.name)}
              selected={secondary}
              onSelect={setSecondary}
              disabled={!isOwner || saving}
              small
            />
            {secondary && (
              <button
                type="button"
                onClick={() => setSecondary(null)}
                disabled={!isOwner || saving}
                style={{
                  alignSelf: "flex-start",
                  fontSize: 11.5, color: "#6B7280", fontWeight: 600,
                  background: "transparent", border: "1px solid #E5E7EB",
                  borderRadius: 8, padding: "6px 12px",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Retirer la couleur secondaire
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Sub-components ─────────────────────────────────────────────── */

function CurrentColorPreview({ label, hex, isOff }: { label: string; hex: string; isOff: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{
        width: 38, height: 38,
        borderRadius: 10,
        background: hex,
        border: "1px solid rgba(0,0,0,0.10)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)",
      }} />
      <div>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#6B7280", letterSpacing: "0.05em", textTransform: "uppercase" }}>
          {label}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 14, fontFamily: "var(--font-space-grotesk), monospace", fontWeight: 700, color: "#111827" }}>
          {isOff ? <span style={{ color: "#6B7280" }}>Non configurée</span> : hex.toUpperCase()}
        </p>
      </div>
    </div>
  )
}

function PaletteRow({
  title, colors, labels, selected, onSelect, empty, disabled, small,
}: {
  title: string
  colors: string[]
  labels?: string[]
  selected: string | null
  onSelect: (hex: string) => void
  empty?: string
  disabled?: boolean
  small?: boolean
}) {
  const size = small ? 24 : 30
  return (
    <div>
      <p style={{ margin: "0 0 8px", fontSize: 11.5, fontWeight: 600, color: "#374151" }}>
        {title}
      </p>
      {colors.length === 0 && empty && (
        <p style={{ margin: 0, fontSize: 11.5, color: "#6B7280", fontStyle: "italic" }}>{empty}</p>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {colors.map((c, i) => {
          const isSelected = selected?.toLowerCase() === c.toLowerCase()
          return (
            <button
              key={`${c}-${i}`}
              type="button"
              onClick={() => onSelect(c)}
              disabled={disabled}
              title={labels?.[i] ?? c}
              style={{
                width: size, height: size,
                borderRadius: size / 2,
                background: c,
                border: isSelected ? "2px solid #111827" : "1px solid rgba(0,0,0,0.10)",
                boxShadow: isSelected ? "0 0 0 2px white, 0 0 0 3.5px #7C63C8" : "none",
                cursor: disabled ? "default" : "pointer",
                padding: 0,
                transition: "transform 120ms",
              }}
              aria-label={labels?.[i] ?? c}
            />
          )
        })}
      </div>
    </div>
  )
}

/* ─── Helpers ────────────────────────────────────────────────────── */

function colorDistance(a: string, b: string): number {
  const ra = parseInt(a.slice(1, 3), 16), ga = parseInt(a.slice(3, 5), 16), ba = parseInt(a.slice(5, 7), 16)
  const rb = parseInt(b.slice(1, 3), 16), gb = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16)
  // Euclidienne pondérée approchée — pas du delta-E parfait mais ok pour bucket
  return Math.sqrt((ra - rb) ** 2 + (ga - gb) ** 2 + (ba - bb) ** 2)
}
