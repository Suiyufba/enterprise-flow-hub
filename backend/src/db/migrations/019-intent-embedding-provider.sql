ALTER TABLE model_providers ADD COLUMN embedding_base_url TEXT NOT NULL DEFAULT '';
ALTER TABLE model_providers ADD COLUMN embedding_model TEXT NOT NULL DEFAULT '';
ALTER TABLE model_providers ADD COLUMN embedding_api_key TEXT NOT NULL DEFAULT '';
