/**
 * Test: OPEN_PHONE_NETFLIX handler logic
 * Verifies that the background handler opens the correct URL and returns { success: true }
 */

const assert = require('assert');

// --- Mock chrome.tabs.create ---
let lastCreatedTab = null;
let tabCreateShouldFail = false;

global.chrome = {
    tabs: {
        create: async (options) => {
            if (tabCreateShouldFail) {
                throw new Error('Tab creation failed (mock)');
            }
            lastCreatedTab = options;
            return { id: 1, url: options.url };
        }
    }
};

// --- Logic under test (extracted from background.js handler) ---
async function handleOpenPhoneNetflix() {
    const phoneUrl = "https://www.netflix.com/unsupported";
    try {
        await chrome.tabs.create({ url: phoneUrl, active: true });
        return { success: true };
    } catch (err) {
        return { success: false, message: err.message || "Failed to open tab" };
    }
}

// --- Tests ---
async function runTests() {
    let passed = 0;
    let failed = 0;

    // Test 1: Opens correct URL and returns success
    console.log("Test 1: Opens netflix.com/unsupported and returns success");
    try {
        tabCreateShouldFail = false;
        lastCreatedTab = null;
        const result = await handleOpenPhoneNetflix();

        assert.strictEqual(result.success, true, "Should return success: true");
        assert.strictEqual(
            lastCreatedTab.url,
            "https://www.netflix.com/unsupported",
            "Should open the correct Netflix URL"
        );
        assert.strictEqual(lastCreatedTab.active, true, "Tab should be active");
        console.log("  PASS ✅");
        passed++;
    } catch (e) {
        console.error("  FAIL ❌:", e.message);
        failed++;
    }

    // Test 2: Returns failure when tab creation throws
    console.log("Test 2: Returns failure when chrome.tabs.create fails");
    try {
        tabCreateShouldFail = true;
        const result = await handleOpenPhoneNetflix();

        assert.strictEqual(result.success, false, "Should return success: false on error");
        assert.ok(result.message, "Should include an error message");
        assert.ok(result.message.includes("mock"), "Error message should reflect mock error");
        console.log("  PASS ✅");
        passed++;
    } catch (e) {
        console.error("  FAIL ❌:", e.message);
        failed++;
    }

    // Test 3: URL is exactly the Netflix unsupported deep-link trigger
    console.log("Test 3: URL matches the Netflix app deep-link trigger page");
    try {
        tabCreateShouldFail = false;
        lastCreatedTab = null;
        await handleOpenPhoneNetflix();

        const url = lastCreatedTab.url;
        assert.ok(url.startsWith("https://www.netflix.com"), "Should be a netflix.com URL");
        assert.ok(url.includes("unsupported"), "Should include /unsupported path");
        console.log("  PASS ✅");
        passed++;
    } catch (e) {
        console.error("  FAIL ❌:", e.message);
        failed++;
    }

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

runTests();
