# Validation record — 1.2.1

2026-11-25, Windows, installed Microsoft Edge. Exact browser version and geometry
are recorded in `fixed-width-evidence.json` and `benchmark-results-1.2.1.json`.

- Existing dependencies are retained; only package version metadata changed from 1.2.0.
- TypeScript check and production bundle: passed (`npm run build`).
- Real-browser regression suite: **31 passed, 0 failed** (`npm test`).
- Upstream table-ID compatibility: **5 samples passed**, including Chinese,
  emoji, empty content and special paths (`node scripts/verify-table-id.js`).
- Drag benchmark: 50, 300 and 1,000 body rows, both upstream and fork;
  deterministic complexity assertions passed. Raw data is in `benchmark-results-1.2.1.json`.
- Native-mouse 600px fixture: the first column gains 80px, its neighbor loses 80px,
  table width stays fixed and the reading pane does not overflow. Before/after
  screenshots and raw geometry are included.
- Package check: version declarations agree; original MIT license unchanged;
  generated bundle includes license; ZIP allowlist and every packaged byte match.

The suite uses real browser layout and events with a small Obsidian API stub.
Native Playwright mouse input is tested as well as synthetic pointer sequences.
It does not exercise a live Obsidian process. No plugin was installed into the
user's vault, and no personal vault data is included in the repository or package.

Unverified: real Obsidian/theme/other-plugin compatibility, real touch/stylus
hardware, and actual Obsidian pop-out windows. The iframe test verifies the
document/window logic but is not a full pop-out acceptance test.

The upstream workflow file is unchanged; a proposed Node 22 build/test workflow
is supplied as `docs/ci-example.yml`. The inherited automatic-release workflow
remains disabled on this fork. Validation reported above ran locally, and
the release is published and verified explicitly. No GitHub Actions test pass
is claimed.
