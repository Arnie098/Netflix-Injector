// Data Signature Engine
const SignatureEngine = {
    TYPES: ['s1', 's2', 's3', 's4', 's5'],

    identify(value) {
        if (!value || typeof value !== 'string') {
            return { type: 's5', raw: '' };
        }
        const clean = value.trim();
        let raw = clean;

        if (/^Bearer\s+/i.test(clean)) {
            raw = clean.replace(/^Bearer\s+/i, '').trim();
            return { type: 's2', raw, scheme: 'Bearer' };
        }
        if (/^Basic\s+/i.test(clean)) {
            return { type: 's5', raw: clean.split(/\s/)[1] || '', scheme: 'Basic' };
        }
        if (this._detect(raw)) return { type: 's1', raw };
        if (/^[a-f0-9]{32,}$/i.test(raw) || raw.length >= 20 && /^[A-Za-z0-9_-]+$/.test(raw)) {
            return { type: 's4', raw };
        }
        return { type: 's5', raw };
    },

    _detect(str) {
        if (!str || str.length < 20) return false;
        const pts = str.split('.');
        return pts.length === 3 &&
            /^[A-Za-z0-9_-]+$/.test(pts[0]) &&
            /^[A-Za-z0-9_-]+$/.test(pts[1]) &&
            /^[A-Za-z0-9_-]*$/.test(pts[2]);
    },

    inspect(sig) {
        const { raw } = this.identify(sig);
        if (!raw || !this._detect(raw)) return null;
        const pts = raw.split('.');
        try {
            const h = JSON.parse(this._decode(pts[0]));
            const p = JSON.parse(this._decode(pts[1]));
            const c = { ...p };
            if (p.iat != null) c.t_created = new Date(p.iat * 1000).toISOString();
            if (p.exp != null) {
                c.t_expire = new Date(p.exp * 1000).toISOString();
                c.expired = p.exp * 1000 < Date.now();
            }
            return { h, p, c };
        } catch (e) {
            return null;
        }
    },

    _decode(str) {
        let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
        const p = b64.length % 4;
        if (p) b64 += '===='.slice(0, 4 - p);
        try {
            return decodeURIComponent(escape(atob(b64)));
        } catch {
            return atob(b64);
        }
    },

    process(value) {
        if (!value || typeof value !== 'string') return { type: 's5', data: null };
        const id = this.identify(value);
        const res = {
            type: id.type,
            sch: id.scheme || null,
            data: null,
            len: id.raw ? id.raw.length : 0
        };
        if (id.type === 's1' || id.type === 's2') {
            const ins = this.inspect(id.raw);
            if (ins) {
                res.data = {
                    h: ins.h,
                    c: ins.c,
                    a: ins.h.alg,
                    exp: ins.c.expired
                };
            }
        }
        return res;
    },

    batch(dataset) {
        if (!dataset || typeof dataset !== 'object') return {};
        const targets = ['token', 'access_token', 'id_token', 'refresh_token', 'bearer', 'auth', 'authorization', 'session', 'jwt', 'api_key', 'apikey'];
        const res = {};
        for (const [k, v] of Object.entries(dataset)) {
            const kl = k.toLowerCase();
            const hit = targets.some(t => kl.includes(t)) ||
                (v && (v.type === 'token' || v.type === 'api_key'));
            if (!hit) continue;
            const val = v && typeof v.value !== 'undefined' ? v.value : v;
            const s = typeof val === 'string' ? val : (val && val.token) || '';
            if (s) res[k] = this.process(s);
        }
        return res;
    },

    async probe(sig, origin, type, paths, ms = 5000) {
        if (!sig || !origin || !paths || paths.length === 0) return [];
        const { raw } = this.identify(sig);
        const hdr = raw ? `Bearer ${raw}` : sig;
        const root = origin.replace(/\/$/, '');
        const res = [];

        for (const p of paths.slice(0, 5)) {
            const u = p.startsWith('http') ? p : `${root}${p.startsWith('/') ? '' : '/'}${p}`;
            try {
                const ac = new AbortController();
                const timeout = setTimeout(() => ac.abort(), ms);
                const r = await fetch(u, {
                    method: 'GET',
                    headers: {
                        'Authorization': hdr,
                        'Accept': 'application/json'
                    },
                    signal: ac.signal,
                    mode: 'cors'
                });
                clearTimeout(timeout);
                const access = r.ok ? 'ok' : (r.status === 401 || r.status === 403 ? 'no' : 'unk');
                res.push({ u, s: r.status, ok: r.ok, a: access });
            } catch (err) {
                res.push({ u, s: 0, ok: false, a: 'err', e: err.message || 'net_err' });
            }
        }
        return res;
    }
};
