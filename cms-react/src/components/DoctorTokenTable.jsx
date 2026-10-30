import React from 'react';
import { Empty, Status } from './UI';

export default function DoctorTokenTable({ rows = [], busyId, onCall, onOpen }) {
  if (!rows.length) return <Empty title="No tokens in today’s queue" description="There are no waiting, called, or consulting tokens for today." />;
  return <div className="table-responsive"><table className="table cms-table align-middle"><thead><tr><th>Token</th><th>Patient</th><th>Session</th><th>Status</th><th>Action</th></tr></thead><tbody>
    {rows.map((token) => <tr key={token.token_id}>
      <td>#{token.token_number}</td><td>{token.patient_name || `Patient #${token.patient}`}</td><td>{token.session}</td><td><Status value={token.status}/></td>
      <td className="text-nowrap">{token.status === 'WAITING' ? <button className="btn btn-sm btn-primary" disabled={busyId === token.token_id} onClick={() => onCall(token)}>{busyId === token.token_id ? 'Calling…' : 'Call patient'}</button> : ['CALLED', 'CONSULTING'].includes(token.status) ? <button className="btn btn-sm btn-outline-primary" onClick={() => onOpen(token)}>{token.status === 'CALLED' ? 'Open consultation' : 'Continue consultation'}</button> : '—'}</td>
    </tr>)}
  </tbody></table></div>;
}
