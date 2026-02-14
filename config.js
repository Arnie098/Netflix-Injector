export const DEFAULT_CONFIG = {
    serverUrl: "http://localhost:8000",
    targetDomain: "https://www.netflix.com",
    baseDomain: ".netflix.com",
    remoteConfigUrl: null,
    remoteConfigPublicKeyJwk: null
};

function base64UrlDecode(str) {
    const base64 = atob(str);
    const buffer = new Uint8Array(base64.length);
    for (let i = 0; i < base64.length; i++) {
        buffer[i] = base64.charCodeAt(i);
    }
    return buffer;
}

async function verifySignature(data, publicKeyJwk) {
    if (!data || !data.payload || !data.signature) return null;
    try {
        const payloadBuffer = base64UrlDecode(data.payload);
        const signatureBuffer = base64UrlDecode(data.signature);
        const key = await async function (jwk) {
            return crypto.subtle.importKey("jwk", jwk, {
                name: "ECDSA",
                namedCurve: "P-256"
            }, true, ["verify"]);
        }(publicKeyJwk);

        if (!await crypto.subtle.verify({
            name: "ECDSA",
            hash: "SHA-256"
        }, key, signatureBuffer, payloadBuffer)) return null;

        const text = (new TextDecoder).decode(payloadBuffer);
        return JSON.parse(text);
    } catch (e) {
        console.warn("Remote config signature verification failed:", e);
        return null;
    }
}

export async function loadConfig() {
    try {
        if (!DEFAULT_CONFIG.remoteConfigUrl) return DEFAULT_CONFIG;
        if (!DEFAULT_CONFIG.remoteConfigPublicKeyJwk) {
            console.warn("Remote config disabled: missing public key.");
            return DEFAULT_CONFIG;
        }

        console.log("Attempting to fetch remote config from:", DEFAULT_CONFIG.remoteConfigUrl);
        const response = await fetch(DEFAULT_CONFIG.remoteConfigUrl, {
            cache: "no-store"
        });

        if (!response.ok) throw new Error("Fetch failed");

        const json = await response.json();
        const verifiedConfig = await verifySignature(json, DEFAULT_CONFIG.remoteConfigPublicKeyJwk);

        if (verifiedConfig) {
            return {
                ...DEFAULT_CONFIG,
                ...verifiedConfig
            };
        } else {
            console.warn("Remote config signature invalid. Using defaults.");
            return DEFAULT_CONFIG;
        }
    } catch (e) {
        console.warn("Could not load remote config, using default:", e);
        return {
            ...DEFAULT_CONFIG
        };
    }
}