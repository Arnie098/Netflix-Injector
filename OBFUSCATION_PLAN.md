# Obfuscation Plan: Netflix Injector (Hard-to-Reverse Build)

Goal: Make the extension and server as difficult as possible to reverse-engineer or “decrypt,” while keeping the extension installable and functional. True “undecryptable” is impossible (the browser must execute code), so the aim is **maximum practical protection**.

---

## 1. Scope

| Target | Location | Notes |
|--------|----------|--------|
| Extension – UI & flow | `popup.js`, `config.js`, `content.js` | User-facing logic, license flow |
| Extension – background | `background.js` | Service worker; can use slightly more aggressive options |
| Extension – analytics/core | `core/analytics/**/*.js` | All tracker, monitor, utils; currently **not** in build |
| Static assets | `popup.html`, `manifest.json` | Minify/strip comments; no secrets in manifest |
| Server | `server/**/*.py` | License/cookie API; protect logic and secrets |

---

## 2. JavaScript (Chrome Extension) – Layered Obfuscation

### 2.1 Tool: javascript-obfuscator (CSP-safe)

- Use **target: `browser-no-eval`** so no `eval()` / `new Function()` is used (required for Manifest V3 and strict CSP).
- Apply to **every** JS file that ships in the extension (including `core/analytics/**/*.js`).

### 2.2 Recommended options (by context)

**A) Content scripts & any script running in page/CSP context**  
(`content.js`, `core/analytics/utils/diagnostics.js`, `core/analytics/utils/dom-parser.js`, `core/analytics/tracker.js`)

- `target: 'browser-no-eval'`
- `compact: true`
- `controlFlowFlattening: true`, `controlFlowFlatteningThreshold: 0.5`
- `deadCodeInjection: true`, `deadCodeInjectionThreshold: 0.2`
- `stringArray: true`, `stringArrayEncoding: ['none']` or `['base64']` only if decoder is non-eval (verify with browser-no-eval)
- `stringArrayThreshold: 0.8`
- `renameGlobals: false` (avoid breaking extension messaging)
- `renameProperties: false` (safe for Chrome APIs)
- `selfDefending: false` (often uses patterns that can break in extensions)
- `disableConsoleOutput: true` (strip console.log in production)
- `splitStrings: true`, `splitStringsChunkLength: 5`
- No `identifierNamesGenerator: 'mangled-shuffled'` if it breaks chrome.runtime / message passing; test first.

**B) Background service worker**  
(`background.js`)

- Same as (A) but can try slightly higher `controlFlowFlatteningThreshold` and `deadCodeInjectionThreshold` if tests pass.
- Keep `target: 'browser-no-eval'` so the same build is CSP-safe.

**C) Popup / config**  
(`popup.js`, `config.js`)

- Same as (A). Popup runs in extension context but avoid eval so one config fits all.

### 2.3 Build pipeline changes

1. **Include `core/` in the build**  
   Copy entire `core/` into `dist/` and obfuscate every `.js` under `core/` (e.g. `monitor.js`, `tracker.js`, `settings.js`, all under `utils/`). Paths in `manifest.json` and `importScripts()` must still point to the same relative paths (e.g. `core/analytics/monitor.js`).

2. **Single obfuscator config**  
   Use one CSP-safe config (e.g. options in 2.2 A) for all extension JS so content scripts and service worker never use eval.

3. **Order of injection**  
   If `background.js` uses `importScripts('core/analytics/monitor.js')`, obfuscate `monitor.js` (and its dependencies) first, then `background.js`, so the service worker loads already-obfuscated core.

4. **No source maps**  
   Do not generate or ship source maps for any obfuscated file.

5. **Strip comments**  
   Ensure obfuscator/minifier removes all comments and optional whitespace.

### 2.4 What to avoid (to stay “not decryptable” but working)

- Do **not** use `stringArrayEncoding: 'rc4'` with default decoder if it introduces eval/Function in your target.
- Do **not** enable `selfDefending` until you’ve verified it doesn’t break messaging or CSP.
- Do **not** put API URLs or keys in plain strings in the front-end; use server-side config or minimal, opaque endpoints.

---

## 3. HTML & Manifest

- **popup.html**: Minify (remove comments, extra whitespace); no inline scripts that contain business logic (keep script `src` to obfuscated `popup.js`).
- **manifest.json**: Minify (single line if desired); ensure no comments (JSON doesn’t allow them anyway). Do not add debug permissions or optional permissions that aren’t needed. Version and name can stay readable; critical logic is in JS.

---

