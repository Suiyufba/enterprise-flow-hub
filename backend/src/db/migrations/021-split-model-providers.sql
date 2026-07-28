ALTER TABLE model_providers
  ADD COLUMN provider_type TEXT NOT NULL DEFAULT 'chat'
  CHECK (provider_type IN ('chat', 'embedding'));

INSERT OR IGNORE INTO model_providers (
  id,
  name,
  base_url,
  model,
  api_key_env,
  embedding_base_url,
  embedding_model,
  embedding_api_key,
  enabled,
  provider_type
)
SELECT
  id || '-embedding',
  name || ' · 向量',
  CASE WHEN embedding_base_url <> '' THEN embedding_base_url ELSE base_url END,
  embedding_model,
  CASE WHEN embedding_api_key <> '' THEN embedding_api_key ELSE api_key_env END,
  '',
  '',
  '',
  enabled,
  'embedding'
FROM model_providers
WHERE embedding_model <> '';

UPDATE agent_model_configs
SET embedding_provider_id = embedding_provider_id || '-embedding'
WHERE embedding_provider_id IN (
  SELECT id
  FROM model_providers
  WHERE provider_type = 'chat' AND embedding_model <> ''
);

UPDATE model_providers
SET embedding_base_url = '',
    embedding_model = '',
    embedding_api_key = ''
WHERE provider_type = 'chat';

CREATE INDEX IF NOT EXISTS idx_model_providers_type
  ON model_providers(provider_type, enabled);
