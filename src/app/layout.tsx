import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { spaceGrotesk, inter, instrumentSerif } from '@/lib/fonts'
import { MotionProvider } from '@/components/providers/MotionProvider'
import './globals.css'

const SITE_URL = 'https://nawastudio.com'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: 'Naywa Studio — Le CRM IA pour sourceurs',
    template: '%s | Naywa Studio',
  },
  description:
    'Naywa Studio — Nora, le CRM IA pour sourceurs. Organisez votre vivier de CVs, matchez automatiquement avec vos postes, anonymisez et suivez votre pipeline candidat.',
  keywords: [
    'CRM recrutement',
    'CRM sourceurs',
    'matching CV IA',
    'anonymisation CV',
    'vivier candidats',
    'IA recrutement',
    'pipeline candidat',
  ],
  authors: [{ name: 'Naywa Studio', url: SITE_URL }],
  creator: 'Naywa Studio',
  publisher: 'Naywa Studio',

  alternates: {
    canonical: SITE_URL,
  },

  openGraph: {
    title: 'Naywa Studio — Le CRM IA pour sourceurs',
    description:
      'Nora organise votre vivier de CVs, match avec vos postes, anonymise et suit votre pipeline candidat.',
    url: SITE_URL,
    siteName: 'Naywa Studio',
    locale: 'fr_FR',
    type: 'website',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Naywa Studio — Le CRM IA pour sourceurs',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Naywa Studio — Le CRM IA pour sourceurs',
    description:
      'Nora organise votre vivier de CVs, match avec vos postes, anonymise et suit votre pipeline.',
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

  // Icons are generated dynamically from src/app/icon.tsx and
  // src/app/apple-icon.tsx — Next.js auto-detects them. No need to
  // declare them explicitly here.
}

export const viewport: Viewport = {
  themeColor: '#FAFAFA',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
}

// ── JSON-LD Structured Data ────────────────────────────────────────────────
const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Naywa Studio',
  url: SITE_URL,
  logo: `${SITE_URL}/naywa-logo-full.svg`,
  description:
    "Naywa Studio — Le CRM IA pour sourceurs. Organisez votre vivier de CVs, matchez automatiquement avec vos postes ouverts, anonymisez et suivez votre pipeline.",
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
  name: 'Naywa Studio',
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
      className={`${spaceGrotesk.variable} ${inter.variable} ${instrumentSerif.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        <MotionProvider>
          <main className="flex-1">{children}</main>
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
