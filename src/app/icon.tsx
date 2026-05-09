import { ImageResponse } from 'next/og'

// Favicon — the violet "N" mark on a soft white square,
// matching the Naywa Studio brand SVG.
export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#FFFFFF',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '96px',
          border: '6px solid rgba(124,99,200,0.18)',
        }}
      >
        <div
          style={{
            color: '#7C63C8',
            fontSize: 360,
            fontWeight: 400,
            fontStyle: 'italic',
            fontFamily: 'serif',
            lineHeight: 1,
            letterSpacing: '-0.04em',
            transform: 'translateY(-4px)',
          }}
        >
          N
        </div>
      </div>
    ),
    { ...size },
  )
}
