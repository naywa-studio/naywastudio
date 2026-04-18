ALTER TABLE missions ADD COLUMN IF NOT EXISTS chat_history jsonb DEFAULT '[]';
