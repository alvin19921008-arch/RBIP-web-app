# Git Workflow Guide for RBIP Web App

## ✅ Current Status
Your repository is connected to: `https://github.com/alvin19921008-arch/RBIP-web-app.git`

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

### If you want to see what's on GitHub vs local:
```bash
git fetch origin
git log main..origin/main  # See commits on GitHub not in local
git log origin/main..main  # See commits in local not on GitHub
```
