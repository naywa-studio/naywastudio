/**
 * Sentry — server SDK (Node runtime).
 *
 * Capture les erreurs côté Vercel serverless functions et SSR. C'est
 * ici qu'on récupère 90 % des bugs intéressants (route handlers Stripe,
 * Supabase, OpenRouter).
 *
 * Le DSN est partagé entre client et server pour viser le même projet
 * Sentry. La variable côté serveur reste SENTRY_DSN (sans prefix
 * NEXT_PUBLIC), seul le client a besoin du préfixe pour être inlined
 * au build.
 */

import * as Sentry from "@sentry/nextjs"

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0,
  })
}
