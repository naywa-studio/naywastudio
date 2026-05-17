-- Per-client branding for the anonymised CV.
-- brand_name replaces "NAYWA STUDIO" at the top + in the footer.
-- brand_logo_path points into the private "brand-logos" bucket
-- ({user_id}/logo.{ext}); the anonymise route signs it server-side.

alter table public.profiles
  add column if not exists brand_name text,
  add column if not exists brand_logo_path text;

-- Dedicated bucket — private, signed URLs only.
insert into storage.buckets (id, name, public)
values ('brand-logos', 'brand-logos', false)
on conflict (id) do nothing;

create policy "brand-logos read own" on storage.objects for select
  to authenticated
  using (bucket_id = 'brand-logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "brand-logos write own" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'brand-logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "brand-logos update own" on storage.objects for update
  to authenticated
  using (bucket_id = 'brand-logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "brand-logos delete own" on storage.objects for delete
  to authenticated
  using (bucket_id = 'brand-logos' and (storage.foldername(name))[1] = auth.uid()::text);
