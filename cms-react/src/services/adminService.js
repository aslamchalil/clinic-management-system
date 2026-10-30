import { api, unwrap } from './api';

async function getCollection(path) {
  const { data } = await api.get(path);
  return unwrap(data);
}

export const listStaff = () => getCollection('/auth/staff/');
export const listRoles = () => getCollection('/auth/roles/');
export const listDepartments = () => getCollection('/auth/departments/');
export const listSpecializations = () => getCollection('/auth/specializations/');
export const listDoctors = () => getCollection('/auth/doctors/');
export const listLabTests = () => getCollection('/auth/lab-tests/');
export const listAdminMedicines = () => getCollection('/pharmacy/medicines/');
export const listAdminStockRequests = (status) => getCollection(`/auth/stock-requests/admin/${status ? `?status=${encodeURIComponent(status)}` : ''}`);
export const listMyStockRequests = () => getCollection('/auth/stock-requests/');
export const listMonthlyBills = (year, month) => getCollection(`/auth/monthly-bills/?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`);

export async function createStaff(payload) {
  const { data } = await api.post('/auth/staff/', payload);
  return data;
}

export async function updateStaff(staffId, payload) {
  const { data } = await api.patch(`/auth/staff/${staffId}/`, payload);
  return data;
}

export async function updateStaffStatus(staffId, isActive) {
  return updateStaff(staffId, { is_active: isActive });
}

export async function createDoctorProfile(payload) {
  const { data } = await api.post('/auth/doctors/', payload);
  return data;
}

export async function updateDoctorProfile(docId, payload) {
  const { data } = await api.patch(`/auth/doctors/${docId}/`, payload);
  return data;
}

export async function createDepartment(payload) {
  const { data } = await api.post('/auth/departments/', payload);
  return data;
}

export async function updateDepartment(departmentId, payload) {
  const { data } = await api.patch(`/auth/departments/${departmentId}/`, payload);
  return data;
}

export async function createSpecialization(payload) {
  const { data } = await api.post('/auth/specializations/', payload);
  return data;
}

export async function updateSpecialization(specId, payload) {
  const { data } = await api.patch(`/auth/specializations/${specId}/`, payload);
  return data;
}

export async function createLabTest(payload) {
  const { data } = await api.post('/auth/lab-tests/', payload);
  return data;
}

export async function updateLabTest(testId, payload) {
  const { data } = await api.patch(`/auth/lab-tests/${testId}/`, payload);
  return data;
}

export async function createMedicine(payload) {
  const { data } = await api.post('/pharmacy/medicines/', payload);
  return data;
}

export async function updateMedicine(medicineId, payload) {
  const { data } = await api.patch(`/pharmacy/medicines/${medicineId}/`, payload);
  return data;
}

export async function submitStockRequest(payload) {
  const { data } = await api.post('/auth/stock-requests/', payload);
  return data;
}

export async function reviewStockRequest(requestId, status, reviewNote = '', approvedQuantity) {
  const payload = { status, review_note: reviewNote };
  if (approvedQuantity !== undefined && approvedQuantity !== null) payload.approved_quantity = Number(approvedQuantity);
  const { data } = await api.post(`/auth/stock-requests/${requestId}/review/`, {
    ...payload,
  });
  return data;
}
