# Musecity implementation and verification

Date: 2026-09-25. Status: deployed at https://musecity.xyz with isolated Supabase, Privy, Hyperdrive and R2. The Move-in guide was released at 08:38:11 UTC after explicit deployment authorization; local workflow acceptance and production release checks are recorded separately below.

Current extension: the wallet and native weighted governance feature was deployed on 2026-09-26 after explicit authorization. Production acceptance found public RPC rate limiting, so server-side membership remains an outstanding integration check; see the release record at the end. Earlier release records below describe earlier code.

## Authorized scope

Copy the complete predecessor workspace to `/Volumes/code/opc/musecity`, preserve the target `.git` and existing ignored `.env`, use fresh accounts/data, and retain the source unchanged. Apply the approved red/gold/cream Musecity brand, four original artworks, technical names and credential prefixes. The original migration stage excluded staging, commits, pushes, deployment, domain binding and cloud project creation.

The user subsequently authorized the existing Musecity Supabase and Privy configuration from the root `.env`. This permits initializing the new project's application schema and runtime role. Test fixtures remain local. The user later explicitly authorized deployment to the configured `musecity.xyz` Cloudflare zone, including the separate Worker, private R2 and Hyperdrive resources required for it. On 2026-09-26, the user requested `commit all`, authorizing staging and a complete local commit of the current project. Ignored secrets, runtime data, dependencies and build output remain excluded. Remote pushes and third-party plan upgrades remain unauthorized.

## Implementation

- Full source copy, including untracked MCP and onboarding work; excludes secrets, dependencies, caches and runtime data.
- Existing target `.env` remains unchanged and ignored. New secrets remain in ignored local files only.
- At migration time, predecessor release documents and branding were retained unchanged. They were subsequently removed from this repository by user request on 2026-09-26; see the cleanup record below.
- `musecity`, `@musecity/web`, `MUSECITY_*`, private SQL schema and roles, MCP identity, storage keys, and `mca_` / `mcr_` / `mci_` / `mcc_` / `mcu_` credentials.
- Independent `musecity-local` container and `musecity-local-db` volume, port 65433, databases `musecity`, `musecity_test`, `musecity_e2e`.
- Application 5190; isolated browser fixture 5191; fixture HMR 25191. Migrations and destructive test resets validate their local target before connecting.
- The initial migration used Cloudflare placeholders to prevent accidental deployment. The subsequently authorized release replaces them with Musecity resources. Local R2 simulation and Hyperdrive connection overrides remain available.

## Migration-stage verification

The following records the completed migration before deployment was authorized. See the production section below for subsequent release evidence.

### Source and repository isolation

- Copied 163 tracked/untracked source files, including all pending MCP, Agent onboarding, and profile-setting changes. Source HEAD remains `688f49a716f65045ae6800a615f3713c80df4efb`; all 163 source SHA-256 values and the full original worktree status match the baseline.
- Target `.git` files match the pre-copy baseline byte for byte, HEAD has no commit, and the staging area is empty. No commit, push, deployment, or cloud project creation occurred. The user-supplied root `.env` has its original SHA-256 and is ignored.
- At migration acceptance, 25 historical brand assets and all four Musecity originals passed the asset guard. Archived predecessor documents and artwork were preserved at that time; the later authorized cleanup is recorded below.

### Automated acceptance

Node 24.11.1 and pnpm 10.33.2; locked dependencies installed with `--frozen-lockfile`.

- `guard`: passed, including production/test identity import separation.
- `wrangler types`, React Router type generation, and TypeScript: passed.
- `vitest run`: **51 tests passed in 7 files**. Covers creation revisions/publishing and uploads, owner/account isolation, registration/claim/activation, pause/scope changes/rotation/revocation, REST/MCP permissions, all five new credential namespaces and rejection of legacy credentials before Privy verification.
- `format:check`: passed. Production client and Worker build: passed. Existing dependency annotation and large chunk warnings remain; no build failure.
- Local initialization and a second `db:migrate`: passed for all three databases. Wrong port/database/role/remote target rejection is tested before any connection or reset.
- `guard:deployment`: intentionally fails with “Configure a real Hyperdrive binding before deployment.” No deploy command was run.
- Client artifact scan found no input secrets, runtime connection secrets, or fixture identities. Build output and local secrets remain ignored.

### Browser acceptance

Normal Chrome, desktop viewport 1795px and a 390 × 844 emulated phone viewport. Phone document width was exactly 390px on the home, neighbors, share, creation editor, settings, Agent management, invitation dialog, and MCP guide. Desktop page width remained within its viewport. No active old brand copy was observed.

- Approved artwork loads clearly in navigation/favicon, homepage, community/empty states, and the real Privy modal. Manrope, page structure, ecosystem filters, and separate Agent permission checkboxes remain.
- In the isolated fixture, saved `Musecity QA Alice` / `musecity-qa-alice`, joined the directory with no ecosystem requirement, uploaded the crest PNG, published an update, and verified its public detail and directory entry. Only `musecity_e2e` received this browser content. Test identities and local file storage are explicitly labeled.
- Settings and Agent invitation controls were checked on desktop and phone; autonomous publishing/community posting/replies remain opt-in. The MCP guide shows the current origin and new credentials. Creation editor exposes all four formats and correct publication/draft actions.
- Real human login, linked-account changes, wallet creation/signing, and real remote uploads were not performed. These are not implied by fixture/browser layout acceptance.

### Authorized existing cloud connections

- Supabase project `musecity`, ref `vlvhfnhmcpeuyoyiapuk`, Seoul. Before initialization, no application schema/roles or public business tables existed. Applied the three SQL files with checksum records via the Supabase connector (`musecity_initialization`), then the dedicated login role (`musecity_worker_role`). Remote checksum records match the local files. No predecessor database was accessed or migrated.
- `musecity_worker` is not superuser and cannot create databases or roles. It uses the `musecity_runtime` grants; reading the migration ledger is denied. Supabase `anon` and `authenticated` have no Musecity schema access.
- The supplied direct connection was not reachable from this host. The project’s dashboard supplied the IPv4 session pooler. The official Supabase root certificate enables `verify-full`; the client-to-pooler TLS transport is verified. The pooler’s internal database hop reports `pg_stat_ssl=false`, which is recorded separately and is not used as the client TLS signal.
- The local Cloudflare Worker at `http://127.0.0.1:5190` uses Hyperdrive’s local connection override with that runtime connection. Real read-only API requests returned six tags and an empty neighbor list.
- Privy app `musecity` (`cmug6tppl01ry0ejlx0asnge8`) is distinct from the predecessor. Email and wallet were enabled; Google and X were enabled and saved, then read back after refresh. No additional OAuth scopes, OAuth token return, custom credentials, wallet permissions, plan upgrade, or secret rotation was added. The real local login modal shows the Musecity artwork and all four login choices. A read-only authenticated Privy users request also succeeded with the supplied app secret and returned no users.
- Development and remote databases both have **0 accounts, 0 works, 0 posts, 0 Agents, and 0 media**; each has only the six initial catalog tags plus schema/migration metadata. Automated fixtures use `musecity_test`; browser fixtures use `musecity_e2e`.
- At the end of the migration stage, Cloudflare bindings, remote Hyperdrive and remote R2 were still unconfigured; `musecity.xyz` had not yet been deployed. The subsequently authorized deployment is recorded below.

The fixture server was stopped after acceptance; restart it with `corepack pnpm e2e:serve` when needed. The port-5190 application remains available for review.

Logs for this local session are `/tmp/musecity-tests.log` and `/tmp/musecity-build.log`. The source/hash baseline is outside both repositories at `/var/folders/dv/35gw0r9d6zl5tn0yg1sdhhzc0000gn/T/musecity-migration-20260925-c5c_prc8/baseline.json`.

## Authorized production deployment (2026-09-25)

The user explicitly requested deployment after configuring `musecity.xyz` in Cloudflare. This supersedes the migration-stage no-deployment boundary while preserving no staging, commits or pushes. The existing zone was Active with no DNS records, Musecity Worker, bucket or Hyperdrive at the preflight check; no existing service was replaced.

| Resource | Configuration |
| --- | --- |
| Cloudflare account | `4b68bb6b6c38892162610027f25fbb0d` |
| Zone | `musecity.xyz`, `c6940f04c34e4e60d4b13b9e6a39bc4c` |
| Worker | `musecity`; custom domain `musecity.xyz`; workers.dev and preview URLs disabled |
| Hyperdrive | `musecity-db`, `b69f95f4f29d439982e812296dd27531` |
| Database origin | `db.vlvhfnhmcpeuyoyiapuk.supabase.co:5432/postgres`, user `musecity_worker` |
| Database TLS | `verify-full`, CA `8ccd9030-4763-44d4-a191-e68556858711`; connection limit 10; query cache disabled |
| R2 | Private `musecity-media`, APAC; r2.dev disabled, no custom domains |
| Privy | `cmug6tppl01ry0ejlx0asnge8`; only the existing app secret is stored as a Worker Secret |

Hyperdrive creation successfully verified the direct Supabase connection. The local session-pooler configuration remains for local development only. Privy allowed origins were restricted to `https://musecity.xyz` and `http://127.0.0.1:5190`; dashboard refresh and the authenticated SDK read-back both confirmed them. Privy remains in development mode (dashboard limit: 150 users); no plan upgrade, OAuth scopes, credential rotation or wallet permission expansion occurred.

