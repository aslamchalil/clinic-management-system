import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DoctorAppointmentTable from '../components/DoctorAppointmentTable';
import { Card, Empty } from '../components/UI';
import { errorMessage } from '../services/api';
import { listDoctorAppointments } from '../services/doctorService';

export default function DoctorAppointments() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = async () => { setLoading(true); setError(''); try { setRows(await listDoctorAppointments()); } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  return <div className="doctor-page">{error && <div className="alert alert-danger" role="alert">{error}</div>}<Card title="Today’s appointments" subtitle="Appointments are filtered by the backend using your Doctor profile and clinic date.">{loading ? <div className="loading-line"><span/> Loading appointments…</div> : error ? <Empty title="Appointments unavailable" description={error}/> : <DoctorAppointmentTable rows={rows} onOpen={(token) => navigate('/app/doctor/consultation', { state: { tokenId: token.token_id } })}/>}</Card></div>;
}