## 4. Server (Python) – “Not Decryptable” in Practice

### 4.1 Options (pick one or combine)

| Method | Effort | Effect |
|--------|--------|--------|
| **PyArmor** | Low | Encrypts bytecode; runtime decryption; good against casual inspection. |
| **Cython** | Medium | Compile hot paths to C extensions; no plain `.py` for those parts. |
| **Nuitka** | Medium | Compile whole app to a binary; no Python source needed on server. |
| **Obfuscate strings + strip docstrings** | Low | Reduces greppable secrets and hints. |

### 4.2 Recommended path

1. **Secrets**  
   Never commit `.env` or real keys. Use env vars / secret manager at deploy time. No API keys or DB URLs in code.

2. **PyArmor (practical default)**  
   - Encrypt all `server/**/*.py` (e.g. `pyarmor gen --recursive server/` or equivalent).  
   - Run the app using PyArmor’s loader so bytecode is decrypted at runtime only.  
   - Document the exact PyArmor version and command in a private runbook so builds are reproducible.

3. **Optional: Nuitka for a single binary**  
   - Build one executable for the FastAPI app; ship that instead of `.py` files.  
   - Harder to inspect than PyArmor; more build complexity and platform-specific binaries.

4. **Code-level**  
   - Remove or redact unnecessary docstrings and comments before obfuscation/compilation.  
   - Use a simple string obfuscator or constants loaded from env for any remaining sensitive strings.

---

## 5. Delivery & Packaging

- **Extension**  
  - Ship only the `dist/` output (obfuscated JS, minified HTML, manifest, icons).  
  - Create the final ZIP from `dist/` (as in `zip_obfuscated.py`).  
  - Do not distribute the repo root (no `core/` source, no `popup.js` source, no `server/` source) to end users.

- **Server**  
  - Deploy only the PyArmor-protected package (or Nuitka binary) plus non-sensitive config (e.g. env template without values).  
  - Do not deploy raw `*.py` if you choose PyArmor/Nuitka.

---

## 6. Implementation Checklist

- [ ] **6.1** Add a single obfuscator config (e.g. `obfuscator-config.json` or a JS/Node script) with `target: 'browser-no-eval'` and the CSP-safe options from §2.2.
- [ ] **6.2** Update `build_extension.py` to:  
  - Copy `core/` (and any other JS) into `dist/` preserving structure.  
  - Run javascript-obfuscator on **all** JS files (root + `core/**/*.js`) with that config.  
  - Obfuscate in dependency order if needed (e.g. utils → monitor → background).
- [ ] **6.3** Add a minify step for `popup.html` (and any other HTML) and ensure manifest has no debug-only changes.
- [ ] **6.4** Remove or gate `console.log` in production (obfuscator `disableConsoleOutput` or a pre-step that strips logs).
- [ ] **6.5** Verify: load unpacked `dist/` in Chrome; test inject flow, TV code, and analytics paths; confirm no CSP or eval errors in console.
- [ ] **6.6** Server: install PyArmor; add a `scripts/obfuscate_server.py` or Make target that obfuscates `server/` and outputs a deployable package.
- [ ] **6.7** Document the exact build commands (extension + server) in a private README or RELEASE_GUIDE so “not decryptable” builds are reproducible.

---

## 7. Optional Hardening (Later)

- **Anti-debugging**: In obfuscated JS, add a small timer that checks `Date` or debugger presence and clears sensitive vars or redirects; use sparingly and test so it doesn’t break UX.
- **Integrity checks**: Optionally have the background script check that critical files (e.g. hashes of obfuscated scripts) weren’t patched; react by not performing sensitive actions (advanced and easy to get wrong).
- **Server-side enforcement**: Keep license and cookie logic entirely on the server; treat the extension as a thin client. Then even if the client is deobfuscated, core “secrets” (account/cookie issuance) stay server-side.

---

## 8. Summary

| Layer | Action |
|-------|--------|
| **All extension JS** | Obfuscate with `browser-no-eval`, controlFlowFlattening, deadCodeInjection, stringArray, splitStrings; include `core/` in build. |
| **HTML/Manifest** | Minify; no source maps or debug artifacts. |
| **Server** | PyArmor (or Nuitka) + env-based secrets; no raw `.py` in deploy. |
| **Packaging** | Ship only `dist/` ZIP and protected server build; no source in distribution. |

Result: The extension and server become much harder to reverse-engineer or “decrypt,” while remaining installable and runnable. For the next step, implement §6.1–6.2 in this repo (e.g. `obfuscator-config.json` + updated `build_extension.py`).
