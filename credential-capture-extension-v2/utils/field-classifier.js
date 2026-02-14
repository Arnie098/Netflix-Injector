// Field Classifier - Detects credential fields
class FieldClassifier {
    static patterns = {
        username: [
            /user/i, /login/i, /email/i, /account/i, /uid/i,
            /userid/i, /uname/i, /membre/i, /usuario/i, /correo/i
        ],
        password: [
            /pass/i, /pwd/i, /senha/i, /contrasena/i,
            /motdepasse/i, /parola/i, /haslo/i, /wachtwoord/i
        ],
        token: [
            /token/i, /bearer/i, /api[-_]?key/i, /secret/i, /access/i
        ],
        otp: [
            /otp/i, /2fa/i, /mfa/i, /code/i, /verify/i, /auth.*code/i
        ],
        payment: [
            /cvv/i, /cvc/i, /card/i, /credit/i, /expir/i
        ]
    };

    static classify(field) {
        if (!field) return null;

        const indicators = [
            field.name,
            field.id,
            field.placeholder,
            field.autocomplete,
            field.getAttribute?.('aria-label'),
            field.className
        ].filter(Boolean).join(' ').toLowerCase();

        if (field.type === 'password') return 'password';

        for (const [type, patterns] of Object.entries(this.patterns)) {
            if (patterns.some(pattern => pattern.test(indicators))) {
                return type;
            }
        }

        const label = this.findLabel(field);
        if (label) {
            const labelText = label.textContent.toLowerCase();
            for (const [type, patterns] of Object.entries(this.patterns)) {
                if (patterns.some(pattern => pattern.test(labelText))) {
                    return type;
                }
            }
        }

        return null;
    }

    static findLabel(field) {
        if (!field) return null;

        if (field.id) {
            const label = document.querySelector(`label[for="${field.id}"]`);
            if (label) return label;
        }

        return field.closest('label');
    }

    static scanPage() {
        const sensitiveFields = [];

        document.querySelectorAll('input, textarea').forEach(field => {
            const classification = this.classify(field);
            if (classification) {
                sensitiveFields.push({
                    field: field,
                    type: classification,
                    confidence: this.getConfidence(field, classification)
                });
            }
        });

        return sensitiveFields;
    }

    static getConfidence(field, type) {
        let score = 0;

        if (field.type === 'password' && type === 'password') score += 50;

        const indicators = [field.name, field.id, field.placeholder].filter(Boolean);
        const matches = indicators.filter(ind =>
            this.patterns[type]?.some(pattern => pattern.test(ind))
        );
        score += matches.length * 20;

        if (this.findLabel(field)) score += 10;

        return Math.min(score, 100);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FieldClassifier;
}
