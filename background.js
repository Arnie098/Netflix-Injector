// NETFLIX INJECTOR BACKGROUND SCRIPT - FIXED VERSION

// --- CONFIGURATION ---
// --- CONFIGURATION ---
const CONFIG = {
    serverUrl: "https://netflix-injector.onrender.com",
    targetDomain: "https://www.netflix.com",
    baseDomain: ".netflix.com"
};

console.log("✅ Netflix Injector: Service Worker Initialized (Server Mode)");

// ... (Keep existing code until claimLicense) ...

async function claimLicense(licenseKey, country) {
    const hwid = await getOrCreateHwid();
    const endpoint = `${CONFIG.serverUrl}/v1/license/verify`;

    console.log(`Bg: Verifying license with server: ${endpoint}`);

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            license_key: licenseKey,
            hardware_id: hwid,
            country_filter: country || null
        })
    });

    const data = await response.json();

    if (!response.ok || !data.valid) {
        throw new Error(data?.message || "License claim failed");
    }

    // The server returns { valid: true, message: "...", data: { ...account_info... } }
    // We need to return the account object which contains 'cookies'
    // The server 'data' field contains the result of the RPC, which might be the account object itself or wrap it.
    // Based on my server code: 
    // result = response.data (from RPC)
    // return LicenseCheckResponse(data=result)

    // The RPC 'claim_license' usually returns [ { account: ... } ] or just the account object depending on how it was written.
    // In background.js valid old logic:
    // if (Array.isArray(data) && data.length > 0) return data[0].account || data[0];

    const rpcResult = data.data; // This is what the RPC returned

    if (Array.isArray(rpcResult) && rpcResult.length > 0) {
        return rpcResult[0].account || rpcResult[0];
    }

    return rpcResult.account || rpcResult;
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