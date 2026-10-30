import { api, unwrap } from './api';

async function list(path) {
  const { data } = await api.get(path);
  return unwrap(data);
}

export const getDoctorDashboard = async () => (await api.get('/doctor/dashboard/')).data;
export const listDoctorAppointments = () => list('/doctor/appointments/today/');
export const listDoctorQueue = () => list('/doctor/queue/');
export const callDoctorToken = async (tokenId) => (await api.post(`/doctor/tokens/${tokenId}/call/`)).data;
export const searchDoctorPatients = (query) => list(`/doctor/patients/search/?q=${encodeURIComponent(query)}`);
export const getDoctorPatient = async (patientId) => (await api.get(`/doctor/patients/${patientId}/`)).data;
export const createConsultation = async (payload) => (await api.post('/doctor/consultations/', payload)).data;
export const getConsultation = async (consultationId) => (await api.get(`/doctor/consultations/${consultationId}/`)).data;
export const finalizeConsultation = async (consultationId) => (await api.post(`/doctor/consultations/${consultationId}/finalize/`)).data;
export const listConsultationHistory = () => list('/doctor/consultations/history/');
export const listDoctorPrescriptions = () => list('/doctor/prescriptions/');
export const createPrescription = async (consultationId) => (await api.post('/doctor/prescriptions/', { consultation: consultationId })).data;
export const createPrescriptionItem = async (payload) => (await api.post('/doctor/prescription-items/', payload)).data;
export const listDoctorMedicines = () => list('/doctor/medicines/');
export const listDoctorDosages = (medicineId) => list(`/doctor/dosages/${medicineId ? `?medicine_id=${encodeURIComponent(medicineId)}` : ''}`);
export const listDoctorLabTests = () => list('/doctor/lab-tests/');
export const listDoctorLabRequests = () => list('/doctor/lab-requests/list/');
export const createDoctorLabRequest = async (payload) => (await api.post('/doctor/lab-requests/', payload)).data;
export const listDoctorLabResults = () => list('/lab/results/');
export const getDoctorLabResult = async (resultId) => (await api.get(`/lab/results/${resultId}/`)).data;
