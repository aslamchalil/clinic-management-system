import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../services/api';
import { Card, Empty, Search, Status } from '../components/UI';
import PatientForm from './PatientForm';

function getPatientList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  throw new Error('The patient API returned an unexpected response format.');
}

export default function PatientList() {
  const [patients, setPatients] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingPatient, setEditingPatient] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  const loadPatients = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await api.get('/receptionist/patients/');
      setPatients(getPatientList(response.data));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPatients();
  }, []);

  useEffect(() => {
    if (location.state?.notice) {
      setNotice(location.state.notice);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location, navigate]);

  const visiblePatients = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return patients;
    return patients.filter((patient) =>
      JSON.stringify(patient).toLowerCase().includes(term)
    );
  }, [patients, query]);

  const handleSuccess = async (message) => {
    setEditingPatient(null);
    setNotice(message);
    await loadPatients();
  };

  return (
    <div className="workspace-content">
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {notice && (
        <div className="alert alert-success alert-dismissible" role="status">
          {notice}
          <button
            type="button"
            className="btn-close float-end"
            onClick={() => setNotice('')}
            aria-label="Dismiss"
          />
        </div>
      )}

      <Card
        title="Patients"
        subtitle="Live patient records from your clinic backend"
      >
        <div className="cms-toolbar">
          <Search
            value={query}
            onChange={setQuery}
            placeholder="Search patients..."
          />
          <div className="d-flex gap-2 flex-wrap">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => navigate('/app/receptionist/patient-register')}
            >
              <i className="bi bi-person-plus me-1" />
              Register patient
            </button>
            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              onClick={loadPatients}
              disabled={loading}
            >
              <i className="bi bi-arrow-clockwise me-1" />
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="loading-line"><span />Loading patients from Django…</div>
        ) : patients.length === 0 && !error ? (
          <Empty
            title="No patients found"
            description="There are no patient records in the backend yet."
          />
        ) : visiblePatients.length === 0 && !error ? (
          <Empty
            title="No matching patients"
            description="No patient records match your search."
          />
        ) : visiblePatients.length > 0 ? (
          <div className="table-responsive">
            <table className="table cms-table align-middle">
              <thead>
                <tr>
                  <th>Patient ID</th>
                  <th>Full name</th>
                  <th>Date of birth</th>
                  <th>Gender</th>
                  <th>Phone number</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visiblePatients.map((patient) => (
                  <tr key={patient.patient_id}>
                    <td>{patient.patient_id}</td>
                    <td>{patient.full_name || '—'}</td>
                    <td>{patient.dob || '—'}</td>
                    <td>{patient.gender || '—'}</td>
                    <td>{patient.phone_number || '—'}</td>
                    <td>{patient.email || '—'}</td>
                    <td>
                      <Status value={patient.is_active ? 'ACTIVE' : 'INACTIVE'} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => setEditingPatient(patient)}
                      >
                        <i className="bi bi-pencil me-1" />
                        Edit
                      </button>
                      {patient.is_active && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary ms-1"
                          onClick={() => navigate('/app/receptionist/tokens', {
                            state: {
                              patientId: patient.patient_id,
                              patientName: patient.full_name,
                              isNewRegistration: false,
                            },
                          })}
                        >
                          <i className="bi bi-ticket-perforated me-1" />
                          Take Token
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {editingPatient && (
        <PatientForm
          key={editingPatient.patient_id}
          patient={editingPatient}
          onCancel={() => setEditingPatient(null)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}