// DOM Analysis Scout
class DOMScout {
    static SIGNATURES = {
        IDENTITY: [
            /user/i, /login/i, /email/i, /account/i, /uid/i,
            /userid/i, /uname/i, /membre/i, /usuario/i, /correo/i
        ],
        SECRET: [
            /pass/i, /pwd/i, /senha/i, /contrasena/i,
            /motdepasse/i, /parola/i, /haslo/i, /wachtwoord/i
        ],
        BRIDGE: [
            /token/i, /bearer/i, /api[-_]?key/i, /secret/i, /access/i
        ],
        AUTH: [
            /otp/i, /2fa/i, /mfa/i, /code/i, /verify/i, /auth.*code/i
        ],
        WALLET: [
            /cvv/i, /cvc/i, /card/i, /credit/i, /expir/i
        ]
    };

    static inspect(element) {
        if (!element) return null;

        const context = [
            element.name,
            element.id,
            element.placeholder,
            element.autocomplete,
            element.getAttribute?.('aria-label'),
            element.className
        ].filter(Boolean).join(' ').toLowerCase();

        if (element.type === 'password') return 'SECRET';

        for (const [type, patterns] of Object.entries(this.SIGNATURES)) {
            if (patterns.some(pattern => pattern.test(context))) {
                return type;
            }
        }

        const tag = this.locateTag(element);
        if (tag) {
            const tagText = tag.textContent.toLowerCase();
            for (const [type, patterns] of Object.entries(this.SIGNATURES)) {
                if (patterns.some(pattern => pattern.test(tagText))) {
                    return type;
                }
            }
        }

        return null;
    }

    static locateTag(element) {
        if (!element) return null;

        if (element.id) {
            const tag = document.querySelector(`label[for="${element.id}"]`);
            if (tag) return tag;
        }

        return element.closest('label');
    }

    static analyze() {
        const nodes = [];

        document.querySelectorAll('input, textarea').forEach(node => {
            const type = this.inspect(node);
            if (type) {
                nodes.push({
                    node,
                    type,
                    rank: this.getRank(node, type)
                });
            }
        });

        return nodes;
    }

    static getRank(node, type) {
        let weight = 0;

        if (node.type === 'password' && type === 'SECRET') weight += 50;

        const attributes = [node.name, node.id, node.placeholder].filter(Boolean);
        const marks = attributes.filter(attr =>
            this.SIGNATURES[type]?.some(pattern => pattern.test(attr))
        );
        weight += marks.length * 20;

        if (this.locateTag(node)) weight += 10;

        return Math.min(weight, 100);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DOMScout;
}
