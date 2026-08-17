-- Postgres full-text search over published DAM assets.
-- array_to_string is STABLE, so wrap the document in an IMMUTABLE SQL function
-- and keep the query in src/lib/dam/archive-search.ts in sync.
CREATE OR REPLACE FUNCTION dam_asset_fts(
  file_name text,
  alt_text text,
  credit text,
  keywords text[]
)
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT to_tsvector(
    'simple'::regconfig,
    coalesce(file_name, '') || ' ' || coalesce(alt_text, '') || ' ' || coalesce(credit, '') || ' ' || coalesce(array_to_string(keywords, ' '), '')
  );
$$;

CREATE INDEX IF NOT EXISTS asset_published_fts_idx
ON "asset"
USING GIN (dam_asset_fts("fileName", "altText", "credit", keywords))
WHERE status = 'published';
