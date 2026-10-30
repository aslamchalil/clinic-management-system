import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import WorkspacePage from './pages/WorkspacePage';
import AdminDashboard from './pages/AdminDashboard';
import StaffManagement from './pages/StaffManagement';
import DoctorManagement from './pages/DoctorManagement';
import DepartmentManagement from './pages/DepartmentManagement';
import SpecializationManagement from './pages/SpecializationManagement';
import LabTestManagement from './pages/LabTestManagement';
import MedicineManagement from './pages/MedicineManagement';
import StockRequestsPage from './pages/StockRequestsPage';
import AdminStockManagement from './pages/AdminStockManagement';
import PharmacyDashboard from './pages/PharmacyDashboard';
import PharmacyPrescriptions from './pages/PharmacyPrescriptions';
import PharmacyBilling from './pages/PharmacyBilling';
import PharmacyDispensing from './pages/PharmacyDispensing';
import PharmacyStock from './pages/PharmacyStock';
import DoctorDashboard from './pages/DoctorDashboard';
import DoctorAppointments from './pages/DoctorAppointments';
import DoctorTokenQueue from './pages/DoctorTokenQueue';
import DoctorConsultation from './pages/DoctorConsultation';
import DoctorHistory from './pages/DoctorHistory';
import DoctorPrescriptions from './pages/DoctorPrescriptions';
import DoctorLabRequests from './pages/DoctorLabRequests';
import DoctorLabResults from './pages/DoctorLabResults';
import LabDashboard from './pages/LabDashboard';
import LabRequests from './pages/LabRequests';
import LabBilling from './pages/LabBilling';
import LabProcessing from './pages/LabProcessing';
import LabResults from './pages/LabResults';
import './styles/lab.css';
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
      : page === 'dashboard' && resolvedRole === 'LAB_ASSISTANT'
        ? <LabDashboard />
      : page === 'dashboard' && resolvedRole === 'DOCTOR'
        ? <DoctorDashboard />
      : page === 'dashboard' && resolvedRole === 'PHARMACIST'
        ? <PharmacyDashboard />
      : page === 'stock' && resolvedRole === 'ADMIN'
        ? <AdminStockManagement />
      : page === 'prescriptions' && resolvedRole === 'PHARMACIST'
        ? <PharmacyPrescriptions />
      : page === 'billing' && resolvedRole === 'PHARMACIST'
        ? <PharmacyBilling />
      : page === 'dispensing' && resolvedRole === 'PHARMACIST'
        ? <PharmacyDispensing />
      : page === 'stock' && resolvedRole === 'PHARMACIST'
        ? <PharmacyStock />
      : page === 'staff' && resolvedRole === 'ADMIN'
        ? <StaffManagement user={sessionUser} />
        : page === 'doctors' && resolvedRole === 'ADMIN'
          ? <DoctorManagement />
          : page === 'departments' && resolvedRole === 'ADMIN'
            ? <DepartmentManagement />
            : page === 'specializations' && resolvedRole === 'ADMIN'
              ? <SpecializationManagement />
              : page === 'lab-tests' && resolvedRole === 'ADMIN'
                ? <LabTestManagement />
                : page === 'medicines' && resolvedRole === 'ADMIN'
                  ? <MedicineManagement />
                  : page === 'stock-requests' && ['ADMIN', 'PHARMACIST', 'LAB_ASSISTANT'].includes(resolvedRole)
                    ? <StockRequestsPage user={sessionUser} />
                    : page === 'appointments' && resolvedRole === 'DOCTOR'
                          ? <DoctorAppointments />
                          : page === 'token-queue' && resolvedRole === 'DOCTOR'
                            ? <DoctorTokenQueue />
                            : page === 'consultation' && resolvedRole === 'DOCTOR'
                              ? <DoctorConsultation />
                              : page === 'history' && resolvedRole === 'DOCTOR'
                                ? <DoctorHistory />
                                : page === 'prescriptions' && resolvedRole === 'DOCTOR'
                                  ? <DoctorPrescriptions />
                                  : page === 'lab-requests' && resolvedRole === 'DOCTOR'
                                    ? <DoctorLabRequests />
                                    : page === 'lab-results' && resolvedRole === 'DOCTOR'
                                      ? <DoctorLabResults />
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
          : page === 'requests' && resolvedRole === 'LAB_ASSISTANT'
            ? <LabRequests />
            : page === 'billing' && resolvedRole === 'LAB_ASSISTANT'
              ? <LabBilling />
              : page === 'processing' && resolvedRole === 'LAB_ASSISTANT'
                ? <LabProcessing />
                : page === 'results' && resolvedRole === 'LAB_ASSISTANT'
                  ? <LabResults />
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
