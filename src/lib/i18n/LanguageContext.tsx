'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { getSupabase } from '@/lib/supabase'

export type Lang = 'fr' | 'en'

interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function isLang(value: unknown): value is Lang {
  return value === 'fr' || value === 'en'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Français par défaut pour tout visiteur non connecté — pas de mémoire
  // via localStorage entre deux visites anonymes. Seul un compte connecté
  // a une préférence persistée (profiles.preferred_language).
  const [lang, setLangState] = useState<Lang>('fr')
  // Tracks whether the current value came from the account, so setLang
  // knows whether it's safe to persist to the profile. Kept in sync via
  // onAuthStateChange (not a one-shot getSession() check) : login/logout
  // usually happen via client-side navigation without a full page reload,
  // so LanguageProvider (mounted once in the root layout) would otherwise
  // never learn that a session appeared or disappeared.
  const isAuthedRef = useRef(false)

  useEffect(() => {
    const sb = getSupabase()

    const syncFromAccount = async (userId: string) => {
      isAuthedRef.current = true
      const { data } = await sb
        .from('profiles')
        .select('preferred_language')
        .eq('user_id', userId)
        .single()
      if (isLang(data?.preferred_language)) {
        setLangState(data.preferred_language)
      }
    }

    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        void syncFromAccount(session.user.id)
      } else if (event === 'SIGNED_OUT') {
        isAuthedRef.current = false
        // Retour au français par défaut dès la déconnexion.
        setLangState('fr')
      }
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = (next: Lang) => {
    setLangState(next)
    if (isAuthedRef.current) {
      fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferred_language: next }),
      }).then((res) => {
        if (!res.ok) {
          // eslint-disable-next-line no-console
          console.error('[LanguageContext] preferred_language save failed', res.status)
        }
      }).catch(() => {
        // eslint-disable-next-line no-console
        console.error('[LanguageContext] preferred_language save failed (network)')
      })
    }
  }

  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider')
  return ctx
}
