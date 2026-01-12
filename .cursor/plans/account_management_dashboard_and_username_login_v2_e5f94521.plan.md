---
name: account_management_dashboard_and_username_login_v2
overview: "Add Account Management dashboard with User/Admin/Developer roles, username-or-email login, developer-only diagnostics, navbar profile dropdown, and strict permissions: Admins cannot see/delete/promote to Developer."
todos:
  - id: db-migration-roles-usernames
    content: Add username/email to user_profiles, expand role to user/admin/developer, migrate existing values, update RLS to treat developer as admin.
    status: completed
  - id: api-auth-resolve-login
    content: Add /api/auth/resolve-login to map username -> auth email.
    status: completed
  - id: api-accounts-crud
    content: Add accounts list/create/update/delete/reset-password routes with strict Admin vs Developer enforcement and last-developer protection.
    status: completed
  - id: dashboard-account-panel
    content: Build AccountManagementPanel UI and integrate into dashboard sidebar/page with role-based hiding of developer accounts.
    status: completed
  - id: navbar-profile-dropdown
    content: Replace Logout with profile dropdown and implement self change-password dialog; developer reset via accounts panel.
    status: completed
  - id: developer-only-diagnostics
    content: Update schedule diagnostics gating and role loading to use developer/admin/user and restrict diagnostics to developer only
    status: completed
  - id: todo-1768149858172-nekb1d0nn
    content: ""
    status: pending
---

# Account management + username login (revised Admin vs Developer rules)

## Goals

- Create a new **Account Management** dashboard panel (modeled after Staff Profile table UI).
- Add access levels: **User / Admin / Developer**.
- Login supports **email OR username**.
- Navbar shows **profile icon + username** and dropdown: **Change password**, **Logout**.
- **Developer-only diagnostics**: schedule load/copy/save diagnostics + floating PCA diagnostics.
- Email can be null → auto-generate internal auth email `username@rbip.local`.
  - This internal auth email is only visible to **Developer** in Account Management.

## Updated permission rules (per your latest message)

### Visibility

- **Developer accounts are hidden** from **User/Admin** in Account Management.
- Only **Developer** can see Developer accounts.

### Admin permissions

- Admin can:
  - Create accounts
  - Edit username/email
  - Edit role only within **User ↔ Admin** (cannot set Developer)
  - Delete non-Developer accounts
- Admin cannot:
  - See Developer accounts
  - Delete any Developer
  - Promote anyone to Developer
  - Reset passwords for other users

### Developer permissions

- Developer can do everything Admin can, plus:
  - See all accounts (including Developer)
  - Set role to Developer
  - Reset any account password
  - View all diagnostics

### User permissions

- User can only view the Account Management list (but Developer accounts are hidden).

### Lockout prevention

- Prevent deleting/demoting the **last remaining Developer** (enforced server-side).

## DB changes

Create a Supabase migration to extend `user_profiles`:

- Add `username TEXT NOT NULL UNIQUE`
- Add `email TEXT NULL` (public email; can be null)
- Expand role to `('user','admin','developer')` (migrate existing `regular -> user`, `admin -> admin`)
- Set the current admin account with email `alvin19921008@gmail.com` to role `developer`.

Update RLS policies that currently check `role = 'admin'` to `role IN ('admin','developer')` for admin-managed tables.

## Backend route handlers (server-side, service role)

Implement Next.js route handlers using a server-only Supabase Admin client (service role key) after verifying the requester session + role:

- `app/api/accounts/list/route.ts`
  - If requester is Developer: return all accounts, include `authEmail` (internal email).
  - If requester is Admin/User: **filter out Developer accounts**, and never return `authEmail`.

- `app/api/accounts/create/route.ts`
  - Admin/Developer only.
  - If email is null: set auth email to `username@rbip.local`.
  - Store public email in `user_profiles.email` (nullable).

- `app/api/accounts/update/route.ts`
  - Admin/Developer only.
  - Enforce:
    - Admin cannot set role to Developer.
    - Admin cannot edit a Developer account (shouldn’t see it anyway, but enforce).
    - Protect last-developer rule.

- `app/api/accounts/delete/route.ts`
  - Admin/Developer only.
  - Batch delete supported.
  - Enforce:
    - Admin cannot delete Developer.
    - Protect last-developer rule.

- `app/api/accounts/reset-password/route.ts`
  - Developer only.

- `app/api/auth/resolve-login/route.ts`
  - Map username -> auth email (including internal `@rbip.local`) so username login works.

## Login page changes

Update `app/(auth)/login/page.tsx`:

- Replace Email input with **Identifier (email or username)**.
- If identifier contains `@`: treat as email.
- Else: call `/api/auth/resolve-login` and then `signInWithPassword` using resolved auth email.

## Navbar changes

Update `components/layout/Navbar.tsx`:

- Replace Logout button with profile display + dropdown:
  - Show username (from `user_profiles.username`, fallback to `user.email`).
  - Menu items: Change password, Logout.
- Change password dialog:
  - Self-change requires entering current password; new password must differ from current.

## Dashboard UI: Account Management panel

Create `components/dashboard/AccountManagementPanel.tsx`:

- Layout matches Staff Profile table conventions: selection checkboxes, batch actions, row actions.
- Columns:
  - Username
  - Email (public)
  - Created
  - Access badge + dropdown
  - Actions (Edit/Delete)
  - Developer-only: Auth email (internal)

UI rules:

- For Admin: role dropdown only offers User/Admin.
- For User: everything read-only.
- Developer accounts are not rendered at all for Admin/User.

Add the panel to:

- `components/dashboard/DashboardSidebar.tsx` (new category)
- `app/(dashboard)/dashboard/page.tsx` (routing + title/description)

## Diagnostics gating

Update schedule page role logic to include `developer` and gate diagnostics:

- Show diagnostics only when role is **Developer**.

## Visual draft (dashboard)

```
Account Management
[+ Add new accounts] [Delete selected]

[ ] Username   Email            Created        Access           Actions
[ ] jane       jane@x.com       2026-01-03     [Admin ▾]        Edit  Delete
[ ] bob        (blank)          2026-01-05     [User ▾]         Edit  Delete

Developer-only additional column:
Auth email (internal): jane@rbip.local
```

## Files likely to change

- `supabase/migrations/*_account_management.sql`
- `lib/auth.ts`
- `app/(auth)/login/page.tsx`
- `components/layout/Navbar.tsx`
- `components/dashboard/DashboardSidebar.tsx`
- `app/(dashboard)/dashboard/page.tsx`
- `components/dashboard/AccountManagementPanel.tsx` (new)
- `app/api/auth/resolve-login/route.ts` (new)
- `app/api/accounts/*/route.ts` (new)
- `app/(dashboard)/schedule/page.tsx` (developer-only diagnostics)

## Acceptance criteria

- Admin cannot see Developer accounts in Account Management.
- Admin cannot delete Developers or set role to Developer.
- Developer can manage all accounts and see internal auth emails.
- Users can log in with username (including accounts with null public email).
- Navbar shows account menu with Change password + Logout.
- Diagnostics are visible only to Developer.