import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DoctorTokenTable from '../components/DoctorTokenTable';
import { Card, Empty } from '../components/UI';
import { errorMessage } from '../services/api';
import { callDoctorToken, listDoctorQueue } from '../services/doctorService';

export default function DoctorTokenQueue() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true); const [busyId, setBusyId] = useState(null); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const load = async () => { setLoading(true); setError(''); try { setRows(await listDoctorQueue()); } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const call = async (token) => { setBusyId(token.token_id); setError(''); setNotice(''); try { const result = await callDoctorToken(token.token_id); setNotice(result.detail || `Patient for token #${token.token_number} called.`); await load(); } catch (err) { setError(errorMessage(err)); } finally { setBusyId(null); } };
  return <div className="doctor-page">{error && <div className="alert alert-danger" role="alert">{error}</div>}{notice && <div className="alert alert-success" role="status">{notice}</div>}<Card title="Today’s token queue" subtitle="Call only waiting tokens assigned to your active Doctor profile.">{loading ? <div className="loading-line"><span/> Loading today’s queue…</div> : error ? <Empty title="Queue unavailable" description={error}/> : <DoctorTokenTable rows={rows} busyId={busyId} onCall={call} onOpen={(token) => navigate('/app/doctor/consultation', { state: { tokenId: token.token_id, consultationId: token.consultation_id } })}/>}</Card></div>;
}
