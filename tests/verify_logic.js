// tests/verify_logic.js

// Mock Data representing what comes from Supabase
const mockResponseFromSupabase = {
    success: true,
    status: 'valid',
    account: {
        id: 1,
        email: 'test@example.com',
        // This is the formatted JSON string we expect from the DB
        cookies: `[{"name":"netflix-sans-normal-3-loaded","path":"/","value":"true","domain":".netflix.com","secure":false,"session":false,"storeId":null,"hostOnly":false,"httpOnly":false,"sameSite":null,"expirationDate":1777288991.732274},{"name":"SecureNetflixId","path":"/","value":"v%3D3%26mac%3DAQEAEQABABSkftEib2gRw5kZBeKl134obWeet5inHUg.%26dt%3D1769512882382","domain":".netflix.com","secure":true,"session":false,"storeId":null,"hostOnly":false,"httpOnly":true,"sameSite":"strict","expirationDate":1785064882.588209}]`
    }
};

// Mock Config
const config = {
    targetDomain: "https://www.netflix.com",
    baseDomain: ".netflix.com"
};

// Simulation of the logic in background.js
async function injectCookies(cookies) {
    let cookieList = cookies;
    if (typeof cookieList === "string") {
        try {
            cookieList = JSON.parse(cookieList);
        } catch (e) {
            console.error("JSON Parse Error");
            throw e;
        }
    }

    if (!Array.isArray(cookieList)) throw new Error("Invalid cookie format");

    console.log(`Successfully parsed ${cookieList.length} cookies.`);

    const processedCookies = [];

    for (const cookie of cookieList) {
        let domain = cookie.domain || config.baseDomain;
        const newCookie = {
            url: config.targetDomain,
            name: cookie.name,
            value: cookie.value,
            domain: domain,
            path: cookie.path || "/",
            secure: true,
            httpOnly: cookie.httpOnly || false,
            sameSite: "no_restriction"
        };
        processedCookies.push(newCookie);
    }

    return processedCookies;
}

// Run Test
(async () => {
    try {
        console.log("Testing Cookie Injection Logic...");

        // check if 'cookies' property exists as expected
        if (!mockResponseFromSupabase.account.cookies) {
            throw new Error("Missing 'cookies' property in mock response.");
        }

        const result = await injectCookies(mockResponseFromSupabase.account.cookies);

        if (result.length > 0 && result[0].url === config.targetDomain) {
            console.log("✅ Verification Successful: Logic correctly handles the new 'cookies' field and stringified JSON.");
            console.log("Sample Data:", result[0]);
        } else {
            console.error("❌ Verification Failed: Result was empty or malformed.");
        }
    } catch (e) {
        console.error("❌ Verification Failed with Error:", e.message);
        process.exit(1);
    }
})();
