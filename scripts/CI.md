# Site CI/CD

The workflow **Validate and deploy Pages** checks the website on every main push and pull request. It stages only the existing Seattle homepage and the trip/ and socal/ folders, validates JavaScript syntax/data/links, and runs Chromium at phone and desktop widths. External weather is mocked so testing does not depend on the forecast API; the unavailable-API/embedded-data fallback is tested separately.

## One-time activation

In repository Settings → Pages → Build and deployment → Source, choose GitHub Actions. The legacy branch-publishing source bypasses this gate. The connector cannot change repository Pages settings. Once activated, use the Actions tab to run the workflow manually if needed. Restrict the github-pages environment to main if desired.

The deploy job depends on the successful validation job, uploads the tested artifact, and checks the public URLs and file contents against the commit. Test failures before deployment leave the previous published version intact. A post-deployment failure is reported in Actions; it does not automatically roll back. To restore a known-good commit, revert the faulty commit on main and run the workflow again. Standard hosted runners for this public repository are free.

## Local checks

Use Node.js 22:
```sh
mkdir -p _site
git archive HEAD index.html trip socal | tar -x -C _site
node scripts/validate-site.cjs _site
npm install --no-save --no-package-lock playwright@1.56.1
npx playwright install chromium
node scripts/smoke-site.cjs _site
```
