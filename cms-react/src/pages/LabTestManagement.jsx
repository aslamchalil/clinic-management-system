import React, { useEffect, useMemo, useState } from 'react';
import { Card, Empty, Search, Status } from '../components/UI';
import { errorMessage } from '../services/api';
import { createLabTest, listLabTests, updateLabTest } from '../services/adminService';

const EMPTY_FORM = {
  test_name: '',
  test_type: '',
  description: '',
  test_price: '',
  min_value: '',
  max_value: '',
};

export default function LabTestManagement() {
  const [tests, setTests] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setTests(await listLabTests());
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const visibleTests = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? tests.filter((test) => JSON.stringify(test).toLowerCase().includes(term)) : tests;
  }, [tests, query]);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    const price = Number(form.test_price);
    const min = form.min_value === '' ? null : Number(form.min_value);
    const max = form.max_value === '' ? null : Number(form.max_value);
    if (!form.test_name.trim() || !Number.isFinite(price) || price < 0) {
      setError('Enter a test name and a valid non-negative price.');
      return;
    }
    if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max)) || (min !== null && max !== null && min > max)) {
      setError('Enter valid reference limits; the minimum cannot exceed the maximum.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await createLabTest({
        test_name: form.test_name.trim(),
        test_type: form.test_type.trim(),
        description: form.description.trim(),
        test_price: price.toFixed(2),
        min_value: min,
        max_value: max,
        is_active: true,
      });
      setForm(EMPTY_FORM);
      setNotice('Lab test created successfully.');
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (test) => {
    setBusyId(test.test_id);
    setError('');
    setNotice('');
    try {
      await updateLabTest(test.test_id, { is_active: !test.is_active });
      setNotice(`Lab test ${test.is_active ? 'deactivated' : 'activated'}. Historical requests, bills, and results are retained.`);
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="workspace-content">
      <Card title="Lab test catalogue" subtitle="Create tests and manage availability while preserving linked requests, bills, and results.">
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        <form className="row g-3 mb-4" onSubmit={submit}>
          <div className="col-md-6"><label className="form-label" htmlFor="lab-test-name">Test name</label><input id="lab-test-name" className="form-control" value={form.test_name} onChange={(event) => setField('test_name', event.target.value)} required /></div>
          <div className="col-md-6"><label className="form-label" htmlFor="lab-test-type">Test type</label><input id="lab-test-type" className="form-control" value={form.test_type} onChange={(event) => setField('test_type', event.target.value)} /></div>
          <div className="col-md-4"><label className="form-label" htmlFor="lab-test-price">Price</label><input id="lab-test-price" type="number" min="0" step="0.01" className="form-control" value={form.test_price} onChange={(event) => setField('test_price', event.target.value)} required /></div>
          <div className="col-md-4"><label className="form-label" htmlFor="lab-test-min">Minimum value</label><input id="lab-test-min" type="number" step="any" className="form-control" value={form.min_value} onChange={(event) => setField('min_value', event.target.value)} /></div>
          <div className="col-md-4"><label className="form-label" htmlFor="lab-test-max">Maximum value</label><input id="lab-test-max" type="number" step="any" className="form-control" value={form.max_value} onChange={(event) => setField('max_value', event.target.value)} /></div>
          <div className="col-md-9"><label className="form-label" htmlFor="lab-test-description">Description</label><textarea id="lab-test-description" className="form-control" value={form.description} onChange={(event) => setField('description', event.target.value)} /></div>
          <div className="col-md-3 d-flex align-items-end"><button type="submit" className="btn btn-primary w-100" disabled={saving}>{saving ? 'Saving…' : 'Create lab test'}</button></div>
        </form>
        <div className="cms-toolbar mb-3">
          <Search value={query} onChange={setQuery} placeholder="Search lab tests…" />
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={load} disabled={loading || saving}>Refresh</button>
        </div>
        {loading ? <div className="loading-line"><span />Loading lab tests…</div> : visibleTests.length === 0 ? (
          <Empty title="No lab tests found" description={query ? 'No lab tests match your search.' : 'There are no lab tests in the backend yet.'} />
        ) : (
          <div className="table-responsive">
            <table className="table cms-table align-middle">
              <thead><tr><th>ID</th><th>Test</th><th>Type</th><th>Price</th><th>Reference range</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{visibleTests.map((test) => (
                <tr key={test.test_id}>
                  <td>#{test.test_id}</td><td>{test.test_name}<div className="small text-secondary">{test.description}</div></td>
                  <td>{test.test_type || '—'}</td><td>₹{test.test_price}</td>
                  <td>{test.min_value ?? '—'} – {test.max_value ?? '—'}</td><td><Status value={test.is_active ? 'ACTIVE' : 'INACTIVE'} /></td>
                  <td><button type="button" className={`btn btn-sm ${test.is_active ? 'btn-outline-danger' : 'btn-outline-success'}`} onClick={() => toggle(test)} disabled={busyId === test.test_id}>
                    {busyId === test.test_id ? 'Saving…' : test.is_active ? 'Deactivate' : 'Activate'}
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
