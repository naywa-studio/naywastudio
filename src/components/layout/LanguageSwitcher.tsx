'use client'

import { useEffect, useRef, useState } from 'react'
import { useLanguage, type Lang } from '@/lib/i18n/LanguageContext'

const LANGUAGES: { value: Lang; label: string }[] = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
]

export function LanguageSwitcher() {
  const { lang, setLang } = useLanguage()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const current = LANGUAGES.find((l) => l.value === lang)!

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Changer de langue / Change language"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          fontWeight: 600,
          color: '#4B5563',
          padding: '9px 14px',
          borderRadius: 999,
          border: '1px solid rgba(124,99,200,0.20)',
          background: 'rgba(255,255,255,0.4)',
          cursor: 'pointer',
          fontFamily: 'var(--font-inter), sans-serif',
          transition: 'all 160ms ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(124,99,200,0.08)'
          e.currentTarget.style.borderColor = 'rgba(124,99,200,0.4)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.4)'
          e.currentTarget.style.borderColor = 'rgba(124,99,200,0.20)'
        }}
      >
        {current.label}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#7C63C8"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease' }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 46,
            right: 0,
            minWidth: 140,
            background: 'white',
            border: '1px solid #F0ECF8',
            borderRadius: 12,
            boxShadow: '0 12px 32px rgba(124,99,200,0.18)',
            padding: 6,
            fontFamily: 'var(--font-inter), sans-serif',
            zIndex: 20,
          }}
        >
          {LANGUAGES.map((l) => (
            <button
              key={l.value}
              role="menuitemradio"
              aria-checked={l.value === lang}
              onClick={() => {
                setLang(l.value)
                setOpen(false)
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '9px 12px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: l.value === lang ? 700 : 500,
                color: l.value === lang ? '#7C63C8' : '#374151',
                background: l.value === lang ? 'rgba(124,99,200,0.08)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 150ms',
              }}
              onMouseEnter={(e) => {
                if (l.value !== lang) e.currentTarget.style.background = '#F8F6FF'
              }}
              onMouseLeave={(e) => {
                if (l.value !== lang) e.currentTarget.style.background = 'transparent'
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
