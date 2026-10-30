import React, { useEffect, useMemo, useState } from 'react';
import { Card, Empty, Search, Status } from '../components/UI';
import { errorMessage } from '../services/api';
import {
  createDoctorProfile,
  listDoctors,
  listSpecializations,
  listStaff,
  updateDoctorProfile,
} from '../services/adminService';

const EMPTY_FORM = {
  staff: '',
  specialization: '',
  consultation_fee: '',
  license_no: '',
  qualification: '',
  exp_year: '0',
  sessions: [],
};

export default function DoctorManagement() {
  const [doctors, setDoctors] = useState([]);
  const [staff, setStaff] = useState([]);
  const [specializations, setSpecializations] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingDoctorId, setEditingDoctorId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [doctorRows, staffRows, specializationRows] = await Promise.all([
        listDoctors(), listStaff(), listSpecializations(),
      ]);
      setDoctors(doctorRows);
      setStaff(staffRows);
      setSpecializations(specializationRows);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const profiledStaffIds = useMemo(() => new Set(doctors.map((doctor) => String(doctor.staff))), [doctors]);
  const availableStaff = staff.filter((member) =>
    member.role_name?.toUpperCase() === 'DOCTOR' && !profiledStaffIds.has(String(member.staff_id))
  );
  const visibleDoctors = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? doctors.filter((doctor) => JSON.stringify(doctor).toLowerCase().includes(term)) : doctors;
  }, [doctors, query]);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if ((!editingDoctorId && !form.staff) || !form.specialization || !form.license_no.trim()) {
      setError('Choose Doctor-role staff and an active specialization, and enter a license number.');
      return;
    }
    if (!form.sessions.length) {
      setError('Assign at least one Doctor session.');
      return;
    }
    const fee = Number(form.consultation_fee);
    const experience = Number(form.exp_year);
    if (!Number.isFinite(fee) || fee < 0 || !Number.isInteger(experience) || experience < 0) {
      setError('Enter a valid non-negative consultation fee and whole-number experience.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        specialization: Number(form.specialization),
        consultation_fee: fee.toFixed(2),
        license_no: form.license_no.trim(),
        qualification: form.qualification.trim(),
        exp_year: experience,
        sessions: form.sessions.map((session) => ({
          session,
          start_time: form[`${session.toLowerCase()}_start`],
          end_time: form[`${session.toLowerCase()}_end`],
          is_active: true,
        })),
      };
      if (editingDoctorId) await updateDoctorProfile(editingDoctorId, payload);
      else await createDoctorProfile({ ...payload, staff: Number(form.staff) });
      setForm(EMPTY_FORM);
      setEditingDoctorId(null);
      setNotice(editingDoctorId ? 'Doctor profile and sessions updated.' : 'Doctor profile created. The doctor can log in when the profile, staff account, and role are active.');
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const editDoctor = (doctor) => {
    const activeSessions = (doctor.sessions || []).filter((item) => item.is_active);
    const next = {
      ...EMPTY_FORM,
      staff: String(doctor.staff),
      specialization: String(doctor.specialization),
      consultation_fee: String(doctor.consultation_fee),
      license_no: doctor.license_no || '',
      qualification: doctor.qualification || '',
      exp_year: String(doctor.exp_year ?? 0),
      sessions: activeSessions.map((item) => item.session),
    };
    activeSessions.forEach((item) => {
      const key = item.session.toLowerCase();
      next[`${key}_start`] = item.start_time?.slice(0, 5) || '';
      next[`${key}_end`] = item.end_time?.slice(0, 5) || '';
    });
    setForm(next);
    setEditingDoctorId(doctor.doc_id);
    setError('');
    setNotice('');
  };

  const toggleDoctor = async (doctor) => {
    setBusyId(doctor.doc_id);
    setError('');
    setNotice('');
    try {
      await updateDoctorProfile(doctor.doc_id, { is_active: !doctor.is_active });
      setNotice(`Doctor profile ${doctor.is_active ? 'deactivated' : 'activated'}.`);
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="workspace-content">
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      <Card title="Doctor profiles" subtitle="Manage persisted Doctor records linked to staff accounts.">
        <form className="row g-3 mb-4" onSubmit={submit}>
          <div className="col-md-6">
            <label className="form-label" htmlFor="doctor-staff">Doctor-role staff without a profile</label>
            <select id="doctor-staff" className="form-select" value={form.staff} onChange={(event) => setField('staff', event.target.value)} required disabled={Boolean(editingDoctorId)}>
              <option value="">Select staff member</option>
              {availableStaff.map((member) => (
                <option key={member.staff_id} value={member.staff_id}>{member.first_name} {member.last_name} (#{member.staff_id})</option>
              ))}
            </select>
            {!availableStaff.length && !loading && <div className="form-text">Create a staff account with the Doctor role first.</div>}
          </div>
          <div className="col-md-6">
            <label className="form-label" htmlFor="doctor-specialization">Active specialization</label>
            <select id="doctor-specialization" className="form-select" value={form.specialization} onChange={(event) => setField('specialization', event.target.value)} required>
              <option value="">Select specialization</option>
              {specializations.filter((item) => item.is_active).map((item) => (
                <option key={item.spec_id} value={item.spec_id}>{item.spec_name}</option>
              ))}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="doctor-fee">Consultation fee</label>
            <input id="doctor-fee" type="number" min="0" step="0.01" className="form-control" value={form.consultation_fee} onChange={(event) => setField('consultation_fee', event.target.value)} required />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="doctor-license">License number</label>
            <input id="doctor-license" className="form-control" value={form.license_no} onChange={(event) => setField('license_no', event.target.value)} required />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="doctor-experience">Experience (years)</label>
            <input id="doctor-experience" type="number" min="0" step="1" className="form-control" value={form.exp_year} onChange={(event) => setField('exp_year', event.target.value)} />
          </div>
          <div className="col-md-9">
            <label className="form-label" htmlFor="doctor-qualification">Qualification</label>
            <input id="doctor-qualification" className="form-control" value={form.qualification} onChange={(event) => setField('qualification', event.target.value)} />
          </div>
          <div className="col-12">
            <fieldset>
              <legend className="form-label fs-6">Working sessions</legend>
              <div className="row g-3">
                {['MORNING', 'EVENING'].map((session) => {
                  const key = session.toLowerCase();
                  const selected = form.sessions.includes(session);
                  return <div className="col-md-6" key={session}>
                    <div className="form-check mb-2">
                      <input id={`doctor-session-${key}`} className="form-check-input" type="checkbox" checked={selected} onChange={(event) => setForm((current) => ({ ...current, sessions: event.target.checked ? [...current.sessions, session] : current.sessions.filter((item) => item !== session) }))} />
                      <label className="form-check-label" htmlFor={`doctor-session-${key}`}>{session === 'MORNING' ? 'Morning' : 'Evening'}</label>
                    </div>
                    {selected && <div className="row g-2">
                      <div className="col-6"><label className="form-label" htmlFor={`${key}-start`}>Start time</label><input id={`${key}-start`} type="time" className="form-control" value={form[`${key}_start`] || ''} onChange={(event) => setField(`${key}_start`, event.target.value)} required /></div>
                      <div className="col-6"><label className="form-label" htmlFor={`${key}-end`}>End time</label><input id={`${key}-end`} type="time" className="form-control" value={form[`${key}_end`] || ''} onChange={(event) => setField(`${key}_end`, event.target.value)} required /></div>
                    </div>}
                  </div>;
                })}
              </div>
            </fieldset>
          </div>
          <div className="col-md-3 d-flex align-items-end">
            <button type="submit" className="btn btn-primary w-100" disabled={saving || loading || (!editingDoctorId && !availableStaff.length) || !specializations.some((item) => item.is_active)}>
              {saving ? 'Saving…' : editingDoctorId ? 'Update Doctor profile' : 'Create Doctor profile'}
            </button>
            {editingDoctorId && <button type="button" className="btn btn-outline-secondary ms-2" onClick={() => { setEditingDoctorId(null); setForm(EMPTY_FORM); }}>Cancel</button>}
          </div>
        </form>

        <div className="cms-toolbar mb-3">
          <Search value={query} onChange={setQuery} placeholder="Search doctors, licenses, specializations…" />
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={load} disabled={loading || saving}>Refresh</button>
        </div>
        {loading ? <div className="loading-line"><span />Loading Doctor profiles…</div> : visibleDoctors.length === 0 ? (
          <Empty title="No Doctor profiles found" description={query ? 'No Doctor profiles match your search.' : 'Create a Doctor profile for an existing staff account assigned the Doctor role.'} />
        ) : (
          <div className="table-responsive">
            <table className="table cms-table align-middle">
              <thead><tr><th>ID</th><th>Doctor / Staff</th><th>Department</th><th>Specialization</th><th>Fee</th><th>Sessions</th><th>License</th><th>Staff / account</th><th>Doctor profile</th><th>Actions</th></tr></thead>
              <tbody>{visibleDoctors.map((doctor) => (
                <tr key={doctor.doc_id}>
                  <td>#{doctor.doc_id}</td>
                  <td>{doctor.staff_name} (Staff #{doctor.staff})<div className="small text-secondary">{doctor.staff_email} · {doctor.staff_phone}</div></td>
                  <td>{doctor.department_name}</td>
                  <td>{doctor.specialization_name}</td>
                  <td>₹{doctor.consultation_fee}</td>
                  <td>{(doctor.sessions || []).filter((session) => session.is_active).map((session) => `${session.session} ${session.start_time}–${session.end_time}`).join(', ') || '—'}</td>
                  <td>{doctor.license_no}</td>
                  <td><Status value={doctor.staff_is_active && doctor.account_is_active ? 'ACTIVE' : 'INACTIVE'} /></td>
                  <td><Status value={doctor.is_active ? 'ACTIVE' : 'INACTIVE'} /></td>
                  <td><button type="button" className="btn btn-sm btn-outline-primary me-1" onClick={() => editDoctor(doctor)} disabled={saving}>Edit</button><button type="button" className={`btn btn-sm ${doctor.is_active ? 'btn-outline-danger' : 'btn-outline-success'}`} onClick={() => toggleDoctor(doctor)} disabled={busyId === doctor.doc_id}>
                    {busyId === doctor.doc_id ? 'Saving…' : doctor.is_active ? 'Deactivate' : 'Activate'}
                  </button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
