# AUD-14 deployed frontend cache policy

**Goal:** Prevent a running browser from reusing stale dashboard HTML or JavaScript after `/stt` is updated and restarted.

**Evidence:** The public `/stt` HTML and JavaScript responses had no `Cache-Control` header. Their ETags only help after a browser revalidates; heuristic freshness can let a tab continue using old scripts after a release. A clean headless browser renders the current chart, so this is a release-cache safeguard, not proof of the user's specific blank-chart cause.

## Tasks

1. [x] Add failing HTTP contract tests requiring `no-store` on dashboard HTML and `no-cache` on dashboard static assets.
2. [x] Set the cache policy in the application response middleware without changing API caching or frontend behavior.
3. [x] Run focused tests, relevant security/frontend regressions, and `git diff --check`.
4. [ ] Recheck the actual response headers after deployment and record the result; browser hard-reload confirmation remains user-visible acceptance.

**Safety:** No browser UI automation, MT5 operation, broker write, deployment, or backtest.