Production configuration passed Worker and React Router type generation, TypeScript, deployment guard, formatting, build and Wrangler dry run. The 298 client files contained no source secrets, database credentials or fixture identities. Existing 51-test local acceptance remains applicable; production entry-point behavior was unchanged. Private R2 passed an API write/read round trip; its temporary check object was removed, and listing returned an empty bucket. This is storage API evidence, not authenticated application upload evidence.

### Release and public acceptance

- Deployed at **2026-09-25 03:19:44 UTC** (11:19:44 Asia/Shanghai), Worker version **`0297d5bc-1a3c-419f-b6df-9e6501ba1c46`**, deployment `9d37eeb7-acd5-4838-b4bd-23c7d3e6cfd3`, 100% traffic. Cloudflare read-back confirms all expected bindings and `PRIVY_APP_SECRET` as `secret_text`; no administrator or pooler URL is deployed.
- Custom domain `musecity.xyz` is enabled, domain ID `8d46aa7558370620388cdd3556a75f8455541e9d`, certificate ID `28f67125-eca4-4e26-b626-ed7b82354140`. HTTPS requests and normal Chrome navigation succeeded. workers.dev and preview URLs were read back as disabled.
- **34 live smoke checks passed**: seven page responses; health; six catalog tags from Supabase through Hyperdrive; public empty neighbors/feed/works; invalid filter rejection; anonymous private endpoints; cookie-only denial; all five predecessor token namespaces and an invalid Musecity Agent token denied; invalid human token denied; same-origin Skill/OpenAPI; MCP method/authentication denial; all four deployed PNG SHA-256 values match their originals.
- Normal Chrome at 1795px verified home, neighbors, share, creation, settings, Agent management and MCP pages within the viewport, plus the real Privy login modal, including the four configured login choices and Musecity artwork. A 390 × 844 phone check covered home, neighbors, share, creation, settings, Agent management, MCP guide and login modal; document width did not exceed 390px. Private pages show the real sign-in gate, not fixture identities. MCP setup names `https://musecity.xyz/mcp`. No active old brand text was observed. Extension-origin MetaMask warnings were distinguished from application failures.
- The remote business tables remain empty: zero accounts, works, posts, Agents and media. No synthetic production user, owner approval, wallet signing, authenticated publishing/upload, or successful live Agent/MCP tool call was performed. Those remain separate acceptance boundaries; the full content and Agent workflows passed in isolated local tests and fixtures only.
- The first bulk asset transfer failed on network socket closure. The identical built files were uploaded through the official assets API in smaller batches with a longer transfer timeout, after which the ordinary Wrangler deployment succeeded. No production source or dependency workaround was introduced.
- Source file/status checks, target `.git` hashes and root `.env` hashes still match the migration baseline. There are zero commits and zero staged files; no push occurred.

Logs: `/tmp/musecity-deploy-final.log`, `/tmp/musecity-live-smoke.json`, `/tmp/musecity-deploy-typecheck.log`, `/tmp/musecity-deploy-format.log`, and `/tmp/musecity-deploy-build.log`.

## Move-in guide implementation and local acceptance (2026-09-25)

The user initially approved the three-step plan for implementation in the isolated local environment, excluding production migration/deployment, staging, commits, pushes, or production profile, post and invitation writes. The subsequent explicit instruction to deploy authorized this change's production migration and release, as recorded below. No commit or push was requested.

### Delivered behavior

- Dedicated `/move-in`: public identity and explicit directory consent; optional public introduction with saved preview; optional existing Muse invitation with explicit draft-only approval. Numbered progress, text statuses, heading focus, unsaved-change protection and a truthful completion summary are shared across desktop and phone.
- Home Join starts login at the guide, while task-specific login retains its current route. Home/profile/Neighbors joining links share the new destination. Settings is ordinary profile/account management and retains guide re-entry. Interrupted guides resume; deliberately finished guides stop the homepage prompt.
- Private account progress in `0004_move_in.sql`, applied only to the validated local `musecity`, `musecity_test` and `musecity_e2e` databases at `127.0.0.1:65433`. Owner-only `GET/PATCH /me/onboarding` accept intent, not invented completion. `POST /me/onboarding/posts` shares publishing rules and saves introduction/progress in one locked transaction. Replayed requests return current visible results; different retry keys and concurrent tabs cannot duplicate the introduction.
- Existing human updates and active Agents are recognized. Invitation creation, registration waiting, expiry, deferral and activation are distinct. Page-visible polling uses existing APIs and does not overlap background reads. Copying is never completion. Expired or lost unfinished connections require explicit cancellation before fresh authorization; consumed invitation instructions are cleared after registration. Account changes remove local invitation secrets. Default rights remain drafts only; no Agent permissions or MCP tools were added.
- SPEC and Agent integration documentation describe the flow, human-only endpoints, replay semantics and release boundary; OpenAPI includes request and response schemas for the three new operations.

### Local acceptance

- **59 tests passed in 8 files**, including 7 new Move-in business tests and the human guide's OpenAPI response check. Evidence uses real isolated PostgreSQL and test authentication. Coverage includes membership consent, account isolation, server-derived completion, skip/resume/finish, existing human versus Agent posts, concurrent and repeated introduction requests, quota rollback, hidden/deleted replay protection, Agent access denial, invitation/registration expiry and cancellation, activation and invalidated connections.
- Wrangler Env generation, React Router type generation, TypeScript, formatting, protected asset/production import guards and production build pass. Existing dependency annotation/chunk-size warnings are not new failures. No new Worker binding, package dependency or runtime permission is required.
- In-app browser acceptance at desktop size and **390 × 844**: homepage Join, existing-account routing, new identity and directory membership, handle conflict with retained values and focused input, unsaved navigation dialog, interrupted setup resume, blocked-network introduction failure and successful retry, actual saved post preview, draft-only Muse consent, copy remaining in waiting state, server registration/activation reflected by polling, completion, skipped steps, no reminder after finishing, Settings re-entry, empty directory and Share login retaining its task. Phone pages stayed within the viewport. Fixture account switching cleared the private invitation immediately.
- The browser fixture created one new Bob update and one draft-only Muse, and exercised an expired Alice invitation. Agent activation plus a diagnostic REST call succeeded against the local fixture. Expiry/empty-neighborhood/skip scenarios used reversible local fixture changes that were restored. No real Privy/OAuth, external Agent client, live MCP client or wallet operation was tested in this change.
- The local preview remains available at `http://127.0.0.1:5191/move-in` through `corepack pnpm e2e:serve`; it is visibly labeled as simulated identity and local PostgreSQL. Logs: `/tmp/musecity-move-in-tests.log`, `/tmp/musecity-move-in-final-checks.log` and `/tmp/musecity-move-in-build.log`.

### Remaining validation and release

First-time human usability testing is still required to determine whether users understand public membership, optional publishing and Agent activation without explanation. Local correctness/layout checks do not establish comprehension or conversion improvement. Record where users hesitate and whether they can explain each completion/deferral status before making a conversion claim.

For that session, give the participant the local homepage and ask them to join the neighborhood without publishing yet, leave and return to finish an introduction, then decide whether to connect their existing Agent or defer. Do not explain controls in advance. Before each primary action, ask what will become public or authorized; after completion, ask which tasks are done, deferred or waiting. Record incorrect predictions, backtracking, requests for explanation and actual outcomes. A separate participant with an existing Agent is needed to assess the handoff instructions; simulated activation proves interface behavior only.

Production migration and deployment were subsequently authorized and completed below. The additive `0004_move_in.sql` must precede this code; it does not alter existing accounts, posts or Agent permissions. For local rollback, restore only this change's touched files from `/var/folders/dv/35gw0r9d6zl5tn0yg1sdhhzc0000gn/T/musecity-move-in-7z5zywcq` and remove its newly added onboarding files. Preserve other uncommitted work and retain the additive progress table/data; no database reset or drop is needed.

## Authorized Move-in production release (2026-09-25)

The user explicitly requested deployment after local acceptance. Production target identity, existing migration checksums and the previous Worker version were read back before publishing.

- Applied `0004_move_in.sql` to Supabase project `musecity` (`vlvhfnhmcpeuyoyiapuk`) at **08:37:20 UTC**, using migration `musecity_move_in` and the existing application migration ledger. SHA-256: `689c76f86f964c654f319a29d683113fe97aed39e66dca28ef89b3c22e7f2c1e`. Remote checksum matches the local file; the first three migration checksums remain unchanged.
- Read-back confirms all six columns and runtime SELECT/INSERT/UPDATE access, with no runtime DELETE grant. Supabase `anon` and `authenticated` cannot access the private schema or read the progress table. The security advisor returned no findings. No existing profile, post, Agent, credential or wallet data was changed by this migration.
- Published Worker version **`5e8c6c6b-90ea-4302-8433-5820fcb54861`** at **08:38:11 UTC** (16:38:11 Asia/Shanghai), deployment **`9705e214-05ff-42fe-8961-1b46cb16b2a2`**, serving **100%** of traffic at `musecity.xyz`. Cloudflare read-back confirms the existing Hyperdrive, R2, public variables and Privy secret binding. workers.dev and preview URLs remain disabled.
- Reused the verified production build without runtime source changes. Deployment guard and Wrangler dry run passed; 304 client files were checked for private configuration and fixture identities with no matches. Asset upload and ordinary Wrangler deployment succeeded. Source/lockfile/config hashes and the root `.env` remained unchanged during publication.
- **25 production smoke checks passed** at 08:42:21 UTC: home, Move-in, Neighbors, Settings, Share and My agents return 200; health, tags and public community reads succeed; anonymous/cookie-only/fixture identities are denied on private progress; Agent-prefix credentials are denied on all three human-only operations; OpenAPI includes the new contracts. Deployed Move-in, Settings and home JavaScript bytes match the tested local build. Agent-prefix denial is not a real activated-Agent integration test.
- In-app browser verification used the existing authenticated production session for read-only home and Settings checks. The homepage displays the three-step explanation and `/move-in` destination; Settings displays regular profile management and its guide entry, without the old joining checkbox. Desktop and 390 × 844 phone layouts stayed within the viewport; no application console errors were observed. The guide itself was not started with the real account because opening it records progress; full write workflows remain supported by isolated local acceptance, not claimed as production acceptance.
- After verification, production still held **1 account, 0 posts, 0 Agents, 0 invitations and 0 onboarding rows**. No fixture account, synthetic content, invitation, login-method change or wallet action was performed. No staging, commit or push occurred.

