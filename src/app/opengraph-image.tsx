import { ImageResponse } from 'next/og'

export const alt = 'Naywa Studio — Sourcing automatisé pour recruteurs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#FAFAFA',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* Soft violet wash */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse 70% 60% at 90% 10%, rgba(124,99,200,0.10) 0%, transparent 65%),' +
              'radial-gradient(ellipse 60% 50% at 0% 100%, rgba(184,174,222,0.10) 0%, transparent 60%)',
          }}
        />

        {/* Logo badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '14px',
            marginBottom: '48px',
            position: 'relative',
          }}
        >
          <span
            style={{
              fontSize: '76px',
              fontWeight: 400,
              fontStyle: 'italic',
              fontFamily: 'serif',
              color: '#7C63C8',
              lineHeight: 0.9,
              letterSpacing: '-0.03em',
            }}
          >
            N
          </span>
          <span
            style={{
              color: '#111827',
              fontWeight: 600,
              fontSize: '32px',
              letterSpacing: '-0.012em',
            }}
          >
            Naywa Studio
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            color: '#111827',
            fontWeight: 800,
            fontSize: '74px',
            lineHeight: 1.06,
            letterSpacing: '-0.035em',
            maxWidth: '880px',
            marginBottom: '24px',
            position: 'relative',
          }}
        >
          Vos meilleurs candidats LinkedIn en 2 minutes.
        </div>

        {/* Sub */}
        <div
          style={{
            color: '#4B5563',
            fontWeight: 400,
            fontSize: '24px',
            lineHeight: 1.5,
            maxWidth: '720px',
            marginBottom: '40px',
            position: 'relative',
          }}
        >
          Décrivez votre poste, Léo source jusqu&apos;à 60 profils triés par
          pertinence. Tableur Excel exportable.
        </div>

        {/* Pills */}
        <div style={{ display: 'flex', gap: '12px', position: 'relative' }}>
          {['Beta gratuite', 'Aucune carte bancaire', 'Setup en 2 min'].map((label) => (
            <div
              key={label}
              style={{
                background: 'rgba(124,99,200,0.08)',
                border: '1px solid rgba(124,99,200,0.22)',
                borderRadius: '100px',
                padding: '10px 20px',
                color: '#7C63C8',
                fontSize: '17px',
                fontWeight: 600,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  )
}
