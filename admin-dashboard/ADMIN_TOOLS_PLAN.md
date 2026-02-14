# Admin Dashboard – Recommended Tools Plan

Suggested tools to add to the Injector Admin dashboard, ordered by impact and feasibility. Each section describes the feature, how it works, and what to build (UI + API).

---

## 1. Auto-Send Captured Token to Domain

**What it does:** From a credential or session token row, one-click “Send to domain” so the token is re-injected for that domain (e.g. set as cookie or `Authorization` header for that origin).

**Use case:** Reuse a captured session on the same site (e.g. Netflix cookie sent back to netflix.com) or test if a token is still valid.

**Implementation outline:**
- **UI:** Per credential/token row: button “Send to domain” (and optionally “Copy”).
- **Backend:** New endpoint `POST /v1/admin/send-token` that:
  - Accepts: `domain`, `token_type` (cookie | authorization), `name`, `value`, optional `path`/`expiry`.
  - Does **not** set cookies directly (server can’t set browser cookies). Instead it returns a **payload** (e.g. JSON) that a **browser extension or bookmarklet** can consume to set the cookie/header in the user’s browser, **or** it calls an internal service that the extension polls.
- **Preferred approach:** “Send to domain” generates a **short-lived one-time link** or **code** that the user opens in a tab where the extension is installed; the extension reads the code, fetches the token from the API, and injects it into the current origin (or the stored domain). Alternatively, the extension could expose a messaging API that the dashboard calls via `postMessage` or a small helper page.

**Recommendation:** Implement “Copy as cookie / header” first (see below); then add “Send to domain” via extension handoff (API returns token + domain, extension injects when user visits that domain or clicks “Inject here”).

---

## 2. Copy Token / Copy as Cookie / Copy as cURL

**What it does:** One-click copy of the captured value in a format that’s ready to paste elsewhere (raw value, `Cookie:` header line, or full `curl` command).

**Use case:** Manual testing, scripts, or pasting into Postman/DevTools.

**Implementation:**
- **UI:** On each credential and (when you expose them) session-token row: buttons “Copy value”, “Copy as Cookie header”, “Copy as cURL” (for captures that have URL + method + headers).
- **Logic:** All in frontend; no new backend. Format examples:
  - Cookie: `name=value` or `Cookie: name=value`.
  - cURL: use capture’s `url`, `method`, and reconstructed headers (e.g. from `session_tokens` or `captured_data`).

---

## 3. Session Tokens Tab / Section

**What it does:** Show `session_tokens` (cookies and auth headers) linked to each capture, not only “extracted credentials”.

**Use case:** See and re-use full session context (cookies + Authorization) for a domain.

**Implementation:**
- **Backend:** `GET /v1/admin/captures/{id}/tokens` (or include `session_tokens` in capture list/detail) from `session_tokens` where `audit_capture_id = id`.
- **UI:** In “Audit Captures”, add “View tokens” (or expand row) to list cookies and headers for that capture; same “Copy” / “Send to domain” actions as above.

---

## 4. Token Validity Check (Probe)

**What it does:** For a chosen credential or session token, call a configurable “probe” URL on the same domain (e.g. `https://<domain>/api/me` or `/account`) with that token and show whether the response is 200/401/403.

**Use case:** Quickly see if a captured token is still valid without opening the site.

**Implementation:**
- **Backend:** `POST /v1/admin/probe` with body `{ "domain", "token_type", "name", "value", "probe_path" }`. Server does HTTP request to `https://<domain><probe_path>` with Cookie or Authorization, returns status code and optionally safe summary (e.g. “200 OK” or “401 Unauthorized”).
- **UI:** “Check validity” button; optional dropdown for path (`/api/me`, `/me`, `/user`, etc.). Show result (e.g. green/red + status code).

**Security:** Run server-side only; don’t expose raw token in response. Optionally restrict probe to a list of allowed paths/domains in env.

---

## 5. Export (CSV / JSON)

**What it does:** Export current list (or filtered view) of captures or credentials as CSV or JSON.

**Use case:** Backups, reporting, or feeding other tools.

**Implementation:**
- **Option A (recommended):** Client-side only: use current `captures` / `credentials` in state, convert to CSV/JSON, trigger download (no new API).
- **Option B:** `GET /v1/admin/captures/export?format=csv|json&domain=...&page_size=1000` for large exports server-side.

---

## 6. Webhook / Auto-Forward on New Capture

**What it does:** When a new audit capture is stored, the server POSTs a summary (or full payload) to a configurable URL (e.g. Slack, Discord, or your own API).

**Use case:** Alerts, logging to another system, or triggering automation.

