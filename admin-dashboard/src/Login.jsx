import React, { useState } from 'react';

function Login({ onLogin }) {
    const [apiKey, setApiKey] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/v1/admin/verify', {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            if (res.ok) {
                localStorage.setItem('admin_api_key', apiKey);
                onLogin(apiKey);
            } else {
                setError('Invalid API Key. Access Denied.');
            }
        } catch (err) {
            setError('Connection failed. Please check the backend.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container animate-fade">
            <div className="login-card glass">
                <div className="login-header">
                    <div className="logo-icon large">NI</div>
                    <h1>Protected Access</h1>
                    <p>Provide your Admin API Key to synchronize with the node</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <input
                            type="password"
                            placeholder="Enter Admin API Key..."
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            required
                        />
                    </div>

                    {error && <div className="error-message">{error}</div>}

                    <button type="submit" className="login-btn" disabled={loading}>
                        {loading ? 'Authenticating...' : 'Establish Connection'}
                    </button>
                </form>

                <div className="login-footer">
                    Authentication required for administrative CRUD operations.
                </div>
            </div>
        </div>
    );
}

export default Login;
