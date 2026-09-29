-- Destructive schema cleanup: execute only after the new Worker stops using these columns.
-- The migration runner supplies the transaction. Include hidden and deleted rows in the guard.
LOCK TABLE musecity.posts IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM musecity.posts WHERE kind='help') THEN
    RAISE EXCEPTION 'Help removal requires zero help rows; no data was changed';
  END IF;
END $$;
ALTER TABLE musecity.posts DROP CONSTRAINT posts_kind_check;
ALTER TABLE musecity.posts ADD CONSTRAINT posts_kind_check CHECK(kind='update');
ALTER TABLE musecity.posts DROP COLUMN title, DROP COLUMN expected_outcome, DROP COLUMN help_status;
