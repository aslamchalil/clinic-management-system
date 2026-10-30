import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../services/api';
import { Card } from '../components/UI';

const EMPTY_FORM = {
  full_name: '',
  dob: '',
  gender: 'MALE',
  phone_number: '',
  email: '',
  address: '',
  blood_group: '',
  emergency_contact: '',
};

function getLocalDateString() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${today.getFullYear()}-${month}-${day}`;
}

function toFormValues(patient) {
  if (!patient) return EMPTY_FORM;
  return Object.fromEntries(
    Object.keys(EMPTY_FORM).map((field) => [field, patient[field] ?? ''])
  );
}

function isValidDateOfBirth(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return false;
  }
  return value <= getLocalDateString();
}

function validateForm(form) {
  const errors = {};
  const phone = form.phone_number.trim();
  const digitCount = phone.replace(/\D/g, '').length;

  if (!form.full_name.trim()) errors.full_name = 'Full name is required.';
  if (!form.dob) errors.dob = 'Date of birth is required.';
  else if (!isValidDateOfBirth(form.dob)) {
    errors.dob = 'Enter a valid date of birth that is not in the future.';
  }
  if (!['MALE', 'FEMALE', 'OTHER'].includes(form.gender)) {
    errors.gender = 'Select a valid gender.';
  }
  if (!phone) errors.phone_number = 'Phone number is required.';
  else if (
    phone.length > 20 ||
    !/^\+?[0-9\s().-]+$/.test(phone) ||
    digitCount < 7 ||
    digitCount > 15
  ) {
    errors.phone_number = 'Enter a valid phone number (7-15 digits).';
  }
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }

  return errors;
}

export default function PatientForm({ patient = null, standalone = false, onCancel, onSuccess }) {
  const [form, setForm] = useState(() => toFormValues(patient));
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdPatient, setCreatedPatient] = useState(null);
  const navigate = useNavigate();
  const isEditing = Boolean(patient);

  useEffect(() => {
    setForm(toFormValues(patient));
    setFieldErrors({});
    setError('');
  }, [patient]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setError('');
  };

  const cancel = () => {
    if (onCancel) onCancel();
    else navigate('/app/receptionist/patients');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const errors = validateForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    const payload = Object.fromEntries(
      Object.entries(form).map(([field, value]) => [
        field,
        typeof value === 'string' ? value.trim() : value,
      ])
    );
    setSubmitting(true);
    setError('');

    try {
      let savedPatient;
      if (isEditing) {
        await api.patch(`/receptionist/patients/${patient.patient_id}/`, payload);
      } else {
        const response = await api.post('/receptionist/patients/', payload);
        savedPatient = response.data;
        if (!savedPatient?.patient_id) {
          throw new Error('Patient was saved, but the API response did not include the patient ID.');
        }
      }

      const message = isEditing
        ? 'Patient record updated successfully.'
        : 'Patient registered successfully.';
      if (onSuccess) {
        await onSuccess(message);
      } else if (!isEditing) {
        setCreatedPatient(savedPatient);
      } else {
        navigate('/app/receptionist/patients', { state: { notice: message } });
      }
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  const inputField = (name, label, type = 'text', required = false) => (
    <div className="col-md-6" key={name}>
      <label className="form-label" htmlFor={`patient-${name}`}>{label}</label>
      <input
        id={`patient-${name}`}
        className={`form-control${fieldErrors[name] ? ' is-invalid' : ''}`}
        type={type}
        value={form[name]}
        onChange={(event) => updateField(name, event.target.value)}
        required={required}
        maxLength={{
          full_name: 200,
          phone_number: 20,
          email: 254,
          blood_group: 5,
          emergency_contact: 20,
        }[name]}
        max={type === 'date' ? getLocalDateString() : undefined}
      />
      {fieldErrors[name] && <div className="invalid-feedback">{fieldErrors[name]}</div>}
    </div>
  );

  const formContent = (
    <form onSubmit={submit} noValidate>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <div className="row g-3">
        {inputField('full_name', 'Full name', 'text', true)}
        {inputField('dob', 'Date of birth', 'date', true)}
        <div className="col-md-6">
          <label className="form-label" htmlFor="patient-gender">Gender</label>
          <select
            id="patient-gender"
            className={`form-select${fieldErrors.gender ? ' is-invalid' : ''}`}
            value={form.gender}
            onChange={(event) => updateField('gender', event.target.value)}
            required
          >
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
          {fieldErrors.gender && <div className="invalid-feedback">{fieldErrors.gender}</div>}
        </div>
        {inputField('phone_number', 'Phone number', 'tel', true)}
        {inputField('email', 'Email')}
        {inputField('blood_group', 'Blood group')}
        {inputField('emergency_contact', 'Emergency contact', 'tel')}
        <div className="col-12">
          <label className="form-label" htmlFor="patient-address">Address</label>
          <textarea
            id="patient-address"
            className="form-control"
            rows="3"
            value={form.address}
            onChange={(event) => updateField('address', event.target.value)}
          />
        </div>
      </div>
      <div className="d-flex justify-content-end gap-2 mt-4">
        <button type="button" className="btn btn-outline-secondary" onClick={cancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : isEditing ? 'Save changes' : 'Register patient'}
        </button>
      </div>
    </form>
  );

  if (standalone) {
    if (createdPatient) {
      return (
        <div className="workspace-content">
          <Card
            title="Patient registered"
            subtitle="The patient record was confirmed by the backend"
          >
            <div className="alert alert-success" role="status">
              {createdPatient.full_name} was registered as patient #{createdPatient.patient_id}.
            </div>
            <p>Choose the next step for this patient:</p>
            <div className="d-flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate('/app/receptionist/appointments', {
                  state: {
                    patientId: createdPatient.patient_id,
                    patient: createdPatient,
                    workflow: {
                      patientId: createdPatient.patient_id,
                      patientName: createdPatient.full_name,
                      isNewRegistration: true,
                      followUp: 'APPOINTMENT',
                    },
                  },
                })}
              >
                Create Appointment
              </button>
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={() => navigate('/app/receptionist/tokens', {
                  state: {
                    patientId: createdPatient.patient_id,
                    patientName: createdPatient.full_name,
                    isNewRegistration: true,
                    workflow: {
                      patientId: createdPatient.patient_id,
                      patientName: createdPatient.full_name,
                      isNewRegistration: true,
                      followUp: 'WALK_IN',
                    },
                  },
                })}
              >
                Walk-in token
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => navigate('/app/receptionist/billing', {
                  state: {
                    workflow: {
                      patientId: createdPatient.patient_id,
                      patientName: createdPatient.full_name,
                      isNewRegistration: true,
                      followUp: 'NONE',
                    },
                  },
                })}
              >
                Neither, continue to billing
              </button>
            </div>
          </Card>
        </div>
      );
    }

    return (
      <div className="workspace-content">
        <Card
          title="Register patient"
          subtitle="Create a patient record in the live clinic backend"
        >
          {formContent}
        </Card>
      </div>
    );
  }

  return (
    <div className="modal show d-block" tabIndex="-1" role="dialog" aria-modal="true" style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}>
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Edit patient</h5>
            <button type="button" className="btn-close" onClick={cancel} aria-label="Close" disabled={submitting} />
          </div>
          <div className="modal-body">{formContent}</div>
        </div>
      </div>
    </div>
  );
}
