# Publish PagePulse and get your GitHub submission link

The project files are ready. A GitHub repository has **not** been created for you; publish it from your own account using either method below.

## Easiest: GitHub's website (no terminal)

1. Download `pagepulse.zip` from this conversation and extract it.
2. Sign in at https://github.com.
3. Click **+ → New repository**. Name it **pagepulse**, choose **Public** if your assignment requires a public link, and create it. Do not add a README, license, or .gitignore because these files are already included.
4. On the empty repository page, click **uploading an existing file** (or **Add file → Upload files**).
5. Open the extracted `pagepulse` folder on your computer. Drag its **contents** into the upload area. The repository root should contain `package.json`, `server.js`, `README.md`, `public/`, `lib/`, and the other included files—not just the ZIP or an extra wrapper folder.
6. Confirm that the upload includes `.gitignore` and `.env.example`. Hidden files may need to be made visible in your file manager. Do **not** upload your `.env`, `data/`, or `node_modules/` if you have already run the project locally. You can omit `.github/workflows/ci.yml` when uploading via the browser if GitHub rejects it; use Git to add it later.
7. Enter a commit message, for example **Initial commit: PagePulse website change detector**, then click **Commit changes**.
8. Your submission link is the repository address:

   ```text
   https://github.com/YOUR_USERNAME/pagepulse
   ```

A repository link is not a hosted running website. The README explains how an evaluator can install and run it. This app has a Node backend, Chromium worker, and persistent SQLite database, so **GitHub Pages cannot run it**.

## Recommended: Git in the terminal

Install Git if needed, extract the ZIP, and open a terminal **inside the `pagepulse` folder**.

First create an empty repository named `pagepulse` on GitHub. Do not initialize it with any files. Then run:

```bash
git init
git add .
git status
```

Check that `.env`, `node_modules/`, and `data/` are **not** listed. `.env.example` **should** be listed; it contains placeholders, not secrets.

If Git asks who you are, configure your commit identity:

```bash
git config user.name "Your Name"
git config user.email "YOUR_GITHUB_EMAIL"
```

Commit and push, replacing `YOUR_USERNAME` with your actual username:

```bash
git commit -m "Initial commit: PagePulse website change detector"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/pagepulse.git
git push -u origin main
```

Complete the browser sign-in prompt from Git Credential Manager if shown. GitHub does not accept your account password for HTTPS Git operations; use its supported browser/device flow, SSH key, or personal access token. Never put a token in a source file, chat, or remote URL. If a token is used for the included workflow file, it must have the appropriate repository/workflow permissions.

Then open and submit:

```text
https://github.com/YOUR_USERNAME/pagepulse
```

### If the remote repository already contains files

The easiest safe option is to clone it, copy the project contents into the cloned folder, then commit and push from there. Do not force-push over work you want to preserve.

### Future changes

```bash
git add .
git commit -m "Describe your update"
git push
```

## Before submission

- [ ] `package.json` and `server.js` are at the repository root.
- [ ] README renders and includes setup instructions.
- [ ] `.env` and real credentials are absent.
- [ ] `npm ci`, `npx playwright install chromium`, and `npm test` work locally.
- [ ] `npm run demo` (optional) and `npm start` open the dashboard.
- [ ] Try one real monitor and inspect its baseline.
- [ ] If the repository is private, invite your evaluator or make it public as requested.
- [ ] Submit the repository URL, not the ZIP filename or your local `localhost` URL.
