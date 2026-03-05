-- Test query to verify monthly_dashboards table is working

-- 1. Check if table exists and see its structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'monthly_dashboards'
ORDER BY ordinal_position;

-- 2. Check if RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'monthly_dashboards';

-- 3. Check existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'monthly_dashboards';

-- 4. Try to see all monthly dashboards (you should only see your own)
SELECT * FROM monthly_dashboards;

-- 5. Check if you can insert
-- This should work because RLS will automatically set user_id to auth.uid()
INSERT INTO monthly_dashboards (user_id, month_key, custom_name)
VALUES (auth.uid(), 'test-' || extract(epoch from NOW())::text, 'Test Dashboard')
RETURNING *;
