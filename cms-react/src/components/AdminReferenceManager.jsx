import React, { useEffect, useMemo, useState } from 'react';
import { errorMessage } from '../services/api';
import { Card, Empty, Search, Status } from './UI';

export default function AdminReferenceManager({
  title,
  subtitle,
  entityLabel,
  idKey,
  nameKey,
  nameLabel,
  fetchItems,
  createItem,
  updateItem,
}) {
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await fetchItems());
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? items.filter((item) => String(item[nameKey] || '').toLowerCase().includes(term)) : items;
  }, [items, nameKey, search]);

  const submit = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError(`${nameLabel} is required.`);
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await createItem({ [nameKey]: trimmed, is_active: true });
      setName('');
      setNotice(`${entityLabel} created successfully.`);
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (item) => {
    setBusyId(item[idKey]);
    setError('');
    setNotice('');
    try {
      await updateItem(item[idKey], { is_active: !item.is_active });
      setNotice(`${entityLabel} ${item.is_active ? 'deactivated' : 'activated'}.`);
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="workspace-content">
      <Card title={title} subtitle={subtitle}>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        <form className="row g-2 align-items-end mb-3" onSubmit={submit}>
          <div className="col-md-8">
            <label className="form-label" htmlFor={`${idKey}-name`}>{nameLabel}</label>
            <input id={`${idKey}-name`} className="form-control" value={name} onChange={(event) => setName(event.target.value)} required />
          </div>
          <div className="col-md-4 d-flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : `Add ${entityLabel}`}</button>
            <button type="button" className="btn btn-outline-primary" onClick={load} disabled={loading || saving}>Refresh</button>
          </div>
        </form>
        <div className="cms-toolbar mb-3">
          <Search value={search} onChange={setSearch} placeholder={`Search ${title.toLowerCase()}…`} />
        </div>
        {loading ? <div className="loading-line"><span />Loading {title.toLowerCase()}…</div> : visibleItems.length === 0 ? (
          <Empty title={`No ${title.toLowerCase()} found`} description={search ? 'No records match your search.' : `There are no ${title.toLowerCase()} in the backend yet.`} />
        ) : (
          <div className="table-responsive">
            <table className="table cms-table align-middle">
              <thead><tr><th>ID</th><th>{nameLabel}</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{visibleItems.map((item) => (
                <tr key={item[idKey]}>
                  <td>#{item[idKey]}</td>
                  <td>{item[nameKey]}</td>
                  <td><Status value={item.is_active ? 'ACTIVE' : 'INACTIVE'} /></td>
                  <td><button type="button" className={`btn btn-sm ${item.is_active ? 'btn-outline-danger' : 'btn-outline-success'}`} onClick={() => toggle(item)} disabled={busyId === item[idKey]}>
                    {busyId === item[idKey] ? 'Saving…' : item.is_active ? 'Deactivate' : 'Activate'}
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
