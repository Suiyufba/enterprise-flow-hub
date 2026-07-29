ALTER TABLE conversations ADD COLUMN scope_enterprise_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE conversations ADD COLUMN scope_project_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE conversations ADD COLUMN persona_id TEXT;

UPDATE conversations
SET scope_enterprise_ids = json_array(enterprise_id),
    scope_project_ids = json_array(project_id)
WHERE scope_enterprise_ids = '[]' OR scope_project_ids = '[]';
