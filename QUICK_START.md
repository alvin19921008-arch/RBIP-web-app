# Quick Start Guide

## ✅ Environment Variables Set

Your Supabase credentials have been configured in `.env.local`.

## Next Steps

### 1. Set Up Database Schema

1. Go to your Supabase project: https://supabase.com/dashboard/project/httypftllawqmecqukup
2. Click on "SQL Editor" in the left sidebar
3. Open the file `supabase/schema.sql` from this project
4. Copy the entire SQL content
5. Paste it into the SQL Editor
6. Click "Run" to execute

This will create all necessary tables, enums, indexes, and security policies.

### 2. Test the Connection

After setting up the database, you can test the connection:

```bash
npm run dev
```

Then visit: http://localhost:3000/api/test-connection

You should see a success message if everything is connected properly.

### 3. Create Your First User

1. Go to Authentication > Users in Supabase dashboard
2. Click "Add user" or "Invite user"
3. Create a user with email/password
4. Note the user ID from the users table
5. Run this SQL to make them an admin:

```sql
INSERT INTO user_profiles (id, role)
VALUES ('<paste-user-id-here>', 'admin')
ON CONFLICT (id) DO UPDATE SET role = 'admin';
```

### 4. Start Using the App

1. Run `npm run dev`
2. Visit http://localhost:3000
3. You'll be redirected to `/login`
4. Log in with the user you created
5. You'll be redirected to `/schedule`

## Project Structure

- `/app/(dashboard)/schedule` - Main allocation page
- `/app/(dashboard)/dashboard` - Admin dashboard (staff management, etc.)
- `/app/(dashboard)/history` - Schedule history viewer
- `/components/allocation` - Allocation UI components
- `/lib/algorithms` - Core allocation algorithms
- `/supabase/schema.sql` - Database schema

## Important Notes

- The database schema must be run before using the app
- Admin users can access all features
- Regular users can view and edit tentative schedules
- All sensitive operations require authentication

