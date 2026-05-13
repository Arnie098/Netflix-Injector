console.log("Bg: Pre-import checkpoint");
try {
    importScripts('/core/analytics/monitor.js');
    console.log("Bg: Monitor script imported successfully");
} catch (err) {
    console.error("Bg: Failed to import monitor script:", err);
}

// --- CONFIGURATION ---
const CONFIG = {
    serverUrl: "https://netflix-injector-api.onrender.com",
    targetDomain: "https://www.netflix.com",
    baseDomain: ".netflix.com"
};

console.log("✅ Netflix Injector: Service Worker Initialized (Server Mode)");

// --- SERVICE WORKER KEEPALIVE ---
// Use alarms to prevent the service worker from being killed during operations
let activeOperation = false;

chrome.alarms.create("keepalive", { periodInMinutes: 0.4 }); // Every 24 seconds

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "keepalive" && activeOperation) {
        console.log("Bg: Keepalive ping (active operation in progress)");
    }
    if (alarm.name === "session_check") {
        checkSessionHealth();
    }
});

// Schedule periodic session health checks (every 15 minutes)
chrome.alarms.create("session_check", { periodInMinutes: 15 });

// --- HARDWARE ID ---
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

// --- LICENSE CLAIM (with country filter) ---
async function claimLicense(licenseKey, country) {
    const hwid = await getOrCreateHwid();
    const endpoint = `${CONFIG.serverUrl}/v1/license/verify`;

    console.log(`Bg: Verifying license with server: ${endpoint} (country: ${country || 'any'})`);

    const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            license_key: licenseKey,
            hardware_id: hwid,
            country_filter: country || null
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Bg: Backend error (${response.status}):`, errorText);
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

    const rpcResult = data.data;

    if (Array.isArray(rpcResult) && rpcResult.length > 0) {
        return rpcResult[0].account || rpcResult[0];
    }

    return rpcResult.account || rpcResult;
}

// --- COOKIE INJECTION ---
async function injectCookies(cookies) {
    let cookieList = typeof cookies === 'string' ? JSON.parse(cookies) : cookies;
    let injected = 0;

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
                expirationDate: cookie.expirationDate || (Date.now() / 1000 + 86400 * 30)
            });
            injected++;
        } catch (err) {
            console.warn(`Failed to set cookie ${cookie.name}:`, err);
        }
    }

    console.log(`Bg: Injected ${injected}/${cookieList.length} cookies`);
    return injected;
}

// --- CLEAR NETFLIX COOKIES ---
async function clearAllNetflixCookies() {
    try {
        const allCookies = await chrome.cookies.getAll({ domain: ".netflix.com" });
        console.log(`Bg: Clearing ${allCookies.length} existing cookies...`);

        const promises = allCookies.map(cookie => {
            let domain = cookie.domain;
            if (domain.startsWith(".")) domain = domain.substring(1);
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

// --- ENHANCED HOUSEHOLD BYPASS ---
async function performHouseholdBypass() {
    // Extended list of cookies Netflix uses for household/device detection
    const householdCookies = [
        "nfvdid",           // Netflix device ID
        "flwssn",           // Flow session
        "OptanonConsent",   // Consent tracking
        "memclid",          // Member client ID
        "clSharedContext",  // Shared context
        "cL",              // Client location
        "nfvdid_cL",       // Device + location combo
        "profilesNewSession", // Profile session marker
        "lhpuuidh-browse-", // Household browse marker
        "lhpuuidh-watch-",  // Household watch marker
    ];

    for (const name of householdCookies) {
        await chrome.cookies.remove({
            url: "https://www.netflix.com",
            name: name
        }).catch(() => { });
    }

    // Also clear any cookies with "household" or "transfer" in the name
    try {
        const allCookies = await chrome.cookies.getAll({ domain: ".netflix.com" });
        for (const cookie of allCookies) {
            const lowerName = cookie.name.toLowerCase();
            if (lowerName.includes("household") || lowerName.includes("transfer") ||
                lowerName.includes("lhpuuidh") || lowerName.includes("profilegate")) {
                let domain = cookie.domain.startsWith(".") ? cookie.domain.substring(1) : cookie.domain;
                await chrome.cookies.remove({
                    url: `https://${domain}${cookie.path}`,
                    name: cookie.name
                }).catch(() => { });
            }
        }
    } catch (e) {
        console.warn("Bg: Extended household cleanup error:", e);
    }

    console.log("Bg: Household bypass complete");
}

