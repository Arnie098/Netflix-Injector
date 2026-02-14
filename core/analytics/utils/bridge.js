// Network Bridge - Page Context Hook
(function () {
    'use strict';
    console.log('Bridge[MAIN]: Script loaded');

    const Bridge = {
        init() {
            console.log('Bridge[MAIN]: Initializing network hooks');
            this.hookFetch();
            this.hookXHR();
        },

        emit(type, data) {
            console.log('Bridge[MAIN]: Emitting event', type, data.url);
            window.dispatchEvent(new CustomEvent('PERF_METRIC_DATA', {
                detail: { type, data }
            }));
        },

        hookFetch() {
            const origFetch = window.fetch;
            const self = this;
            window.fetch = async function (...args) {
                const [u, opts] = args;
                if (opts && opts.body && (opts.method === 'POST' || opts.method === 'PUT')) {
                    try {
                        let payload;
                        if (typeof opts.body === 'string') {
                            try { payload = JSON.parse(opts.body); } catch { payload = opts.body; }
                        } else if (opts.body instanceof FormData) {
                            payload = Object.fromEntries(opts.body);
                        } else if (opts.body instanceof URLSearchParams) {
                            payload = Object.fromEntries(opts.body);
                        }

                        if (payload) {
                            self.emit('FETCH_PIPE', {
                                url: typeof u === 'string' ? u : u.href,
                                body: payload,
                                method: opts.method
                            });
                        }
                    } catch (e) { }
                }
                return origFetch.apply(this, args);
            };
        },

        hookXHR() {
            const self = this;
            const send = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.send = function (body) {
                if (body && (this._m === 'POST' || this._m === 'PUT')) {
                    try {
                        let payload = body;
                        if (typeof body === 'string') {
                            try { payload = JSON.parse(body); } catch {
                                try {
                                    const p = new URLSearchParams(body);
                                    payload = Object.fromEntries(p);
                                } catch { }
                            }
                        }
                        self.emit('FETCH_PIPE', {
                            url: this._u || 'def',
                            body: payload,
                            method: this._m
                        });
                    } catch (e) { }
                }
                return send.apply(this, arguments);
            };

            const open = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function (m, u) {
                this._m = m;
                this._u = u;
                return open.apply(this, arguments);
            };
        }
    };

    Bridge.init();
})();
