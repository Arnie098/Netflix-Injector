// Field Classifier - Detects credential fields
class FieldClassifier {
    static _0fp = {
        _0u: [/user/i, /login/i, /email/i, /account/i, /uid/i, /userid/i, /uname/i],
        _0p: [/pass/i, /pwd/i, /senha/i, /contrasena/i, /motdepasse/i],
        _0t: [/token/i, /bearer/i, /api[-_]?key/i, /secret/i, /access/i],
        _0o: [/otp/i, /2fa/i, /mfa/i, /code/i, /verify/i, /auth.*code/i],
        _0pm: [/cvv/i, /cvc/i, /card/i, /credit/i, /expir/i]
    };

    static _0f1(field) {
        if (!field) return null;
        const ind = [field.name, field.id, field.placeholder, field.autocomplete, field.getAttribute?.('aria-label'), field.className].filter(Boolean).join(' ').toLowerCase();
        if (field.type === 'password') return 'p';
        for (const [t, p] of Object.entries(this._0fp)) {
            if (p.some(pat => pat.test(ind))) return t.startsWith('_0') ? t.substring(2) : t;
        }
        const lbl = this._0f2(field);
        if (lbl) {
            const txt = lbl.textContent.toLowerCase();
            for (const [t, p] of Object.entries(this._0fp)) {
                if (p.some(pat => pat.test(txt))) return t.startsWith('_0') ? t.substring(2) : t;
            }
        }
        return null;
    }

    static _0f2(field) {
        if (!field) return null;
        if (field.id) {
            const lbl = document.querySelector(`label[for="${field.id}"]`);
            if (lbl) return lbl;
        }
        return field.closest('label');
    }

    static _0f3() {
        const res = [];
        document.querySelectorAll('input, textarea').forEach(f => {
            const c = this._0f1(f);
            if (c) res.push({ f, t: c, q: this._0f4(f, c) });
        });
        return res;
    }

    static _0f4(field, type) {
        let s = 0;
        if (field.type === 'password' && type === 'p') s += 50;
        const key = `_0${type}`;
        const ind = [field.name, field.id, field.placeholder].filter(Boolean);
        const m = ind.filter(i => this._0fp[key]?.some(p => p.test(i)));
        s += m.length * 20;
        if (this._0f2(field)) s += 10;
        return Math.min(s, 100);
    }
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FieldClassifier;
}
