import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0066FF',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '120px',
        }}
      >
        <div
          style={{
            color: 'white',
            fontSize: 280,
            fontWeight: 700,
            fontFamily: 'sans-serif',
            lineHeight: 1,
            letterSpacing: '-0.05em',
          }}
        >
          N
        </div>
      </div>
    ),
    { ...size },
  )
}
