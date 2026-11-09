-- Historical party assignments.
-- candidate_id, party_id, and closed_by_user_id are plain integers.
-- No parent constraint is added. A missing parent does not delete history.
-- Agent and Sub-Agent have no single canonical original address.
-- Their present and permanent parts are stored separately, including null and empty string.
-- Those parts are not concatenated, and neither side is selected as the assignment address.
-- Agencier and Companier store only their address column, including null.
-- Activation is became_active_at. A separate creation timestamp and an update timestamp are omitted
-- so neither name can be mistaken for activation time.
-- This migration does not copy legacy rows and does not write live party ids.

CREATE TABLE historical_party_assignments (
    id SERIAL NOT NULL,
    candidate_id INTEGER NOT NULL,
    party_category VARCHAR(20) NOT NULL,
    party_id INTEGER NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    original_address VARCHAR(255),
    present_address_house VARCHAR(200),
    present_address_road VARCHAR(20),
    present_address_village VARCHAR(20),
    present_address_post VARCHAR(20),
    present_address_thana_id INTEGER,
    present_address_district_id INTEGER,
    present_address_division_id INTEGER,
    permanent_address_house VARCHAR(200),
    permanent_address_road VARCHAR(20),
    permanent_address_village VARCHAR(20),
    permanent_address_post VARCHAR(20),
    permanent_address_thana_id INTEGER,
    permanent_address_district_id INTEGER,
    permanent_address_division_id INTEGER,
    status VARCHAR(10) NOT NULL,
    became_active_at TIMESTAMPTZ(6) NOT NULL,
    closure_reason TEXT,
    closed_by_user_id INTEGER,
    closed_at TIMESTAMPTZ(6),

    CONSTRAINT historical_party_assignments_pkey PRIMARY KEY (id),
    CONSTRAINT historical_party_assignments_category_check CHECK (
        party_category IN ('agent', 'sub_agent', 'agencier', 'companier')
    ),
    CONSTRAINT historical_party_assignments_status_check CHECK (
        status IN ('ACTIVE', 'CLOSED')
    ),
    CONSTRAINT historical_party_assignments_name_check CHECK (
        btrim(original_name) <> ''
    ),
    CONSTRAINT historical_party_assignments_closure_check CHECK (
        (
            status = 'ACTIVE'
            AND closure_reason IS NULL
            AND closed_by_user_id IS NULL
            AND closed_at IS NULL
        )
        OR (
            status = 'CLOSED'
            AND closure_reason IS NOT NULL
            AND btrim(closure_reason) <> ''
            AND closed_by_user_id IS NOT NULL
            AND closed_at IS NOT NULL
        )
    ),
    CONSTRAINT historical_party_assignments_address_shape_check CHECK (
        (
            party_category IN ('agencier', 'companier')
            AND present_address_house IS NULL
            AND present_address_road IS NULL
            AND present_address_village IS NULL
            AND present_address_post IS NULL
            AND present_address_thana_id IS NULL
            AND present_address_district_id IS NULL
            AND present_address_division_id IS NULL
            AND permanent_address_house IS NULL
            AND permanent_address_road IS NULL
            AND permanent_address_village IS NULL
            AND permanent_address_post IS NULL
            AND permanent_address_thana_id IS NULL
            AND permanent_address_district_id IS NULL
            AND permanent_address_division_id IS NULL
        )
        OR (
            party_category IN ('agent', 'sub_agent')
            AND original_address IS NULL
        )
    )
);

-- Multiple CLOSED rows for one candidate and category stay allowed.
CREATE UNIQUE INDEX historical_party_assignments_one_active
    ON historical_party_assignments (candidate_id, party_category)
    WHERE status = 'ACTIVE';

