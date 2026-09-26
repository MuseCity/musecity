ALTER TABLE musecity.media
  ADD COLUMN purpose text NOT NULL DEFAULT 'content' CHECK (purpose IN ('avatar', 'content')),
  ADD COLUMN width integer CHECK (width > 0 AND width <= 12000),
  ADD COLUMN height integer CHECK (height > 0 AND height <= 12000);
