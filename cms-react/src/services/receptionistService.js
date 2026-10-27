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

export async function listAppointments() {
  const { data } = await api.get('/receptionist/appointments/');
  return collection(data, 'appointment');
}

export async function listBills() {
  const { data } = await api.get('/receptionist/bills/');
  return collection(data, 'bill');
}

export async function listTokens() {
  const { data } = await api.get('/receptionist/tokens/');
  return collection(data, 'token');
}

export async function createRegistrationBill(payload) {
  const { data } = await api.post('/receptionist/bills/', payload);
  return data;
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
