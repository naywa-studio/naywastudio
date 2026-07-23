/**
 * Wrapper Cloudflare R2 — server-only.
 *
 * R2 expose une API S3-compatible, on utilise donc @aws-sdk/client-s3
 * configuré avec l'endpoint Cloudflare. Buckets utilisés :
 *
 *   - naywa-cv     → PDFs candidats + DOCX anonymisés
 *   - naywa-logos  → logos brandés cabinet (approuvés + pending demande)
 *
 * Convention de path (héritée de Supabase Storage pour ne pas casser
 * les chemins existants) :
 *
 *   naywa-cv:     {organization_id}/{candidate_id}/{filename}
 *   naywa-logos:  {organization_id}/{timestamp}.{ext}
 *                 {organization_id}/pending/{timestamp}.{ext}  (demande)
 *
 * Sécurité : toutes les API routes doivent vérifier que
 * `path.startsWith(callerOrgId + "/")` avant d'opérer. R2 n'a pas
 * de RLS — c'est au code de garantir le scoping org.
 *
 * Quotas : voir lib/quota.ts pour les contrôles. Ce wrapper est
 * "naïf" — il fait l'op, c'est l'appelant qui check le quota avant.
 */

import type { ListObjectsV2CommandOutput } from "@aws-sdk/client-s3"
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

// ─── Configuration ─────────────────────────────────────────────────────

const R2_ENDPOINT = process.env.R2_ENDPOINT ?? ""
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? ""
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? ""

// Noms de buckets pilotés par env var (fallback = noms actuels). Permet
// la bascule vers les buckets EU (jurisdiction UE) sans redéploiement de
// code : il suffit de poser R2_BUCKET_CV / R2_BUCKET_LOGOS + R2_ENDPOINT
// (variante `.eu`) côté Vercel. Bascule EU déjà effectuée et vérifiée en
// prod ; la route one-off de copie (/api/admin/migrate-r2-eu) a été retirée.
export const R2_BUCKETS = {
  cv: process.env.R2_BUCKET_CV ?? "naywa-cv",
  logos: process.env.R2_BUCKET_LOGOS ?? "naywa-logos",
} as const

export type R2BucketKey = keyof typeof R2_BUCKETS

let cachedClient: S3Client | null = null

/**
 * Singleton S3 client configuré pour R2. Lazy pour ne pas crasher
 * le build si les env vars manquent côté preview/build.
 */
function getR2Client(): S3Client {
  if (cachedClient) return cachedClient
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error("R2 credentials missing — set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in env")
  }
  cachedClient = new S3Client({
    region: "auto",            // R2 ignore la region, doit être "auto"
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  })
  return cachedClient
}

// ─── Garde-fou sécurité ────────────────────────────────────────────────

/**
 * Vérifie qu'un path est bien scopé à l'org du caller. À appeler
 * dans CHAQUE API route avant tout op R2.
 *
 * @throws si le path n'a pas l'org_id du caller en 1er segment
 */
export function assertOrgScopedPath(path: string, callerOrgId: string): void {
  if (!callerOrgId) throw new Error("missing_caller_org_id")
  if (path.includes("..") || path.startsWith("/")) {
    throw new Error("invalid_path")
  }
  const firstSegment = path.split("/")[0]
  if (firstSegment !== callerOrgId) {
    throw new Error("path_not_scoped_to_org")
  }
}

// ─── Opérations R2 ─────────────────────────────────────────────────────

/** Upload un buffer dans un bucket R2. Path obligatoire scopé à l'org. */
export async function r2Upload(opts: {
  bucket: R2BucketKey
  path: string
  body: Buffer | Uint8Array
  contentType: string
  callerOrgId: string
}): Promise<void> {
  assertOrgScopedPath(opts.path, opts.callerOrgId)
  await getR2Client().send(new PutObjectCommand({
    Bucket: R2_BUCKETS[opts.bucket],
    Key: opts.path,
    Body: opts.body,
    ContentType: opts.contentType,
  }))
}

/**
 * Signed URL temporaire pour lecture (download / inline). TTL en secondes,
 * 1h par défaut — au-delà l'URL devient invalide.
 *
 * Pour les usages internes server-side (download puis re-process, ex
 * parsing CV), préférer r2Download() qui évite l'aller-retour HTTP.
 */
export async function r2SignedUrl(opts: {
  bucket: R2BucketKey
  path: string
  callerOrgId: string
  ttlSeconds?: number
  filename?: string         // si défini, force le download avec ce nom
}): Promise<string> {
  assertOrgScopedPath(opts.path, opts.callerOrgId)
  const cmd = new GetObjectCommand({
    Bucket: R2_BUCKETS[opts.bucket],
    Key: opts.path,
    ...(opts.filename && {
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(opts.filename)}"`,
    }),
  })
  return getSignedUrl(getR2Client(), cmd, { expiresIn: opts.ttlSeconds ?? 3600 })
}

