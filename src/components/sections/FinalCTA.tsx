"use client"

import Link from "next/link"
import { brand, type as t } from "@/lib/brand"
import { useLanguage } from "@/lib/i18n/LanguageContext"

/**
 * CTA final — bande ENCRE, pour clore la page par un contraste franc
 * (charte v2.0 : le rythme alterne papier / encre).
 *
 * Remplace l'ancienne version (4 pastilles de garanties, palette lavande) :
 * les garanties sont désormais portées par la TrustBar en HAUT de page, là
 * où elles lèvent le doute AVANT la lecture. Les répéter en bas diluait la
 * dernière invitation à agir.
 */

const content = {
  fr: {
    title: "Essayez sur votre vrai vivier.",
    body: "15 jours offerts, sans carte bancaire. Déposez vos CV, créez une mission, jugez sur pièce.",
    cta: "Démarrer l'essai gratuit →",
  },
  en: {
    title: "Try it on your own talent pool.",
    body: "15 days free, no credit card. Drop in your CVs, create a role, judge for yourself.",
    cta: "Start the free trial →",
  },
}

export function FinalCTA() {
  const { lang } = useLanguage()
  const c = content[lang]

  return (
    <section style={{ padding: "104px 24px 120px", background: brand.ink }}>
      <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ ...t.h2, color: brand.sable, margin: "0 0 14px" }}>{c.title}</h2>
        <p
          style={{
            ...t.body,
            fontSize: 15.5,
            lineHeight: 1.75,
            color: brand.violetSoft,
            margin: "0 0 28px",
          }}
        >
          {c.body}
        </p>
        <Link href="/login?mode=signup" className="nw-btn nw-btn-primary">
          {c.cta}
        </Link>
      </div>
    </section>
  )
}
