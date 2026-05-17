"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { m } from "framer-motion"
import { getSupabase } from "@/lib/supabase"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

/**
 * Branding card — sits on the workspace home so the user discovers it.
 *
 * Lets the sourcer set their company name + logo. Both get baked into
 * every anonymised CV the route generates, replacing the Naywa default
 * brand. Keeps it lightweight on purpose: no full settings page yet,
 * this is the only customisation that actually changes anything in
 * the product right now.
 */
export default function BrandingCard() {
  const sb = useMemo(() => getSupabase(), [])
  const [loading, setLoading] = useState(true)
  const [brandName, setBrandName] = useState("")
  const [savedName, setSavedName] = useState("")
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState<"idle" | "saving-name" | "uploading" | "deleting">("idle")
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user || !mounted) return
      const { data } = await sb.from("profiles")
        .select("brand_name, brand_logo_path").eq("user_id", user.id).maybeSingle()
      if (!mounted) return
      const name = data?.brand_name ?? ""
      setBrandName(name); setSavedName(name)
      if (data?.brand_logo_path) {
        const { data: signed } = await sb.storage.from("brand-logos")
          .createSignedUrl(data.brand_logo_path, 60 * 60) // 1h preview
        if (mounted) setLogoUrl(signed?.signedUrl ?? null)
      }
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [sb])

  const saveName = async () => {
    if (brandName.trim() === savedName.trim()) return
    setBusy("saving-name"); setError(null)
    const res = await fetch("/api/profile/brand", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_name: brandName.trim() || null }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data?.message ?? "Échec de l'enregistrement.")
    } else {
      setSavedName(brandName.trim())
    }
    setBusy("idle")
  }

  const uploadLogo = async (file: File) => {
    setBusy("uploading"); setError(null)
    const fd = new FormData(); fd.append("file", file, file.name)
    const res = await fetch("/api/profile/brand", { method: "POST", body: fd })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data?.message ?? data?.error ?? "Upload échoué.")
      setBusy("idle"); return
    }
    // Refresh the preview by signing the new path.
    const { data: { user } } = await sb.auth.getUser()
    if (user) {
      const { data: signed } = await sb.storage.from("brand-logos")
        .createSignedUrl(data.brand_logo_path, 60 * 60)
      setLogoUrl(signed?.signedUrl ?? null)
    }
    setBusy("idle")
  }

  const deleteLogo = async () => {
    if (!confirm("Supprimer le logo ?")) return
    setBusy("deleting"); setError(null)
    const res = await fetch("/api/profile/brand", { method: "DELETE" })
    if (res.ok) setLogoUrl(null)
    else setError("Suppression échouée.")
    setBusy("idle")
  }

  if (loading) return null

  return (
    <m.section
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      style={{
        background: "white", border: "1px solid #F0ECF8", borderRadius: 16,
        padding: 22,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Identité visuelle
          </p>
          <h2 style={{ margin: "4px 0 0", fontSize: 17, fontWeight: 800, color: "#111827", letterSpacing: "-0.01em" }}>
            Vos CVs anonymisés, à votre nom
          </h2>
        </div>
      </div>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "#6B7280", lineHeight: 1.6, maxWidth: "62ch" }}>
        Renseignez le nom de votre cabinet et téléchargez votre logo. Tous les
        CVs anonymisés que vous générez porteront vos couleurs au lieu de
        celles de Naywa Studio.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }} className="brand-grid">
        {/* Name */}
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
            Nom du cabinet
          </label>
          <input
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            onBlur={saveName}
            placeholder="Ex : Cabinet Dupont Recrutement"
            disabled={busy === "saving-name"}
            style={{
              width: "100%", boxSizing: "border-box",
              fontSize: 13.5, color: "#111827",
              padding: "10px 12px",
              background: "#FAFAFA",
              border: "1px solid #E5E7EB", borderRadius: 9,
              outline: "none", fontFamily: "inherit",
            }}
          />
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "#9CA3AF" }}>
            {busy === "saving-name" ? "Enregistrement…"
              : brandName.trim() && brandName.trim() === savedName.trim()
                ? "✓ Sauvegardé"
                : "Sauvegarde automatique"}
          </p>
        </div>

        {/* Logo */}
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
            Logo
          </label>
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: 12,
            background: "#FAFAFA",
            border: "1px solid #E5E7EB", borderRadius: 9,
            minHeight: 62,
          }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo" style={{
                maxWidth: 90, maxHeight: 50,
                objectFit: "contain",
                background: "white", border: "1px solid #F0ECF8", borderRadius: 6, padding: 4,
              }} />
            ) : (
              <span style={{ fontSize: 12, color: "#9CA3AF", flex: 1 }}>
                Aucun logo · format PNG, JPG, WEBP, SVG (max 2 Mo)
              </span>
            )}
            <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
              <button
                onClick={() => fileInput.current?.click()}
                disabled={busy === "uploading"}
                style={{
                  fontSize: 12, fontWeight: 700, color: "white",
                  background: busy === "uploading" ? "#C4B6E0" : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                  border: "none", borderRadius: 8, padding: "7px 12px",
                  cursor: busy === "uploading" ? "default" : "pointer", fontFamily: "inherit",
                }}
              >
                {busy === "uploading" ? "Upload…" : logoUrl ? "Remplacer" : "Téléverser"}
              </button>
              {logoUrl && (
                <button
                  onClick={deleteLogo}
                  disabled={busy === "deleting"}
                  style={{
                    fontSize: 12, fontWeight: 600, color: "#9CA3AF",
                    background: "transparent", border: "1px solid #E5E7EB",
                    borderRadius: 8, padding: "7px 10px",
                    cursor: busy === "deleting" ? "default" : "pointer", fontFamily: "inherit",
                  }}
                >
                  Retirer
                </button>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) uploadLogo(f)
                e.target.value = ""
              }}
            />
          </div>
        </div>
      </div>

      {error && (
        <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "#B91C1C" }}>{error}</p>
      )}

      <style>{`
        @media (max-width: 720px) {
          .brand-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </m.section>
  )
}
