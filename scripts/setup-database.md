# Database Setup Checklist

## Step 1: Run Schema SQL

1. Open Supabase Dashboard: https://supabase.com/dashboard/project/httypftllawqmecqukup
2. Go to SQL Editor
3. Copy the entire contents of `supabase/schema.sql`
4. Paste and click "Run"

## Step 2: Verify Tables Created

Check that these tables exist:
- ✅ staff
- ✅ staff_preferences
- ✅ special_programs
- ✅ spt_allocations
- ✅ team_head_substitutions
- ✅ pca_preferences
- ✅ wards
- ✅ daily_schedules
- ✅ schedule_therapist_allocations
- ✅ schedule_pca_allocations
- ✅ schedule_bed_allocations
- ✅ schedule_calculations
- ✅ user_profiles

## Step 3: Create Initial Admin User

After creating a user in Authentication:

```sql
-- Replace 'your-user-id-here' with the actual UUID from auth.users
INSERT INTO user_profiles (id, role)
VALUES ('your-user-id-here', 'admin')
ON CONFLICT (id) DO UPDATE SET role = 'admin';
```

## Step 4: Test Connection

Run the dev server and check the browser console for any connection errors.

