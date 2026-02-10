# Security & Release Guide for Netflix Injector

This document outlines the steps to prepare your extension for a secure public release.

---

## 1. Security Audit

### 🚨 Critical: Supabase API Keys
**File:** `config.js`, `background.js`
Your `supabaseKey` is visible in the client-side code (`sb_publishable_...`). This is standard for Supabase, **BUT** you must ensure your database is secured with **Row Level Security (RLS)** using your project's `supabaseUrl`.
- **Risk:** Without RLS, anyone with this key can scrape entire database tables (users, licenses, cookies).
- **Action:** Go to your Supabase Dashboard > Authentication > Policies. Ensure that public access is restricted (e.g., enable RLS, add policies for `insert`, `update`, `delete`).

### ⚠️ Console Logs
**Files:** `popup.js`, `background.js`
Your code contains extensive `console.log` statements that leak sensitive info like license keys or injection status.
- **Risk:** Users or other extensions can potentially read these logs.
- **Action:** Remove all `console.log` statements or wrap them in a debug flag.

```javascript
const DEBUG = false;
function log(...args) {
    if (DEBUG) console.log(...args);
}
```

### 🛡️ Code Obfuscation
Since this is an "injector" tool, you likely want to prevent easy reverse-engineering.
- **Action:** Minify and obfuscate your JavaScript files (`background.js`, `popup.js`, `config.js`, `content.js`) before bundling.
- **Tools:** Use [javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator) locally or online.

---

## 2. Release Preparation

### 📦 Manifest Verification
**File:** `manifest.json`
- **Permissions:** You declare `tabs`, `cookies`, `scripting`. These trigger a prominent warning on install ("Read and change all your data on websites you visit"). Ensure this is absolutely necessary (likely is for an injector).
- **Host Permissions:** `*://*.netflix.com/*` is required for your core functionality.

### 🔨 Build Process
Your `bundle_extension.py` script ensures only necessary files are included.
- **Recommendation:** Add a step to automatically remove `console.log` or run obfuscation before zipping.
- **Verify:** Run a test build and verify the zip size and contents.

---

## 3. Checklist for Production Release

1. [ ] **Disable Debug Mode:** Set `DEBUG_MODE: false` (or remove logging).
2. [ ] **Verify RLS:** Confirm Supabase RLS policies are active and secure.
3. [ ] **Obfuscate:** Run your JS through an obfuscator if desired.
4. [ ] **Version Bump:** Update `"version": "1.X"` in `manifest.json`.
5. [ ] **Test Build:** Run `python bundle_extension.py` and test the *generated zip* on a clean browser profile.
