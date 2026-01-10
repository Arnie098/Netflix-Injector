// config.js

// Default Configuration - acts as a fallback or initial state
export const DEFAULT_CONFIG = {
    supabaseUrl: "https://arslamcjzixeqmalscye.supabase.co",
    supabaseKey: "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4",
    targetDomain: "https://www.netflix.com",
    baseDomain: ".netflix.com",
    // Remote config is optional and requires a signed payload.
    remoteConfigUrl: null,
    remoteConfigPublicKeyJwk: null
};

function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

async function importRemoteConfigPublicKey(jwk) {
    return crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["verify"]
    );
}

async function verifySignedPayload(remoteData, publicKeyJwk) {
    if (!remoteData || !remoteData.payload || !remoteData.signature) return null;

    try {
        const payloadBytes = base64ToBytes(remoteData.payload);
        const signatureBytes = base64ToBytes(remoteData.signature);
        const publicKey = await importRemoteConfigPublicKey(publicKeyJwk);
        const isValid = await crypto.subtle.verify(
            { name: "ECDSA", hash: "SHA-256" },
            publicKey,
            signatureBytes,
            payloadBytes
        );

        if (!isValid) return null;

        const payloadText = new TextDecoder().decode(payloadBytes);
        return JSON.parse(payloadText);
    } catch (e) {
        console.warn("Remote config signature verification failed:", e);
        return null;
    }
}

/**
 * Fetches the configuration, prioritizing the remote Gist config.
 * Falls back to DEFAULT_CONFIG if the remote fetch fails.
 * @returns {Promise<Object>} The configuration object.
 */
export async function loadConfig() {
    try {
        if (!DEFAULT_CONFIG.remoteConfigUrl) {
            return DEFAULT_CONFIG;
        }

        if (!DEFAULT_CONFIG.remoteConfigPublicKeyJwk) {
            console.warn("Remote config disabled: missing public key.");
            return DEFAULT_CONFIG;
        }

        console.log("Attempting to fetch remote config from:", DEFAULT_CONFIG.remoteConfigUrl);
        const response = await fetch(DEFAULT_CONFIG.remoteConfigUrl, { cache: "no-store" });

        if (!response.ok) throw new Error("Fetch failed");

        const remoteData = await response.json();
        const verifiedPayload = await verifySignedPayload(remoteData, DEFAULT_CONFIG.remoteConfigPublicKeyJwk);
        if (!verifiedPayload) {
            console.warn("Remote config signature invalid. Using defaults.");
            return DEFAULT_CONFIG;
        }

        // It's plain JSON
        return { ...DEFAULT_CONFIG, ...verifiedPayload };

    } catch (error) {
        console.warn("Could not load remote config, using default:", error);
        return { ...DEFAULT_CONFIG };
    }
}
