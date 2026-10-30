import React from 'react';

export default function DoctorSelect({
  id = 'doctor-select',
  value,
  onChange,
  doctors = [],
  loading = false,
  error = '',
  required = true,
  disabled = false,
}) {
  const selectedDoctor = doctors.find(
    (doctor) => String(doctor.doc_id) === String(value)
  );

  return (
    <>
      <label className="form-label" htmlFor={id}>Doctor</label>
      <select
        id={id}
        className={`form-select${error ? ' is-invalid' : ''}`}
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={disabled || loading || !doctors.length}
      >
        <option value="">
          {loading ? 'Loading doctors…' : 'Select a doctor'}
        </option>
        {doctors.map((doctor) => (
          <option key={doctor.doc_id} value={doctor.doc_id}>
            {doctor.display_name} (#{doctor.doc_id})
          </option>
        ))}
      </select>
      {error && <div className="form-text text-danger" role="alert">{error}</div>}
      {selectedDoctor && (
        <div className="form-text">
          Consultation fee: ₹{selectedDoctor.consultation_fee}
        </div>
      )}
      {!loading && !doctors.length && !error && (
        <div className="form-text">No active doctors are available.</div>
      )}
    </>
  );
}
