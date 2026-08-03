import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { spaceGrotesk, inter, instrumentSerif, fraunces, jetbrainsMono } from '@/lib/fonts'
import { MotionProvider } from '@/components/providers/MotionProvider'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { CookieBanner } from '@/components/layout/CookieBanner'
import { PreviewBadge } from '@/components/layout/PreviewBadge'
import './globals.css'

const SITE_URL = 'https://naywastudio.com'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: 'Naywa Studio, l\'optimisation de vos process métier',
    template: '%s | Naywa Studio',
  },
  description:
    'Naywa Studio conçoit des packages d\'optimisation de process métier. Notre premier package, Package Sourcing, est destiné aux ESN, cabinets de consulting et cabinets de recrutement : vivier, missions, matching, pricing Syntec, pipeline candidat.',
  keywords: [
    'optimisation process métier',
    'package sourcing',
    'CRM cabinet recrutement',
    'pricing Syntec',
    'matching candidat',
    'anonymisation CV',
    'vivier candidats',
    'ESN cabinet consulting',
    'pipeline candidat',
  ],
  authors: [{ name: 'Naywa Studio', url: SITE_URL }],
  creator: 'Naywa Studio',
  publisher: 'Naywa Studio',

  alternates: {
    canonical: SITE_URL,
  },

  openGraph: {
    title: 'Naywa Studio, nous traitons, vous décidez',
    description:
      'L\'optimisation de vos process métier. Pensée pour votre équipe, pas à sa place. Package Sourcing : vivier, missions, pricing Syntec, pipeline candidat.',
    url: SITE_URL,
    siteName: 'Naywa Studio',
    locale: 'fr_FR',
    type: 'website',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Naywa Studio, l\'optimisation de vos process métier',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Naywa Studio, nous traitons, vous décidez',
    description:
      'L\'optimisation de vos process métier. Package Sourcing : vivier, missions, pricing Syntec, pipeline candidat.',
    images: ['/og-image.jpg'],
    creator: '@naywastudio',
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
    "Naywa Studio conçoit des packages d'optimisation de process métier. Package Sourcing : vivier, missions, matching, pricing Syntec, pipeline candidat. Pour ESN, cabinets de consulting et cabinets de recrutement.",
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Paris',
    addressCountry: 'FR',
  },
  sameAs: ['https://www.linkedin.com/company/naywastudio', 'https://x.com/naywastudio'],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'sales',
    email: 'contact@naywastudio.com',
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
      className={`${spaceGrotesk.variable} ${inter.variable} ${instrumentSerif.variable} ${fraunces.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        <LanguageProvider>
          <MotionProvider>
            <main className="flex-1">{children}</main>
          </MotionProvider>
          <PreviewBadge />
          <CookieBanner />
        </LanguageProvider>

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
