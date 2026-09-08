# DriverPay Pro deployment

Production deployments are handled by GitHub Actions after a push to `main`.

## Required configuration

GitHub repository settings:

- Actions secret `CONVEX_DEPLOY_KEY`: Convex production deploy key
- Actions variable `VITE_CONVEX_URL`: `https://kindred-seal-7.convex.cloud`
- Pages source: the `gh-pages` branch

Convex production environment:

- `AUTH_RESEND_KEY`: Resend API key
- `SITE_URL`: created or updated automatically by the workflow
- `JWT_PRIVATE_KEY` and `JWKS`: created automatically if missing

The Resend sender is `DriverPay Pro <noreply@freedomaminos.com>`.

## Release flow

The deploy workflow runs `npm ci`, typechecking, tests, Convex Auth initialization, `convex deploy`, a production Vite build, and GitHub Pages publishing. A failed validation or backend deployment stops the web release.

## Local checks

```bash
npm ci
VITE_CONVEX_URL=https://kindred-seal-7.convex.cloud npm run check
```

Do not add deploy keys, Resend keys, JWT private keys, or `.env.local` to Git.
