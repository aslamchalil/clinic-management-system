import { api, unwrap } from './api';

async function list(path) {
  const { data } = await api.get(path);
  return unwrap(data);
}

export const getLabDashboard = async () => (await api.get('/lab/dashboard/')).data;
export const searchLabPatients = (query) => list(`/lab/patients/search/?q=${encodeURIComponent(query)}`);
export const listLabRequests = () => list('/lab/requests/');
export const listLabBills = (patientId = '') => list(`/lab/bills/${patientId ? `?patient=${encodeURIComponent(patientId)}` : ''}`);
export const createLabBill = async (labRequestIds) => (await api.post('/lab/bills/', { lab_request_ids: labRequestIds })).data;
export const payLabBill = async (billId, paymentMethod) => (await api.patch(`/lab/bills/${billId}/payment/`, { payment_method: paymentMethod })).data;
export const startLabProcessing = async (requestId) => (await api.post(`/lab/requests/${requestId}/start-processing/`)).data;
export const enterLabResult = async (requestId, payload) => (await api.post(`/lab/requests/${requestId}/result/`, payload)).data;
export const listLabResults = () => list('/lab/results/');
