import React from 'react';
import { Card } from '../components/UI';

export default function ActivitySessions() {
  return <Card title="Activity & login sessions" subtitle="Available records from the current authentication setup.">
    <div className="alert alert-info mb-3">
      <strong>No historical activity feed is available.</strong> The application currently authenticates API users with JWT access and refresh tokens. The backend does not persist a sign-in/sign-out audit event or a revocable per-device session record for this flow.
    </div>
    <p className="mb-2">Django’s session framework is installed, but the React login flow does not create Django sessions. Showing database sessions here would therefore not provide a reliable login history.</p>
    <p className="small text-secondary mb-0">A future audit feed should record sign-in success/failure, sign-out, staff activation changes, and Admin reviews as append-only events with actor, event type, timestamp, and safe metadata. It must never store passwords or JWT values. No events are fabricated on this page.</p>
  </Card>;
}