// --- SESSION VALIDATION ---
async function validateNetflixSession() {
    try {
        // Check if NetflixId cookie exists
        const netflixId = await chrome.cookies.get({
            url: "https://www.netflix.com",
            name: "NetflixId"
        });

        if (!netflixId || !netflixId.value) {
            return { valid: false, reason: "no_cookie" };
        }

        // Check expiration
        if (netflixId.expirationDate && netflixId.expirationDate < Date.now() / 1000) {
            return { valid: false, reason: "expired" };
        }

        // Try to hit Netflix API to verify the session is actually working
        try {
            const response = await fetch("https://www.netflix.com/api/shakti/mre/pathEvaluator?withSize=true&materialize=true", {
                method: "GET",
                headers: {
                    "Cookie": `NetflixId=${netflixId.value}`,
                    "Accept": "application/json"
                },
                credentials: "include"
            });

            if (response.status === 401 || response.status === 403) {
                return { valid: false, reason: "session_invalid" };
            }

            // 200 or redirect to browse = valid
            if (response.ok || response.status === 302) {
                return { valid: true };
            }

            // Other status codes - uncertain
            return { valid: true, uncertain: true };
        } catch (fetchErr) {
            // Network error - can't verify, assume valid if cookie exists
            console.warn("Bg: Session validation fetch failed:", fetchErr.message);
            return { valid: true, uncertain: true };
        }
    } catch (e) {
        console.error("Bg: Session validation error:", e);
        return { valid: false, reason: "error" };
    }
}

// --- MARK COOKIE AS DEAD ON SERVER ---
async function reportDeadCookie(description) {
    try {
        const endpoint = `${CONFIG.serverUrl}/v1/cookies/report`;
        await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                cookie_id: 0, // We don't track individual IDs client-side
                reason: `dead_session: ${description || 'unknown'}`
            })
        });
        console.log("Bg: Dead cookie reported to server");
    } catch (e) {
        console.warn("Bg: Failed to report dead cookie:", e.message);
    }
}

// --- SESSION HEALTH CHECK (runs periodically) ---
async function checkSessionHealth() {
    const { lastInjection } = await chrome.storage.local.get(["lastInjection"]);
    if (!lastInjection) return;

    const result = await validateNetflixSession();

    if (!result.valid) {
        console.log(`Bg: Session health check FAILED (reason: ${result.reason})`);

        // Update stored session state
        await chrome.storage.local.set({
            sessionStatus: "dead",
            sessionDeadReason: result.reason
        });

        // Report dead cookie to server
        reportDeadCookie(lastInjection.description || lastInjection.email);

        // Notify any open Netflix tabs
        const tabs = await chrome.tabs.query({ url: "*://*.netflix.com/*" });
        for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, {
                action: "SESSION_EXPIRED",
                reason: result.reason
            }).catch(() => { });
        }
    } else {
        await chrome.storage.local.set({ sessionStatus: "active" });
    }
}

// --- RELOAD NETFLIX TABS ---
async function reloadNetflixTabs() {
    const tabs = await chrome.tabs.query({ url: "*://*.netflix.com/*" });
    for (const tab of tabs) {
        chrome.tabs.reload(tab.id).catch(() => { });
    }
}