**Implementation:**
- **Backend:** After successful insert in `analytics.receive_audit`, enqueue or call a “webhook sender” with config from env (e.g. `ADMIN_WEBHOOK_URL`, optional `ADMIN_WEBHOOK_HEADERS`). Payload: `{ "event": "new_capture", "id", "domain", "capture_type", "timestamp", "has_credentials" }` (no raw credentials in webhook by default).
- **UI (optional):** “Settings” or “Integrations” where admin can set webhook URL (stored in env or DB) and test (send a dummy POST).

---

## 7. Bulk Actions

**What it does:** Select multiple rows (captures or credentials) and delete, or export selection only.

**Use case:** Cleanup by domain or date range, or export a subset.

**Implementation:**
- **UI:** Checkboxes per row, “Select all on page”, toolbar: “Delete selected”, “Export selected”.
- **Backend:** `POST /v1/admin/captures/bulk-delete` with body `{ "ids": ["id1", "id2"] }`; delete in a transaction. Export can stay client-side from current list.

---

## 8. Domain Allowlist / Blocklist (Auto-Ignore or Auto-Delete)

**What it does:** Configure domains that should never be stored (blocklist) or only these should be stored (allowlist). Optionally auto-delete existing captures for blocked domains.

**Use case:** Reduce noise (e.g. ignore third-party login pages) or restrict capture to a few target domains.

**Implementation:**
- **Backend:** In `analytics.receive_audit`, before insert, check `domain` against env or DB-stored list (e.g. `AUDIT_ALLOWLIST_DOMAINS`, `AUDIT_BLOCKLIST_DOMAINS`). If blocklist match or allowlist mismatch, return 200 but skip insert.
- **UI:** “Settings” → “Capture rules”: text area or tag input for allowlist/blocklist domains; optional “Delete all captures for these domains” for blocklist.

---

## 9. Dashboard Stats (Charts / Summaries)

**What it does:** Simple stats: captures per day, top domains, count by `capture_type`, credentials per domain.

**Use case:** Quick overview without scanning tables.

**Implementation:**
- **Backend:** `GET /v1/admin/stats?from=...&to=...` using Supabase aggregation (count by date, by domain, by capture_type). Or reuse existing list endpoints with small page_size and aggregate in backend.
- **UI:** Sidebar or top strip: total captures (last 24h / 7d), top 5 domains, breakdown by type (e.g. FORM_SUBMIT vs HTTP_REQUEST). Simple bars or tables; optional chart library later.

---

## 10. “Inject in browser” via Extension Handoff

**What it does:** User clicks “Inject in browser” for a capture; dashboard shows a short instruction (“Open Netflix and click the extension icon”) and optionally a one-time code. The extension (Netflix Injector or a small companion) asks the backend for “pending inject for code X”, gets cookies/tokens for the capture, and injects them into the current tab.

**Use case:** Directly apply a captured session in the browser without manual copy-paste.

**Implementation:**
- **Backend:** `POST /v1/admin/inject-requests` creates a pending inject (storage or DB): `{ "code": "abc123", "capture_id", "expires_at" }`. `GET /v1/admin/inject-requests/{code}` (or polling by code) returns token/cookie payload for that capture; delete or mark used after first read.
- **Extension:** New action or popup: “Enter inject code” → call API with code → receive cookies/tokens → run same logic as “Inject Cookie” (set cookies for domain). Dashboard shows the code and “Valid for 5 minutes”.

---

## Priority Order (Suggested)

| Priority | Tool                         | Reason |
|----------|-----------------------------|--------|
| 1        | Copy value / Copy as Cookie | No backend, high daily use |
| 2        | Session Tokens tab          | Needed to see and re-use full session |
| 3        | Export CSV/JSON             | Client-side only, quick win |
| 4        | Token validity probe        | High value for checking tokens |
| 5        | Auto-send token to domain   | Depends on extension handoff; design with #10 |
| 6        | Bulk delete / export        | Quality of life for large lists |
| 7        | Webhook on new capture      | Good for alerts and automation |
| 8        | Stats / dashboard           | Overview and reporting |
| 9        | Allowlist/blocklist         | Cleaner data at ingest |
| 10       | Inject in browser (code)    | Best UX for “send token to domain” |

---

## Summary

- **Auto-send captured token to domain:** Implement via **extension handoff**: dashboard creates a one-time “inject” code, extension fetches token by code and injects into the current tab (or stored domain). Optionally combine with “Copy as Cookie” for manual use.
- **Quick wins without new backend:** Copy value, Copy as Cookie, Copy as cURL, Export CSV/JSON (client-side), and basic bulk export/delete from current list.
- **Backend additions:** Session tokens API, probe endpoint, webhook on new capture, bulk-delete, stats, inject-request (code) API, and optional allowlist/blocklist in analytics.

Use this plan to pick the first 2–3 tools (e.g. Copy + Session Tokens + Export), then add probe and “inject in browser” for the full “auto send token to domain” flow.
