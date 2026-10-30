import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../services/api';
import { Card, Empty, Search, Status } from '../components/UI';
import {
  createRegistrationBill,
  listAppointments,
  listDoctors,
  listPatients,
} from '../services/receptionistService';
import DoctorSelect from '../components/DoctorSelect';
import { maximumTokenDate } from '../services/dateUtils';

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function validDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

export default function AppointmentForm() {
  const location = useLocation();
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [appointmentQuery, setAppointmentQuery] = useState('');
  const [form, setForm] = useState({
    patient: location.state?.patientId ? String(location.state.patientId) : '',
    doctor: '',
    appointment_date: localDate(),
    appointment_time_slot: '',
    advance_amount: '0',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [appointmentListError, setAppointmentListError] = useState('');
  const [doctorError, setDoctorError] = useState('');
  const [appointmentCreated, setAppointmentCreated] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError('');
    setAppointmentListError('');
    setDoctorError('');
    const [patientResult, appointmentResult, doctorResult] = await Promise.allSettled([
      listPatients(),
      listAppointments(),
      listDoctors(),
    ]);

    if (patientResult.status === 'fulfilled') {
      setPatients(patientResult.value);
    } else {
      setError(errorMessage(patientResult.reason));
    }

    if (appointmentResult.status === 'fulfilled') {
      setAppointments(appointmentResult.value);
    } else {
      setAppointmentListError(errorMessage(appointmentResult.reason));
    }
    if (doctorResult.status === 'fulfilled') {
      setDoctors(doctorResult.value);
    } else {
      setDoctorError(errorMessage(doctorResult.reason));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (location.state?.patientId) {
      setForm((current) => ({ ...current, patient: String(location.state.patientId) }));
    }
  }, [location.state]);

  const activePatients = useMemo(
    () => patients.filter((patient) => patient.is_active),
    [patients]
  );
  const patientMap = useMemo(
    () => new Map(patients.map((patient) => [String(patient.patient_id), patient])),
    [patients]
  );
  const visibleAppointments = useMemo(() => {
    const term = appointmentQuery.trim().toLowerCase();
    if (!term) return appointments;
    return appointments.filter((appointment) => {
      const patient = patientMap.get(String(appointment.patient));
      return JSON.stringify({
        ...appointment,
        patient_name: patient?.full_name || '',
      }).toLowerCase().includes(term);
    });
  }, [appointments, appointmentQuery, patientMap]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: '' }));
    setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const errors = {};
    const doctorId = Number(form.doctor);
    const advanceAmount = Number(form.advance_amount);
    if (!form.patient) errors.patient = 'Select a patient.';
    if (!doctors.some((doctor) => Number(doctor.doc_id) === doctorId)) {
      errors.doctor = 'Select an active doctor from the list.';
    }
    if (!validDate(form.appointment_date) || form.appointment_date < localDate() || form.appointment_date > maximumTokenDate()) {
      errors.appointment_date = `Choose a valid date from today through ${maximumTokenDate()}.`;
    }
    const [hour, minute] = form.appointment_time_slot.split(':').map(Number);
    if (
      !/^\d{2}:\d{2}$/.test(form.appointment_time_slot) ||
      hour > 23 ||
      minute > 59
    ) {
      errors.appointment_time_slot = 'Enter a valid appointment time.';
    }
    if (!Number.isFinite(advanceAmount) || advanceAmount < 0) {
      errors.advance_amount = 'Advance amount must be zero or more.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    setError('');
    try {
      let appointment = appointmentCreated;
      const payload = {
        patient: Number(form.patient),
        doctor: doctorId,
        appointment_date: form.appointment_date,
        appointment_time_slot: form.appointment_time_slot,
        advance_amount: form.advance_amount.trim() || '0',
      };
      if (!appointment) {
        const response = await api.post('/receptionist/appointments/', payload);
        appointment = response.data;
        setAppointmentCreated(appointment);
      }
      if (!appointment?.appointment_id) {
        throw new Error('The appointment API did not return an appointment ID.');
      }

      const patientId = appointment.patient ?? payload.patient;
      const linkedPatient = patientMap.get(String(patientId));
      const doctorIdForBill = appointment.doctor ?? payload.doctor;
      const bill = await createRegistrationBill({
        patient: Number(patientId),
        doctor: Number(doctorIdForBill),
        appointment: appointment.appointment_id,
      });
      navigate('/app/receptionist/billing', {
        state: {
          workflow: {
            billId: bill.bill_id,
            appointmentId: appointment.appointment_id,
            patientId,
            doctorId: doctorIdForBill,
            appointmentDate: appointment.appointment_date ?? payload.appointment_date,
            appointmentTime: appointment.appointment_time_slot ?? payload.appointment_time_slot,
            patientName: linkedPatient?.full_name || '',
            isNewRegistration: Boolean(location.state?.workflow?.isNewRegistration),
            followUp: 'APPOINTMENT',
          },
          notice: `Appointment #${appointment.appointment_id} and bill #${bill.bill_id} are ready for payment.`,
        },
      });
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass = (field) =>
    `form-control${fieldErrors[field] ? ' is-invalid' : ''}`;

  return (
    <div className="workspace-content">
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {appointmentListError && (
        <div className="alert alert-warning" role="alert">
          Could not load the appointment list: {appointmentListError}
        </div>
      )}

      <Card
        title="Create appointment"
        subtitle="Choose an active doctor and a time accepted by that doctor's schedule"
      >
        {loading ? (
          <div className="loading-line"><span />Loading patients and appointments…</div>
        ) : (
          <>
            <div className="alert alert-info">
              The consultation fee is read from the selected doctor when the bill is created.
              Django continues to validate the appointment time against the doctor's active session.
            </div>
            {appointmentCreated && (
              <div className="alert alert-warning d-flex flex-wrap align-items-center justify-content-between gap-2">
                <span>Appointment #{appointmentCreated.appointment_id} is saved. Retry bill creation to continue.</span>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => submit({ preventDefault() {} })} disabled={submitting}>
                  {submitting ? 'Creating bill…' : 'Retry bill creation'}
                </button>
              </div>
            )}
            <form onSubmit={submit} noValidate>
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label" htmlFor="appointment-patient">Patient</label>
                  <select
                    id="appointment-patient"
                    className={`form-select${fieldErrors.patient ? ' is-invalid' : ''}`}
                    value={form.patient}
                    onChange={(event) => updateField('patient', event.target.value)}
                    required
                    disabled={!activePatients.length || Boolean(appointmentCreated)}
                  >
                    <option value="">Select a patient</option>
                    {activePatients.map((patient) => (
                      <option key={patient.patient_id} value={patient.patient_id}>
                        #{patient.patient_id} — {patient.full_name}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.patient && <div className="invalid-feedback">{fieldErrors.patient}</div>}
                </div>
                <div className="col-md-6">
                  <DoctorSelect
                    id="appointment-doctor"
                    value={form.doctor}
                    doctors={doctors}
                    loading={loading}
                    error={fieldErrors.doctor || doctorError}
                    onChange={(value) => updateField('doctor', value)}
                    disabled={Boolean(appointmentCreated)}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="appointment-date">Appointment date</label>
                  <input
                    id="appointment-date"
                    type="date"
                    min={localDate()}
                    max={maximumTokenDate()}
                    className={fieldClass('appointment_date')}
                    value={form.appointment_date}
                    onChange={(event) => updateField('appointment_date', event.target.value)}
                    required
                    disabled={Boolean(appointmentCreated)}
                  />
                  {fieldErrors.appointment_date && <div className="invalid-feedback">{fieldErrors.appointment_date}</div>}
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="appointment-time">Appointment time</label>
                  <input
                    id="appointment-time"
                    type="time"
                    className={fieldClass('appointment_time_slot')}
                    value={form.appointment_time_slot}
                    onChange={(event) => updateField('appointment_time_slot', event.target.value)}
                    required
                    disabled={Boolean(appointmentCreated)}
                  />
                  {fieldErrors.appointment_time_slot && <div className="invalid-feedback">{fieldErrors.appointment_time_slot}</div>}
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="appointment-advance">Advance amount</label>
                  <input
                    id="appointment-advance"
                    type="number"
                    min="0"
                    step="0.01"
                    className={fieldClass('advance_amount')}
                    value={form.advance_amount}
                    onChange={(event) => updateField('advance_amount', event.target.value)}
                    disabled={Boolean(appointmentCreated)}
                  />
                  {fieldErrors.advance_amount && <div className="invalid-feedback">{fieldErrors.advance_amount}</div>}
                </div>
              </div>
              {!activePatients.length && (
                <p className="text-secondary mt-3 mb-0">No active patients are available from the API.</p>
              )}
              <div className="d-flex justify-content-end gap-2 mt-4">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => navigate('/app/receptionist/patients')}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting || !activePatients.length || !doctors.length}>
                  {submitting ? 'Creating…' : appointmentCreated ? 'Retry bill creation' : 'Create appointment'}
                </button>
              </div>
            </form>
          </>
        )}
      </Card>

      <Card title="Appointments" subtitle="Existing appointments from the live API">
        <div className="cms-toolbar">
          <Search
            value={appointmentQuery}
            onChange={setAppointmentQuery}
            placeholder="Search appointments..."
          />
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={loadData} disabled={loading}>
            <i className="bi bi-arrow-clockwise me-1" />Refresh
          </button>
        </div>
        {appointmentListError ? (
          <Empty title="Appointment list unavailable" description={appointmentListError} />
        ) : loading ? (
          <div className="loading-line"><span />Loading appointments…</div>
        ) : appointments.length === 0 ? (
          <Empty title="No appointments found" description="The API returned no appointment records." />
        ) : visibleAppointments.length === 0 ? (
          <Empty title="No matching appointments" description="No appointments match your search." />
        ) : (
          <div className="table-responsive">
            <table className="table cms-table align-middle">
              <thead>
                <tr>
                  <th>Appointment ID</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Status</th>
                  <th>Advance</th>
                  <th>Advance payment</th>
                </tr>
              </thead>
              <tbody>
                {visibleAppointments.map((appointment) => {
                  const patient = patientMap.get(String(appointment.patient));
                  return (
                    <tr key={appointment.appointment_id}>
                      <td>{appointment.appointment_id}</td>
                      <td>{patient ? `${patient.full_name} (#${patient.patient_id})` : `Patient #${appointment.patient}`}</td>
                      <td>Doctor #{appointment.doctor}</td>
                      <td>{appointment.appointment_date || '—'}</td>
                      <td>{appointment.appointment_time_slot || '—'}</td>
                      <td><Status value={appointment.status} /></td>
                      <td>{appointment.advance_amount ?? '—'}</td>
                      <td><Status value={appointment.advance_payment_status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