Release logs: `/tmp/musecity-move-in-deploy.log`, `/tmp/musecity-move-in-release-dry-run.log`, `/tmp/musecity-move-in-live-smoke.json`. Source input hashes: `/tmp/musecity-move-in-release-source.json`.

The verified pre-release rollback version is **`0297d5bc-1a3c-419f-b6df-9e6501ba1c46`**. If rollback is required, run from `apps/web`: `corepack pnpm exec wrangler rollback 0297d5bc-1a3c-419f-b6df-9e6501ba1c46 --config build/server/wrangler.json`. Keep the additive progress table and any saved progress; rolling back the Worker does not require dropping it or reverting account data. Real first-time usability and external Agent/MCP acceptance remain separate outstanding validations.

## Rollback

For local rollback, restore only the affected Musecity files from the applicable task backup and restart the local server. Preserve unrelated working changes, the database volume, `.git` and remote resources; do not substitute a predecessor checkout or database.

For production rollback, this is the first Musecity release, so no previous Musecity version exists. To stop public traffic, detach only the `musecity.xyz` custom domain from Worker `musecity` in Cloudflare (domain ID `8d46aa7558370620388cdd3556a75f8455541e9d`). Keep Supabase, Hyperdrive, private R2, the local volume and target `.git`; workers.dev/preview URLs are already disabled. For subsequent releases, restore this validated version with `corepack pnpm exec wrangler rollback 0297d5bc-1a3c-419f-b6df-9e6501ba1c46 --config build/server/wrangler.json`. Worker rollback does not revert database data or Privy settings. Do not reset the source repository or route Musecity to the predecessor database.

## Image optimization implementation and acceptance (2026-09-25)

Status at implementation acceptance: locally accepted, with real Cloudflare Images/R2 checks in a temporary remote development Worker. **Production release completed on 2026-09-26; see the release record below.** This section supersedes the earlier raw-upload behavior, not earlier release records. Scope is compression, responsive display and caching; proxy configuration, HTTP protocol changes and network retries were untouched.

### Delivered behavior

- Shared browser preprocessing covers avatars, creation/cover images, article illustrations and post photos: WebP quality 82, longest edge 512px/2560px, orientation/alpha/aspect ratio preserved, no enlargement. Conforming static WebP is reused. Animation bypasses Canvas; animated WebP is preserved server-side and unsupported APNG is explicitly rejected.
- Additive `0005_image_optimization.sql` adds media purpose and nullable actual width/height. MIME/bytes/ETag describe the stored master after upload/completion. REST, MCP, OpenAPI and Agent documentation reflect the new contract, processing errors and fixed display widths.
- Private R2 derived keys include processing version, media id, master ETag and width. Every `/media/:id` request rechecks current visibility/ownership before storage/cache access. Public bytes use an internal named Workers Cache API with a seven-day TTL; private requests bypass it. Browser responses remain `private, no-store`. Display processing failure returns the existing master; required upload processing failure does not store an unprocessed file or mark it ready.
- Public responsive images use small avatar, medium feed and large detail candidates. Private previews load near the viewport, abort on unmount/identity change and release blob URLs. Structured logs contain processing metrics, cache sources and sanitized error codes only.
- Cloudflare configuration includes `IMAGES`. Sharp is a development-only local test codec under e2e; it is never imported into the production Worker. Protected artwork, local source PNGs, ignored credentials and root environment inputs were retained.

### Local evidence

- Node 24.11.1, pnpm 10.33.2. Migration 0005 applied only to validated local `musecity`, `musecity_test`, `musecity_e2e` at port 65433. No Supabase mutation.
- **67 tests passed in 9 files**, including 8 dedicated media scenarios plus REST/MCP workflow coverage. Exercises alpha, JPEG orientation, no enlargement, 2560px content cap, byte/dimension limits, damaged files, APNG rejection, animated WebP and lost-frame rejection; conforming WebP byte preservation; draft/account/Agent isolation; revoked/invalid credentials; R2/edge reuse; private cache bypass; warm-cache unpublishing/deletion/moderation/account restriction; provider failure/quota fallback and failed-upload readiness; historical master preservation and width validation.
- Three old image test fixtures had invalid PNG compressed data. Replaced them with a valid generated 1px PNG rather than weakening decode checks.
- `wrangler types`, React Router types, TypeScript, formatting, production guard, build and Wrangler deployment dry-run passed. Dry-run lists Images, private R2 and Hyperdrive. Existing third-party annotation/large-chunk warnings remain. No commit, push or production deployment.
- Normal Chrome against the isolated browser fixture at port 5191: uploaded `/Users/admin/Desktop/musecity/musecity-big.png`, saved the local Bob avatar, read its public profile, and uploaded/published a local-only four-photo post with the actual PNG, an EXIF-rotated JPEG, animated WebP and a small transparent PNG. All four private previews decoded; public images expose `srcset`/`sizes`. Desktop and 390px detail pages had no horizontal overflow. The local fixture tab remains available for review; no production profile or post was changed.

| Actual PNG measurement | Result | Target |
| --- | --- | --- |
| Source | 1254 × 1254 PNG, 1,764,489 bytes | Source untouched |
| Browser upload/master | 512 × 512 WebP, 43,908 bytes (42.9 KiB) | ≤200 KiB |
| Local 128px preview | 6,212 bytes (6.1 KiB) | ≤30 KiB |
| Real Cloudflare 128px derivative from the same browser master | 6,552 bytes (6.4 KiB) | ≤30 KiB |

### Real Cloudflare evidence and remaining release boundary

- Dashboard showed a 5,000-transformation allowance (0 used before verification) and purchase options for paid media products. No purchase, upgrade or zone transformation setting was changed. The Images binding worked directly with private bytes while zone URL transformations remained disabled.
- A temporary **remote development** Worker reused the production Images adapter with only Images and the existing Musecity R2 binding; it had no database, user authentication or production route. Successful remote calls verified the 512px master and 128px derivative, EXIF orientation (900×600 → 341×512), a two-frame WebP retaining both frames, and a 32×20 transparent PNG retaining dimensions and alpha (102/255). Repeated R2 reads matched ETags/lengths without another transform. The conforming browser master remained exactly 43,908 bytes and needed only one display transformation.
- Verification objects used unique `_verification/image-…` keys and were deleted in `finally`. The Cloudflare connector subsequently listed that prefix and returned **zero objects**. The temporary remote dev session was stopped. No live Musecity deployment was created or replaced.
- The initial large-source remote-dev POST failed in Wrangler's forwarding layer. A small health request and subsequent calls with the already compressed browser master and targeted fixtures passed. No proxy investigation, HTTP adjustment or retry mechanism was implemented.
- Local injected caches establish application authorization ordering; remote binding tests establish actual Images processing and R2 round trips. They do **not** establish live production API/database behavior or production Cache API hit rates. Those are acceptance checks after separately authorized release. The quota failure tests inject Cloudflare error 9422; no real quota was exhausted.

### Release and rollback procedure (authorized and executed on 2026-09-26)

1. Capture the current production Worker version immediately before release; preserve it as the rollback target. Check the Images plan/allowance again without purchasing anything.
2. Apply only migration 0005 to the verified Musecity project with the existing migration/checksum procedure, leaving private schema grants and the dedicated runtime role unchanged. Deploy the tested build with `IMAGES`; do not enable public bucket access or change zone-wide caching.
3. Verify a human/Agent upload, final metadata, fixed widths, repeated R2/cache reads and a warm-cache visibility withdrawal through the live Worker. Keep this evidence separate from the local fixture and remote development checks above.
4. Roll back with `corepack pnpm exec wrangler rollback <captured-pre-release-version> --config build/server/wrangler.json` from `apps/web`. Retain migration columns and media/derived objects. Code rollback cannot recover discarded uncompressed uploads. Previously downloaded image copies cannot be revoked.

Local logs: `/tmp/musecity-images-final-tests.log`, `/tmp/musecity-images-final-types.log`, `/tmp/musecity-images-formatcheck.log`, `/tmp/musecity-images-final-build.log`, `/tmp/musecity-images-dryrun.log`. Ignored measurement outputs and the temporary cloud verifier are under `apps/web/.local/image-verification/`.


## Image optimization production release (2026-09-26)

The user separately authorized production deployment. Released at **2026-09-26 00:36:31 UTC / 08:36:31 Asia/Shanghai**, serving 100% of `https://musecity.xyz` traffic.

