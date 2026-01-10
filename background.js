import { loadConfig } from './config.js';

let CONFIG = null;

// Initialize Config on startup
(async () => {
    CONFIG = await loadConfig();
    console.log("Configuration loaded:", CONFIG);
})();

// ==========================================
// MESSAGE LISTENER
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "START_INJECTION") {
        handleInjection(request.licenseKey)
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, message: err.message }));
        return true;
    }

});

// ==========================================
// CORE LOGIC
// ==========================================
async function handleInjection(userLicenseKey) {
    if (!CONFIG) CONFIG = await loadConfig();

    console.log("Starting Injection Process...");

    // 0. Config Check
    if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey) {
        throw new Error("Configuration Error: Missing Supabase URL or key in runtime config.");
    }

    // 1. VALIDATE LICENSE & FETCH ACCOUNT
    const account = await claimLicenseAndFetchAccount(userLicenseKey);

    // 2. INJECT COOKIES
    if (account && account.cookie_data) {
        await injectCookies(account.cookie_data);
        reloadActiveTab();
    } else {
        throw new Error("No valid accounts available in the database.");
    }
}

async function reloadActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
        chrome.tabs.reload(tabs[0].id);
    }
}

// ==========================================
// LICENSE & DEVICE LOGIC
// ==========================================

async function getDeviceId() {
    const result = await chrome.storage.local.get(['hwid']);
    if (result.hwid) return result.hwid;

    const newId = crypto.randomUUID();
    await chrome.storage.local.set({ hwid: newId });
    return newId;
}

async function claimLicenseAndFetchAccount(key) {
    if (!key) throw new Error("License key is required.");

    // 1. Get Device ID
    const deviceId = await getDeviceId();
    console.log("Checking license for Device:", deviceId);

    // 2. Atomically claim/validate license on the server
    const rpcQuery = `${CONFIG.supabaseUrl}/rest/v1/rpc/claim_license`;
    let response;
    try {
        response = await fetch(rpcQuery, {
            method: "POST",
            headers: {
                "apikey": CONFIG.supabaseKey,
                "Authorization": `Bearer ${CONFIG.supabaseKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                p_license_key: key,
                p_hardware_id: deviceId,
                p_include_account: true
            })
        });
    } catch (e) {
        throw new Error(`License validation failed: ${e.message}`);
    }

    const rawBody = await response.text();
    let data = null;
    if (rawBody) {
        try {
            data = JSON.parse(rawBody);
        } catch (e) {
            data = null;
        }
    }

    if (!response.ok) {
        const msg = data && data.message ? data.message : (rawBody || "License validation failed.");
        throw new Error(msg);
    }

    if (!data || !data.success) {
        const msg = data && data.message ? data.message : "Invalid, Expired, or Device-Locked License Key.";
        throw new Error(msg);
    }

    if (data.status === "newly_claimed") {
        console.log("License claimed and locked to this device.");
    } else {
        console.log("License valid and belongs to this device.");
    }
    if (!data.account || !data.account.cookie_data) {
        throw new Error("No valid accounts available in the database.");
    }
    return data.account;
}

async function injectCookies(cookieArray) {
    if (typeof cookieArray === 'string') {
        try { cookieArray = JSON.parse(cookieArray); } catch (e) { }
    }
    if (!Array.isArray(cookieArray)) throw new Error("Invalid cookie format");

    for (const cookie of cookieArray) {
        let domain = cookie.domain || CONFIG.baseDomain;
        const cookieDetails = {
            url: CONFIG.targetDomain,
            name: cookie.name,
            value: cookie.value,
            domain: domain,
            path: cookie.path || "/",
            secure: true,
            httpOnly: cookie.httpOnly || false,
            sameSite: "no_restriction"
        };
        try { await chrome.cookies.set(cookieDetails); } catch (e) { }
    }
}

