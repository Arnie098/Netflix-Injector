// NETFLIX INJECTOR BACKGROUND SCRIPT - FIXED VERSION

// --- CONFIGURATION ---
const CONFIG = {
    supabaseUrl: "https://arslamcjzixeqmalscye.supabase.co",
    supabaseKey: "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4",
    targetDomain: "https://www.netflix.com",
    baseDomain: ".netflix.com"
};

console.log("✅ Netflix Injector: Service Worker Initialized");

// --- KEEP ALIVE MECHANISM ---
let isAlive = true;

// Send heartbeat to prevent termination
setInterval(() => {
    if (isAlive) {
        console.log("💓 Service worker heartbeat");
    }
}, 25000);

// --- SIMPLIFIED MESSAGE LISTENER ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("📩 Received message:", request.action);

    switch (request.action) {
        case "PING":
            sendResponse({ alive: true, timestamp: Date.now() });
            return true;

        case "START_INJECTION":
            handleInjection(request.licenseKey, request.country)
                .then(() => sendResponse({ success: true }))
                .catch(err => {
                    console.error("❌ Critical Injection Error:", err);
                    sendResponse({
                        success: false,
                        message: err.message,
                        stack: err.stack
                    });
                });
            return true; // Keep channel open

        case "HOUSEHOLD_BYPASS":
            performHouseholdBypass()
                .then(() => sendResponse({ success: true }))
                .catch(err => sendResponse({ success: false }));
            return true;

        case "CLEAR_COOKIES":
            clearAllNetflixCookies()
                .then(() => sendResponse({ success: true }))
                .catch(err => sendResponse({ success: false }));
            return true;

        default:
            sendResponse({ error: "Unknown action" });
            return false;
    }
});

// --- CORE FUNCTIONS ---

async function handleInjection(licenseKey, country) {
    console.log("🕵️ Starting Injection...");

    try {
        // 1. Clear existing cookies
        console.log("Bg: 1. Clearing existing cookies...");
        if (!chrome.cookies) throw new Error("chrome.cookies API is not available");
        await clearAllNetflixCookies();
        console.log("Bg: 1. ✅ Cookies Cleared");

        // 2. Claim License
        console.log("Bg: 2. Claiming license...");
        const accountData = await claimLicense(licenseKey, country);
        console.log("Bg: 2. ✅ License Claimed");

        // 3. Inject Cookies
        console.log("Bg: 3. Injecting cookies...");
        const cookies = accountData.cookies || accountData.cookie_data;
        if (!cookies) throw new Error("No cookie data found");
        await injectCookies(cookies);
        console.log("Bg: 3. ✅ Cookies Injected");

        // 4. Wait briefly and bypass
        await new Promise(resolve => setTimeout(resolve, 300));
        await performHouseholdBypass();

        // 5. Reload tabs
        await reloadNetflixTabs();

        console.log("✅ Injection complete");
    } catch (e) {
        console.error("❌ Error inside handleInjection:", e);
        throw e;
    }
}

async function claimLicense(licenseKey, country) {
    const hwid = await getOrCreateHwid();
    const endpoint = `${CONFIG.supabaseUrl}/rest/v1/rpc/claim_license`;

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            apikey: CONFIG.supabaseKey,
            Authorization: `Bearer ${CONFIG.supabaseKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            p_license_key: licenseKey,
            p_hardware_id: hwid,
            p_include_account: true
        })
    });

    const data = await response.json();

    if (!response.ok || !data) {
        throw new Error(data?.message || "License claim failed");
    }

    if (Array.isArray(data) && data.length > 0) {
        return data[0].account || data[0];
    }

    return data.account || data;
}

async function getOrCreateHwid() {
    const { hwid } = await chrome.storage.local.get(["hwid"]);
    if (hwid) return hwid;

    const newHwid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });

    await chrome.storage.local.set({ hwid: newHwid });
    return newHwid;
}

async function injectCookies(cookies) {
    let cookieList = typeof cookies === 'string' ? JSON.parse(cookies) : cookies;

    for (const cookie of cookieList) {
        try {
            await chrome.cookies.set({
                url: "https://www.netflix.com",
                name: cookie.name,
                value: cookie.value,
                domain: cookie.domain || ".netflix.com",
                path: cookie.path || "/",
                secure: true,
                httpOnly: cookie.httpOnly || false,
                sameSite: "no_restriction",
                expirationDate: cookie.expirationDate
            });
        } catch (err) {
            console.warn(`Failed to set cookie ${cookie.name}:`, err);
        }
    }
}

async function clearAllNetflixCookies() {
    try {
        const allCookies = await chrome.cookies.getAll({ domain: ".netflix.com" });
        console.log(`Bg: Clearing ${allCookies.length} existing cookies...`);

        const promises = allCookies.map(cookie => {
            // Robust URL construction
            let domain = cookie.domain;
            if (domain.startsWith(".")) {
                domain = domain.substring(1); // .netflix.com -> netflix.com
            }
            // Ensure www for main domain if needed, or just use the domain
            const url = `https://${domain}${cookie.path}`;

            return chrome.cookies.remove({ url: url, name: cookie.name })
                .catch(err => console.warn(`Bg: Could not remove ${cookie.name}:`, err.message));
        });

        await Promise.all(promises);
        console.log("Bg: All cookies cleared");
    } catch (e) {
        console.error("Bg: Error clearing cookies:", e);
        throw e;
    }
}

async function performHouseholdBypass() {
    const cookies = ["nfvdid", "flwssn", "OptanonConsent", "memclid", "clSharedContext", "cL"];
    for (const name of cookies) {
        await chrome.cookies.remove({
            url: "https://www.netflix.com",
            name: name
        }).catch(() => { });
    }
}

async function reloadNetflixTabs() {
    const tabs = await chrome.tabs.query({ url: "*://*.netflix.com/*" });
    for (const tab of tabs) {
        chrome.tabs.reload(tab.id).catch(() => { });
    }
}

// Initialize
chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed/updated");
    isAlive = true;
});

chrome.runtime.onSuspend.addListener(() => {
    console.log("Service worker suspending...");
    isAlive = false;
});