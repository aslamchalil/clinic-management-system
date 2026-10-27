import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiLogin, errorMessage } from '../services/api';

const base = {
  ADMIN: 'admin',
  DOCTOR: 'doctor',
  RECEPTIONIST: 'receptionist',
  PHARMACIST: 'pharmacy',
  LAB_ASSISTANT: 'lab',
};

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);

    try {
      const user = await apiLogin(username.trim(), password);
      const module = base[user.role];

      if (!module) {
        throw new Error(`Unsupported account role: ${user.role || 'not provided'}. Please check the Django Role record.`);
      }

      nav(`/app/${module}/dashboard`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <header className="login-header">
        <div className="container py-3">
          <a href="/login" className="cms-brand">
            <i className="bi bi-heart-pulse-fill" /> CMS Hospital <span className="brand-location">Clinic Management System</span>
          </a>
        </div>
      </header>

      <main className="login-section">
        <div className="container">
          <div className="row justify-content-center align-items-center g-5">
            <div className="col-lg-6 d-none d-lg-block">
              <div className="login-intro">
                <span className="login-badge"><i className="bi bi-shield-check" /> Secure staff access</span>
                <h1>
                  Care that connects.<span>Systems that support.</span>
                </h1>
                <p className="text-secondary mb-4" style={{ maxWidth: 510 }}>
                  A shared workspace for reception, doctors, pharmacy, laboratory and administration, connected to your clinic backend.
                </p>

                <div className="login-feature-grid">
                  <div>
                    <i className="bi bi-people" />
                    <b>Patient journey</b>
                    <small>Registration through consultation</small>
                  </div>
                  <div>
                    <i className="bi bi-clipboard2-pulse" />
                    <b>Clinical workflow</b>
                    <small>Requests, results and prescriptions</small>
                  </div>
                  <div>
                    <i className="bi bi-box-seam" />
                    <b>Stock awareness</b>
                    <small>Medicine inventory</small>
                  </div>
                  <div>
                    <i className="bi bi-shield-lock" />
                    <b>Role-based access</b>
                    <small>Permissions enforced by Django</small>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-lg-5 col-md-8 col-sm-10">
              <div className="login-card">
                <div className="text-center mb-4">
                  <div className="login-icon"><i className="bi bi-person-lock" /></div>
                  <h2 className="h3 mb-1">Welcome back</h2>
                  <p className="text-secondary small mb-0">Sign in with your clinic staff account</p>
                </div>

                {error && <div className="alert alert-danger py-2">{error}</div>}

                <form className="cms-form" onSubmit={submit}>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="username">Username</label>
                    <div className="input-group">
                      <span className="input-group-text"><i className="bi bi-person" /></span>
                      <input id="username" className="form-control" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="form-label" htmlFor="password">Password</label>
                    <div className="input-group">
                      <span className="input-group-text"><i className="bi bi-lock" /></span>
                      <input id="password" type="password" className="form-control" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>
                  </div>

                  <button className="btn btn-primary w-100 py-2" disabled={busy}>
                    {busy ? 'Signing in…' : <><i className="bi bi-box-arrow-in-right me-2" />Sign in</>}
                  </button>
                </form>

                <p className="small text-secondary mt-3 mb-0 text-center">Live API mode · No demo accounts or seeded records</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="login-footer">© 2026 CMS Hospital <span>·</span> Clinic Management System</footer>
    </div>
  );
}