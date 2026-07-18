"use client"

import { useEffect, useState } from "react"
import { m, AnimatePresence } from "framer-motion"
import { brand, type as t } from "@/lib/brand"
import { Eyebrow } from "@/components/brand/Eyebrow"

/**
 * Démo simulée du Package Sourcing (accueil, juste sous le hero).
 *
 * Une UI de workspace SIMULÉE — pas une vidéo : toujours nette, légère (aucun
 * fichier à héberger), modifiable quand le produit évolue, et sans la moindre
 * donnée candidat réelle (zéro enjeu RGPD).
 *
 * 6 temps, en boucle, étapes cliquables. Le temps fort est l'étape 5
 * « vous validez » : c'est la promesse de la marque — Nora propose, l'humain
 * tranche — autant la MONTRER plutôt que l'écrire.
 *
 * Honnêteté : les données affichées sont illustratives. Pas de faux logo
 * client, pas de faux témoignage, pas de métrique inventée présentée comme
 * réelle.
 *
 * `prefers-reduced-motion` : le défilement automatique est coupé, l'utilisateur
 * navigue au clic.
 */

const STEP_MS = 3800

const STEPS = [
  { n: "01", label: "Vous déposez vos CVs", hint: "PDF, même scannés" },
  { n: "02", label: "Nora range le vivier", hint: "classement par secteur" },
  { n: "03", label: "Vous décrivez la mission", hint: "un brief suffit" },
  { n: "04", label: "Nora score et justifie", hint: "chaque note s'explique" },
  { n: "05", label: "Vous tranchez", hint: "aucune action automatique" },
  { n: "06", label: "Anonymisé, puis suivi", hint: "prêt pour votre client" },
] as const

// ── Primitives de la scène ───────────────────────────────────────────
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: brand.paper,
        border: `1px solid ${brand.border}`,
        borderRadius: brand.radiusLg,
        padding: 20,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ ...t.meta, color: brand.violet }}>{children}</div>
}

