import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
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
          borderRadius: '40px',
          border: '3px solid rgba(124,99,200,0.20)',
        }}
      >
        <div
          style={{
            color: '#7C63C8',
            fontSize: 130,
            fontWeight: 400,
            fontStyle: 'italic',
            fontFamily: 'serif',
            lineHeight: 1,
            letterSpacing: '-0.04em',
            transform: 'translateY(-2px)',
          }}
        >
          N
        </div>
      </div>
    ),
    { ...size },
  )
}