- Worker version: `abf66242-b3fa-4305-8a1e-9993625a6f1a`; deployment: `e0ac62d4-f504-41b2-9a05-84f4b05fc576`.
- Captured pre-release / rollback version: `5e8c6c6b-90ea-4302-8433-5820fcb54861` (previous deployment `9705e214-05ff-42fe-8961-1b46cb16b2a2`).
- Applied only migration `0005_image_optimization.sql` to the verified healthy Musecity Supabase project `vlvhfnhmcpeuyoyiapuk` at 00:30:10 UTC. SHA-256: `639d1c8e9d48650884bf5892aff88a7b1beb5cfa671f7883d2b73b2f41b756dd`; recorded in `musecity._migrations`. All three existing media records remained. Runtime column grants remain available and anonymous schema access remains denied.
- Reused the validated build. Wrangler uploaded all 23 changed static assets, then its Worker-version transfer failed with a closed connection. The previous version remained live. Uploaded the same four dry-run output modules and the 303-file asset manifest through Cloudflare's official versions API, preserving cloud secrets, then activated that version through the deployments API. No proxy settings, HTTP options, application retry logic or package versions changed.
- Read back `IMAGES`, `MEDIA`, `DATABASE`, application vars and the preserved Privy secret binding. Both workers.dev and preview URLs remain disabled; observability remains enabled at 100% sampling. No plan purchase, bucket publicity or zone cache setting was changed.

### Live application and browser evidence

- Production homepage, skill and OpenAPI returned 200 with the new contract. Allen's authenticated `/api/v1/agent` remained active with exactly `content:read` and `content:write`; no permission escalation or credential change.
- Real Agent upload of the browser-compressed avatar completed and stored **43,908 bytes, 512 × 512 WebP** unchanged. Its 128px preview is **6,552 bytes**. A second preview read logged `r2_variant`, with the same bytes and ETag, without another transformation. Anonymous access returned 404 and unsupported width 129 returned 400.
- Real Agent upload of the original 1,764,489-byte PNG exercised mandatory server normalization through Images: **44,284 bytes, 512 × 512 WebP**, with a **6,566-byte 128px** preview. The live upload log reports `transformed: true`, 358ms processing time. Metadata, R2 bytes and ETags correspond to the final master.
- Normal Chrome, already signed in to the real owner account: uploaded `/Users/admin/Desktop/musecity/musecity-big.png` on the production settings page. Observed allocation with actual `image/webp`, `byteSize: 43908`, `purpose: avatar`; allocation 201, PUT 200, completion 200 and authenticated 128px preview 200. The preview decoded at 128 × 128 and rendered correctly. Did not save profile changes; reloaded settings after acceptance.
- The existing public avatar master remains the original 1,764,489-byte PNG. On-demand 128px WebP is **6,628 bytes**, 256px WebP is **16,440 bytes**. Workers Logs explicitly show `cache: edge` for a repeated public 128px read and `cache: r2_variant` for the authenticated historical-avatar preview. All image responses to the browser remain `private, no-store`.
- Public profile avatars expose the 128w/256w `srcset` and `sizes="72px"`, decode successfully, and render without horizontal overflow at desktop width 1795 and mobile width 390. Temporary device emulation and network capture were restored/disabled.
- Anonymous access to the new human preview and Allen's attempted access to that human-owned private preview both returned 404. Allen cannot fetch ownership metadata for the human avatar. The owner profile still references `med_d0012727-f113-49b5-a3f1-e8afac859268`; no existing post/profile was modified.
- Three actual-file acceptance uploads remain private and unreferenced: Agent conforming master `med_7f19bca9-3d43-4157-ac78-f8b6f2ad1c61`, human browser master `med_f867dc3d-8016-4cda-8f97-3a6fcf95114f`, Agent normalized master `med_35c7fdd1-1882-4a40-8c38-43524384724c`. No synthetic accounts, production resets, public acceptance posts or credential revocations were used.

Evidence boundary: the successful live checks establish browser/Agent upload, Images normalization, final DB metadata, R2 reuse, public edge hits and the exercised denial cases. Warm-cache visibility withdrawal, account restriction, credential revocation, cross-account isolation, processing outage and quota-exhaustion scenarios remain covered by the **67 local tests**, not by destructive production acceptance. The remote development codec checks above remain separate evidence for EXIF orientation, alpha and animation.

The first acceptance script omitted the existing required Idempotency-Key on completion and correctly received 400. Supplying the required header completed the same upload; no product change or duplicate allocation was needed.

### Current rollback command

From `apps/web`:

```sh
corepack pnpm exec wrangler rollback 5e8c6c6b-90ea-4302-8433-5820fcb54861 --config build/server/wrangler.json
```

Retain migration 0005 and all media/R2 objects. Worker rollback restores the preceding code and assets; it does not restore discarded uncompressed uploads or undo database data. The three new columns are additive and compatible with the preceding Worker. No commit, staging or push was performed.

Sanitized release/acceptance evidence: `/tmp/musecity-images-production-deploy.log`, `/tmp/musecity-images-production-smoke.log`, `/tmp/musecity-images-production-normalization.log`, and ignored JSON results under `apps/web/.local/image-verification/`. Credentials were read privately from existing ignored files and were not printed. The temporary upload metadata containing an asset-session token was removed after upload.

## Ecosystem affiliation removal (2026-09-26)

Status: implemented and locally accepted. No production deployment, remote data changes, migration, staging, commit or push in this task. This section supersedes earlier ecosystem UI/API requirements, while retaining those historical release records. Starting checkout: `b764bc9` with a clean worktree.

### Delivered behavior

- Removed Your communities from Settings and its save payload, all ecosystem badges (profile, member directory, feed sidebar and content bylines), and Square/Neighbors ecosystem selectors. Removed unused component/type/schema definitions and CSS. Profile identity, bio, current focus, help, membership, wallet configuration and Agent permissions remain independent.
- All current profile/owner serializers and OpenAPI response types omit `ecosystems`. Profile writes reject the retired field with `400 VALIDATION_ERROR`. Both REST lists reject even empty/repeated `ecosystem` parameters with `400 INVALID_FILTER`; MCP discovery omits the argument and strict tool validation rejects it. Machine Skill, Agent documentation, SPEC and README describe the current behavior.
- Server lists no longer reference historical ecosystem values. Cursor filter signatures no longer include that value; previous cursors fail with `400 INVALID_CURSOR`, prompting a first-page reload. Browser loaders replace old Square, Neighbors and profile URLs before fetching, removing the retired parameter and cursor while retaining other query parameters. Filter links and return navigation also discard obsolete parameters/state.
- Historical idempotent write responses are projected at their known profile/owner positions to remove the retired field without changing stored snapshots or re-executing writes. The database column, default, constraint and every migration checksum remain unchanged; new profile saves preserve old values. No migration or data cleanup is needed.

### Verification

- Node **24.11.1**, Corepack pnpm **10.33.2**. **72 tests passed across 9 files**, using the existing isolated local PostgreSQL fixture and test authentication. Four historical-value cases (empty, Base, Robinhood, both) exercise profile saving, membership, unfiltered discovery/content and nested response removal while reading back unchanged database values. Coverage also includes retired REST/MCP arguments, old cursor rejection, navigation cleanup, idempotent replay preservation, current pagination/search/follow/block behavior, Move-in and existing creation/post/media/Agent workflows.
- Wrangler Env generation, React Router type generation, TypeScript, formatting, production import/asset guard and production build passed. All 25 preserved brand assets and four Musecity originals passed the existing guard. Build still reports the pre-existing third-party annotation/chunk-size warnings.
- Normal Chrome reused the existing local fixture tab at `http://127.0.0.1:5191`. Desktop acceptance completed Settings edit/save → public profile → member search → public post. The updated name/bio/focus/help appeared in the expected places, with no ecosystem controls or badges. Mobile **390 × 844** acceptance covered Settings saving, profile, search/directory, Square and Following → Creations filter preservation. Measured document width was **375px within the 390px viewport**, with no horizontal overflow; the temporary viewport override was reset.
- Browser tests opened all three kinds of old ecosystem URLs and observed cleaned destinations retaining content/search filters. Separate local HTTP checks verified the actual 302 destinations, REST rejection and OpenAPI properties. Bob's edited fixture name/bio/focus/help were restored and read back through the local API. No new post, invitation, login-method or wallet action was part of this browser acceptance.
- Restarting the pre-existing fixture server produced buffered HMR and detail-page return-label hydration errors on its old open document. After fresh navigation, the full acceptance flow completed and no additional browser error logs occurred after **00:54 UTC**. A local `/favicon.ico` request also returned the existing unmatched-route error; no unrelated favicon or return-navigation redesign was introduced.
- These are local application/database and local MCP SDK results, not a production release, real Privy/wallet acceptance or external Agent-client verification.

Evidence logs: `/tmp/musecity-ecosystem-tests-final.log`, `/tmp/musecity-ecosystem-types.log`, `/tmp/musecity-ecosystem-build.log`, `/tmp/musecity-ecosystem-http.json`, `/tmp/musecity-ecosystem-browser.log`. The local fixture remains available at port 5191.

### Rollback

The pre-change files and SHA-256 manifest are saved at `/var/folders/dv/35gw0r9d6zl5tn0yg1sdhhzc0000gn/T/musecity-ecosystem-removal-h47zvck8`. Run `python3 /var/folders/dv/35gw0r9d6zl5tn0yg1sdhhzc0000gn/T/musecity-ecosystem-removal-h47zvck8/restore.py` to restore only this task's changed files. The script first verifies that each file still matches this task's final hash and aborts if later edits exist; do not override that safeguard. Restart the local fixture server afterward. No database rollback, reset, Git reset or production action is required.