function Row({
  title,
  sub,
  right,
  accent,
}: {
  title: string
  sub?: string
  right?: React.ReactNode
  accent?: boolean
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px",
        borderRadius: brand.radiusSm,
        background: accent ? brand.violet100 : brand.surface2,
        border: `1px solid ${accent ? brand.violetSoft : brand.border}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: brand.fontBody,
            fontSize: 13,
            fontWeight: 600,
            color: brand.text,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>
        {sub && (
          <div
            style={{
              fontFamily: brand.fontBody,
              fontSize: 11,
              color: brand.textMuted,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {sub}
          </div>
        )}
      </div>
      {right}
    </div>
  )
}

function Score({ value }: { value: number }) {
  return (
    <span
      style={{
        fontFamily: brand.fontMono,
        fontSize: 12,
        fontWeight: 700,
        color: value >= 75 ? brand.success : brand.violet,
        background: value >= 75 ? brand.successBg : brand.violet100,
        border: `1px solid ${value >= 75 ? brand.success : brand.violetSoft}33`,
        borderRadius: brand.radiusPill,
        padding: "2px 9px",
      }}
    >
      {value}
    </span>
  )
}

const fade = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
}

// ── Les 6 scènes ─────────────────────────────────────────────────────
function Scene({ step }: { step: number }) {
  if (step === 0) {
    return (
      <Panel>
        <Label>Import</Label>
        <div
          style={{
            flex: 1,
            border: `1.5px dashed ${brand.violetSoft}`,
            borderRadius: brand.radiusMd,
            background: brand.violet100,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            {[0, 1, 2, 3].map((i) => (
              <m.div
                key={i}
                initial={{ y: -14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: i * 0.12, duration: 0.4 }}
                style={{
                  width: 34,
                  height: 44,
                  borderRadius: 5,
                  background: brand.surface2,
                  border: `1px solid ${brand.border}`,
                }}
              />
            ))}
          </div>
          <div style={{ ...t.body, fontSize: 13, color: brand.textSecondary }}>
            42 CVs déposés
          </div>
        </div>
      </Panel>
    )
  }

  if (step === 1) {
    const sectors = [
      { name: "IT / Data", n: 18 },
      { name: "Ingénierie", n: 11 },
      { name: "Commercial", n: 8 },
      { name: "Finance", n: 5 },
    ]
    return (
      <Panel>
        <Label>Vivier · par secteur</Label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, flex: 1 }}>
          {sectors.map((s, i) => (
            <m.div
              key={s.name}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1, duration: 0.35 }}
              style={{
                background: brand.surface2,
                border: `1px solid ${brand.border}`,
                borderRadius: brand.radiusMd,
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 4,
              }}
            >
              <div style={{ fontFamily: brand.fontBody, fontSize: 12.5, fontWeight: 600, color: brand.text }}>
                {s.name}
              </div>
              <div style={{ fontFamily: brand.fontDisplay, fontSize: 22, color: brand.violet, lineHeight: 1 }}>
                {s.n}
              </div>
            </m.div>
          ))}
        </div>
      </Panel>
    )
  }

  if (step === 2) {
    const fields = [
      ["Poste", "Data Engineer"],
      ["Lieu", "Paris · hybride"],
      ["Séniorité", "3-5 ans"],
      ["Compétences", "Python · Spark · SQL"],
    ]
    return (
      <Panel>
        <Label>Mission · détectée depuis le brief</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          {fields.map(([k, v], i) => (
            <m.div
              key={k}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.14, duration: 0.35 }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: brand.surface2,
                border: `1px solid ${brand.success}44`,
                borderRadius: brand.radiusSm,
                padding: "9px 12px",
              }}
            >
              <span style={{ ...t.meta, color: brand.textMuted, minWidth: 92 }}>{k}</span>
              <span style={{ fontFamily: brand.fontBody, fontSize: 13, color: brand.text, fontWeight: 500 }}>
                {v}
              </span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: brand.success, fontWeight: 700 }}>
                détecté
              </span>
            </m.div>
          ))}
        </div>
      </Panel>
    )
  }

  if (step === 3) {
    const cands = [
      { n: "Mike M.", s: "Senior Data Engineer · 4 ans", v: 92 },
      { n: "Paul M.", s: "Lead Data Engineer · 6 ans", v: 88 },
      { n: "Ibtissam R.", s: "Data Platform · 3 ans", v: 71 },
    ]
    return (
      <Panel>
        <Label>Matching · score justifié</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          {cands.map((c, i) => (
            <m.div
              key={c.n}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.15, duration: 0.35 }}
            >
              <Row title={c.n} sub={c.s} right={<Score value={c.v} />} />
            </m.div>
          ))}
          <div style={{ ...t.caption, fontSize: 11.5, marginTop: "auto" }}>
            Python ✓ · Spark ✓ · Paris ✓ — chaque critère est explicité.
          </div>
        </div>
      </Panel>
    )
  }

  if (step === 4) {
    return (
      <Panel>
        <Label>Votre décision</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          <m.div initial={{ scale: 1 }} animate={{ scale: [1, 1.02, 1] }} transition={{ duration: 0.6 }}>
            <Row
              title="Mike M."
              sub="Retenu pour présentation client"
              accent
              right={
                <span
                  style={{
                    fontFamily: brand.fontBody,
                    fontSize: 11,
                    fontWeight: 700,
                    color: brand.success,
                    background: brand.successBg,
                    borderRadius: brand.radiusPill,
                    padding: "3px 10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Retenu
                </span>
              }
            />
          </m.div>
          <Row title="Paul M." sub="En attente de votre avis" right={<Score value={88} />} />
          <Row title="Ibtissam R." sub="En attente de votre avis" right={<Score value={71} />} />
          <div
            style={{
              marginTop: "auto",
              ...t.caption,
              fontSize: 12,
              color: brand.textSecondary,
              borderTop: `1px solid ${brand.border}`,
              paddingTop: 10,
            }}
          >
            Rien ne part sans vous. Aucun mail, aucun classement appliqué
            automatiquement.
          </div>
        </div>
      </Panel>
    )
  }

  const stages = ["Identifié", "Contacté", "Entretien", "Offre"]
  return (
    <Panel>
      <Label>CV anonymisé · puis pipeline</Label>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        style={{
          background: brand.surface2,
          border: `1px solid ${brand.border}`,
          borderRadius: brand.radiusMd,
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: brand.radiusPill,
            background: brand.violet100,
            border: `1px solid ${brand.violetSoft}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: brand.fontMono,
            fontSize: 11,
            color: brand.violet,
          }}
        >
          C-
        </div>
        <div>
          <div style={{ fontFamily: brand.fontBody, fontSize: 13, fontWeight: 600, color: brand.text }}>
            C-8F2A41C9
          </div>
          <div style={{ ...t.caption, fontSize: 11 }}>Nom, photo et coordonnées masqués</div>
        </div>
      </m.div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, flex: 1 }}>
        {stages.map((s, i) => (
          <m.div
            key={s}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 + i * 0.1, duration: 0.3 }}
            style={{
              background: i === 0 ? brand.violet100 : brand.surface2,
              border: `1px solid ${i === 0 ? brand.violetSoft : brand.border}`,
              borderRadius: brand.radiusSm,
              padding: "10px 8px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <span style={{ ...t.meta, fontSize: 9.5, color: brand.textMuted }}>{s}</span>
            {i === 0 && (
              <span
                style={{
                  height: 22,
                  borderRadius: 4,
                  background: brand.surface2,
                  border: `1px solid ${brand.violetSoft}`,
                }}
              />
            )}
          </m.div>
        ))}
      </div>
    </Panel>
  )
}

