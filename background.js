console.log("Bg: Pre-import checkpoint");
try {
    importScripts('/core/analytics/monitor.js');
    console.log("Bg: Monitor script imported successfully");
} catch (err) {
    console.error("Bg: Failed to import monitor script:", err);
}

// --- CONFIGURATION ---
// --- CONFIGURATION ---
const CONFIG = {
    serverUrl: "https://netflix-injector-api.onrender.com",
    targetDomain: "https://www.netflix.com",
    baseDomain: ".netflix.com"
};

console.log("✅ Netflix Injector: Service Worker Initialized (Server Mode)");

let isAlive = true;

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

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Bg: Backend error (${response.status}):`, errorText);
        // If it starts with <, it's HTML, so provide a better message
        if (errorText.trim().startsWith("<!DOCTYPE") || errorText.trim().startsWith("<html")) {
            throw new Error(`Server returned an HTML error page (Status ${response.status}). Ensure the API URL is correct and the server is running.`);
        }
        throw new Error(`Server error (${response.status}): ${errorText.slice(0, 100)}`);
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Bg: Expected JSON but got:", text);
        throw new Error("Server returned an invalid response format (not JSON).");
    }

    const data = await response.json();

    if (!data.valid) {
        throw new Error(data?.message || "License claim failed");
    }

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

async function runInjectionPipeline(licenseKey) {
    let account;
    try {
        account = await claimLicense(licenseKey);
    } catch (err) {
        return { success: false, message: err.message || "License claim failed" };
    }
    const cookies = account?.cookies ?? account;
    if (!cookies || (Array.isArray(cookies) && cookies.length === 0)) {
        return { success: false, message: "No account data or cookies returned from server." };
    }
    try {
        await clearAllNetflixCookies();
        await injectCookies(cookies);
        await performHouseholdBypass();
        reloadNetflixTabs();
        return { success: true };
    } catch (err) {
        console.error("Bg: Injection pipeline error:", err);
        return { success: false, message: err.message || "Cookie injection failed" };
    }
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.action === "PING") {
        sendResponse({ alive: true });
        return false;
    }
    if (request?.action === "START_INJECTION" && request?.licenseKey) {
        runInjectionPipeline(request.licenseKey.trim())
            .then(sendResponse)
            .catch((err) => {
                console.error("Bg: START_INJECTION error:", err);
                sendResponse({ success: false, message: err?.message || "Injection failed" });
            });
        return true;
    }
    if (request?.action === "OPEN_PHONE_NETFLIX") {
        const phoneUrl = "https://www.netflix.com/unsupported";
        console.log("Bg: Opening phone Netflix URL:", phoneUrl);
        chrome.tabs.create({ url: phoneUrl, active: true })
            .then(() => sendResponse({ success: true }))
            .catch((err) => {
                console.error("Bg: Failed to open phone tab:", err);
                sendResponse({ success: false, message: err.message || "Failed to open tab" });
            });
        return true; // async response
    }
    return false;
});

// Initialize
chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed/updated");
    isAlive = true;
});

chrome.runtime.onSuspend.addListener(() => {
    console.log("Service worker suspending...");
    isAlive = false;
});