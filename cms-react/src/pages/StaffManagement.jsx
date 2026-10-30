import React, { useEffect, useMemo, useState } from 'react';
import { errorMessage } from '../services/api';
import {
  createStaff,
  listDepartments,
  listRoles,
  listStaff,
  updateStaff,
  updateStaffStatus,
} from '../services/adminService';
import { Card, Search, Status, Empty } from '../components/UI';

const INITIAL_FORM = {
  username: '',
  password: '',
  first_name: '',
  last_name: '',
  email: '',
  dob: '',
  gender: 'MALE',
  phone_number: '',
  role: '',
  department: '',
};

function isAtLeast26(dob) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob || '');
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const birthDate = new Date(year, month - 1, day);
  if (birthDate.getFullYear() !== year || birthDate.getMonth() !== month - 1 || birthDate.getDate() !== day) return false;
  const today = new Date();
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age -= 1;
  return age >= 26;
}

export default function StaffManagement() {
  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [editingMember, setEditingMember] = useState(null);
  const [assignment, setAssignment] = useState({ role: '', department: '' });
  const [assignmentError, setAssignmentError] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError('');

    try {
      const [staffRows, roleRows, departmentRows] = await Promise.all([
        listStaff(), listRoles(), listDepartments(),
      ]);
      setStaff(staffRows);
      setRoles(roleRows);
      setDepartments(departmentRows);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const roleMap = useMemo(
    () => Object.fromEntries(roles.map((role) => [role.role_id, role.role_name])),
    [roles]
  );

  const departmentMap = useMemo(
    () => Object.fromEntries(departments.map((dep) => [dep.department_id, dep.department_name])),
    [departments]
  );

  const visibleStaff = useMemo(() => {
    const term = query.trim().toLowerCase();

    if (!term) return staff;

    return staff.filter((member) => {
      const haystack = JSON.stringify({
        ...member,
        role_name: roleMap[member.role] || '',
        department_name: departmentMap[member.department] || '',
      }).toLowerCase();
      return haystack.includes(term);
    });
  }, [staff, query, roleMap, departmentMap]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFormErrors((current) => ({ ...current, [field]: undefined }));
  };

  const validateForm = () => {
    const nextErrors = {};

    if (!form.username.trim()) nextErrors.username = 'Username is required.';
    if (!form.password) nextErrors.password = 'Password is required.';
    else if (form.password.length < 8) nextErrors.password = 'Password must be at least 8 characters.';
    if (!form.first_name.trim()) nextErrors.first_name = 'First name is required.';
    if (!form.last_name.trim()) nextErrors.last_name = 'Last name is required.';
    if (!form.email.trim()) nextErrors.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) nextErrors.email = 'Enter a valid email address.';
    if (!form.phone_number.trim()) nextErrors.phone_number = 'Phone number is required.';
    else if (!/^\+?[0-9\s\-()]{7,20}$/.test(form.phone_number)) nextErrors.phone_number = 'Enter a valid phone number.';
    if (!form.dob) nextErrors.dob = 'Date of birth is required.';
    else if (!isAtLeast26(form.dob)) nextErrors.dob = 'Staff must be older than 25 years.';
    if (!form.role) nextErrors.role = 'Role is required.';
    if (!form.department) nextErrors.department = 'Department is required.';
    if (!['MALE', 'FEMALE', 'OTHER'].includes(form.gender)) nextErrors.gender = 'Select a valid gender.';

    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const submitStaff = async (event) => {
    event.preventDefault();

    if (!validateForm()) return;

    setSubmitting(true);
    setError('');
    setNotice('');

    try {
      const payload = {
        username: form.username.trim(),
        password: form.password,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        dob: form.dob,
        gender: form.gender,
        phone_number: form.phone_number.trim(),
        role: Number(form.role),
        department: Number(form.department),
      };

      await createStaff(payload);

      setForm(INITIAL_FORM);
      setIsModalOpen(false);
      setNotice(`Staff member ${payload.first_name} ${payload.last_name} created successfully.`);
      await fetchData();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStaffStatus = async (member) => {
    const nextState = !member.is_active;

    if (
      !window.confirm(
        nextState
          ? `Activate ${member.first_name} ${member.last_name}?`
          : `Deactivate ${member.first_name} ${member.last_name}? This will prevent login until reactivated.`
      )
    ) {
      return;
    }

    setBusyId(member.staff_id);
    setError('');
    setNotice('');

    try {
      await updateStaffStatus(member.staff_id, nextState);
      setNotice(
        `${member.first_name} ${member.last_name} is now ${nextState ? 'active' : 'inactive'}.`
      );
      await fetchData();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const openAssignmentEditor = (member) => {
    setEditingMember(member);
    setAssignment({ role: String(member.role), department: String(member.department), dob: member.dob || '' });
    setAssignmentError('');
  };

  const saveAssignment = async (event) => {
    event.preventDefault();
    if (!assignment.role || !assignment.department) {
      setAssignmentError('Choose an active role and department.');
      return;
    }
    if (!isAtLeast26(assignment.dob)) {
      setAssignmentError('Staff must be older than 25 years.');
      return;
    }
    setBusyId(editingMember.staff_id);
    setAssignmentError('');
    setError('');
    setNotice('');
    try {
      await updateStaff(editingMember.staff_id, {
        role: Number(assignment.role),
        department: Number(assignment.department),
        dob: assignment.dob,
      });
      setNotice(`Role and department updated for ${editingMember.first_name} ${editingMember.last_name}.`);
      setEditingMember(null);
      await fetchData();
    } catch (err) {
      setAssignmentError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="workspace-content">
      <Card
        title="Staff Management"
        subtitle="Create staff accounts and activate or deactivate records from the live backend"
        action={
          <button className="btn btn-primary btn-sm" onClick={() => setIsModalOpen(true)}>
            <i className="bi bi-plus-lg me-2" />
            Add staff
          </button>
        }
      >
        {error && <div className="alert alert-warning mb-3">{error}</div>}
        {notice && <div className="alert alert-success mb-3">{notice}</div>}

        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mb-3">
          <Search value={query} onChange={setQuery} placeholder="Search staff, emails, departments..." />
        </div>

        {loading ? (
          <div className="loading-line"><span />Loading staff records…</div>
        ) : visibleStaff.length === 0 ? (
          <Empty
            title="No staff found"
            description={query ? 'No staff match your search.' : 'There are no staff records in the backend yet.'}
          />
        ) : (
          <div className="table-responsive">
            <table className="table cms-table align-middle">
              <thead>
                <tr>
                  <th>Staff ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleStaff.map((member) => (
                  <tr key={member.staff_id}>
                    <td>{member.staff_id}</td>
                    <td>{`${member.first_name || ''} ${member.last_name || ''}`.trim() || '—'}</td>
                    <td>{member.email || '—'}</td>
                    <td>{member.phone_number || '—'}</td>
                    <td>{member.role_name || roleMap[member.role] || member.role || '—'}</td>
                    <td>{member.department_name || departmentMap[member.department] || member.department || '—'}</td>
                    <td><Status value={member.is_active ? 'ACTIVE' : 'INACTIVE'} /></td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary me-2"
                        onClick={() => openAssignmentEditor(member)}
                        disabled={busyId === member.staff_id}
                      >
                        Edit assignment
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${member.is_active ? 'btn-outline-danger' : 'btn-outline-success'}`}
                        onClick={() => toggleStaffStatus(member)}
                        disabled={busyId === member.staff_id}
                      >
                        {busyId === member.staff_id
                          ? 'Processing…'
                          : member.is_active
                            ? 'Deactivate'
                            : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isModalOpen && (
        <div className="modal fade show d-block" tabIndex="-1" style={{ background: 'rgba(0,0,0,0.35)' }}>
          <div className="modal-dialog modal-lg modal-dialog-centered" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Create staff account</h5>
                <button type="button" className="btn-close" onClick={() => setIsModalOpen(false)} />
              </div>

              <form onSubmit={submitStaff}>
                <div className="modal-body">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">Username</label>
                      <input
                        className={`form-control ${formErrors.username ? 'is-invalid' : ''}`}
                        value={form.username}
                        onChange={(e) => updateField('username', e.target.value)}
                      />
                      {formErrors.username && <small className="text-danger">{formErrors.username}</small>}
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Password</label>
                      <input
                        type="password"
                        className={`form-control ${formErrors.password ? 'is-invalid' : ''}`}
                        value={form.password}
                        onChange={(e) => updateField('password', e.target.value)}
                      />
                      {formErrors.password && <small className="text-danger">{formErrors.password}</small>}
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">First name</label>
                      <input
                        className={`form-control ${formErrors.first_name ? 'is-invalid' : ''}`}
                        value={form.first_name}
                        onChange={(e) => updateField('first_name', e.target.value)}
                      />
                      {formErrors.first_name && <small className="text-danger">{formErrors.first_name}</small>}
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Last name</label>
                      <input
                        className={`form-control ${formErrors.last_name ? 'is-invalid' : ''}`}
                        value={form.last_name}
                        onChange={(e) => updateField('last_name', e.target.value)}
                      />
                      {formErrors.last_name && <small className="text-danger">{formErrors.last_name}</small>}
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Email</label>
                      <input
                        type="email"
                        className={`form-control ${formErrors.email ? 'is-invalid' : ''}`}
                        value={form.email}
                        onChange={(e) => updateField('email', e.target.value)}
                      />
                      {formErrors.email && <small className="text-danger">{formErrors.email}</small>}
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Phone number</label>
                      <input
                        className={`form-control ${formErrors.phone_number ? 'is-invalid' : ''}`}
                        value={form.phone_number}
                        onChange={(e) => updateField('phone_number', e.target.value)}
                      />
                      {formErrors.phone_number && <small className="text-danger">{formErrors.phone_number}</small>}
                    </div>

                    <div className="col-md-4">
                      <label className="form-label">Date of birth</label>
                      <input
                        type="date"
                        className={`form-control ${formErrors.dob ? 'is-invalid' : ''}`}
                        value={form.dob}
                        onChange={(e) => updateField('dob', e.target.value)}
                      />
                      {formErrors.dob && <small className="text-danger">{formErrors.dob}</small>}
                    </div>

                    <div className="col-md-4">
                      <label className="form-label">Gender</label>
                      <select
                        className={`form-select ${formErrors.gender ? 'is-invalid' : ''}`}
                        value={form.gender}
                        onChange={(e) => updateField('gender', e.target.value)}
                      >
                        <option value="MALE">MALE</option>
                        <option value="FEMALE">FEMALE</option>
                        <option value="OTHER">OTHER</option>
                      </select>
                      {formErrors.gender && <small className="text-danger">{formErrors.gender}</small>}
                    </div>

                    <div className="col-md-4">
                      <label className="form-label">Role</label>
                      <select
                        className={`form-select ${formErrors.role ? 'is-invalid' : ''}`}
                        value={form.role}
                        onChange={(e) => updateField('role', e.target.value)}
                      >
                        <option value="">Select role</option>
                        {roles.filter((role) => role.is_active).map((role) => (
                          <option key={role.role_id} value={role.role_id}>
                            {role.role_name}
                          </option>
                        ))}
                      </select>
                      {formErrors.role && <small className="text-danger">{formErrors.role}</small>}
                    </div>

                    <div className="col-md-12">
                      <label className="form-label">Department</label>
                      <select
                        className={`form-select ${formErrors.department ? 'is-invalid' : ''}`}
                        value={form.department}
                        onChange={(e) => updateField('department', e.target.value)}
                      >
                        <option value="">Select department</option>
                        {departments.filter((department) => department.is_active).map((department) => (
                          <option key={department.department_id} value={department.department_id}>
                            {department.department_name}
                          </option>
                        ))}
                      </select>
                      {formErrors.department && <small className="text-danger">{formErrors.department}</small>}
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setIsModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? 'Saving…' : 'Save staff'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {editingMember && (
        <div className="modal fade show d-block" tabIndex="-1" style={{ background: 'rgba(0,0,0,0.35)' }}>
          <div className="modal-dialog modal-dialog-centered" role="document">
            <div className="modal-content">
              <form onSubmit={saveAssignment}>
                <div className="modal-header">
                  <h5 className="modal-title">Edit staff assignment</h5>
                  <button type="button" className="btn-close" onClick={() => setEditingMember(null)} aria-label="Close" />
                </div>
                <div className="modal-body">
                  {assignmentError && <div className="alert alert-danger">{assignmentError}</div>}
                  <p className="small text-secondary">{editingMember.first_name} {editingMember.last_name}</p>
                  <label className="form-label" htmlFor="staff-edit-dob">Date of birth</label>
                  <input id="staff-edit-dob" type="date" className="form-control mb-3" value={assignment.dob} onChange={(event) => setAssignment((current) => ({ ...current, dob: event.target.value }))} required />
                  <label className="form-label" htmlFor="staff-edit-role">Role</label>
                  <select id="staff-edit-role" className="form-select mb-3" value={assignment.role} onChange={(event) => setAssignment((current) => ({ ...current, role: event.target.value }))} required>
                    <option value="">Select active role</option>
                    {roles.filter((role) => role.is_active).map((role) => (
                      <option key={role.role_id} value={role.role_id}>{role.role_name}</option>
                    ))}
                  </select>
                  <label className="form-label" htmlFor="staff-edit-department">Department</label>
                  <select id="staff-edit-department" className="form-select" value={assignment.department} onChange={(event) => setAssignment((current) => ({ ...current, department: event.target.value }))} required>
                    <option value="">Select active department</option>
                    {departments.filter((department) => department.is_active).map((department) => (
                      <option key={department.department_id} value={department.department_id}>{department.department_name}</option>
                    ))}
                  </select>
                  <div className="form-text mt-2">This edit does not change the account password.</div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setEditingMember(null)} disabled={busyId === editingMember.staff_id}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={busyId === editingMember.staff_id}>
                    {busyId === editingMember.staff_id ? 'Saving…' : 'Save assignment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
