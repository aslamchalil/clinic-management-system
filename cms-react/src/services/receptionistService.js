import { api } from './api';

function collection(data, resourceName) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  throw new Error(`The ${resourceName} API returned an unexpected response format.`);
}

export async function listPatients() {
  const { data } = await api.get('/receptionist/patients/');
  return collection(data, 'patient');
}

export async function listDoctors() {
  const { data } = await api.get('/receptionist/doctors/');
  return collection(data, 'doctor');
}

export async function listAppointments() {
  const { data } = await api.get('/receptionist/appointments/');
  return collection(data, 'appointment');
}

export async function listBills() {
  const { data } = await api.get('/receptionist/bills/');
  return collection(data, 'bill');
}

export async function listTokens({ tokenDate, billId } = {}) {
  const params = {};
  if (tokenDate) params.token_date = tokenDate;
  if (billId !== undefined && billId !== null) params.bill_id = billId;
  const { data } = await api.get('/receptionist/tokens/', { params });
  return collection(data, 'token');
}

export async function createRegistrationBill(payload) {
  const { data } = await api.post('/receptionist/bills/', payload);
  return data;
}

export function getOrCreateWalkInVisitKey(patientId) {
  const storageKey = `cms_walkin_visit_${patientId}`;
  let existing;
  try { existing = globalThis.sessionStorage?.getItem(storageKey); } catch { /* Storage may be disabled. */ }
  if (existing) return existing;
  let visitKey;
  if (globalThis.crypto?.randomUUID) {
    visitKey = globalThis.crypto.randomUUID();
  } else {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    visitKey = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  try { globalThis.sessionStorage?.setItem(storageKey, visitKey); } catch { /* Key remains in page state. */ }
  return visitKey;
}

export function clearWalkInVisitKey(patientId) {
  try { globalThis.sessionStorage?.removeItem(`cms_walkin_visit_${patientId}`); } catch { /* Safe to ignore. */ }
}

export async function payRegistrationBill(billId, paymentMethod) {
  const { data } = await api.post(`/receptionist/bills/${billId}/pay/`, {
    payment_method: paymentMethod,
  });
  return data;
}

export async function generateToken(payload) {
  const response = await api.post('/receptionist/tokens/generate/', payload);
  return { status: response.status, data: response.data };
}
