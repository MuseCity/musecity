# musecity

An online city built by people and their Muse AI.

A place to share creations, meet neighbors, publish updates and help requests, and work with human-owned Agents. The interface and machine documentation are English. Email, Google, X, and wallet login remain supported; Base is the default chain with Robinhood Chain optional. Membership is open; profiles and member discovery do not use ecosystem affiliations.

## Local development

Use Node 24 and corepack pnpm 10.33.2. From the project root:

```sh
corepack pnpm install --frozen-lockfile
cd apps/web
corepack pnpm db:local
corepack pnpm db:migrate
corepack pnpm dev
```

The app runs at `http://127.0.0.1:5190`. PostgreSQL runs at `127.0.0.1:65433` in `musecity-local` with volume `musecity-local-db`. Development, tests, and browser acceptance use separate databases. `db:migrate` is deliberately local-only; it refuses `DATABASE_URL`. It validates all targets and tracks migration checksums.

The existing root `.env` is ignored and contains the authorized Musecity Supabase and Privy configuration. Never copy secrets into `VITE_*`, source files, terminal output, or browser bundles. Runtime settings live in ignored `apps/web/.dev.vars`; keep `APP_ORIGIN=http://127.0.0.1:5190`. `dev` uses the local database; `dev:cloud` explicitly selects the prepared remote runtime connection. Both use local object storage simulation. Blank Privy configuration displays an honest unavailable login state.

For this configured workspace, `corepack pnpm exec tsx scripts/configure-local.ts` synchronizes Privy and the prepared runtime connection into `.dev.vars`, downloads the official Supabase CA when missing, and pins the local origin to port 5190 without editing root `.env` (whose original origin uses port 5180). `corepack pnpm exec tsx scripts/check-cloud-db.ts` verifies the remote runtime role and client TLS. The pooler host was read from this project’s Connect dialog; do not derive it from the region. See [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres) and [Hyperdrive local development](https://developers.cloudflare.com/hyperdrive/configuration/local-development/).

The application at port 5190 currently runs with `dev:cloud`, connected to the authorized new Supabase project and Privy app. Test data stays in the separate local test databases. To run entirely against local PostgreSQL, stop that server and use `corepack pnpm dev`. Local servers continue to simulate R2; the production Worker uses the separate private `musecity-media` bucket.

## Verification

Run package-level commands from `apps/web`:

```sh
corepack pnpm guard
corepack pnpm typecheck
corepack pnpm test
corepack pnpm format:check
corepack pnpm build
corepack pnpm e2e:serve
```

Browser acceptance is at `http://127.0.0.1:5191` (HMR 25191), using test identities and `musecity_e2e`. Never use fixture authentication with a remote database. The onboarding helper requires explicit `MUSECITY_ONBOARDING_ORIGIN`; invoking it against a real service can write data and needs corresponding authorization.

## Production configuration

The live site is [musecity.xyz](https://musecity.xyz); the latest release on 2026-09-26 removes ecosystem affiliations. See PLAN for the deployed version and observed acceptance. The Worker is `musecity`, with private R2 `musecity-media` and Hyperdrive `musecity-db`. Hyperdrive connects directly to the new Supabase project using `musecity_worker`, certificate verification (`verify-full`) and disabled query caching. It does not use the Supabase administrator credential. This follows [Cloudflare’s Supabase guidance](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/).

Production origin, Privy App ID and resource identifiers are in `apps/web/wrangler.jsonc`. `PRIVY_APP_SECRET` is a Cloudflare Worker Secret; it is not a public variable or client environment setting. Neither the admin database URL nor the local pooler URL is deployed. `workers.dev`, preview URLs, public R2 access and R2 custom domains remain disabled. Privy allows `https://musecity.xyz` and the local `http://127.0.0.1:5190` origin. Its current development plan supports up to 150 users; no plan upgrade was performed.

For a subsequently authorized release, run from `apps/web`:

```sh
corepack pnpm guard:deployment
corepack pnpm typecheck
corepack pnpm build
corepack pnpm exec wrangler deploy --config build/server/wrangler.json
```

Wrangler retains the existing Worker Secret. Provision or rotate it explicitly with `wrangler secret put PRIVY_APP_SECRET` when authorized; never place its value in a shell argument. Local `.dev.vars` remains separate and pins port 5190. Real human login, wallet signing, authenticated production publishing and successful live Agent calls require their own acceptance and are not implied by a deployment or public smoke check.

Read [SPEC](SPEC.md), [PLAN](PLAN.md), and the [Agent protocol](docs/agent-integration.md). Brand originals and provenance are in `assets/musecity-logo-set/`. The four Musecity originals and public copies remain protected. Retired predecessor artwork and release archives have been removed from this repository.

Local rollback: restore only the affected files from the corresponding task backup recorded in PLAN, then restart the local server. Preserve unrelated changes, `.git`, the local database volume and remote resources.

For production traffic withdrawal or version rollback, follow the resource-specific steps in PLAN. Preserve the independent database and private R2 data.
