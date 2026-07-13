/**
 * GET /api/admin/migrate-r2-eu — ONE-OFF, admin-only.
 *
 * Copie les objets R2 des organisations GMH depuis le bucket actuel
 * (endpoint par défaut) vers le bucket EU (jurisdiction Union européenne),
 * pour la mise en conformité RGPD "stockage UE".
 *
 * Seul GMH est concerné : les 522 autres CV étaient des tests, purgés en
 * base. Les vieux objets orphelins mourront avec l'ancien bucket (supprimé
 * après la bascule).
 *
 * Idempotent : un objet déjà présent en destination est ignoré (skip).
 * La route ne SUPPRIME jamais rien côté source — copie pure. Sans perte.
 *
 * À RETIRER après la bascule UE validée.
 *
 * Config (env Vercel) :
 *   - R2_ENDPOINT           : endpoint source actuel (déjà présent)
 *   - R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY : creds (déjà présents ;
 *     le token doit couvrir AUSSI le bucket EU — sinon 403 en écriture)
 *   - R2_ENDPOINT_EU        : optionnel. Si absent, dérivé de R2_ENDPOINT
 *                             en insérant `.eu` (variante jurisdiction UE)
 *   - R2_MIGRATE_SRC_BUCKET : défaut "naywa-cv"
 *   - R2_MIGRATE_DST_BUCKET : défaut "naywa-cv-eu"
 */

import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin"
import {
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  S3Client,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

// Un objet GMH connu, pour le mode ?verify=1 (test de lecture post-bascule).
const GMH_SAMPLE_KEY =
  "121de2ba-e5dc-4b60-939d-5c8135181997/22ce1d03-00be-469a-ada1-942cac955e2d/CV_Aquila_Engineering_LDU.pdf"

export const runtime = "nodejs"
export const maxDuration = 300

// Préfixes R2 des 2 organisations GMH (path = {org_id}/...).
const GMH_PREFIXES = [
  "121de2ba-e5dc-4b60-939d-5c8135181997/",
  "5a151528-a7b5-47f0-9969-81aef2354a35/",
]

function makeClient(endpoint: string): S3Client {
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    },
  })
}

export async function GET(req: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response

  // ── Mode VÉRIFICATION (?verify=1) ──────────────────────────────────────
  // Utilise la config LIVE de l'app (R2_ENDPOINT + R2_BUCKET_CV courants,
  // = EU après la bascule) pour signer une URL de téléchargement d'un CV
  // GMH. Si le lien ouvre le PDF, la lecture depuis l'EU est prouvée.
  if (new URL(req.url).searchParams.has("verify")) {
    const liveEndpoint = process.env.R2_ENDPOINT ?? ""
    const liveBucket = process.env.R2_BUCKET_CV ?? "naywa-cv"
    try {
      const url = await getSignedUrl(
        makeClient(liveEndpoint),
        new GetObjectCommand({ Bucket: liveBucket, Key: GMH_SAMPLE_KEY }),
        { expiresIn: 600 },
      )
      return NextResponse.json({ ok: true, liveEndpoint, liveBucket, key: GMH_SAMPLE_KEY, signedUrl: url })
    } catch (e) {
      return NextResponse.json(
        { ok: false, liveEndpoint, liveBucket, error: e instanceof Error ? e.message : String(e) },
        { status: 500 },
      )
    }
  }

  const oldEndpoint = process.env.R2_ENDPOINT ?? ""
  if (!oldEndpoint) {
    return NextResponse.json({ error: "R2_ENDPOINT manquant" }, { status: 500 })
  }
  const euEndpoint =
    process.env.R2_ENDPOINT_EU ??
    oldEndpoint.replace(".r2.cloudflarestorage.com", ".eu.r2.cloudflarestorage.com")
  const srcBucket = process.env.R2_MIGRATE_SRC_BUCKET ?? "naywa-cv"
  const dstBucket = process.env.R2_MIGRATE_DST_BUCKET ?? "naywa-cv-eu"

  if (euEndpoint === oldEndpoint) {
    return NextResponse.json(
      { error: "Endpoint EU identique à la source — pose R2_ENDPOINT_EU explicitement." },
      { status: 400 },
    )
  }

  const src = makeClient(oldEndpoint)
  const dst = makeClient(euEndpoint)

  const report: { key: string; status: "copied" | "skipped" | "error"; message?: string }[] = []

  for (const prefix of GMH_PREFIXES) {
    let token: string | undefined = undefined
    do {
      const listed: ListObjectsV2CommandOutput = await src.send(
        new ListObjectsV2Command({ Bucket: srcBucket, Prefix: prefix, ContinuationToken: token }),
      )
      for (const obj of listed.Contents ?? []) {
        const key = obj.Key
        if (!key) continue
        try {
          // Idempotent : déjà en destination → skip.
          let exists = false
          try {
            await dst.send(new HeadObjectCommand({ Bucket: dstBucket, Key: key }))
            exists = true
          } catch {
            exists = false
          }
          if (exists) {
            report.push({ key, status: "skipped" })
            continue
          }
          const got = await src.send(new GetObjectCommand({ Bucket: srcBucket, Key: key }))
          const body = got.Body
            ? Buffer.from(await got.Body.transformToByteArray())
            : Buffer.alloc(0)
          await dst.send(
            new PutObjectCommand({
              Bucket: dstBucket,
              Key: key,
              Body: body,
              ContentType: got.ContentType,
            }),
          )
          report.push({ key, status: "copied" })
        } catch (e) {
          report.push({ key, status: "error", message: e instanceof Error ? e.message : String(e) })
        }
      }
      token = listed.IsTruncated ? listed.NextContinuationToken : undefined
    } while (token)
  }

  const copied = report.filter((r) => r.status === "copied").length
  const skipped = report.filter((r) => r.status === "skipped").length
  const errors = report.filter((r) => r.status === "error").length

  return NextResponse.json({
    ok: errors === 0,
    srcBucket,
    dstBucket,
    euEndpoint,
    totals: { copied, skipped, errors },
    report,
  })
}
