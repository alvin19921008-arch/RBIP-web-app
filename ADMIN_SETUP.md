# Admin User Setup

## Your User Information
- **User ID**: `36cf36fd-3793-4118-8ec9-8b9d8b9c1996`
- **Email**: `alvin19921008@gmail.com`

## Quick Setup

### Step 1: Add Admin Profile

Go to your Supabase SQL Editor and run:

```sql
INSERT INTO user_profiles (id, role)
VALUES ('36cf36fd-3793-4118-8ec9-8b9d8b9c1996', 'admin')
ON CONFLICT (id) DO UPDATE SET role = 'admin';
```

### Step 2: Verify

Run this to confirm:

```sql
SELECT 
  up.id,
  au.email,
  up.role,
  up.created_at
FROM user_profiles up
JOIN auth.users au ON up.id = au.id
WHERE up.id = '36cf36fd-3793-4118-8ec9-8b9d8b9c1996';
```

You should see:
- id: `36cf36fd-3793-4118-8ec9-8b9d8b9c1996`
- email: `alvin19921008@gmail.com`
- role: `admin`

### Step 3: Test Login

1. Go to http://localhost:3000/login
2. Enter your email: `alvin19921008@gmail.com`
3. Enter your password
4. Click "Login"
5. You should be redirected to `/schedule`

## Troubleshooting

If login fails:
- Verify the SQL above ran successfully
- Check that the user exists in `auth.users`
- Make sure the password is correct
- Check browser console for errors

## After Login

Once logged in as admin, you'll have access to:
- ✅ Schedule allocation page
- ✅ Dashboard (staff management, configuration)
- ✅ Schedule history
- ✅ All admin features

