import React, { useEffect, useState } from 'react';
import { Card, Empty, Search, Status } from '../components/UI';
import { errorMessage } from '../services/api';
import { createMedicine, listAdminMedicines, updateMedicine } from '../services/adminService';

const emptyForm = { name: '', generic_name: '', category: '', is_active: true, dosages: [{ dosage_value: '', unit: '', description: '' }] };

export default function MedicineManagement() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try { setRows(await listAdminMedicines()); }
    catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filteredRows = rows.filter((row) =>
    [row.name, row.generic_name, row.category, row.medicine_id]
      .some((value) => String(value ?? '').toLowerCase().includes(query.toLowerCase())));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    if (!form.dosages.length || form.dosages.some((row) => !row.dosage_value || Number(row.dosage_value) <= 0 || !row.unit.trim())) {
      setSaving(false);
      setError('Enter a dosage value greater than zero and a unit for every dosage option.');
      return;
    }
    const dosageKeys = form.dosages.map((row) => `${Number(row.dosage_value)}|${row.unit.trim().toLowerCase()}`);
    if (new Set(dosageKeys).size !== dosageKeys.length) {
      setSaving(false);
      setError('Duplicate dosage values and units are not allowed.');
      return;
    }
    const payload = {
      ...form,
      name: form.name.trim(),
      generic_name: form.generic_name.trim(),
      category: form.category.trim(),
      dosages: form.dosages.map((row) => ({
        ...(row.dosage_id ? { dosage_id: row.dosage_id } : {}),
        dosage_value: Number(row.dosage_value).toFixed(2),
        unit: row.unit.trim(),
        description: row.description.trim(),
        is_active: true,
      })),
    };
    try {
      if (editingId) await updateMedicine(editingId, payload);
      else await createMedicine(payload);
      setNotice(editingId ? 'Medicine updated successfully.' : 'Medicine created successfully.');
      setForm(emptyForm); setEditingId(null); await load();
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };

  const edit = (medicine) => {
    setEditingId(medicine.medicine_id);
    setForm({
      name: medicine.name || '',
      generic_name: medicine.generic_name || '',
      category: medicine.category || '',
      is_active: medicine.is_active,
      dosages: (medicine.dosages || []).filter((row) => row.is_active).map((row) => ({
        dosage_id: row.dosage_id,
        dosage_value: String(row.dosage_value),
        unit: row.unit,
        description: row.description || '',
      })),
    });
    setNotice(''); setError('');
  };

  const toggle = async (medicine) => {
    setBusyId(medicine.medicine_id); setError(''); setNotice('');
    try {
      await updateMedicine(medicine.medicine_id, { is_active: !medicine.is_active });
      setNotice(`Medicine ${medicine.is_active ? 'deactivated' : 'activated'} successfully.`);
      await load();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusyId(null); }
  };

  return <div className="admin-phase-b">
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    {notice && <div className="alert alert-success" role="status">{notice}</div>}
    <Card title={editingId ? 'Edit medicine' : 'Add medicine'} subtitle="Save medicine details to the live pharmacy catalogue.">
      <form className="row g-3" onSubmit={submit}>
        <div className="col-md-4"><label className="form-label" htmlFor="medicine-name">Medicine name</label><input id="medicine-name" className="form-control" required maxLength={200} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="col-md-4"><label className="form-label" htmlFor="medicine-generic">Generic name</label><input id="medicine-generic" className="form-control" maxLength={200} value={form.generic_name} onChange={(e) => setForm({ ...form, generic_name: e.target.value })} /></div>
        <div className="col-md-4"><label className="form-label" htmlFor="medicine-category">Category</label><input id="medicine-category" className="form-control" maxLength={100} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
        <div className="col-12"><label className="form-label">Dosage options</label>{form.dosages.map((dosage, index) => <div className="row g-2 align-items-end mb-2" key={dosage.dosage_id || `new-${index}`}>
          <div className="col-md-3"><label className="form-label small" htmlFor={`medicine-dosage-value-${index}`}>Strength / value</label><input id={`medicine-dosage-value-${index}`} className="form-control" type="number" min="0.01" step="0.01" required value={dosage.dosage_value} onChange={(e) => setForm((current) => ({ ...current, dosages: current.dosages.map((row, rowIndex) => rowIndex === index ? { ...row, dosage_value: e.target.value } : row) }))} /></div>
          <div className="col-md-3"><label className="form-label small" htmlFor={`medicine-dosage-unit-${index}`}>Unit</label><input id={`medicine-dosage-unit-${index}`} className="form-control" maxLength={50} required value={dosage.unit} onChange={(e) => setForm((current) => ({ ...current, dosages: current.dosages.map((row, rowIndex) => rowIndex === index ? { ...row, unit: e.target.value } : row) }))} placeholder="e.g. mg, tablet" /></div>
          <div className="col-md-4"><label className="form-label small" htmlFor={`medicine-dosage-description-${index}`}>Description (optional)</label><input id={`medicine-dosage-description-${index}`} className="form-control" maxLength={200} value={dosage.description} onChange={(e) => setForm((current) => ({ ...current, dosages: current.dosages.map((row, rowIndex) => rowIndex === index ? { ...row, description: e.target.value } : row) }))} /></div>
          <div className="col-md-2">{form.dosages.length > 1 && <button type="button" className="btn btn-outline-danger w-100" onClick={() => setForm((current) => ({ ...current, dosages: current.dosages.filter((_, rowIndex) => rowIndex !== index) }))}>Remove</button>}</div>
        </div>)}<button type="button" className="btn btn-sm btn-outline-secondary mt-1" onClick={() => setForm((current) => ({ ...current, dosages: [...current.dosages, { dosage_value: '', unit: '', description: '' }] }))}>Add dosage option</button></div>
        <div className="col-12 d-flex gap-2">
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add medicine'}</button>
          {editingId && <button className="btn btn-outline-secondary" type="button" disabled={saving} onClick={() => { setEditingId(null); setForm(emptyForm); }}>Cancel edit</button>}
        </div>
      </form>
    </Card>
    <Card title="Master medicines" subtitle="Medicine catalogue records from the backend.">
      <div className="cms-toolbar"><Search value={query} onChange={setQuery} placeholder="Search medicines…" /><button className="btn btn-outline-primary btn-sm" onClick={load} disabled={loading || saving}><i className="bi bi-arrow-clockwise me-1" />Refresh</button></div>
      {loading ? <div className="loading-line"><span /> Loading medicines…</div> : filteredRows.length === 0 ? <Empty title="No medicines found" description={error ? 'The medicine list could not be loaded.' : 'No matching medicine records are in the catalogue.'} /> :
        <div className="table-responsive"><table className="table align-middle cms-table"><thead><tr><th>ID</th><th>Name</th><th>Generic name</th><th>Category</th><th>Dosages</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {filteredRows.map((medicine) => <tr key={medicine.medicine_id}><td>{medicine.medicine_id}</td><td>{medicine.name}</td><td>{medicine.generic_name || '—'}</td><td>{medicine.category || '—'}</td><td>{(medicine.dosages || []).filter((row) => row.is_active).map((row) => `${row.dosage_value} ${row.unit}`).join(', ') || '—'}</td><td><Status value={medicine.is_active ? 'ACTIVE' : 'INACTIVE'} /></td><td className="d-flex gap-2"><button className="btn btn-sm btn-outline-primary" onClick={() => edit(medicine)}>Edit</button><button className={`btn btn-sm ${medicine.is_active ? 'btn-outline-danger' : 'btn-outline-success'}`} disabled={busyId === medicine.medicine_id} onClick={() => toggle(medicine)}>{busyId === medicine.medicine_id ? 'Saving…' : medicine.is_active ? 'Deactivate' : 'Activate'}</button></td></tr>)}
        </tbody></table></div>}
    </Card>
  </div>;
}