## Retired predecessor files removed (2026-09-26)

The user explicitly requested deletion of predecessor-related files from the local repository, superseding the earlier preservation requirement for those retired assets. Removed **67 tracked files**: 25 obsolete brand files, their protection manifest, and 41 historical documents/design screenshots. Current Musecity artwork, public assets, source provenance, licenses, application code, database contents and Git history were retained. No source-project directory, remote resource, commit, staging or deployment was changed.

Updated the asset inventory, current specification, README and engineering boundary to reflect this cleanup. The guard now verifies the four Musecity originals and their public copies; production/test identity and deployment-target checks remain unchanged. The database-isolation test uses a generic wrong-project database name with the same rejection expectation. Historical Musecity verification records above describe what was checked at their respective times; this cleanup supersedes their asset-retention state.

Verification: no remaining predecessor-name matches in existing tracked filenames or text; **67 tracked deletions**; Musecity originals/provenance and public assets have no diff; asset/production guard and formatting pass; **3 migration-boundary tests pass**. The earlier ecosystem-removal changes remain intact. No application behavior changed in this cleanup, so the full application suite and browser flows were not repeated.

Recovery backup (74 files, including the seven edited files and the pre-cleanup working diff): `/var/folders/dv/35gw0r9d6zl5tn0yg1sdhhzc0000gn/T/musecity-legacy-cleanup-h67p6jif`. To undo only this cleanup, run `python3 /var/folders/dv/35gw0r9d6zl5tn0yg1sdhhzc0000gn/T/musecity-legacy-cleanup-h67p6jif/restore.py`. It validates original backup checksums and current final hashes before restoring anything, refusing to overwrite later edits. If also undoing the preceding ecosystem-removal task, restore this cleanup first so that its earlier file-hash safeguards can pass. Git history was not rewritten.

## Ecosystem removal production release and clean initial commit (2026-09-26)

The user subsequently authorized deployment and committing all changes. Released at **2026-09-26 01:17:35 UTC / 09:17:35 Asia/Shanghai**, serving 100% of `https://musecity.xyz` traffic. This release supersedes the local-only delivery boundary above.

- Worker version: `f52ee0a7-9120-4d99-b634-8f1b9bcf2e7b`; deployment: `a28a9632-0d3a-411e-b29a-e26188a1fe42`.
- Captured pre-release / rollback version: `abf66242-b3fa-4305-8a1e-9993625a6f1a` (deployment `e0ac62d4-f504-41b2-9a05-84f4b05fc576`). No migration or production application-data mutation was required.
- Reused the build validated by the 72-test local suite, type checks and browser acceptance above. Deployment guard, formatting and Wrangler dry-run passed. Wrangler uploaded 120 of 180 changed static assets before repeated transfer failures; stopped that deploy process and uploaded the remaining 60 files in smaller batches through the official API. Uploaded the same four dry-run Worker modules with the complete 303-file asset manifest, then activated the version through the deployments API. No application retry logic, dependencies, proxy settings or HTTP protocol options changed.
- Read back the 100% deployment and preserved `DATABASE`, `MEDIA`, `IMAGES`, application vars and Privy secret binding. Observability remains enabled; workers.dev and preview URLs remain disabled.
- **31 production HTTP checks passed**: public pages/discovery, profile and nested feed responses without the retired field, directory search, blank/repeated/old REST filters rejected with `INVALID_FILTER`, old cursor rejection, three 302 legacy-link cleanups preserving other filters, strict retired profile-field rejection, and anonymous account/MCP denial. Five served JS/CSS files matched the local build byte-for-byte. An initial Python urllib smoke request received Cloudflare error 1010; the checks used ordinary curl requests without changing site security settings.
- Normal Chrome reused the existing signed-in owner tab. Settings no longer displays Your communities; existing login methods, wallet details and profile values remain visible. Checked profile, member search via an old ecosystem URL, and the existing public post author. The profile fits desktop and **390px** mobile (document width 375px); reset temporary viewport overrides. No new browser error logs were observed. No profile save, wallet action, content publication or successful external Agent tool call was performed during this release acceptance.

### Repository reconciliation and commit scope

During deployment the user removed the previous unpushed initial commit reference while cleaning its obsolete files. After clarification, retained the resulting unborn `master` branch and prepared a new root commit of the current code instead of restoring that history. Compared every surviving source file with the accepted task hashes and original commit objects: no additional application changes existed. Four current Musecity originals were also missing; restored them from the public copies after verifying the provenance SHA-256 values. Removed four reappeared retired files, then reran the guard and formatting successfully.

The new initial snapshot contains **122 files**, excluding the 67 retired files, credentials, local state, build output and backup directories. Staged path/text checks found no retired-brand strings or credential-pattern matches. The task diff against the previous initial snapshot passes whitespace checks; unchanged third-party font notices and generated Worker Env retain their original whitespace. No push was performed by this task. A pre-existing GitHub Desktop push process was observed and reported to the user; it is separate from this release and commit workflow.

### Current production rollback

From `apps/web`:

```sh
corepack pnpm exec wrangler rollback abf66242-b3fa-4305-8a1e-9993625a6f1a --config build/server/wrangler.json
```

This restores the preceding Worker and static assets, including its ecosystem UI/API behavior. Retain the database schema and historical values. Earlier file-recovery scripts intentionally refuse later documentation edits; do not override their hash safeguards or use a blanket Git reset for local recovery.

Sanitized evidence: `/tmp/musecity-ecosystem-production-deploy.log`, `/tmp/musecity-ecosystem-production-api-upload.log`, `/tmp/musecity-ecosystem-production-smoke.json`; ignored deployment bundle and version metadata: `apps/web/.local/ecosystem-release/`. Temporary asset-session metadata was removed after upload. This release evidence is separate from authenticated write/MCP tests against the isolated local database.

## White-and-gold mascot asset replacement (2026-09-26)

The user authorized replacing corresponding project artwork using `/Users/admin/Desktop/musecity` and allowed image generation. Initial acceptance was **local only**, with no staging, commit, push or production release. The user subsequently authorized deployment and a local commit; see the release record below.

- Copied the four supplied reference images byte-for-byte into `assets/musecity-mascot-set/originals/`. Navigation and favicon exports use `logo.png`; Privy login branding uses `cover image.png`. The white-and-gold identity is used throughout; the black-and-gold scene remains a preserved reference rather than a second active visual identity.
- Created one transparent full-body mascot with the built-in `image_gen` tool, using the logo, cover and white-and-gold scene as references. The output is saved at `assets/musecity-mascot-set/generated/mascot.png`; the exact prompt is `assets/musecity-mascot-set/prompt.txt`. The web export serves the homepage, empty states, sidebar and profile decoration.
- Active exports are `apps/web/public/brand/{icon.png,favicon.png,horizontal.webp,mascot.webp}`. Removed the superseded public horizontal/crest/vertical PNG copies and updated every application reference. Corrected intrinsic dimensions, renamed the obsolete sidebar decoration class, removed the profile icon that overlapped the new mascot and brought the mobile profile artwork fully into its cover. Existing layout, interface colors and business behavior remain otherwise unchanged.
- Preserved all four protected migration originals and `assets/musecity-logo-set/source.json` unchanged. The guard checks those original hashes and the separate new manifest's reference files, generated image, exact prompt and current exports; production/test identity and deployment checks remain in place. Current asset mappings are documented in `assets/README.md`.

Verification: Node 24.11.1 / pnpm 10.33.2; asset/production guard, formatting of all touched source files, Worker and React Router type generation, TypeScript, production build and `git diff --check` pass. The final build includes the profile layout correction; existing dependency annotation and bundle-size warnings remain. No new business logic or database changes warranted a full database test run.

All four exported assets return HTTP 200 from the local server with expected MIME types, dimensions and SHA-256 values. The 640 × 800 WebP preserves real transparency, including 222,186 fully transparent pixels and partial-alpha edges. Web brand assets total **248,660 bytes**, down from **6,575,348 bytes (96.2% smaller)**. Desktop input hashes and protected migration-original hashes match their baselines.

Browser acceptance used the existing isolated fixture at port 5191 and the regular local Worker at port 5190 with local PostgreSQL. Checked homepage, empty directory, sidebar, favicon and profile at 1440 × 1000 and 390 × 844; mobile document width was 375px, within the 390px viewport. Opened the actual Privy modal on the local Worker and verified the replacement horizontal image on desktop and phone; the mobile modal occupied exactly 390px without horizontal overflow. No login submission, profile save, publication, upload, invitation, wallet action or external data change was performed. Historical fixture avatars and post images remain user content and were not rewritten.

Evidence: ignored screenshots, `asset-checks.json`, `typecheck.log` and `build.log` under `apps/web/.local/asset-refresh/`. Initial development dependency optimization produced stale-module responses before fresh navigation; the loaded local SDK and modal were subsequently verified. This establishes local asset/layout acceptance, not production release or completed login verification.

## Mascot asset production release and commit (2026-09-26)

The user explicitly requested deployment and committing this change. Released at **2026-09-26 02:54:30 UTC / 10:54:30 Asia/Shanghai**, serving 100% of `https://musecity.xyz` traffic.

