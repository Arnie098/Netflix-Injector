const https = require('https');
const fs = require('fs');
const path = require('path');

function loadEnvFile() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, 'utf-8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
}

loadEnvFile();

// Configuration
const CONFIG = {
    supabaseUrl: process.env.SUPABASE_URL || "https://arslamcjzixeqmalscye.supabase.co",
    supabaseKey: process.env.SUPABASE_ANON_KEY || "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"
};
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const TEST_LICENSE_KEY = "RPC-TEST-KEY-" + Math.floor(Math.random() * 10000);
const DEVICE_A = "device-id-aaa-111";
const DEVICE_B = "device-id-bbb-222";

async function supabaseFetch(url, method, body, apiKey) {
    return new Promise((resolve, reject) => {
        const options = {
            method: method,
            headers: {
                "apikey": apiKey,
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            }
        };

        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(data ? JSON.parse(data) : null);
                } catch (e) {
                    console.error("Parse error", data);
                    resolve(null);
                }
            });
        });

        req.on('error', (e) => reject(e));
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runTest() {
    console.log(`\n🧪 STARTING RPC LOGIC TEST`);
    console.log(`🔑 Test Key: ${TEST_LICENSE_KEY}`);
    console.log(`-----------------------------------------------`);

    // 0. Setup: Create License directly (using normal insert)
    if (!SERVICE_ROLE_KEY) {
        console.warn("SUPABASE_SERVICE_ROLE_KEY not set. License insert may fail if RLS is enabled.");
    }
    await supabaseFetch(
        `${CONFIG.supabaseUrl}/rest/v1/licenses`,
        "POST",
        { license_key: TEST_LICENSE_KEY, is_active: true },
        SERVICE_ROLE_KEY || CONFIG.supabaseKey
    );
    console.log("✅ License created in DB.");

    // 1. Device A Claims (First Time)
    console.log("\nStep 1: Device A calling claim_license RPC...");
    const resA = await callRpc(TEST_LICENSE_KEY, DEVICE_A);
    console.log("Result:", resA);

    if (resA && resA.success && resA.status === 'newly_claimed') {
        console.log("✅ Device A Successfully Claimed License.");
    } else {
        console.error("❌ Device A Failed to Claim (Unexpected).");
    }

    // 2. Device B Claims (Should Fail)
    console.log("\nStep 2: Device B calling claim_license RPC...");
    const resB = await callRpc(TEST_LICENSE_KEY, DEVICE_B);
    console.log("Result:", resB);

    if (resB && !resB.success && resB.message.includes("locked")) {
        console.log("✅ Device B was Rejected (Expected).");
    } else {
        console.error("❌ Device B was NOT rejected properly (Unexpected).");
    }

    // 3. Device A Checks Again (Should Succeed)
    console.log("\nStep 3: Device A calling claim_license RPC again...");
    const resARetry = await callRpc(TEST_LICENSE_KEY, DEVICE_A);
    console.log("Result:", resARetry);

    if (resARetry && resARetry.success && resARetry.status === 'existing_match') {
        console.log("✅ Device A Recognized (Expected).");
    } else {
        console.error("❌ Device A Retry Failed (Unexpected).");
    }
}

async function callRpc(key, deviceId) {
    return await supabaseFetch(
        `${CONFIG.supabaseUrl}/rest/v1/rpc/claim_license`,
        "POST",
        { p_license_key: key, p_hardware_id: deviceId },
        CONFIG.supabaseKey
    );
}

runTest();
