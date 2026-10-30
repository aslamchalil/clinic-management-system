import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Empty } from '../components/UI';
import { errorMessage } from '../services/api';
import { getPharmacyDashboard, searchPharmacyPatients } from '../services/pharmacyService';

export default function PharmacyDashboard() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [query, setQuery] = useState(''); const [patients, setPatients] = useState([]); const [searching, setSearching] = useState(false); const [hasSearched, setHasSearched] = useState(false); const [searchError, setSearchError] = useState('');
  const load = async () => { setLoading(true); setError(''); try { setCounts(await getPharmacyDashboard()); } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const search = async (event) => { event.preventDefault(); setSearching(true); setSearchError(''); try { setPatients(await searchPharmacyPatients(query)); setHasSearched(true); } catch (err) { setPatients([]); setSearchError(errorMessage(err)); setHasSearched(true); } finally { setSearching(false); } };
  const cards = [['Pending prescription items', 'pending_prescription_items'], ['Low-stock medicines', 'low_stock_medicines'], ['Pending pharmacy bills', 'pending_pharmacy_bills'], ['Paid pharmacy bills', 'paid_pharmacy_bills']];
  return <div className="pharmacy-page">
    <div className="row g-3 mb-3">{cards.map(([label, key]) => <div className="col-sm-6 col-xl-3" key={key}><div className="pharmacy-stat"><span>{label}</span><strong>{loading ? '…' : error ? '—' : counts?.[key] ?? '—'}</strong></div></div>)}</div>
    {error && <div className="alert alert-danger" role="alert">Dashboard counts are unavailable: {error}</div>}
    <Card title="Patient pharmacy bills" subtitle="Search the live patient directory by patient ID, name, or phone number.">
      <form className="d-flex gap-2" onSubmit={search}><input className="form-control" value={query} onChange={(e) => { setQuery(e.target.value); setHasSearched(false); }} placeholder="Patient ID, name, or phone" aria-label="Search patients"/><button className="btn btn-primary" disabled={searching || !query.trim()}>{searching ? 'Searching…' : 'Search'}</button></form>
      {searchError && <div className="alert alert-danger mt-3" role="alert">{searchError}</div>}
      {patients.length > 0 ? <div className="pharmacy-search-results">{patients.map((patient) => <div className="pharmacy-search-row" key={patient.patient_id}><div><strong>{patient.full_name}</strong><div className="small text-secondary">Patient #{patient.patient_id} · {patient.phone_number || 'No phone on record'}</div></div><button className="btn btn-sm btn-outline-primary" onClick={() => navigate(`/app/pharmacy/billing?patientId=${patient.patient_id}`)}>View bills</button></div>)}</div> : !searchError && hasSearched && !searching && <div className="mt-3"><Empty title="No patients found" description="Try a patient ID, name, or phone number."/></div>}
    </Card>
    <Card title="Quick actions"><div className="pharmacy-quick-actions"><button className="btn btn-primary" onClick={() => navigate('/app/pharmacy/prescriptions')}>Prescription Queue</button><button className="btn btn-outline-primary" onClick={() => navigate('/app/pharmacy/billing')}>Billing</button><button className="btn btn-outline-primary" onClick={() => navigate('/app/pharmacy/dispensing')}>Dispensing</button><button className="btn btn-outline-primary" onClick={() => navigate('/app/pharmacy/stock')}>Stock</button></div></Card>
    <Card title="Dispensed today"><strong className="fs-4">{loading ? '…' : error ? '—' : counts?.dispensed_today ?? 0}</strong><span className="ms-2 text-secondary">bills completed today</span></Card>
  </div>;
}
