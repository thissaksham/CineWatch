-- Advisory Lock Functions for Refresh Job Concurrency Control
-- Run this in Supabase SQL Editor to enable advisory locks

-- Function to try acquiring an advisory lock
-- Returns true if lock is acquired, false if already held
CREATE OR REPLACE FUNCTION try_advisory_lock(lock_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN pg_try_advisory_lock(lock_id);
END;
$$;

-- Function to release an advisory lock
-- Returns true if lock was released, false if not held
CREATE OR REPLACE FUNCTION advisory_unlock(lock_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN pg_advisory_unlock(lock_id);
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION try_advisory_lock(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION advisory_unlock(bigint) TO authenticated, service_role;

COMMENT ON FUNCTION try_advisory_lock IS 'Attempts to acquire a Postgres advisory lock. Used to prevent concurrent refresh jobs.';
COMMENT ON FUNCTION advisory_unlock IS 'Releases a previously acquired advisory lock.';