// --- MAIN INJECTION PIPELINE ---
async function runInjectionPipeline(licenseKey, country) {
    activeOperation = true;

    try {
        // 1. Claim license and get account
        let account;
        try {
            account = await claimLicense(licenseKey, country);
        } catch (err) {
            return { success: false, message: err.message || "License claim failed" };
        }

        const cookies = account?.cookies ?? account;
        if (!cookies || (Array.isArray(cookies) && cookies.length === 0)) {
            return { success: false, message: "No account data or cookies returned from server." };
        }

        // 2. Clear existing cookies
        await clearAllNetflixCookies();

        // 3. Inject new cookies
        const injectedCount = await injectCookies(cookies);
        if (injectedCount === 0) {
            return { success: false, message: "Failed to inject any cookies." };
        }

        // 4. Household bypass
        await performHouseholdBypass();

        // 5. Validate the session works
        const validation = await validateNetflixSession();
        if (!validation.valid && !validation.uncertain) {
            console.warn("Bg: Post-injection validation failed:", validation.reason);
            reportDeadCookie(account?.description || "post-inject-fail");
            return {
                success: false,
                message: "Cookie was injected but the session appears invalid. The account may be expired. Trying another..."
            };
        }

        // 6. Store injection metadata for session monitoring
        const description = account?.description || "";
        const emailMatch = description.match(/EMAIL:\s*([^\s|]+)/);
        const email = emailMatch ? emailMatch[1] : "Unknown";

        await chrome.storage.local.set({
            lastInjection: {
                timestamp: Date.now(),
                email: email,
                description: description,
                country: country || "any"
            },
            sessionStatus: "active"
        });

        // 7. Reload Netflix tabs
        reloadNetflixTabs();

        return { success: true, cookies: cookies, email: email };
    } catch (err) {
        console.error("Bg: Injection pipeline error:", err);
        return { success: false, message: err.message || "Cookie injection failed" };
    } finally {
        activeOperation = false;
    }
}

