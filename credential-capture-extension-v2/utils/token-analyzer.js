/**
 * Token Analyzer - Identify type, decode JWTs, probe API access
 * (AUTHORIZED SECURITY TESTING ONLY)
 */
const TokenAnalyzer = {
    TOKEN_TYPES: ['jwt', 'oauth_bearer', 'oauth_refresh', 'session', 'opaque'],

    /**
     * Identify token type from string value
     * @param {string} value - Raw token or "Bearer <token>"
     * @returns {{ type: string, raw: string }}
     */
    identifyType(value) {
        if (!value || typeof value !== 'string') {
            return { type: 'opaque', raw: '' };
        }
        const trimmed = value.trim();
        let raw = trimmed;

        if (/^Bearer\s+/i.test(trimmed)) {
            raw = trimmed.replace(/^Bearer\s+/i, '').trim();
            if (this._looksLikeJwt(raw)) return { type: 'oauth_bearer', raw, scheme: 'Bearer' };
            return { type: 'oauth_bearer', raw, scheme: 'Bearer' };
        }
        if (/^Basic\s+/i.test(trimmed)) {
            return { type: 'opaque', raw: trimmed.split(/\s/)[1] || '', scheme: 'Basic' };
        }
        if (this._looksLikeJwt(raw)) return { type: 'jwt', raw };
        if (/^[a-f0-9]{32,}$/i.test(raw) || raw.length >= 20 && /^[A-Za-z0-9_-]+$/.test(raw)) {
            return { type: 'session', raw };
        }
        return { type: 'opaque', raw };
    },

    _looksLikeJwt(str) {
        if (!str || str.length < 20) return false;
        const parts = str.split('.');
        return parts.length === 3 &&
            /^[A-Za-z0-9_-]+$/.test(parts[0]) &&
            /^[A-Za-z0-9_-]+$/.test(parts[1]) &&
            /^[A-Za-z0-9_-]*$/.test(parts[2]);
    },

    /**
     * Decode JWT without verifying signature (inspection only)
     * @param {string} token - JWT string
     * @returns {{ header: object, payload: object, claims: object } | null}
     */
    decodeJwt(token) {
        const { raw } = this.identifyType(token);
        if (!raw || !this._looksLikeJwt(raw)) return null;
        const parts = raw.split('.');
        try {
            const header = JSON.parse(this._base64UrlDecode(parts[0]));
            const payload = JSON.parse(this._base64UrlDecode(parts[1]));
            const claims = { ...payload };
            if (payload.iat != null) claims.iat_iso = new Date(payload.iat * 1000).toISOString();
            if (payload.exp != null) {
                claims.exp_iso = new Date(payload.exp * 1000).toISOString();
                claims.expired = payload.exp * 1000 < Date.now();
            }
            if (payload.nbf != null) claims.nbf_iso = new Date(payload.nbf * 1000).toISOString();
            return { header, payload, claims };
        } catch (e) {
            return null;
        }
    },

    _base64UrlDecode(str) {
        let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        const pad = base64.length % 4;
        if (pad) base64 += '===='.slice(0, 4 - pad);
        try {
            return decodeURIComponent(escape(atob(base64)));
        } catch {
            return atob(base64);
        }
    },

    /**
     * Full analysis: type + decoded JWT if applicable
     * @param {string} value - Token string
     * @returns {object}
     */
    analyze(value) {
        if (!value || typeof value !== 'string') return { type: 'opaque', decoded: null };
        const identified = this.identifyType(value);
        const out = {
            type: identified.type,
            scheme: identified.scheme || null,
            decoded: null,
            length: identified.raw ? identified.raw.length : 0
        };
        if (identified.type === 'jwt' || identified.type === 'oauth_bearer') {
            const decoded = this.decodeJwt(identified.raw);
            if (decoded) {
                out.decoded = {
                    header: decoded.header,
                    claims: decoded.claims,
                    alg: decoded.header.alg,
                    expired: decoded.claims.expired
                };
            }
        }
        return out;
    },

    /**
     * Analyze all token-like entries in sensitiveData and return a map of analyses
     * @param {object} sensitiveData - e.g. { password: {...}, token: {...}, authorization: {...} }
     * @returns {object} - { fieldName: analyzeResult }
     */
    analyzeSensitiveData(sensitiveData) {
        if (!sensitiveData || typeof sensitiveData !== 'object') return {};
        const tokenLikeKeys = ['token', 'access_token', 'id_token', 'refresh_token', 'bearer', 'auth', 'authorization', 'session', 'jwt', 'api_key', 'apikey'];
        const result = {};
        for (const [key, info] of Object.entries(sensitiveData)) {
            const keyLower = key.toLowerCase();
            const isTokenLike = tokenLikeKeys.some(t => keyLower.includes(t)) ||
                (info && (info.type === 'token' || info.type === 'api_key'));
            if (!isTokenLike) continue;
            const value = info && typeof info.value !== 'undefined' ? info.value : info;
            const str = typeof value === 'string' ? value : (value && value.token) || '';
            if (str) result[key] = this.analyze(str);
        }
        return result;
    },

    /**
     * Test token against common API endpoints to see what access it provides
     * @param {string} token - Raw token (or "Bearer <token>")
     * @param {string} baseOrigin - e.g. "https://api.example.com"
     * @param {string} tokenType - 'jwt' | 'oauth_bearer' | 'session'
     * @param {string[]} endpoints - Paths to try, e.g. ['/api/me', '/api/user']
     * @param {number} timeoutMs - Timeout per request
     * @returns {Promise<Array<{ url: string, status: number, ok: boolean, access: string }>>}
     */
    async testAgainstEndpoints(token, baseOrigin, tokenType, endpoints, timeoutMs = 5000) {
        if (!token || !baseOrigin || !endpoints || endpoints.length === 0) return [];
        const { raw } = this.identifyType(token);
        const authHeader = raw ? `Bearer ${raw}` : token;
        const base = baseOrigin.replace(/\/$/, '');
        const results = [];

        for (const path of endpoints.slice(0, 5)) {
            const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
            try {
                const controller = new AbortController();
                const id = setTimeout(() => controller.abort(), timeoutMs);
                const res = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': authHeader,
                        'Accept': 'application/json'
                    },
                    signal: controller.signal,
                    mode: 'cors'
                });
                clearTimeout(id);
                const access = res.ok ? 'granted' : (res.status === 401 || res.status === 403 ? 'denied' : 'unknown');
                results.push({ url, status: res.status, ok: res.ok, access });
            } catch (err) {
                results.push({ url, status: 0, ok: false, access: 'error', error: err.message || 'Network/CORS error' });
            }
        }
        return results;
    }
};