// ── Composant principal ──────────────────────────────────────────────
export function SimulatedDemo() {
  const [step, setStep] = useState(0)
  const [auto, setAuto] = useState(true)

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const apply = () => setAuto(!mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  useEffect(() => {
    if (!auto) return
    const id = window.setInterval(() => setStep((s) => (s + 1) % STEPS.length), STEP_MS)
    return () => window.clearInterval(id)
  }, [auto, step])

  return (
    <section style={{ padding: "8px 24px 96px", position: "relative" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        <header style={{ textAlign: "center", marginBottom: 36 }}>
          <Eyebrow n="01" align="center">Le produit en mouvement</Eyebrow>
          <h2 style={{ ...t.h2, margin: "14px 0 0" }}>
            De 42 CVs à une shortlist présentable.
          </h2>
        </header>

        {/* Cadre navigateur */}
        <div
          style={{
            background: brand.surface,
            border: `1px solid ${brand.border}`,
            borderRadius: brand.radiusXl,
            boxShadow: brand.shadowLg,
            overflow: "hidden",
          }}
        >
          {/* Barre de fenêtre */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              borderBottom: `1px solid ${brand.border}`,
            }}
          >
            <span style={{ display: "flex", gap: 5 }}>
              {[brand.coral, brand.warning, brand.success].map((c) => (
                <span key={c} style={{ width: 9, height: 9, borderRadius: 999, background: c, opacity: 0.55 }} />
              ))}
            </span>
            <span
              style={{
                ...t.meta,
                fontSize: 10,
                letterSpacing: "0.08em",
                color: brand.textMuted,
                background: brand.paper,
                border: `1px solid ${brand.border}`,
                borderRadius: brand.radiusPill,
                padding: "3px 12px",
                margin: "0 auto",
              }}
            >
              naywastudio.com / workspace
            </span>
          </div>

          {/* Corps : étapes + scène */}
          <div className="demo-grid" style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 0 }}>
            <ol
              style={{
                listStyle: "none",
                margin: 0,
                padding: 14,
                borderRight: `1px solid ${brand.border}`,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {STEPS.map((s, i) => {
                const active = i === step
                return (
                  <li key={s.n}>
                    <button
                      onClick={() => setStep(i)}
                      aria-current={active}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        padding: "10px 12px",
                        borderRadius: brand.radiusSm,
                        border: "none",
                        cursor: "pointer",
                        background: active ? brand.violet100 : "transparent",
                        transition: "background 200ms ease",
                      }}
                    >
                      <span style={{ ...t.meta, color: active ? brand.violet : brand.lin, marginTop: 2 }}>
                        {s.n}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span
                          style={{
                            display: "block",
                            fontFamily: brand.fontBody,
                            fontSize: 13,
                            fontWeight: active ? 700 : 500,
                            color: active ? brand.text : brand.textSecondary,
                          }}
                        >
                          {s.label}
                        </span>
                        <span style={{ ...t.caption, fontSize: 11, display: "block" }}>{s.hint}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>

            <div style={{ padding: 18, minHeight: 320 }}>
              <AnimatePresence mode="wait">
                <m.div key={step} {...fade} style={{ height: "100%" }}>
                  <Scene step={step} />
                </m.div>
              </AnimatePresence>
            </div>
          </div>
        </div>

        <p style={{ ...t.caption, textAlign: "center", marginTop: 14 }}>
          Démonstration illustrative — aucune donnée candidat réelle.
        </p>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .demo-grid { grid-template-columns: 1fr !important; }
          .demo-grid > ol { border-right: none !important; border-bottom: 1px solid ${brand.border}; }
        }
      `}</style>
    </section>
  )
}
