const Logger = {
    _0l: 'INFO',
    _0l1(l) { this._0l = l; },
    _0l2(m, l = 'INFO') {
        const p = { 'DEBUG': 0, 'INFO': 1, 'WARN': 2, 'ERROR': 3 };
        if (p[l] >= p[this._0l]) { }
    }
};
