import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, Empty, Status } from '../components/UI';
import { errorMessage } from '../services/api';
import {
  createConsultation, createDoctorLabRequest, createPrescription, createPrescriptionItem,
  finalizeConsultation, getConsultation, getDoctorPatient, listDoctorDosages,
  listDoctorLabRequests, listDoctorLabTests, listDoctorMedicines, listDoctorPrescriptions,
  listDoctorQueue,
} from '../services/doctorService';

const emptyConsultation = { symptoms: '', diagnosis: '', remarks: '' };
const resourceId = (value) => value && typeof value === 'object' ? (value.token_id ?? value.consult_id ?? value.prescription_id ?? value) : value;
function calculateQuantity(frequency, duration) {
  const frequencyMatch = /^([1-4]) times? per day$/i.exec((frequency || '').trim());
  // The form stores duration as the raw number of days; "N days" is added only for the API payload.
  const durationMatch = /^([1-9]\d{0,2})$/.exec(String(duration || '').trim());
  if (!frequencyMatch || !durationMatch || Number(durationMatch[1]) > 365) return null;
  return Number(frequencyMatch[1]) * Number(durationMatch[1]);
}

export default function DoctorConsultation() {
  const location = useLocation(); const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const requestedConsultationId = location.state?.consultationId || params.get('consultationId');
  const requestedTokenId = location.state?.tokenId || params.get('tokenId');
  const [queue, setQueue] = useState([]); const [selectedTokenId, setSelectedTokenId] = useState(requestedTokenId ? String(requestedTokenId) : '');
  const [consultation, setConsultation] = useState(null); const [patient, setPatient] = useState(null); const [patientError, setPatientError] = useState('');
  const [prescription, setPrescription] = useState(null); const [labRequests, setLabRequests] = useState([]);
  const [medicines, setMedicines] = useState([]); const [dosages, setDosages] = useState([]); const [tests, setTests] = useState([]);
  const [consultationForm, setConsultationForm] = useState(emptyConsultation);
  const [itemForm, setItemForm] = useState({ medicine: '', dosage: '', frequency: '', duration: '', instructions: '' });
  const [labForm, setLabForm] = useState({ test: '', priority: 'NORMAL' });
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');

  const token = useMemo(() => queue.find((row) => String(row.token_id) === String(selectedTokenId)), [queue, selectedTokenId]);
  const activeConsultation = consultation?.token_status === 'CONSULTING' || token?.status === 'CONSULTING';
  const calculatedQuantity = calculateQuantity(itemForm.frequency, itemForm.duration);

  const loadQueue = async () => setQueue(await listDoctorQueue());
  const loadConsultation = async (consultationId) => {
    const detail = await getConsultation(consultationId);
    setConsultation(detail);
    setConsultationForm({ symptoms: detail.symptoms || '', diagnosis: detail.diagnosis || '', remarks: detail.remarks || '' });
    const [prescriptions, requests] = await Promise.all([listDoctorPrescriptions(), listDoctorLabRequests()]);
    setPrescription(prescriptions.find((item) => Number(resourceId(item.consultation)) === Number(detail.consult_id)) || null);
    setLabRequests(requests.filter((item) => Number(resourceId(item.consultation)) === Number(detail.consult_id)));
    const [medicineRows, testRows] = await Promise.all([listDoctorMedicines(), listDoctorLabTests()]);
    setMedicines(medicineRows); setTests(testRows);
  };

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true); setError('');
      try {
        const rows = await listDoctorQueue();
        if (!live) return;
        setQueue(rows);
        if (requestedConsultationId) {
          const detail = await getConsultation(requestedConsultationId);
          if (!live) return;
          setConsultation(detail);
          setConsultationForm({ symptoms: detail.symptoms || '', diagnosis: detail.diagnosis || '', remarks: detail.remarks || '' });
          const [prescriptions, requests, medicineRows, testRows] = await Promise.all([
            listDoctorPrescriptions(), listDoctorLabRequests(), listDoctorMedicines(), listDoctorLabTests(),
          ]);
          if (!live) return;
          setPrescription(prescriptions.find((item) => Number(resourceId(item.consultation)) === Number(detail.consult_id)) || null);
          setLabRequests(requests.filter((item) => Number(resourceId(item.consultation)) === Number(detail.consult_id)));
          setMedicines(medicineRows); setTests(testRows);
          const selected = rows.find((item) => Number(item.token_id) === Number(resourceId(detail.token)));
          if (selected) setSelectedTokenId(String(selected.token_id));
        } else if (requestedTokenId) {
          setSelectedTokenId(String(requestedTokenId));
        }
      } catch (err) { if (live) setError(errorMessage(err)); }
      finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [requestedConsultationId, requestedTokenId]);

  useEffect(() => {
    let live = true;
    if (!token || !['CALLED', 'CONSULTING'].includes(token.status)) { setPatient(null); setPatientError(''); return undefined; }
    getDoctorPatient(token.patient).then((result) => { if (live) { setPatient(result); setPatientError(''); } })
      .catch((err) => { if (live) { setPatient(null); setPatientError(errorMessage(err)); } });
    if (token.consultation_id && (!consultation || Number(consultation.consult_id) !== Number(token.consultation_id))) {
      getConsultation(token.consultation_id).then(async (detail) => { if (live) await loadConsultation(detail.consult_id); })
        .catch((err) => { if (live) setError(errorMessage(err)); });
    } else if (!token.consultation_id && token.status === 'CALLED') {
      setConsultation(null); setPrescription(null); setLabRequests([]); setConsultationForm(emptyConsultation);
    }
    return () => { live = false; };
  }, [token?.token_id, token?.consultation_id, token?.status]);

  useEffect(() => {
    let live = true;
    if (!itemForm.medicine) { setDosages([]); return undefined; }
    listDoctorDosages(itemForm.medicine).then((rows) => { if (live) setDosages(rows); }).catch((err) => { if (live) setError(errorMessage(err)); });
    return () => { live = false; };
  }, [itemForm.medicine]);

  const perform = async (callback, successText) => {
    if (saving) return;
    setSaving(true); setError(''); setNotice('');
    try { await callback(); setNotice(successText); }
    catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };

  const startConsultation = (event) => {
    event.preventDefault();
    if (!token || token.status !== 'CALLED') return;
    perform(async () => {
      const created = await createConsultation({ token: token.token_id, ...consultationForm });
      await loadQueue();
      await loadConsultation(created.consult_id);
    }, 'Consultation started and saved.');
  };

  const savePrescription = () => perform(async () => {
    await createPrescription(consultation.consult_id);
    await loadConsultation(consultation.consult_id);
  }, 'Prescription created.');

  const addPrescriptionItem = (event) => {
    event.preventDefault();
    if (calculatedQuantity === null) {
      setError('Select a supported frequency and enter a duration from 1 to 365 days.');
      return;
    }
    perform(async () => {
      await createPrescriptionItem({
        ...itemForm,
        duration: `${itemForm.duration} days`,
        prescription: prescription.prescription_id,
        medicine: Number(itemForm.medicine),
        dosage: Number(itemForm.dosage),
        prescribed_quantity: calculatedQuantity,
      });
      await loadConsultation(consultation.consult_id);
      setItemForm({ medicine: '', dosage: '', frequency: '', duration: '', instructions: '' });
    }, 'Prescription item saved.');
  };

  const addLabRequest = (event) => {
    event.preventDefault();
    perform(async () => {
      await createDoctorLabRequest({ consultation: consultation.consult_id, test: Number(labForm.test), priority: labForm.priority });
      const rows = await listDoctorLabRequests();
      setLabRequests(rows.filter((item) => Number(resourceId(item.consultation)) === Number(consultation.consult_id)));
      setLabForm({ test: '', priority: 'NORMAL' });
    }, 'Lab request created.');
  };

  const finish = () => perform(async () => {
    await finalizeConsultation(consultation.consult_id);
    setConsultation((current) => ({ ...current, token_status: 'COMPLETED' }));
    await loadQueue();
  }, 'Consultation finalized.');

  const openSelectedToken = (value) => {
    setSelectedTokenId(value);
    setConsultation(null); setPatient(null); setPatientError(''); setPrescription(null); setLabRequests([]);
    navigate(value ? `/app/doctor/consultation?tokenId=${value}` : '/app/doctor/consultation', { replace: true });
  };

  return <div className="doctor-page doctor-consultation-page">
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    {notice && <div className="alert alert-success" role="status">{notice}</div>}
    <Card title="Consultation workspace" subtitle="Open only a called or in-progress token assigned to your Doctor profile.">
      {loading ? <div className="loading-line"><span/> Loading your queue…</div> : error && !queue.length ? <Empty title="Consultation unavailable" description={error}/> : <div className="row g-3 align-items-end">
        <div className="col-lg-8"><label className="form-label" htmlFor="consultation-token">Select today’s called or consulting token</label><select id="consultation-token" className="form-select" value={selectedTokenId} onChange={(event) => openSelectedToken(event.target.value)}><option value="">Choose token</option>{queue.filter((item) => ['CALLED', 'CONSULTING'].includes(item.status)).map((item) => <option value={item.token_id} key={item.token_id}>Token #{item.token_number} · {item.patient_name} · {item.session} · {item.status}</option>)}</select></div>
        {token && <div className="col-lg-4"><Status value={token.status}/><span className="ms-2">Token #{token.token_number} · {token.session}</span></div>}
      </div>}
    </Card>

    {token && <Card title="Patient file" subtitle="Patient details are returned only while a valid current Doctor token is open.">
      {patientError && <div className="alert alert-warning" role="alert">Patient details could not be loaded: {patientError}</div>}
      {patient ? <dl className="row doctor-patient-file"><dt className="col-sm-3">Patient</dt><dd className="col-sm-9">{patient.full_name} · #{patient.patient_id}</dd><dt className="col-sm-3">Date of birth</dt><dd className="col-sm-9">{patient.dob}</dd><dt className="col-sm-3">Phone</dt><dd className="col-sm-9">{patient.phone_number || '—'}</dd><dt className="col-sm-3">Email</dt><dd className="col-sm-9">{patient.email || '—'}</dd><dt className="col-sm-3">Address</dt><dd className="col-sm-9">{patient.address || '—'}</dd><dt className="col-sm-3">Blood group</dt><dd className="col-sm-9">{patient.blood_group || '—'}</dd><dt className="col-sm-3">Emergency contact</dt><dd className="col-sm-9">{patient.emergency_contact || '—'}</dd></dl> : !patientError && <div className="loading-line"><span/> Loading patient file…</div>}
    </Card>}

    {token?.status === 'CALLED' && !consultation && <Card title="Start consultation" subtitle="Symptoms, diagnosis, and remarks are persisted with the consultation.">
      <form onSubmit={startConsultation}><div className="row g-3"><div className="col-12"><label className="form-label" htmlFor="consult-symptoms">Symptoms</label><textarea id="consult-symptoms" className="form-control" rows="3" value={consultationForm.symptoms} onChange={(e) => setConsultationForm({ ...consultationForm, symptoms: e.target.value })}/></div><div className="col-12"><label className="form-label" htmlFor="consult-diagnosis">Diagnosis</label><textarea id="consult-diagnosis" className="form-control" rows="3" value={consultationForm.diagnosis} onChange={(e) => setConsultationForm({ ...consultationForm, diagnosis: e.target.value })}/></div><div className="col-12"><label className="form-label" htmlFor="consult-remarks">Remarks</label><textarea id="consult-remarks" className="form-control" rows="2" value={consultationForm.remarks} onChange={(e) => setConsultationForm({ ...consultationForm, remarks: e.target.value })}/></div></div><button className="btn btn-primary mt-3" disabled={saving}>{saving ? 'Saving…' : 'Start and save consultation'}</button></form>
    </Card>}

    {consultation && <>
      <Card title={`Consultation #${consultation.consult_id}`} subtitle={`${consultation.patient_name || patient?.full_name || `Patient #${consultation.patient}`} · ${consultation.token_date} · Token #${consultation.token_number} · ${consultation.session}`}>
        <div className="doctor-print-actions"><button className="btn btn-outline-primary btn-sm" onClick={() => window.print()}><i className="bi bi-printer me-1"/>Print consultation report</button><Status value={consultation.token_status}/></div>
        <div className="doctor-report-body"><h3>Clinical notes</h3><p><strong>Symptoms</strong><br/>{consultation.symptoms || '—'}</p><p><strong>Diagnosis</strong><br/>{consultation.diagnosis || '—'}</p><p><strong>Remarks</strong><br/>{consultation.remarks || '—'}</p><p className="small text-secondary">Recorded: {consultation.created_at ? new Date(consultation.created_at).toLocaleString() : '—'}</p></div>
      </Card>

      {activeConsultation && <Card title="Prescription" subtitle="Medicine and dosage options are active records from the backend.">
        {!prescription ? <button className="btn btn-outline-primary" disabled={saving} onClick={savePrescription}>{saving ? 'Saving…' : 'Create prescription'}</button> : <>
          {prescription.items?.length ? <div className="table-responsive mb-3"><table className="table cms-table align-middle"><thead><tr><th>Medicine</th><th>Dosage</th><th>Frequency</th><th>Duration</th><th>Instructions</th><th>Quantity</th><th>Dispensing</th></tr></thead><tbody>{prescription.items.map((item) => <tr key={item.prescription_item_id}><td>{item.medicine_name}</td><td>{item.dosage_details}</td><td>{item.frequency}</td><td>{item.duration}</td><td>{item.instructions || '—'}</td><td>{item.prescribed_quantity}</td><td><Status value={item.dispensed_status}/><div className="small">{item.dispensed_quantity} dispensed</div></td></tr>)}</tbody></table></div> : <Empty title="No prescription items" description="Add prescribed medicines below."/>}
          <form className="row g-3 doctor-entry-form" onSubmit={addPrescriptionItem}>
            <div className="col-md-4"><label className="form-label">Medicine</label><select className="form-select" required value={itemForm.medicine} onChange={(e) => setItemForm({ ...itemForm, medicine: e.target.value, dosage: '' })}><option value="">Select active medicine</option>{medicines.map((row) => <option key={row.medicine_id} value={row.medicine_id}>{row.name}{row.generic_name ? ` · ${row.generic_name}` : ''}</option>)}</select></div>
            <div className="col-md-4"><label className="form-label">Dosage</label><select className="form-select" required disabled={!itemForm.medicine} value={itemForm.dosage} onChange={(e) => setItemForm({ ...itemForm, dosage: e.target.value })}><option value="">Select active dosage</option>{dosages.map((row) => <option key={row.dosage_id} value={row.dosage_id}>{row.dosage_value} {row.unit}</option>)}</select></div>
            <div className="col-md-4"><label className="form-label">Frequency</label><select className="form-select" required value={itemForm.frequency} onChange={(e) => setItemForm({ ...itemForm, frequency: e.target.value })}><option value="">Select times per day</option>{[1, 2, 3, 4].map((count) => <option key={count} value={`${count} ${count === 1 ? 'time' : 'times'} per day`}>{count} {count === 1 ? 'time' : 'times'} per day</option>)}</select></div>
            <div className="col-md-4"><label className="form-label">Duration (days)</label><input className="form-control" type="number" min="1" max="365" step="1" required value={itemForm.duration} onChange={(e) => setItemForm({ ...itemForm, duration: e.target.value })} /></div>
            <div className="col-md-3"><label className="form-label">Quantity</label><input className="form-control" type="number" value={calculatedQuantity ?? ''} readOnly aria-readonly="true" /><div className="form-text">Calculated from frequency × duration.</div></div>
            <div className="col-md-5"><label className="form-label">Instructions</label><input className="form-control" value={itemForm.instructions} onChange={(e) => setItemForm({ ...itemForm, instructions: e.target.value })}/></div>
            {calculatedQuantity === null && <div className="col-12"><div className="form-text text-danger" role="alert">Select a supported frequency and enter a duration from 1 to 365 days to calculate quantity.</div></div>}
            <div className="col-12"><button className="btn btn-primary" disabled={saving || !medicines.length || !itemForm.medicine || !itemForm.dosage || !itemForm.frequency || !itemForm.duration || calculatedQuantity === null}>{saving ? 'Saving…' : 'Add prescription item'}</button></div>
          </form>
        </>}
      </Card>}

      {activeConsultation && <Card title="Lab requests" subtitle="Choose from active Lab Test records. Results are recorded by Lab staff.">
        {labRequests.length ? <div className="table-responsive mb-3"><table className="table cms-table"><thead><tr><th>Request</th><th>Test</th><th>Priority</th><th>Status</th></tr></thead><tbody>{labRequests.map((row) => <tr key={row.lab_request_id}><td>#{row.lab_request_id}</td><td>{row.test_name}</td><td>{row.priority}</td><td><Status value={row.status}/></td></tr>)}</tbody></table></div> : <Empty title="No lab requests" description="No lab tests have been requested for this consultation."/>}
        <form className="row g-3" onSubmit={addLabRequest}><div className="col-md-7"><label className="form-label">Active lab test</label><select className="form-select" required value={labForm.test} onChange={(e) => setLabForm({ ...labForm, test: e.target.value })}><option value="">Select test</option>{tests.map((test) => <option key={test.test_id} value={test.test_id}>{test.test_name} · ₹{test.test_price}</option>)}</select></div><div className="col-md-3"><label className="form-label">Priority</label><select className="form-select" value={labForm.priority} onChange={(e) => setLabForm({ ...labForm, priority: e.target.value })}><option value="NORMAL">Normal</option><option value="URGENT">Urgent</option></select></div><div className="col-md-2 d-flex align-items-end"><button className="btn btn-outline-primary" disabled={saving || !tests.length}>{saving ? 'Saving…' : 'Request test'}</button></div></form>
      </Card>}

      {activeConsultation && <div className="d-flex justify-content-end mb-4"><button className="btn btn-success" disabled={saving} onClick={finish}>{saving ? 'Saving…' : 'Finalize consultation'}</button></div>}
    </>}
  </div>;
}
