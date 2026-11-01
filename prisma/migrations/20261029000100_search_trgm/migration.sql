CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS candidates_name_trgm ON candidates USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS candidates_code_trgm ON candidates USING gin (code gin_trgm_ops);
CREATE INDEX IF NOT EXISTS candidates_mobile_trgm ON candidates USING gin (mobile gin_trgm_ops);
CREATE INDEX IF NOT EXISTS candidates_passport_trgm ON candidates USING gin (passport_no gin_trgm_ops);
CREATE INDEX IF NOT EXISTS candidates_email_trgm ON candidates USING gin (email gin_trgm_ops);
