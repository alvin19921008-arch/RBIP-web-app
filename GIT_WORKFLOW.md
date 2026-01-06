# Git Workflow Guide for RBIP Web App

## ✅ Current Status
Your repository is connected to: `https://github.com/alvin19921008-arch/RBIP-web-app.git`

---

## 💻 Working on Multiple Machines (Day 1: Laptop A, Day 2: Laptop B)

### 🆕 Setting Up the Project on a New Laptop

If you're working on a different laptop for the first time:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/alvin19921008-arch/RBIP-web-app.git
   cd RBIP-web-app
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   - Create `.env.local` file in the project root
   - Add your Supabase credentials:
     ```
     NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url_here
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
     ```
   - Get these values from: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/settings/api

4. **Verify setup:**
   ```bash
   npm run dev
   ```
   Then visit http://localhost:3000 to confirm everything works.

---

### 🔄 Daily Workflow: Always Pull Latest Before Starting Work

**⚠️ CRITICAL: Always pull the latest changes before you start working!**

This prevents merge conflicts when you work on different machines.

#### Step 1: Check for Updates (Before Starting Work)

Every time you start working (especially on a different machine), check if there are new changes:

```bash
# Fetch the latest information from GitHub (doesn't change your files)
git fetch origin

# Check if your local branch is behind the remote
git status
```

If you see "Your branch is behind 'origin/main'", you need to pull updates.

#### Step 2: Pull the Latest Changes

**If you have NO uncommitted changes:**
```bash
# Simple pull (fast-forward merge)
git pull origin main
```

**If you get "divergent branches" error:**
This means you have local commits AND GitHub has different commits. Use merge:
```bash
git pull origin main --no-rebase
# This will merge both histories together
```

**If you have uncommitted changes:**
```bash
# Option 1: Commit your changes first, then pull
git add .
git commit -m "WIP: temporary save before pulling latest"
git pull origin main

# Option 2: Stash your changes, pull, then reapply them
git stash                    # Save your uncommitted changes temporarily
git pull origin main         # Get latest changes
git stash pop               # Reapply your changes (may have conflicts to resolve)
```

#### Step 3: Resolve Any Merge Conflicts (if they occur)

If git can't automatically merge, you'll see a conflict message:

```bash
# Git will show which files have conflicts
git status

# Open the conflicted files in your editor
# Look for conflict markers: <<<<<<< HEAD, =======, >>>>>>>
# Edit to resolve conflicts, then:
git add .
git commit -m "Merge latest changes and resolve conflicts"
```

#### Step 4: Verify Everything Works

After pulling:
```bash
# Make sure dependencies are up to date
npm install

# Test that everything works
npm run dev
```

---

### 📊 How to Check What's Changed on GitHub

Before pulling, you can see what changes are on GitHub:

```bash
# Fetch latest info (doesn't change your files)
git fetch origin

# See commits on GitHub that you don't have locally
git log HEAD..origin/main --oneline

# See what files changed
git diff HEAD..origin/main --name-only

# See detailed changes (in a readable format)
git log HEAD..origin/main --stat
```

---

### ✅ Safe Multi-Machine Workflow Checklist

**Before starting work each day:**

- [ ] Open terminal in project folder
- [ ] Run `git fetch origin` to check for updates
- [ ] Run `git status` to see if you're behind
- [ ] If behind, run `git pull origin main`
- [ ] If conflicts occur, resolve them before starting
- [ ] Run `npm install` if package.json changed
- [ ] Test with `npm run dev`

**Before ending work each day:**

- [ ] Commit all your changes: `git add .` then `git commit -m "Your message"`
- [ ] Push to GitHub: `git push origin main`
- [ ] Verify push succeeded: `git status` (should say "Your branch is up to date")

---

### 🛡️ Best Practices to Prevent Version Conflicts

1. **Always pull before starting work** - This is the #1 rule!
2. **Commit and push at end of day** - Don't leave uncommitted work
3. **Pull before pushing** - Even if you just pulled, pull again before pushing:
   ```bash
   git pull origin main  # Get any changes that happened while you were working
   git push origin main  # Now push your changes
   ```
4. **Use descriptive commit messages** - Helps track what changed on which machine
5. **Don't work on the same file simultaneously** - Coordinate with yourself if needed
6. **If unsure, check status first:**
   ```bash
   git status  # Always safe to run, shows current state
   ```

---

