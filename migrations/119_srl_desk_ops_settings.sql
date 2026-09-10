-- SRL desk ops: JSON settings for presets/templates/presence/shift notes
ALTER TABLE srl_operator_settings
  ADD COLUMN IF NOT EXISTS value_json JSONB;
