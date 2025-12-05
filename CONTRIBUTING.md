# Contributing to DockerMaid

Thank you for contributing — your help keeps DockerMaid healthy. This file documents the required workflow and rules contributors must follow.

**Maintainer & permissions**
- **Maintainer:** `@souhaibtouati` — only the maintainer may publish Docker images and perform protected operations.
- Contributors must not push directly to `main`. All changes to `main` must be made via pull requests.

**Branch policy (required)**
- Protect the `main` branch in GitHub settings:
  - Require pull requests before merging.
  - Require passing status checks (CI) before merge.
  - Enable "Require review from Code Owners".
- If a direct push to `main` occurs, an automated workflow will open an issue and notify the maintainer.

**Docker publishing policy**
- Publishing images to Docker Hub is restricted to the maintainer only.
- The GitHub Actions job that performs Docker publishing targets the `docker-publish` environment. The environment must be protected and require approval from maintainers to run.
- To publish a new release image:
  1. Create a tag (example: `v1.3.1`) and push it to the repository.
  2. The `docker-publish` workflow will run but will pause for environment approval — a maintainer must approve the job in GitHub Actions.

**How to request a Docker publish (for contributors)**
- Open a pull request with your changes and request a review from `@souhaibtouati`.
- In the PR description add a short release note and request a release/publish.
- The maintainer will run the publish workflow (approve the `docker-publish` environment) after merging and verifying CI.

**Local development**
1. Install dependencies:

   ```powershell
   npm ci
   ```

2. Run frontend and server concurrently for development:

   ```powershell
   npm run dev:all
   ```

3. Frontend dev server: `http://localhost:5173`
   Server API: `http://localhost:3000`

**Build & test locally**
- Build production assets:

  ```powershell
  npm run build
  ```

- Lint and type check locally before opening a PR:

  ```powershell
  npm run lint
  npx tsc --noEmit
  ```

**Build Docker image locally (example)**

```powershell
docker build -t yourname/dockermaid:local .
docker run -p 3000:3000 yourname/dockermaid:local
```

**Repository secrets & environment (maintainers)**
- Add these repository secrets in GitHub (Settings → Secrets → Actions):
  - `DOCKERHUB_USERNAME` — Docker Hub username
  - `DOCKERHUB_TOKEN` — Docker Hub access token
  - `DOCKERHUB_REPOSITORY` — repository name (e.g., `souhaibtouati/dockermaid`)
- Create an environment called `docker-publish` (Settings → Environments) and enable required reviewers or approval so only maintainers can approve image publishing.

**Pull request checklist**
- [ ] Lint (`npm run lint`) passes
- [ ] Type check (`npx tsc --noEmit`) passes
- [ ] Build (`npm run build`) succeeds
- [ ] PR has a descriptive title and summary
- [ ] Linked any related issues

**If something goes wrong**
- If a direct push to `main` is made, the automated workflow will open an issue labeled `direct-push` and notify `@souhaibtouati` to take action (revert, open PR, etc.).
- If you need a Docker publish and lack permissions, tag the PR and request the maintainer in the PR comments.

**Contacting the maintainer**
- For release requests, urgent fixes, or questions, mention `@souhaibtouati` in the PR or open an issue and tag the `maintainer`.

Thank you for helping improve DockerMaid!