CREATE FUNCTION historical_party_assignments_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'historical assignment records cannot be physically deleted'
            USING ERRCODE = '23001';
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.became_active_at := clock_timestamp();

        IF NEW.status = 'ACTIVE' THEN
            IF NEW.closure_reason IS NOT NULL
                OR NEW.closed_by_user_id IS NOT NULL
                OR NEW.closed_at IS NOT NULL THEN
                RAISE EXCEPTION 'an ACTIVE historical assignment cannot carry closure facts'
                    USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
        END IF;

        IF NEW.status = 'CLOSED' THEN
            IF NEW.closure_reason IS NULL
                OR NEW.closed_by_user_id IS NULL
                OR NEW.closed_at IS NULL THEN
                RAISE EXCEPTION 'a CLOSED historical assignment requires a non-empty closure reason, a closing actor, and a closure timestamp'
                    USING ERRCODE = '23514';
            END IF;
            NEW.closure_reason := regexp_replace(NEW.closure_reason, '^[[:space:]]+|[[:space:]]+$', '', 'g');
            IF NEW.closure_reason = '' THEN
                RAISE EXCEPTION 'a CLOSED historical assignment requires a non-empty closure reason, a closing actor, and a closure timestamp'
                    USING ERRCODE = '23514';
            END IF;
            NEW.closed_at := clock_timestamp();
            RETURN NEW;
        END IF;

        RAISE EXCEPTION 'historical assignment status must be ACTIVE or CLOSED'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
        OR NEW.party_category IS DISTINCT FROM OLD.party_category
        OR NEW.party_id IS DISTINCT FROM OLD.party_id
        OR NEW.original_name IS DISTINCT FROM OLD.original_name
        OR NEW.original_address IS DISTINCT FROM OLD.original_address
        OR NEW.present_address_house IS DISTINCT FROM OLD.present_address_house
        OR NEW.present_address_road IS DISTINCT FROM OLD.present_address_road
        OR NEW.present_address_village IS DISTINCT FROM OLD.present_address_village
        OR NEW.present_address_post IS DISTINCT FROM OLD.present_address_post
        OR NEW.present_address_thana_id IS DISTINCT FROM OLD.present_address_thana_id
        OR NEW.present_address_district_id IS DISTINCT FROM OLD.present_address_district_id
        OR NEW.present_address_division_id IS DISTINCT FROM OLD.present_address_division_id
        OR NEW.permanent_address_house IS DISTINCT FROM OLD.permanent_address_house
        OR NEW.permanent_address_road IS DISTINCT FROM OLD.permanent_address_road
        OR NEW.permanent_address_village IS DISTINCT FROM OLD.permanent_address_village
        OR NEW.permanent_address_post IS DISTINCT FROM OLD.permanent_address_post
        OR NEW.permanent_address_thana_id IS DISTINCT FROM OLD.permanent_address_thana_id
        OR NEW.permanent_address_district_id IS DISTINCT FROM OLD.permanent_address_district_id
        OR NEW.permanent_address_division_id IS DISTINCT FROM OLD.permanent_address_division_id
        OR NEW.became_active_at IS DISTINCT FROM OLD.became_active_at THEN
        RAISE EXCEPTION 'historical assignment identity and snapshots cannot be changed'
            USING ERRCODE = '23514';
    END IF;

    IF OLD.status = 'CLOSED' THEN
        IF NEW.status IS DISTINCT FROM 'CLOSED' THEN
            RAISE EXCEPTION 'a CLOSED historical assignment cannot be reopened'
                USING ERRCODE = '23514';
        END IF;
        RAISE EXCEPTION 'CLOSED historical assignment closure facts cannot be rewritten'
            USING ERRCODE = '23514';
    END IF;

    IF OLD.status = 'ACTIVE' AND NEW.status = 'CLOSED' THEN
        IF NEW.closure_reason IS NULL OR NEW.closed_by_user_id IS NULL THEN
            RAISE EXCEPTION 'closure requires a non-empty closure reason, a closing actor, and a closure timestamp'
                USING ERRCODE = '23514';
        END IF;
        NEW.closure_reason := regexp_replace(NEW.closure_reason, '^[[:space:]]+|[[:space:]]+$', '', 'g');
        IF NEW.closure_reason = '' THEN
            RAISE EXCEPTION 'closure requires a non-empty closure reason, a closing actor, and a closure timestamp'
                USING ERRCODE = '23514';
        END IF;
        NEW.closed_at := clock_timestamp();
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'only an ACTIVE to CLOSED transition is permitted'
        USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER historical_party_assignments_guard_insert
BEFORE INSERT ON historical_party_assignments
FOR EACH ROW
EXECUTE FUNCTION historical_party_assignments_guard();

CREATE TRIGGER historical_party_assignments_guard_update
BEFORE UPDATE ON historical_party_assignments
FOR EACH ROW
EXECUTE FUNCTION historical_party_assignments_guard();

CREATE TRIGGER historical_party_assignments_guard_delete
BEFORE DELETE ON historical_party_assignments
FOR EACH ROW
EXECUTE FUNCTION historical_party_assignments_guard();