/** Download direct en buffer — server-only. Pas de signed URL intermédiaire. */
export async function r2Download(opts: {
  bucket: R2BucketKey
  path: string
  callerOrgId: string
}): Promise<{ body: Buffer; contentType: string | undefined }> {
  assertOrgScopedPath(opts.path, opts.callerOrgId)
  const res = await getR2Client().send(new GetObjectCommand({
    Bucket: R2_BUCKETS[opts.bucket],
    Key: opts.path,
  }))
  const buf = res.Body ? Buffer.from(await res.Body.transformToByteArray()) : Buffer.alloc(0)
  return { body: buf, contentType: res.ContentType }
}

/** Supprime un objet. Idempotent — pas d'erreur si déjà absent. */
export async function r2Delete(opts: {
  bucket: R2BucketKey
  path: string
  callerOrgId: string
}): Promise<void> {
  assertOrgScopedPath(opts.path, opts.callerOrgId)
  await getR2Client().send(new DeleteObjectCommand({
    Bucket: R2_BUCKETS[opts.bucket],
    Key: opts.path,
  }))
}

/**
 * HEAD pour récupérer la taille (ContentLength) d'un objet — utile pour
 * incrémenter storage_used_bytes au moment d'un upload sans avoir à
 * tout relister.
 */
export async function r2GetSize(opts: {
  bucket: R2BucketKey
  path: string
  callerOrgId: string
}): Promise<number> {
  assertOrgScopedPath(opts.path, opts.callerOrgId)
  const res = await getR2Client().send(new HeadObjectCommand({
    Bucket: R2_BUCKETS[opts.bucket],
    Key: opts.path,
  }))
  return res.ContentLength ?? 0
}

/**
 * Liste tous les objets sous un préfixe (ex: `{org_id}/`) et retourne
 * la somme des tailles. Utilisé par le cron nightly de recalcul du
 * stockage par org — pas d'usage en hot path (peut faire plusieurs
 * round-trips si > 1000 objects).
 *
 * Variante admin : pas de assertOrgScopedPath car appelé en boucle
 * sur toutes les orgs depuis un cron server-only. À utiliser
 * uniquement depuis du code admin.
 */
export async function r2SumSizeByPrefix(bucket: R2BucketKey, prefix: string): Promise<number> {
  const client = getR2Client()
  let totalBytes = 0
  let continuationToken: string | undefined = undefined
  while (true) {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: R2_BUCKETS[bucket],
      Prefix: prefix,
      ContinuationToken: continuationToken,
    })) as ListObjectsV2CommandOutput
    for (const obj of res.Contents ?? []) {
      totalBytes += obj.Size ?? 0
    }
    if (!res.IsTruncated || !res.NextContinuationToken) break
    continuationToken = res.NextContinuationToken
  }
  return totalBytes
}

/**
 * Supprime TOUS les objets sous un préfixe (ex: `{org_id}/`) — par lots de
 * 1000 (limite S3 DeleteObjects). Utilisé par les crons de wipe pour purger
 * les CV candidats d'une org à la suppression (RGPD : ne pas garder de CV à
 * l'insu du client). Retourne le nombre d'objets supprimés.
 *
 * Garde-fou : le préfixe DOIT être non vide et se terminer par "/" — on ne
 * doit jamais pouvoir vider un bucket entier par erreur. Idempotent.
 *
 * Variante admin : pas de assertOrgScopedPath (appelé server-only depuis un
 * cron qui boucle sur toutes les orgs). À réserver au code admin.
 */
export async function r2DeleteByPrefix(bucket: R2BucketKey, prefix: string): Promise<number> {
  if (!prefix || !prefix.endsWith("/") || prefix.length < 2 || prefix.includes("..")) {
    throw new Error("r2DeleteByPrefix: unsafe prefix (must be non-empty and end with '/')")
  }
  const client = getR2Client()
  let deleted = 0
  let continuationToken: string | undefined = undefined
  do {
    const list = await client.send(new ListObjectsV2Command({
      Bucket: R2_BUCKETS[bucket],
      Prefix: prefix,
      ContinuationToken: continuationToken,
    })) as ListObjectsV2CommandOutput
    const keys = (list.Contents ?? [])
      .map((o) => o.Key)
      .filter((k): k is string => !!k)
    if (keys.length > 0) {
      await client.send(new DeleteObjectsCommand({
        Bucket: R2_BUCKETS[bucket],
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }))
      deleted += keys.length
    }
    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined
  } while (continuationToken)
  return deleted
}