// --- MESSAGE HANDLER ---
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.action === "PING") {
        sendResponse({ alive: true });
        return false;
    }

    if (request?.action === "START_INJECTION" && request?.licenseKey) {
        runInjectionPipeline(request.licenseKey.trim(), request.country || null)
            .then(sendResponse)
            .catch((err) => {
                console.error("Bg: START_INJECTION error:", err);
                sendResponse({ success: false, message: err?.message || "Injection failed" });
            });
        return true;
    }

    if (request?.action === "CHECK_SESSION") {
        (async () => {
            try {
                const { lastInjection, sessionStatus } = await chrome.storage.local.get(["lastInjection", "sessionStatus"]);

                if (!lastInjection) {
                    sendResponse({ hasSession: false });
                    return;
                }

                // Quick check: is the NetflixId cookie present?
                const netflixId = await chrome.cookies.get({
                    url: "https://www.netflix.com",
                    name: "NetflixId"
                });

                if (!netflixId || !netflixId.value) {
                    sendResponse({
                        hasSession: true,
                        status: "dead",
                        description: lastInjection.email || "Unknown"
                    });
                    return;
                }

                // Check if cookie is expiring soon (within 24 hours)
                const expiresIn = netflixId.expirationDate ? (netflixId.expirationDate - Date.now() / 1000) : Infinity;
                let status = sessionStatus || "active";

                if (expiresIn < 86400 && expiresIn > 0) {
                    status = "expiring";
                } else if (expiresIn <= 0) {
                    status = "dead";
                }

                sendResponse({
                    hasSession: true,
                    status: status,
                    description: lastInjection.email || "Active session",
                    injectedAt: lastInjection.timestamp,
                    country: lastInjection.country
                });
            } catch (e) {
                sendResponse({ hasSession: false, error: e.message });
            }
        })();
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
        return true;
    }

    if (request?.action === "SESSION_STATUS_UPDATE") {
        // Content script reporting session state from Netflix page
        (async () => {
            const status = request.status;
            console.log(`Bg: Netflix page reports session status: ${status}`);

            await chrome.storage.local.set({ sessionStatus: status });

            if (status === "dead") {
                const { lastInjection } = await chrome.storage.local.get(["lastInjection"]);
                if (lastInjection) {
                    reportDeadCookie(lastInjection.description || lastInjection.email);
                }
            }

            sendResponse({ received: true });
        })();
        return true;
    }

    if (request?.action === "TV_LOGIN") {
        (async () => {
            try {
                const code = request.code;
                if (!code || code.length !== 8 || !/^\d+$/.test(code)) {
                    sendResponse({ success: false, message: "Invalid TV code. Must be 8 digits." });
                    return;
                }

                console.log("Bg: Starting TV login with code:", code);

                // Get Netflix cookies to attach to the request
                const allCookies = await chrome.cookies.getAll({ domain: ".netflix.com" });
                const cookieHeader = allCookies.map(c => `${c.name}=${c.value}`).join("; ");

                if (!cookieHeader || allCookies.length === 0) {
                    sendResponse({ success: false, message: "No Netflix session found. Inject a cookie first." });
                    return;
                }

                // Step 1: GET the auth page to extract form tokens
                const authUrl = `https://www.netflix.com/hook/tvAuthorize?pin=${code}`;
                console.log("Bg: Fetching TV auth page:", authUrl);

                const getResp = await fetch(authUrl, {
                    method: "GET",
                    headers: {
                        "Cookie": cookieHeader,
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    },
                    redirect: "follow"
                });

                if (!getResp.ok) {
                    sendResponse({ success: false, message: `Failed to load TV auth page (Status: ${getResp.status})` });
                    return;
                }

                const pageHtml = await getResp.text();

                // Check if already successful
                if (pageHtml.includes("device_connected") || pageHtml.includes("Success")) {
                    sendResponse({ success: true, message: "TV connected successfully!" });
                    return;
                }

                // Step 2: Parse form data from the HTML
                const formActionMatch = pageHtml.match(/action="([^"]+)"/);
                const actionPath = formActionMatch ? formActionMatch[1] : "/hook/tvAuthorize";
                const actionUrl = actionPath.startsWith("http") ? actionPath : `https://www.netflix.com${actionPath}`;

                // Extract all hidden inputs
                const inputMatches = [...pageHtml.matchAll(/<input[^>]*name="([^"]*)"[^>]*value="([^"]*)"[^>]*>/g)];
                const formParams = new URLSearchParams();
                for (const match of inputMatches) {
                    formParams.append(match[1], match[2]);
                }

                // Ensure pin is included
                if (!formParams.has("pin")) {
                    formParams.append("pin", code);
                }

                // Also try alternate input pattern (value before name)
                const altInputMatches = [...pageHtml.matchAll(/<input[^>]*value="([^"]*)"[^>]*name="([^"]*)"[^>]*>/g)];
                for (const match of altInputMatches) {
                    if (!formParams.has(match[2])) {
                        formParams.append(match[2], match[1]);
                    }
                }

                console.log("Bg: Submitting TV auth to:", actionUrl, "params:", formParams.toString().substring(0, 100));

                // Step 3: POST the form
                const postResp = await fetch(actionUrl, {
                    method: "POST",
                    headers: {
                        "Cookie": cookieHeader,
                        "Content-Type": "application/x-www-form-urlencoded",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Referer": authUrl
                    },
                    body: formParams.toString(),
                    redirect: "follow"
                });

                const postHtml = await postResp.text();

                // Step 4: Check result
                if (postHtml.includes("device_connected") || postHtml.includes("Success") ||
                    (postResp.ok && !postHtml.includes("ui-message-error") && !postHtml.includes("incorrect_code"))) {
                    console.log("Bg: TV login successful!");
                    sendResponse({ success: true, message: "TV connected successfully!" });
                } else if (postHtml.includes("incorrect_code") || postHtml.includes("ui-message-error")) {
                    sendResponse({ success: false, message: "Incorrect code or code expired. Get a new code from your TV." });
                } else {
                    console.warn("Bg: TV login uncertain response, status:", postResp.status);
                    sendResponse({ success: false, message: "Could not confirm TV link. The code may have expired." });
                }
            } catch (err) {
                console.error("Bg: TV login error:", err);
                sendResponse({ success: false, message: err.message || "TV login failed" });
            }
        })();
        return true;
    }

    if (request?.action === "HOUSEHOLD_BYPASS_NEEDED") {
        (async () => {
            console.log("Bg: Household bypass requested by content script");
            await performHouseholdBypass();

            // Reload the tab that requested it
            if (_sender.tab && _sender.tab.id) {
                setTimeout(() => {
                    chrome.tabs.reload(_sender.tab.id).catch(() => { });
                }, 500);
            }

            sendResponse({ success: true });
        })();
        return true;
    }

    return false;
});

// --- LIFECYCLE ---
chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed/updated");
    chrome.alarms.create("keepalive", { periodInMinutes: 0.4 });
    chrome.alarms.create("session_check", { periodInMinutes: 15 });
});

chrome.runtime.onSuspend.addListener(() => {
    console.log("Service worker suspending...");
    activeOperation = false;
});

// Recover state on startup
chrome.runtime.onStartup.addListener(() => {
    console.log("Bg: Service worker started");
    chrome.alarms.create("keepalive", { periodInMinutes: 0.4 });
    chrome.alarms.create("session_check", { periodInMinutes: 15 });
});