## 📤 How to Push Updates to Main Branch

### Method 1: Using Terminal (Recommended)

1. **Check what files have changed:**
   ```bash
   git status
   ```

2. **Stage all your changes:**
   ```bash
   git add .
   ```
   Or stage specific files:
   ```bash
   git add path/to/file1.tsx path/to/file2.ts
   ```

3. **Commit with a message:**
   ```bash
   git commit -m "Your commit message here"
   ```

4. **Push to GitHub:**
   ```bash
   git push origin main
   ```

### Method 2: Using VS Code/Cursor UI

1. Open the **Source Control** panel (Ctrl/Cmd + Shift + G)
2. Review your changes in the file list
3. Stage files by clicking the `+` icon next to each file, or click `+` next to "Changes" to stage all
4. Type your commit message in the message box
5. Click **"Commit"** (or **"Commit & Push"** if available)
6. If you only clicked "Commit", then click the **"..."** menu and select **"Push"**

**Note:** If "Commit & Push" doesn't work, use the terminal method above.

---

## 🌿 How to Create and Work with a New Branch

### Create a New Branch for Testing Features

1. **Create and switch to a new branch:**
   ```bash
   git checkout -b "New feature: Staff profile"
   ```
   Or using the newer syntax:
   ```bash
   git switch -c "New feature: Staff profile"
   ```

2. **Make your changes** to your code

3. **Stage, commit, and push the new branch:**
   ```bash
   git add .
   git commit -m "Add staff profile feature"
   git push -u origin "New feature: Staff profile"
   ```
   The `-u` flag sets up tracking so future pushes are simpler.

4. **Switch back to main branch:**
   ```bash
   git checkout main
   ```
   Or:
   ```bash
   git switch main
   ```

5. **To see all your branches:**
   ```bash
   git branch -a
   ```

### Future Updates to Your Feature Branch

Once the branch is created and pushed, you can update it easily:

```bash
# Switch to your feature branch
git checkout "New feature: Staff profile"

# Make changes, then:
git add .
git commit -m "Update staff profile feature"
git push  # No need for -u origin branch-name after first push
```

### Merge Feature Branch Back to Main (when ready)

```bash
# Switch to main
git checkout main

# Pull latest changes
git pull origin main

# Merge your feature branch
git merge "New feature: Staff profile"

# Push the merged changes
git push origin main
```

---

## 🔍 Useful Git Commands

- **See what branch you're on:**
  ```bash
  git branch
  ```

- **See commit history:**
  ```bash
  git log --oneline
  ```

- **See what files changed:**
  ```bash
  git status
  ```

- **See detailed changes:**
  ```bash
  git diff
  ```

- **Discard uncommitted changes** (be careful!):
  ```bash
  git restore .
  ```

---

## ⚠️ Troubleshooting

### If "Commit & Push" in UI doesn't work:
Use the terminal method (Method 1 above) - it's more reliable.

### If you get "Updates were rejected":
This means the remote has changes you don't have. Pull first:
```bash
git pull origin main
```
Then resolve any conflicts and push again.

### If you get "divergent branches" or "Need to specify how to reconcile divergent branches":

This happens when:
- You have local commits that GitHub doesn't have
- GitHub has commits that you don't have locally
- Both branches diverged from the same point

**Solution: Merge the branches**

```bash
# Option 1: Merge (recommended - preserves both histories)
git pull origin main --no-rebase

# This will create a merge commit combining both branches
# If there are conflicts, resolve them, then:
git add .
git commit -m "Merge latest changes from GitHub"
git push origin main
```

**Alternative: Rebase (creates linear history, but rewrites commits)**

```bash
# Option 2: Rebase (if you prefer a cleaner linear history)
git pull origin main --rebase

# If conflicts occur, resolve them, then:
git add .
git rebase --continue
git push origin main
```

**To prevent this in the future:**
- Always pull before starting work: `git pull origin main`
- Always pull before pushing: `git pull origin main && git push origin main`

**To see what's happening:**
```bash
# See the divergence visually
git log --oneline --graph --all -10

# See commits you have that GitHub doesn't
git log origin/main..main --oneline

# See commits GitHub has that you don't
git log main..origin/main --oneline
```

### If you want to see what's on GitHub vs local:
```bash
git fetch origin
git log main..origin/main  # See commits on GitHub not in local
git log origin/main..main  # See commits in local not on GitHub
```
