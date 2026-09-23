# Releasing

Releases run from GitHub Actions, not from a laptop. The workflow authenticates with OIDC — GitHub mints a short-lived token proving the run came from this repository, and the registry verifies it. There is no token stored anywhere and no one-time code to type.

## One-time setup

### PyPI — do this first, it works before the package exists

PyPI supports *pending* publishers, so you can authorise the repository before `pila-sdk` has ever been published.

1. pypi.org → Your projects → **Publishing** → Add a new pending publisher
2. Fill in:
   - PyPI project name: `pila-sdk`
   - Owner: `dannyhilariosuarez`
   - Repository: `pila-agents`
   - Workflow: `release.yml`
   - Environment: `pypi`
3. Create a GitHub environment named `pypi` — repo → Settings → Environments → New environment

### npm — needs the package to exist first

npm configures trusted publishing per package, on the package's settings page, which means **the first version has to be published by hand.** There is no way around that one publish.

Once `@pila/protocol@0.1.0` exists:

1. npmjs.com → the package → Settings → **Trusted publisher**
2. Fill in: owner `dannyhilariosuarez`, repository `pila-agents`, workflow `release.yml`
3. Repeat for `@pila/cli`

Every release after that is hands-off.

**Bridging the gap:** if you would rather not do the first publish interactively, add a granular access token as the repository secret `NPM_TOKEN` (npmjs.com → Access Tokens → Granular → read and write, bypass 2FA). The workflow uses it when present. Delete the secret once trusted publishing is configured — npm is phasing these tokens out.

## Cutting a release

Bump the versions, then:

```bash
git tag v0.1.1
git push --tags
```

The workflow verifies (lint, build, test), then publishes to npm and PyPI.

To rehearse without publishing, use **Actions → Release → Run workflow** with `dry_run` checked. That packs every artifact and runs `twine check` without uploading anything.

`@pila/shared` is excluded by default. Tick `include_shared` to publish it.

## Order matters

`@pila/protocol` publishes before `@pila/cli`. The CLI depends on `workspace:^`, which pnpm rewrites to a real semver range at pack time — so that version has to resolve on the registry. The workflow already does this in the right order; keep it that way.

## What to check after a release

```bash
npm view @pila/protocol version
pip index versions pila-sdk
```

npm packages publish with `--provenance`, so each one gets a verified link back to the exact commit and workflow run that built it. That badge is visible on the package page.
