import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import WorkspacePage from './pages/WorkspacePage';
import AdminDashboard from './pages/AdminDashboard';
import StaffManagement from './pages/StaffManagement';
import PatientList from './pages/PatientList';
import PatientForm from './pages/PatientForm';
import AppointmentForm from './pages/AppointmentForm';
import BillingPage from './pages/BillingPage';
import TokenQueue from './pages/TokenQueue';
import { Shell, roleMeta } from './components/Shell';

function normalizeRole(role) {
  const value = String(role || '').toUpperCase();
  return value === 'LAB_TECHNICIAN' ? 'LAB_ASSISTANT' : value;
}

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('cms_session'));
  } catch {
    return null;
  }
}

function GuardedApp() {
  const location = useLocation();
  const user = getSession();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const resolvedRole = normalizeRole(user.role);
  const sessionUser = { ...user, role: resolvedRole };

  const seg = location.pathname.split('/').filter(Boolean);
  const module = seg[1];
  const page = seg[2] || 'dashboard';
  const base = {
    ADMIN: 'admin',
    DOCTOR: 'doctor',
    RECEPTIONIST: 'receptionist',
    PHARMACIST: 'pharmacy',
    LAB_ASSISTANT: 'lab',
  }[resolvedRole];

  if (module !== base) {
    return <Navigate to={`/app/${base}/dashboard`} replace />;
  }

  const allowed = (roleMeta[resolvedRole]?.links || []).some((x) => x[2] === page);
  if (!allowed) {
    return <Navigate to={`/app/${base}/dashboard`} replace />;
  }

  const renderPage =
    page === 'dashboard' && resolvedRole === 'ADMIN'
      ? <AdminDashboard user={sessionUser} />
      : page === 'staff' && resolvedRole === 'ADMIN'
        ? <StaffManagement user={sessionUser} />
        : page === 'patients' && resolvedRole === 'RECEPTIONIST'
          ? <PatientList />
          : page === 'patient-register' && resolvedRole === 'RECEPTIONIST'
            ? <PatientForm standalone />
            : page === 'appointments' && resolvedRole === 'RECEPTIONIST'
              ? <AppointmentForm />
              : page === 'billing' && resolvedRole === 'RECEPTIONIST'
                ? <BillingPage />
                : page === 'tokens' && resolvedRole === 'RECEPTIONIST'
                  ? <TokenQueue />
          : page === 'dashboard'
            ? <Dashboard user={sessionUser} />
          : <WorkspacePage page={page} user={sessionUser} />;

  return <Shell user={sessionUser} page={page}>{renderPage}</Shell>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/app/:module/:page" element={<GuardedApp />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