- Worker version: `2d3e74c3-3196-41c6-8a6a-92c99eb261e8`; deployment: `fd77f4a1-e263-40fe-b955-6a0e8c5ef318`.
- Verified pre-release rollback version: `f52ee0a7-9120-4d99-b634-8f1b9bcf2e7b` (deployment `a28a9632-0d3a-411e-b29a-e26188a1fe42`). No migration or database mutation was required.
- Reused the final locally accepted build. Deployment guard and Wrangler dry run passed; ordinary Wrangler deployment uploaded 184 changed assets, reused 119 existing assets, and successfully published the Worker. No alternate uploader, dependency/configuration change or retry workaround was required.
- Cloudflare read-back confirms 100% traffic and unchanged Hyperdrive, R2, Images, application variables, Privy secret binding, compatibility settings and observability. workers.dev and preview URLs remain disabled.
- **18 production HTTP checks passed**: all four brand asset hashes match the accepted build; homepage markup references the new mascot/favicon and omits retired PNGs; the served stylesheet matches the build; public pages, profile and API reads succeed; anonymous account and MCP access remains denied.
- Browser acceptance verified live homepage/sidebar, an empty directory, the existing public profile and actual Privy login branding on desktop and at 390 × 844. Page width stayed within the viewport (375px content on the 390px phone; 390px for the login modal). The profile mascot is fully visible without the former overlapping icon. No browser page errors were reported; the existing Coinbase Smart Wallet unsupported-chain informational message remains. No login was submitted and no profile, content, wallet or Agent data was changed. Existing user-uploaded avatars and images are preserved.

Release evidence is saved in the ignored `apps/web/.local/asset-refresh/` directory: `pre-deploy.json`, `production-version.json`, `production-deploy.log`, `production-smoke.json` and production screenshots. Source assets, application references, asset guard, specification and release documentation are included in the local commit; credentials, dependencies, runtime state, build output and acceptance screenshots are excluded. No remote push is part of this authorization.

### Current production rollback

From `apps/web`:

```sh
corepack pnpm exec wrangler rollback f52ee0a7-9120-4d99-b634-8f1b9bcf2e7b --config build/server/wrangler.json
```

This restores the preceding Worker and its static artwork. Keep existing databases, storage, user content and Privy configuration unchanged.

## First performance round — local implementation (2026-09-26)

Implemented the three approved first-round changes: immutable hashed assets, reuse of anonymous SSR data, and per-isolate Privy client/key reuse. Later proposals (lazy login/editor startup, notification endpoints, database/lock changes and Worker placement) remain out of scope. Initial acceptance was local only. The user subsequently authorized deployment and a local commit; see the release-attempt record below.

### Implementation and correctness

- `apps/web/public/_headers` applies one-year immutable caching only to `/assets/*`, which contains Vite's content-hashed output. Unversioned brand/fonts retain revalidation. The local built Worker returns the intended header; public API, denied private API and missing media responses retain `private, no-store`.
- The existing neighborhood cache consumes public loader snapshots once, shares pending reads for the same history key/URL, and keeps its 20-entry limit. Account changes remount the cache. A consumed anonymous snapshot cannot return after logout; authenticated reads still apply account-specific filtering. Invalidation replaces the cache entry so a late response cannot mark invalidated data fresh. Retrying, returning to lists and restoring loaded pagination remain supported.
- The server retains one Privy client for the current app id and secret, rebuilding when either changes. Every token is still verified; current account/Agent permissions, expiry, revocation and database-client lifetimes are unchanged. No token or verified identity is cached.

### Verification

- Node 24.11.1 / pnpm 10.33.2: **76 tests in 10 files pass**, including four new tests using the real Privy SDK and locally signed synthetic JWTs. They cover concurrent and sequential reuse, configuration changes, invalid signature/expiry/issuer/audience and missing configuration. Existing real-local-PostgreSQL tests cover blocking, content revision/visibility, pagination, account isolation and credential pause/scope reduction/rotation/revocation.
- **Seven browser hook checks pass** in the isolated fixture: delayed auth readiness and SSR reuse; concurrent consumers including the initiating consumer unmounting; account changes/logout; invalidation during a pending request; failed-read retry; private reads; and pagination/history restoration. These use actual React hooks and controlled HTTP responses. Separately, the fixture's real UI/API passed Alice sign-in, reload/session restoration, switch to Bob and sign-out/private-page clearing. These identities are simulated, with local PostgreSQL; no external account was modified.
- A real **workerd** test uses the production verifier/SDK with synthetic JWTs and a local outbound JWKS responder. Five concurrent cold requests succeed and cause five key fetches; **five subsequent requests cause zero additional key fetches**, and an expired token remains rejected (401). The SDK intentionally avoids sharing an in-flight fetch between Cloudflare request contexts, so the Node test's single cold fetch must not be claimed for Workers. Completed keys are reused safely.
- Worker/React Router type generation, TypeScript, production build, source formatting, deployment/asset guard and `git diff --check` pass. Existing dependency annotation/chunk-size build warnings remain. No dependency or production configuration changes were needed.
- The actual Privy modal opens on the local production build with Email, Google, X/Twitter and wallet choices. Client authentication startup and callback code were not changed. **Real Privy session recovery and OAuth callback completion were not exercised**; the fixture and synthetic tokens do not establish these results. They remain authenticated release acceptance checks.

### Five-sample local production-build comparison

Measured five fresh isolated browser sessions before and after, each covering cold load, a normal repeat visit through `about:blank`, and SPA navigation from Square to Neighbors. Headless Chrome, local Worker at `127.0.0.1:5190`, local database `127.0.0.1:65433/musecity`, no CPU/network throttling. Waited for Privy's public app-config request and settled resources before reading buffered performance entries. Incomplete paint samples from the initial measurement script were discarded; only complete five-sample runs are reported below.

| Metric | Before | After |
| --- | ---: | ---: |
| Anonymous Square duplicate API reads, every cold/repeat visit | 3 | 0 |
| Neighbors navigation duplicate API reads, every visit | 1 | 0 |
| Repeat visit hashed assets using network, every visit | 26 | 0 |
| Repeat visit hashed-asset transferred bytes, median | 7,800 | 0 |
| Repeat visit total same-origin transferred bytes, median | 15,783 | 6,938 |
| Cold TTFB / LCP, median | 42.5 / 212 ms | 45.7 / 236 ms |
| Repeat TTFB / LCP, median | 32.1 / 136 ms | 36.7 / 196 ms |
| Neighbors SPA navigation to rendered directory, median | 74.5 ms | 67.8 ms |

Before optimization, removed duplicate API calls had median durations of 67.1 ms on cold loads and 49.3 ms on repeat visits. After optimization they are absent, rather than zero-duration requests. SPA navigation still loads its route data through React Router. Browser Resource Timing records cached assets too; zero transferred bytes distinguish them from network revalidation. Total resource-entry medians changed from 40 to 37 (cold) and 39 to 36 (repeat), with occasional extra third-party startup resources.

These samples demonstrate fewer requests and cache reuse, **not an LCP improvement**: the local LCP medians increased. Loopback timings and five samples cannot establish a production latency change, mobile performance or p75 Web Vitals. Production cold/repeat/navigation measurements and authenticated acceptance require a separately authorized release. User content/media authorization and no-store responses remain in place.

### Reproduction and rollback

From `apps/web`, run `corepack pnpm test`, `corepack pnpm typecheck`, `corepack pnpm build`, `corepack pnpm format:check` and `corepack pnpm guard:deployment`. With the local preview configured for the validated local database, run `node e2e/verify-performance.mjs after`; this asserts zero duplicate list APIs and browser-cache reuse for all five repeat visits. `node e2e/verify-privy-worker.mjs` runs the isolated Worker key-cache check without cloud requests. The browser hook harness can be invoked from the isolated Vite fixture with `await (await import('/e2e/neighborhood-cache-checks.tsx')).runNeighborhoodCacheChecks()`.

Raw browser samples are in ignored `apps/web/test-results/performance/{before,after}.json`; local check logs use `/tmp/musecity-performance-*.log`, `/tmp/musecity-cache-regression.log` and `/tmp/musecity-privy-worker.log`. None contain real authentication credentials.

The source baseline is `f105155b16b339a1eb868d9cefc90be18dc457f0`. To roll back this round, restore only `apps/web/src/components/neighborhood.tsx` and `apps/web/src/server/auth.ts` from that revision and remove this round's `apps/web/public/_headers`, after checking for later edits. Rebuild and restart the local preview. Remove this round's test files/specification/record only if reverting its supporting evidence too. No database or cloud rollback is needed. Any future release rollback must also restore the preceding static-asset bundle; hashed URLs retain their old content safely until cache expiry.

## Performance release attempt and local commit (2026-09-26)

The user explicitly authorized deployment and committing the optimization. The initial attempt committed the local changes but was blocked by interrupted Worker-upload connections. No new Worker version was created or activated during that attempt. The subsequent successful release is recorded below. No push or database migration was performed.

