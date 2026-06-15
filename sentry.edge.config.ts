/**
 * Sentry — edge runtime (proxy.ts + edge functions).
 *
 * Le runtime edge est plus restrictif que Node — pas tous les modules
 * Sentry sont supportés, donc on garde la conf minimale.
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
