# DriverPay Pro

DriverPay Pro is a mobile-first truck driver pay calculator with ticket photo capture, OCR, private driver accounts, and secure cloud synchronization through Convex.

## Features

- Email/password accounts with email verification and password reset
- Required driver profiles: name, phone, company, and truck number
- Separate settlements, loads, settings, and tickets for every driver
- Ticket image storage in Convex Storage
- Admin-only fleet view for the configured administrator
- Offline-first local editing with automatic cloud synchronization
- OCR-assisted ticket capture and mileage entry

## Development

Requirements: Node.js 22 and npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The local app runs at `http://localhost:5173/truckpay-calculator/`.

## Validation

```bash
npm run check
```

This runs TypeScript checking, unit/integration tests, and the production build.

## Convex

The backend schema and functions are in `convex/`:

- `auth.ts` and `email.ts`: Convex Auth, verification, and password reset
- `profiles.ts`: required driver onboarding and account settings
- `sync.ts`: authenticated storage and synchronization
- `admin.ts`: server-enforced fleet administrator access
- `schema.ts`: users, profiles, settlements, loads, and tickets

For local Convex development, set `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL`, then run:

```bash
npx convex dev
```

Never commit deployment keys or email provider API keys.

## Production deployment

Pushes to `main` run `.github/workflows/deploy.yml`. The workflow:

1. Installs locked dependencies.
2. Runs the typecheck and test suite.
3. Initializes missing Convex Auth signing keys.
4. Deploys Convex functions.
5. Builds and publishes the app to GitHub Pages.

Required GitHub configuration:

- Secret: `CONVEX_DEPLOY_KEY`
- Variable: `VITE_CONVEX_URL`
- Convex environment variable: `AUTH_RESEND_KEY`

Production app: <https://xgamer791.github.io/truckpay-calculator/>

## Data behavior

Existing pre-account browser tickets are intentionally not migrated. After a driver signs in and completes a profile, the account's cloud state becomes the source of truth. Signing out clears that account's locally cached driver data from the device.
