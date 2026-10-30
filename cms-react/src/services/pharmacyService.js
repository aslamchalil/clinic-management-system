import { api, unwrap } from './api';

const collection = async (path) => unwrap((await api.get(path)).data);

export const getPharmacyDashboard = async () => (await api.get('/pharmacy/dashboard/')).data;
export const searchPharmacyPatients = (query) => collection(`/pharmacy/patients/search/?q=${encodeURIComponent(query)}`);
export const listPharmacyPrescriptions = (patientId) => collection(`/pharmacy/prescriptions/${patientId ? `?patient=${encodeURIComponent(patientId)}` : ''}`);
export const listPharmacyBills = (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.patientId) params.set('patient', filters.patientId);
  if (filters.paymentStatus) params.set('payment_status', filters.paymentStatus);
  const query = params.toString();
  return collection(`/pharmacy/bills/${query ? `?${query}` : ''}`);
};
export const createPharmacyBill = async (payload) => (await api.post('/pharmacy/bills/', payload)).data;
export const payPharmacyBill = async (billId, paymentMethod) => (await api.patch(`/pharmacy/bills/${billId}/payment/`, { payment_method: paymentMethod })).data;
export const dispensePharmacyBill = async (billId) => (await api.post(`/pharmacy/bills/${billId}/dispense/`)).data;
export const listPharmacyStock = () => collection('/pharmacy/stock/');
export const createPharmacyStock = async (payload) => (await api.post('/pharmacy/stock/', payload)).data;
export const updatePharmacyStock = async (stockId, payload) => (await api.patch(`/pharmacy/stock/${stockId}/`, payload)).data;
