import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { clearAuth } from '../services/api';

export const roleMeta = {
  ADMIN: {
    label: 'Administrator',
    base: '/app/admin',
    links: [
      ['Dashboard', 'speedometer2', 'dashboard'],
      ['Staff', 'people', 'staff'],
      ['Doctors', 'person-badge', 'doctors'],
      ['Departments', 'diagram-3', 'departments'],
      ['Specializations', 'mortarboard', 'specializations'],
      ['Medicines', 'capsule', 'medicines'],
      ['Lab Tests', 'clipboard2-pulse', 'lab-tests'],
      ['Activity & Sessions', 'activity', 'activity'],
    ],
  },
  RECEPTIONIST: {
    label: 'Receptionist',
    base: '/app/receptionist',
    links: [
      ['Dashboard', 'speedometer2', 'dashboard'],
      ['Patients', 'people', 'patients'],
      ['Register Patient', 'person-plus', 'patient-register'],
      ['Appointments', 'calendar-check', 'appointments'],
      ['Billing', 'receipt', 'billing'],
      ['Tokens', 'ticket-perforated', 'tokens'],
    ],
  },
  DOCTOR: {
    label: 'Doctor',
    base: '/app/doctor',
    links: [
      ['Dashboard', 'speedometer2', 'dashboard'],
      ['Appointments', 'calendar-check', 'appointments'],
      ['Token Queue', 'ticket-perforated', 'token-queue'],
      ['Consultation', 'journal-medical', 'consultation'],
      ['History', 'clock-history', 'history'],
      ['Prescriptions', 'prescription2', 'prescriptions'],
      ['Lab Requests', 'clipboard2-pulse', 'lab-requests'],
      ['Lab Results', 'file-earmark-medical', 'lab-results'],
    ],
  },
  PHARMACIST: {
    label: 'Pharmacist',
    base: '/app/pharmacy',
    links: [
      ['Dashboard', 'speedometer2', 'dashboard'],
      ['Prescriptions', 'prescription2', 'prescriptions'],
      ['Stock', 'box-seam', 'stock'],
      ['Billing', 'receipt', 'billing'],
      ['Dispensing', 'bag-check', 'dispensing'],
    ],
  },
  LAB_ASSISTANT: {
    label: 'Lab Assistant',
    base: '/app/lab',
    links: [
      ['Dashboard', 'speedometer2', 'dashboard'],
      ['Requests', 'clipboard2-pulse', 'requests'],
      ['Billing', 'receipt', 'billing'],
      ['Processing', 'hourglass-split', 'processing'],
      ['Results', 'file-earmark-medical', 'results'],
      ['Consumables', 'boxes', 'inventory'],
    ],
  },
};

export const titles = {
  dashboard: 'Dashboard',
  staff: 'Staff Management',
  doctors: 'Doctors',
  departments: 'Departments',
  medicines: 'Medicines',
  'lab-tests': 'Lab Tests',
  activity: 'Activity & Login Sessions',
  patients: 'Patients',
  'patient-register': 'Register Patient',
  appointments: 'Appointments',
  billing: 'Billing',
  tokens: 'Token Queue',
  'token-queue': 'Token Queue',
  consultation: 'Consultation',
  history: 'Consultation History',
  prescriptions: 'Prescriptions',
  'lab-requests': 'Lab Requests',
  'lab-results': 'Lab Results',
  requests: 'Lab Requests',
  processing: 'Lab Processing',
  results: 'Lab Results',
  stock: 'Medicine Stock',
  dispensing: 'Dispensing',
  inventory: 'Lab Consumables',
};

function normalizeRole(role) {
  const value = String(role || '').toUpperCase();
  return value === 'LAB_TECHNICIAN' ? 'LAB_ASSISTANT' : value;
}

function getDisplayName(user) {
  if (!user) return 'User';
  const full = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.full_name || user.name || user.username || 'User';
  return full.trim() || 'User';
}

export function Shell({ user, children, page }) {
  const [mobile, setMobile] = useState(false);
  const nav = useNavigate();

  const resolvedRole = normalizeRole(user?.role);
  const meta = roleMeta[resolvedRole] || roleMeta.ADMIN;
  const title = titles[page] || 'Dashboard';

  function logout() {
    clearAuth();
    nav('/login', { replace: true });
  }

  function toggleTheme() {
    const next = document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-bs-theme', next);
    localStorage.setItem('cms_theme_v1', next);
  }

  const displayName = getDisplayName(user);
  const roleLabel = meta.label || 'Staff';
  const staffId = user?.staffId ?? user?.staff_id ?? null;
  const avatarText = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  return (
    <>
      <header className="cms-topbar">
        <button className="cms-icon-btn mobile-menu" onClick={() => setMobile(!mobile)} aria-label="Open menu">
          <i className="bi bi-list" />
        </button>

        <NavLink to={`${meta.base}/dashboard`} className="cms-brand">
          <i className="bi bi-heart-pulse-fill" />
          <span>
            CMS Hospital <span className="brand-location">Thiruvananthapuram</span>
          </span>
        </NavLink>

        <div className="topbar-right">
          <div className="clinic-status">
            <span className="status-dot" /> Clinic workspace
          </div>

          <button className="cms-icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
            <i className={`bi ${document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'bi-sun' : 'bi-moon-stars'}`} />
          </button>

          <div className="user-menu">
            <span className="cms-avatar">{avatarText}</span>
            <span className="user-label">
              <b>{displayName}</b>
              <small>
                {roleLabel} · {staffId ? `Staff #${staffId}` : user?.department || 'Staff'}
              </small>
            </span>
            <button className="btn btn-sm btn-outline-secondary" onClick={logout}>
              Log out
            </button>
          </div>
        </div>
      </header>

      <aside className={`cms-sidebar ${mobile ? 'sidebar-open' : ''}`}>
        <div className="cms-role">{meta.label} workspace</div>

        <ul className="nav flex-column">
          {meta.links.map(([label, icon, key]) => (
            <li className="nav-item" key={key}>
              <NavLink
                onClick={() => setMobile(false)}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                to={`${meta.base}/${key}`}
              >
                <i className={`bi bi-${icon}`} />
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <i className="bi bi-shield-check" />
            <span>
              <b>Secure workspace</b>
              <small>Role-aware clinic tools</small>
            </span>
          </div>
          <div className="sidebar-version">CMS · Frontend workspace</div>
        </div>
      </aside>

      {mobile && <button className="sidebar-backdrop" onClick={() => setMobile(false)} aria-label="Close navigation" />}

      <div className="cms-body">
        <div className="cms-inner">
          <div className="cms-page-header">
            <div>
              <div className="eyebrow">{meta.label} / WORKSPACE</div>
              <h1 className="cms-page-title">{title}</h1>
              <p className="cms-page-subtitle">
                {page === 'activity' ? 'Review sign-in periods and recent staff activity.' : 'A clear view of today’s clinic operations.'}
              </p>
            </div>
            <div className="page-header-date">
              <i className="bi bi-calendar3 me-2" />
              {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
          </div>

          <main>{children}</main>

          <footer className="cms-footer">
            © 2026 CMS Hospital Thiruvananthapuram <span>·</span> Clinic Management System
          </footer>
        </div>
      </div>
    </>
  );
}