- Deployment/asset guard, bundle fingerprints and Wrangler dry run passed. The intended commit contains nine source, test and documentation files. Ignored credentials, deployment bundles, browser samples and logs are excluded; staged content was checked against the configured secret values.
- Wrangler uploaded **14 changed static assets** and reused **289**. The Worker upload then failed with `fetch failed` / `UND_ERR_SOCKET`, including one normal CLI retry. Official API upload attempts also failed: a timeout, followed by empty replies after the complete multipart body was transmitted. HTTP/1.1 and removal of the Expect handshake did not resolve it. Both the version-upload and direct script-upload endpoints were checked. The cause of the interrupted responses remains unresolved; no TLS verification, system proxy, dependency or production-permission settings were changed.
- To test whether payload size was responsible, generated a temporary esbuild-minified deployment bundle: four modules decreased from **4,009,271 to 1,909,926 bytes**. Twenty local HTTP checks and the minified workerd verifier check passed; the local MCP denial is 403 because that preview host differs from its configured origin. Uploading the smaller bundle failed in the same way. These diagnostic artifacts were not deployed, and the original accepted build remains unchanged.
- Final Cloudflare read-back confirms the newest version is still **`2d3e74c3-3196-41c6-8a6a-92c99eb261e8`**, serving **100%** traffic in deployment **`fd77f4a1-e263-40fe-b955-6a0e8c5ef318`**. The public homepage/feed remain available, anonymous `/api/v1/me` remains denied, and hashed assets still have the preceding revalidation policy. Uploaded assets alone do not make this optimization live; no rollback is required while the old version remains active.
- Completed **five pre-release production samples** for each scenario. Median cold TTFB/LCP: **1,410.7 / 2,192 ms**; repeat TTFB/LCP: **233.3 / 872 ms**; Neighbors SPA navigation: **278.3 ms**. Every Square visit still made three duplicate API reads, every directory navigation one, and every repeat visit revalidated 26 hashed assets. These are desktop samples on this machine/network, not field p75 or mobile results. Post-release comparison and authenticated release acceptance remain unperformed because publication did not succeed.

Evidence is saved in ignored `apps/web/.local/performance-release/`: deployment logs, baseline samples, bundle hashes, local compressed-bundle diagnostics, final version/deployment snapshots and `final-production-state.json`. Temporary upload-token metadata is removed after every attempt. The existing production tab and session are retained; the temporary local Worker is stopped.

At that point, the remaining action was to restore a working Worker-upload path, deploy the accepted build and complete production acceptance. Repeated identical uploads were stopped because they no longer produced useful evidence. The successful retry below resolves this release blocker without changing the accepted build.

## Performance production release and acceptance (2026-09-26)

At the user's request to retry publication and acceptance, released source commit **`cb6d455`** at **2026-09-26 04:37:41 UTC / 12:37:41 Asia/Shanghai** to **100%** of `https://musecity.xyz` traffic.

- Worker version: **`050a1298-e42f-4e6a-961a-fc051a28f1be`**; deployment: **`e5401e28-ab84-439f-a8b7-0c03bf464b43`**. Verified through Cloudflare deployment read-back and Wrangler version inspection. Runtime bindings, including the Privy secret binding, match the previous production version.
- All **332 build fingerprints** matched the accepted build and the deployment guard passed. One ordinary Wrangler deployment succeeded (45.55 seconds upload, 2.75 seconds trigger deployment, 76 ms reported Worker startup). No source, dependency, TLS, network or deployment-configuration workaround was needed; the earlier interrupted-upload cause remains unconfirmed.
- **20 production HTTP checks passed.** Five hashed JS/CSS responses match local build hashes and return `public, max-age=31536000, immutable`. Unversioned brand/font responses retain revalidation. Pages, APIs, media denials and MCP retain `private, no-store`; missing/invalid authentication returns 401 and a missing media object returns 404.
- **Five production samples per scenario passed** the browser assertions: cold Square, normal repeat Square, and Square-to-Neighbors SPA navigation. Every anonymous Square load makes **zero** duplicate list API calls (previously three), and every directory navigation makes zero (previously one). All **26 hashed resources** on each repeat visit have zero network transfer, compared with 26 network revalidations before the release.

| Desktop production median, five samples | Before | After |
| --- | ---: | ---: |
| Cold TTFB | 1,410.7 ms | 1,225.5 ms |
| Cold LCP | 2,192 ms | 2,344 ms |
| Repeat TTFB | 233.3 ms | 621.1 ms |
| Repeat LCP | 872 ms | 880 ms |
| Neighbors SPA rendered directory | 278.3 ms | 387.9 ms |
| Repeat same-origin transferred bytes, including document | 21,815 | 13,727 |

These samples establish the expected request/cache behavior, **not an LCP improvement**. Timing results are mixed; repeat TTFB and directory navigation were slower. Before/after runs finished at 03:46:39 / 04:40:03 UTC on this machine/network, with no CPU throttling or controlled network conditions. They are not mobile measurements, field p75, INP or CLS acceptance.

Authenticated acceptance reused the existing regular Chrome session: homepage refresh restored the signed-in account; `/me`, notifications, onboarding and authenticated lists returned 200; profile settings loaded and restored after a full refresh; Neighbors, the existing public profile and browser back-to-list navigation rendered correctly. No browser error logs were reported in the inspected session. A browser automation timeout during settings refresh was resolved by reacquiring the same tab; the restored settings were then observed. No profile save, publication, upload, block, credential revocation or wallet transaction was performed.

The release includes the previously verified per-isolate Privy client reuse. Production acceptance confirms real authenticated reads, but does not instrument or claim a production JWKS fetch count. Warm-key reuse remains supported by the local real-workerd/SDK check above. Fresh OAuth callbacks, switching real accounts, content mutations and credential revocation were not exercised in production; identity switching, cache invalidation, pagination/history and authorization regressions retain the local test evidence recorded above.

Evidence is saved in ignored `apps/web/.local/performance-release/`: `redeploy.log`, `released-version.json`, `released-deployments.json`, `smoke.json`, `after.json`, `comparison.json` and `authenticated-acceptance.json`. No remote push or database migration was performed. Rollback from `apps/web` is `corepack pnpm exec wrangler rollback 2d3e74c3-3196-41c6-8a6a-92c99eb261e8 --config build/server/wrangler.json`; it restores the previous Worker release, not database or Privy-dashboard state.

## Global footer links release (2026-09-26)

Added `GitHub` (`https://github.com/MuseCity/musecity`) and `X` (`https://x.com/musecityxyz`) to the shared application footer alongside Skill, API and MCP. Both use a new tab with `noopener noreferrer` and retain the existing responsive styling.

The user explicitly authorized deployment and a local commit. Released at **2026-09-26 06:20:32 UTC / 14:20:32 Asia/Shanghai**, serving **100%** of `https://musecity.xyz` traffic.

- Worker version: `d52d42f2-6715-49b2-9dcd-ea955848cde5`; deployment: `670ff21b-3594-4161-b815-d8a4cf29adee`. Cloudflare read-back confirms the active version and unchanged runtime bindings.
- Typecheck, changed-file formatting and desktop/390px local checks passed before release. Production build, deployment guard, Wrangler dry run and `git diff --check` passed. Ordinary Wrangler deployment uploaded two changed static assets and reused 301 existing assets.
- Production `/`, `/neighbors`, `/settings` and `/agents/mcp` return 200 with both exact links and the expected new-tab attributes in their footer. Page responses retain `private, no-store`; the new root JS matches the local build hash and retains one-year immutable caching. Anonymous `/api/v1/me` returns 401.
- Production browser checks confirm both links at 1440 × 1000 and 390 × 844 without horizontal overflow (document widths 1425px and 375px). This is anonymous footer/layout acceptance; no login, account mutation or external social action was performed.
- Evidence is saved in ignored `apps/web/.local/footer-release/`: build/guard/dry-run/deploy logs, pre-release and final deployment snapshots, version details, `smoke.json`, and desktop/mobile screenshots. No remote push, migration or configuration change was required.

Rollback from `apps/web`: `corepack pnpm exec wrangler rollback 050a1298-e42f-4e6a-961a-fc051a28f1be --config build/server/wrangler.json`.

## Dual-chain wallet and simple weighted governance (2026-09-26)

Status at initial delivery: implemented and accepted locally. The user explicitly requested implementation of the agreed plan, superseding its earlier planning-only footer. Production migration/deployment, commits, pushes and real asset transfers were not part of that initial authorization. The subsequent deployment/push request and production findings are recorded below; real asset transfers remain unperformed.

### Delivered behavior

- `/wallet` defaults to Robinhood Chain 4663 and can switch to Base 8453. It shows ETH and Robinhood MUSEGOD, loads other ERC-20s by contract, provides receiving addresses, and reviews ETH/ERC-20 transfers before the Privy confirmation UI. Fresh balance/decimals, exact base-unit parsing, selected-chain checks, token simulation and Gas estimates precede signing. Rejection, insufficient funds, uncertain submission and pending/confirmed/reverted statuses are explicit. Hashes and their actual chain persist for the browser session and are isolated by account; status retries never resend.
- `/governance` and proposal details support publication by formal members, announcement, free login-only voting/recasting, weighted totals and distinct participation, cancellation with a retained record, reports/moderation, and one permanent operator execution record for a passed proposal. The 24-hour announcement, 72-hour vote, 5-account quorum and strict For > Against condition are stored with each proposal. Content and rules cannot be edited through the API.
- Server Privy lookup admits only this app's primary, non-imported embedded EVM wallet. Current Robinhood MUSEGOD balance at the agreed contract determines formal membership and weight 1 or 10. RPC/ownership errors preserve the original vote. Recasts recheck and replace; token movements alone do not recalculate prior votes. Transfer of the same tokens between accounts may qualify multiple accounts, as explicitly accepted in this version.
- Additive `0006_wallet_governance.sql` creates private wallet mappings, proposals and unique account/proposal ballots and extends the report kind constraint. Applied only to validated local `musecity`, `musecity_test` and `musecity_e2e` at `127.0.0.1:65433`; no Supabase mutation. Existing account/global social-write/proposal locking, idempotency, quotas, status restrictions and audit records are reused. The deadline is rechecked after the holdings read using database wall time in the ballot write.
- SPEC, PLAN, project default-chain guidance, generated OpenAPI and Agent integration boundaries are updated. No Snapshot integration, fixed voting block, archive requirement, new Agent permission, new package or new Cloudflare binding is introduced. Existing ignored environment inputs, Privy dashboard configuration and cloud resources are untouched.

