
const assert = require('assert');

// Mock DOMParser
class DOMParser {
    parseFromString(html, type) {
        return {
            querySelector: (selector) => {
                if (selector === 'form') {
                    return {
                        querySelectorAll: (sel) => {
                            if (sel === 'input') {
                                return [
                                    { name: 'authURL', value: 'http://example.com/auth' },
                                    { name: 'mode', value: 'tv' },
                                    { name: 'action', value: 'login' }
                                ];
                            }
                            return [];
                        },
                        querySelector: (sel) => {
                            if (sel === "button[type='submit']") {
                                return { name: 'submitBtn', value: 'submit' };
                            }
                            return null;
                        },
                        getAttribute: (attr) => {
                            if (attr === 'action') return '/hook/tvAuthorize';
                            return null;
                        }
                    };
                }
                return null;
            },
            body: {
                textContent: html
            }
        };
    }
}

// Mock global window/document/fetch
global.DOMParser = DOMParser;
global.window = {};
global.document = {
    getElementById: (id) => ({ value: '', addEventListener: () => { } })
};

// Mock Fetch
global.fetch = async (url, options) => {
    console.log(`[MockFetch] Request to: ${url}`);
    if (url.includes('pin=')) {
        return {
            ok: true,
            status: 200,
            text: async () => '<html><body><form action="/hook/tvAuthorize"><input name="authURL" value="123"><input name="action" value="login"></form></body></html>'
        };
    }
    if (url.includes('tvAuthorize') && options.method === 'POST') {
        const body = options.body;
        console.log('[MockFetch] POST Body:', body.toString());
        if (body.has('pin') && body.get('pin') === '12345678') {
            return {
                ok: true,
                status: 200,
                text: async () => '{"status": "success", "msg": "device_connected"}'
            };
        }
    }
    return {
        ok: false,
        status: 500,
        text: async () => 'Error'
    };
};

// --- Logic to Test (Copied from implementation) ---
async function handleTvLogin(code) {
    // START LOGIC COPY
    const authUrl = `https://www.netflix.com/hook/tvAuthorize?pin=${code}`;
    console.log("Fetching auth page:", authUrl);

    // 1. Fetch initial page to get form tokens
    const initialResp = await fetch(authUrl, {
        credentials: 'include' // Important: Use browser cookies
    });

    if (!initialResp.ok) {
        throw new Error(`Failed to load auth page (Status: ${initialResp.status})`);
    }

    const initialText = await initialResp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(initialText, "text/html");

    const form = doc.querySelector("form");
    if (!form) {
        // Check if already successful or a different state
        if (doc.body.textContent.includes("Success")) {
            return "SUCCESS: Already Connected";
        }
        throw new Error("Authorization form not found on Netflix page. Ensure you are logged in.");
    }

    // 2. Prepare Form Data
    const formData = new URLSearchParams();
    const inputs = form.querySelectorAll("input");
    inputs.forEach(input => {
        formData.append(input.name, input.value);
    });

    // Add submit button value if present
    const submitBtn = form.querySelector("button[type='submit']");
    if (submitBtn && submitBtn.name) {
        formData.append(submitBtn.name, submitBtn.value || "");
    }

    // Verify we captured the pin or inject it if missing and required
    if (!formData.has('pin')) {
        formData.append('pin', code);
    }

    // 3. Submit Post Request
    // The action is usually relative, so resolve it against the origin
    const actionUrl = new URL(form.getAttribute("action") || "/hook/tvAuthorize", "https://www.netflix.com").href;

    console.log("Submitting TV Auth to:", actionUrl);

    const postResp = await fetch(actionUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: formData,
        credentials: "include"
    });

    const postText = await postResp.text();

    // 4. Validate Response
    // Check for success indicators
    if (postText.includes("Success") || postText.includes("device_connected") || (!postText.includes("error") && postResp.ok)) {
        // Sometimes Netflix redirects or shows a success message
        // We can check for specific error classes to be sure it DIDN'T fail
        if (postText.includes("ui-message-error") || postText.includes("incorrect_code")) {
            throw new Error("Incorrect code or session expired.");
        }
        return "SUCCESS";
    } else {
        throw new Error("Unknown response from Netflix. Check console.");
    }
    // END LOGIC COPY
}

// Run Test
async function runTest() {
    try {
        console.log("Test 1: Valid Code");
        const result = await handleTvLogin('12345678');
        assert.strictEqual(result, 'SUCCESS');
        console.log("PASS: Test 1");

    } catch (e) {
        console.error("FAIL: Test 1", e);
        process.exit(1);
    }
}

runTest();
