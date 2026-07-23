-- Point 10 de l'audit sécurité : le bucket brand-logos n'avait aucune
-- restriction serveur (file_size_limit / allowed_mime_types NULL). La
-- validation type/taille du logo n'existait que côté navigateur, donc un
-- appel direct à l'API Storage la contournait. On aligne le bucket sur ce
-- que l'UI impose déjà (2 Mo max, images uniquement) — même politique que
-- le bucket cv-uploads. N'affecte QUE les nouveaux uploads/écrasements ;
-- les logos déjà stockés restent intacts.
update storage.buckets
set
  file_size_limit = 2097152, -- 2 Mo (2 * 1024 * 1024)
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
where id = 'brand-logos';
