-- Compatible hardening; apply before the Worker switch in the staged release.
-- Recursive calls are schema-qualified; every other function is in pg_catalog.
ALTER FUNCTION musecity.article_search_text(jsonb) SET search_path = pg_catalog;
