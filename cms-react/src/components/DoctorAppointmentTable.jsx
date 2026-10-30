import React from 'react';
import { Empty, Status } from './UI';

export default function DoctorAppointmentTable({ rows = [], onOpen }) {
  if (!rows.length) return <Empty title="No appointments today" description="There are no appointments scheduled for you today." />;
  return <div className="table-responsive"><table className="table cms-table align-middle"><thead><tr><th>Time</th><th>Patient</th><th>Status</th><th>Token</th><th>Session</th><th>Action</th></tr></thead><tbody>
    {rows.map((appointment) => {
      const token = (appointment.tokens || []).find((item) => item.token_date === appointment.appointment_date) || appointment.tokens?.[0];
      return <tr key={appointment.appointment_id}>
        <td>{String(appointment.appointment_time_slot || '—').slice(0, 5)}</td>
        <td>{appointment.patient_name || `Patient #${appointment.patient}`}</td>
        <td><Status value={appointment.status}/></td>
        <td>{token ? `#${token.token_number}` : '—'}</td>
        <td>{token?.session || '—'}</td>
        <td>{token && ['CALLED', 'CONSULTING'].includes(token.status) ? <button className="btn btn-sm btn-outline-primary" onClick={() => onOpen(token)}>{token.status === 'CALLED' ? 'Open consultation' : 'Continue consultation'}</button> : '—'}</td>
      </tr>;
    })}
  </tbody></table></div>;
}
