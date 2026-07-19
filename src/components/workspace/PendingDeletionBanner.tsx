"use client"

import { useEffect, useMemo, useState } from "react"
import { getSupabase } from "@/lib/supabase"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const copy = {
  fr: {
    message: (dateLabel: string) => (
      <>L&apos;organisation sera fermée le <strong>{dateLabel}</strong>. Sauvegardez les données que vous souhaitez conserver d&apos;ici là.</>
    ),
  },
  en: {
    message: (dateLabel: string) => (
      <>This organization will close on <strong>{dateLabel}</strong>. Save any data you want to keep before then.</>
    ),
  },
}

/**
 * Banner shown across the workspace when the cabinet's owner has cancelled
 * the subscription / asked to delete the cabinet. Members keep access for
 * 30 days, then the cron wipes everything.
 *
 * Lives at the very top of /workspace/layout.tsx below the header.
 */
export default function PendingDeletionBanner() {
  const { lang } = useLanguage()
  const t = copy[lang]
  const sb = useMemo(() => getSupabase(), [])
  const [iso, setIso] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data: profile } = await sb
        .from("profiles").select("organization_id").eq("user_id", user.id).single()
      if (!profile) return
      const { data: org } = await sb
        .from("organizations").select("pending_deletion_at").eq("id", profile.organization_id).single()
      if (mounted) setIso(org?.pending_deletion_at ?? null)
    })()
    return () => { mounted = false }
  }, [sb])

  if (!iso) return null

  const date = new Date(iso)
  const dateLabel = date.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { day: "numeric", month: "long", year: "numeric" })

  return (
    <div style={{
      background: "rgba(217,119,6,0.10)",
      borderBottom: "1px solid rgba(217,119,6,0.25)",
      padding: "10px 20px",
      fontSize: 13, fontWeight: 600, color: "var(--nw-warn-strong)",
      textAlign: "center",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      {t.message(dateLabel)}
    </div>
  )
}