### Local verification

- Node 24.11.1 / pnpm 10.33.2. **97 tests passed in 12 files**, including 14 governance scenarios against real isolated PostgreSQL and 7 wallet/RPC/amount scenarios with injected services or mocked transport. Covers no wallet/ordinary 1; exact threshold/holder 10; one unit below; wrong chain/token target and imported/external/cross-app/wrong-user wallet rejection; balance upgrade/downgrade; unchanged saved weights; ownership/RPC failures; duplicate/concurrent votes; the deadline passing during lookup; quorum/abstention/tie; cancellation; moderation/blocks/restricted accounts; operator recording; Agent denial with all existing scopes; transferred-token reuse; private ballot evidence; strict API contracts.
- `typecheck` (Wrangler Env, React Router types, TypeScript), `format:check`, asset/production identity `guard`, `git diff --check`, and client/Worker production build passed. Existing Privy annotation and large-chunk warnings remain. Initial integration checks caught an incorrect test credential accessor and a duplicate OpenAPI helper name; both were corrected before final passing checks.
- Chrome browser fixture at `http://127.0.0.1:5191`: public empty state/sign-in, holder-only proposal creation and immutable-rule consent, announcement state, detail/results, a 10-weight Alice vote, a 1-weight Bob abstention, Bob's recast to Against without increasing the participant count, and account state isolation. The test proposal's times were advanced only in the validated local fixture database to exercise voting immediately.
- At **390 × 844**, governance voting, wallet forms, both networks, exact receiving address, invalid recipient and insufficient balance errors stayed within the viewport. A visibly labeled **local wallet simulation** exercised cancellation, a mock confirmed Base transfer and its hash/network history, reload persistence and record isolation when switching accounts. Desktop **1795px** wallet layout also stayed within the viewport. Browser viewport override was reset afterward. Fixture source is confined to `e2e/`; the production import guard passed.
- Actual live Privy login/session ownership lookup, embedded wallet creation/recovery, wallet network switching and real user-confirmed signing/receipts on either chain are **not verified by those fixtures**. No real transaction was signed or broadcast. No production account, proposal or vote was created. Official RPC reads made during the preceding research establish token/network identity only, not end-to-end wallet behavior.

Logs: `/tmp/musecity-wallet-tests-final.log`, `/tmp/musecity-wallet-typecheck-final.log`, `/tmp/musecity-wallet-format-final.log`, `/tmp/musecity-wallet-guard-final.log`, `/tmp/musecity-wallet-build-final.log`. Local preview: run `corepack pnpm e2e:serve` from `apps/web` if it is stopped; the banner explicitly identifies simulated identity and wallet.

### Release and rollback boundary

Before a separately authorized release, apply migration 0006 to the verified Musecity target, release the tested Worker, and verify real Privy wallet ownership/creation, both network switches, and user-approved transfer results independently from the local fixtures. The current official public RPCs have bounded request timeouts but no production-capacity guarantee; confirm their suitability for expected voting volume before launch. Voting cannot automatically execute a blockchain transaction, code merge or deployment.

Source rollback point: **`5ab93600ac15b26115e5abd72b592ea2407ca924`**. The task patch is `/tmp/musecity-wallet-governance-20260926.patch`. To roll back this change locally, first preserve later edits, then from the repository root run `git apply --reverse --check --exclude=apps/web/migrations/0006_wallet_governance.sql /tmp/musecity-wallet-governance-20260926.patch`, followed by the same command without `--check` if it is clean. This restores only this task's code/docs and removes its added code files while keeping the additive migration file, ledger and saved local data. Restart the local server. No database reset/drop, remote operation or change to the last deployed Worker is required.

## Wallet/governance production release and push (2026-09-26)

The user's subsequent instruction to deploy and push authorizes the production migration, Worker release, local commit and fast-forward push to `https://github.com/MuseCity/musecity.git`, branch `master`. The remote was four commits behind the local footer release, with no divergent commits; those existing local commits travel with this feature. Real asset transfers were not requested.

The active release is Worker **`965f975d-969a-4646-8b7e-5f317fa2846c`**, deployment **`50be8b13-86b6-4df8-b657-4bb3fbf8f152`**, activated at **2026-09-26 08:32:14 UTC / 16:32:14 Asia/Shanghai**, serving **100%** of `musecity.xyz` traffic. It includes the wallet, governance, request-scoped RPC batch and real-wallet chain-switch fix. Runtime bindings remain unchanged from the pre-feature release.

**The later optional `ROBINHOOD_RPC_URL` configuration patch is committed with this work but is not deployed.** Two ordinary uploads and one separate `wrangler versions upload` failed with interrupted connections; version/deployment read-back still shows the above release. Repeated uploads were stopped. The source therefore intentionally records an unpublished configuration follow-up; do not report the complete current checkout as the live Worker.

- Verified Supabase project `musecity` (`vlvhfnhmcpeuyoyiapuk`) was healthy and migrations 0001–0005 matched local checksums. Applied `musecity_wallet_governance` / `0006_wallet_governance.sql` at **2026-09-26 08:19:06 UTC**, checksum **`29cc386a9aaf819b90065da0b3bd5cf8b2b6c959d0fc8834b70120a75c3f9990`**. Read-back confirms private schema/table denial for Supabase `anon` and `authenticated`; the dedicated runtime role can SELECT/INSERT/UPDATE proposals and ballots but cannot DELETE them. Security advisors returned no findings. The database retained its 2 accounts and 3 posts; no production proposal, vote or fixture was created.
- The feature was published, and real-browser acceptance found two issues absent from the isolated fixtures. Privy's embedded `switchChain` schedules a React state update before resolving, so the old wallet object supplied a provider on the preceding network. The fix waits for the current account's updated wallet object and validates its provider before using it. A real existing Privy session now switches Robinhood → Base → Robinhood and displays balances and the correct receiving network.
- **Server-side membership is not accepted in production.** The official public Robinhood endpoint returned JSON-RPC 429 during `eth_call`, then HTTP 429 when the two reads were combined into a single request. Browser RPC reads succeeded; neither local RPC success nor the client balance is used as server qualification evidence. The page retains a retryable error, proposal creation stays unavailable for this session, and failed vote checks never downgrade or replace ballots. There were 0 qualification mappings, proposals and votes after these checks.
- Added server-only HTTPS `ROBINHOOD_RPC_URL` configuration, generated Worker types and `.dev.vars.example` guidance. Read it from the ignored root `.env` via `scripts/configure-local.ts` and deploy the actual value as a Cloudflare Worker Secret, never a public Vite variable or tracked configuration. The user was asked to supply a dedicated mainnet endpoint; no value was present during this acceptance. Network identity/current balance use a single request-scoped JSON-RPC batch with strict response ids, an 8-second timeout and no silent provider fallback on errors. Sanitized diagnostics omit addresses, balances and RPC credentials. [Robinhood's official provider guidance](https://docs.robinhood.com/chain/connecting/) explicitly describes the public endpoint as rate-limited and unsuitable for production guarantees.
- **100 tests passed in 12 files** after the release fixes, including batch response identity/order/error handling, configured endpoint failure without fallback, and asynchronous chain switching/account interruption. Typecheck, formatting, deployment/asset/fixture guards, secret scans and the production build passed. **29 production HTTP checks passed** for pages, database reads, missing proposals, authentication/Agent denial, strict vote input, OpenAPI/Skill boundaries and served asset hashes/cache policy.
- The regular Chrome session restored a real login and existing embedded wallet. Desktop and **390 × 844** Wallet/Governance screens rendered without horizontal overflow (375px document width at 390px); temporary viewport changes were reset. No new wallet was created, no real transaction was signed/broadcast, and no proposal/vote was submitted. Threshold/weighted-vote mutation acceptance remains local-test evidence. Client-side balances and real network switches are live evidence, distinct from the blocked server holdings check.

Release evidence is in ignored `apps/web/.local/wallet-release/`: deployment and verification logs, version/deployment read-back, database permissions/advisor results, `browser-acceptance.json`, `smoke.json`, and final build hashes. One intermediate batch-only upload and all three optional-RPC configuration upload attempts failed with interrupted `fetch failed` responses; already activated releases continued serving. The final build hashes describe the local unpublished configuration patch; production client hashes matched the same assets, while the active server version is explicitly identified above. No TLS settings, credentials or dependency versions were changed to work around those connections.

Production rollback from `apps/web`: `corepack pnpm exec wrangler rollback d52d42f2-6715-49b2-9dcd-ea955848cde5 --config build/server/wrangler.json`. This restores the pre-feature Worker and keeps the additive database migration/data and existing secrets. The earlier local patch above predates the release fixes; use this release commit's diff for source rollback and retain migration 0006. Completing membership acceptance requires a working dedicated Robinhood mainnet RPC, secret deployment and a fresh authenticated membership check; a real transfer still requires the user's own confirmation.
