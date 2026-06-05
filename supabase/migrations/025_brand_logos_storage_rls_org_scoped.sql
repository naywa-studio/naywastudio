-- Migration 025 — Brand-logos storage RLS goes org-scoped
--
-- The /cabinet page uploads logos at `{org_id}/{ts}.ext`. The previous
-- user-scoped storage policies required `{auth.uid()}/...`, so the
-- upload was being rejected. Make the policies use the caller's
-- organization_id instead (via the current_org_id() helper).
--
-- cv-uploads stays user-scoped — that bucket is only accessed by
-- server routes using the service-role client, which bypasses storage
-- RLS, so the policy is just a defense-in-depth backstop for the
-- direct-from-client edge case.

DROP POLICY IF EXISTS "brand-logos read own" ON storage.objects;
DROP POLICY IF EXISTS "brand-logos write own" ON storage.objects;
DROP POLICY IF EXISTS "brand-logos update own" ON storage.objects;
DROP POLICY IF EXISTS "brand-logos delete own" ON storage.objects;

CREATE POLICY "brand-logos org read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'brand-logos' AND (storage.foldername(name))[1] = (current_org_id())::text);

CREATE POLICY "brand-logos org write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'brand-logos' AND (storage.foldername(name))[1] = (current_org_id())::text);

CREATE POLICY "brand-logos org update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'brand-logos' AND (storage.foldername(name))[1] = (current_org_id())::text);

CREATE POLICY "brand-logos org delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'brand-logos' AND (storage.foldername(name))[1] = (current_org_id())::text);
