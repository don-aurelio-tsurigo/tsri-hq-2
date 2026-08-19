-- Manual journalist context on DAM assets. Rebuild FTS so notes are searchable.
ALTER TABLE "asset" ADD COLUMN "notes" TEXT;

DROP INDEX IF EXISTS asset_published_fts_idx;
DROP FUNCTION IF EXISTS dam_asset_fts(text, text, text, text[]);

CREATE FUNCTION dam_asset_fts(
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
    coalesce(file_name, '') || ' ' ||
    coalesce(alt_text, '') || ' ' ||
    coalesce(credit, '') || ' ' ||
    coalesce(array_to_string(keywords, ' '), '') || ' ' ||
    coalesce(notes, '')
  );
$$;

CREATE INDEX asset_published_fts_idx
ON "asset"
USING GIN (dam_asset_fts("fileName", "altText", "credit", keywords, notes))
WHERE status = 'published';
