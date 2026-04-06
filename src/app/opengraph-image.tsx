import { ImageResponse } from 'next/og'

export const alt = 'Nawa Studio — Agents IA pour les entreprises'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0A0A0F',
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
        {/* Grid pattern */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        {/* Blue radial glow */}
        <div
          style={{
            position: 'absolute',
            right: '-100px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '600px',
            height: '600px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,102,255,0.18) 0%, transparent 70%)',
          }}
        />

        {/* Logo badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '48px',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: '#0066FF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ color: 'white', fontWeight: 700, fontSize: '28px' }}>N</span>
          </div>
          <span
            style={{
              color: '#F8F8FF',
              fontWeight: 600,
              fontSize: '28px',
              letterSpacing: '-0.02em',
            }}
          >
            Nawa Studio
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            color: '#F8F8FF',
            fontWeight: 700,
            fontSize: '64px',
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
            maxWidth: '760px',
            marginBottom: '28px',
          }}
        >
          Des agents IA qui travaillent pour votre business
        </div>

        {/* Sub */}
        <div
          style={{
            color: '#8B8BA8',
            fontWeight: 400,
            fontSize: '26px',
            lineHeight: 1.5,
            maxWidth: '680px',
            marginBottom: '48px',
          }}
        >
          Sales · Support · Contenu · Back-office — déployés en 48h
        </div>

        {/* Pills */}
        <div style={{ display: 'flex', gap: '12px' }}>
          {['Déploiement 48h', '10h/sem économisées', 'Sans engagement'].map((label) => (
            <div
              key={label}
              style={{
                background: 'rgba(0,102,255,0.12)',
                border: '1px solid rgba(0,102,255,0.25)',
                borderRadius: '100px',
                padding: '10px 20px',
                color: '#60A5FA',
                fontSize: '18px',
                fontWeight: 500,
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
