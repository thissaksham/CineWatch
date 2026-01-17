-- Job Lock Table for Preventing Concurrent Refresh Jobs
-- This replaces advisory locks which don't work across separate connections

-- Drop existing objects if they exist (for clean re-run)
DROP POLICY IF EXISTS "Service role can manage locks" ON job_locks;
DROP FUNCTION IF EXISTS try_acquire_job_lock(TEXT, INTEGER);
DROP FUNCTION IF EXISTS release_job_lock(TEXT);
DROP TABLE IF EXISTS job_locks;

-- Create a table to track running jobs
CREATE TABLE job_locks (
    lock_name TEXT PRIMARY KEY,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acquired_by TEXT,
    expires_at TIMESTAMPTZ NOT NULL
);

-- Enable Row Level Security
ALTER TABLE job_locks ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role to manage locks
CREATE POLICY "Service role can manage locks"
    ON job_locks
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Function to try acquiring a lock
CREATE FUNCTION try_acquire_job_lock(
    p_lock_name TEXT,
    p_timeout_minutes INTEGER DEFAULT 60
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rows_inserted INTEGER;
BEGIN
    -- Clean up expired locks first
    DELETE FROM job_locks WHERE expires_at < NOW();
    
    -- Try to insert a new lock
    INSERT INTO job_locks (lock_name, expires_at)
    VALUES (p_lock_name, NOW() + (p_timeout_minutes || ' minutes')::INTERVAL)
    ON CONFLICT (lock_name) DO NOTHING;
    
    -- Check if we got the lock (ROW_COUNT is an integer)
    GET DIAGNOSTICS rows_inserted = ROW_COUNT;
    
    -- Return true if we inserted a row (got the lock)
    RETURN rows_inserted > 0;
END;
$$;

-- Function to release a lock
CREATE FUNCTION release_job_lock(p_lock_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM job_locks WHERE lock_name = p_lock_name;
    RETURN FOUND;
END;
$$;

-- Grant permissions
GRANT ALL ON TABLE job_locks TO service_role;
GRANT EXECUTE ON FUNCTION try_acquire_job_lock(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION release_job_lock(TEXT) TO service_role;

COMMENT ON TABLE job_locks IS 'Tracks running jobs to prevent concurrent execution';
COMMENT ON FUNCTION try_acquire_job_lock IS 'Attempts to acquire a named lock. Returns true if successful.';
COMMENT ON FUNCTION release_job_lock IS 'Releases a named lock. Returns true if lock was found and released.';
