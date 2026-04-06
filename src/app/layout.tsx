import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { spaceGrotesk, inter } from '@/lib/fonts'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { MotionProvider } from '@/components/providers/MotionProvider'
import './globals.css'

const SITE_URL = 'https://nawastudio.com'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: 'Nawa Studio — Agents IA pour les entreprises',
    template: '%s | Nawa Studio',
  },
  description:
    'Nawa Studio déploie des agents IA opérationnels pour les entreprises. Sales agent, support 24/7, création de contenu — en 48h sur votre site.',
  keywords: [
    'agents IA',
    'automatisation IA',
    'agent recrutement',
    'support client IA',
    'studio IA Paris',
    'AI workforce',
    'intelligence artificielle entreprise',
  ],
  authors: [{ name: 'Nawa Studio', url: SITE_URL }],
  creator: 'Nawa Studio',
  publisher: 'Nawa Studio',

  alternates: {
    canonical: SITE_URL,
  },

  openGraph: {
    title: 'Nawa Studio — Agents IA pour les entreprises',
    description:
      'Déployez en 48h des agents IA opérationnels sur votre site. Sales, support, contenu, back-office.',
    url: SITE_URL,
    siteName: 'Nawa Studio',
    locale: 'fr_FR',
    type: 'website',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Nawa Studio — Agents IA pour les entreprises',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Nawa Studio — Agents IA pour les entreprises',
    description:
      'Déployez en 48h des agents IA opérationnels sur votre site. Sales, support, contenu, back-office.',
    images: ['/og-image.jpg'],
    creator: '@nawastudio',
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  icons: {
    icon: [
      { url: '/icon.png', sizes: '512x512', type: 'image/png' },
      { url: '/favicon.ico', sizes: '32x32' },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#0A0A0F',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
}

// ── JSON-LD Structured Data ────────────────────────────────────────────────
const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Nawa Studio',
  url: SITE_URL,
  logo: `${SITE_URL}/icon.png`,
  description:
    'Nawa Studio déploie des agents IA opérationnels pour les entreprises. Sales agent, support 24/7, création de contenu.',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Paris',
    addressCountry: 'FR',
  },
  sameAs: ['https://www.linkedin.com/company/nawastudio', 'https://x.com/nawastudio'],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'sales',
    email: 'hello@nawastudio.com',
    availableLanguage: ['French', 'English'],
  },
}

const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Nawa Studio',
  url: SITE_URL,
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/?q={search_term_string}` },
    'query-input': 'required name=search_term_string',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="fr"
      className={`${spaceGrotesk.variable} ${inter.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        <MotionProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </MotionProvider>

        {/* Structured Data */}
        <Script
          id="schema-organization"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
          strategy="afterInteractive"
        />
        <Script
          id="schema-website"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
          strategy="afterInteractive"
        />
      </body>
    </html>
  )
}
