-- 131: Admin social media posts (Instagram publish via Graph API)

CREATE TABLE IF NOT EXISTS admin_social_posts (
  post_id VARCHAR(64) PRIMARY KEY,
  admin_id VARCHAR(64) NOT NULL,
  platform VARCHAR(32) NOT NULL DEFAULT 'INSTAGRAM',
  media_type VARCHAR(32) NOT NULL DEFAULT 'FEED'
    CHECK (media_type IN ('FEED', 'STORY')),
  caption TEXT NOT NULL DEFAULT '',
  image_storage_path TEXT,
  image_public_token VARCHAR(128),
  image_mime VARCHAR(64),
  image_file_name VARCHAR(255),
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'QUEUED', 'PUBLISHING', 'PUBLISHED', 'FAILED')),
  external_container_id VARCHAR(128),
  external_post_id VARCHAR(128),
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'oddsyra_in',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_social_posts_created
  ON admin_social_posts (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_social_posts_status
  ON admin_social_posts (tenant_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS unq_admin_social_posts_public_token
  ON admin_social_posts (image_public_token)
  WHERE image_public_token IS NOT NULL;
