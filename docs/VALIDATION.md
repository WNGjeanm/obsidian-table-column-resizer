# Validation record — 1.2.0

2026-10-27, Windows, installed Microsoft Edge (Chromium 156.0.4314.42).

- Clean dependency installation from `package-lock.json`: passed (`npm ci`).
- TypeScript check and production bundle: passed (`npm run build`).
- Real-browser regression suite: **18 passed, 0 failed** (`npm test`).
- Upstream table-ID compatibility: **5 samples passed**, including Chinese,
  emoji, empty content and special paths (`node scripts/verify-table-id.js`).
- Drag benchmark: 50, 300 and 1,000 body rows, both upstream and fork;
  deterministic complexity assertions passed. Raw data is in `benchmark-results.json`.
- Chromium fixture screenshot visually inspected: table alignment and text visible.
- Package check: version declarations agree; original MIT license unchanged;
  generated bundle includes license; ZIP allowlist and every packaged byte match.

The suite uses real browser layout and events with a small Obsidian API stub.
Native Playwright mouse input is tested as well as synthetic pointer sequences.
It does not exercise a live Obsidian process. No plugin was installed into the
user's vault, and no personal vault data is included in the repository or package.

Unverified: real Obsidian/theme/other-plugin compatibility, real touch/stylus
hardware, and actual Obsidian pop-out windows. The iframe test verifies the
document/window logic but is not a full pop-out acceptance test.

The current GitHub OAuth credential does not have the `workflow` scope. The
upstream workflow file is therefore unchanged; a proposed Node 22 build/test
workflow is supplied as `docs/ci-example.yml`. The inherited automatic-release
workflow is disabled on this fork. Validation reported above ran locally, and
the release is published and verified explicitly. No GitHub Actions test pass
is claimed.
