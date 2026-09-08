-- Improve DAM archive FTS: split filenames like Bingo_08.jpg into searchable tokens
-- and share the same normalizer for collection-name matching in app queries.

DROP INDEX IF EXISTS public.asset_published_fts_idx;

CREATE OR REPLACE FUNCTION public.dam_search_normalize(doc text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(regexp_replace(coalesce(doc, ''), '[^[:alnum:]]+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.dam_asset_fts(
  file_name text,
  alt_text text,
  credit text,
  keywords text[],
  notes text
)
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT to_tsvector(
    'simple'::regconfig,
    public.dam_search_normalize(file_name) || ' ' ||
    public.dam_search_normalize(alt_text) || ' ' ||
    public.dam_search_normalize(credit) || ' ' ||
    public.dam_search_normalize(array_to_string(keywords, ' ')) || ' ' ||
    public.dam_search_normalize(notes)
  );
$$;

CREATE INDEX asset_published_fts_idx
ON public."asset"
USING GIN (public.dam_asset_fts("fileName", "altText", "credit", keywords, notes))
WHERE status = 'published';
