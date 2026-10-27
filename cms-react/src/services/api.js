import axios from 'axios';

export const ROLE_ID_TO_NAME = {
  1: 'DOCTOR',
  2: 'PHARMACIST',
  3: 'ADMIN',
  4: 'LAB_ASSISTANT',
  5: 'RECEPTIONIST',
};

export function normalizeRoleName(role) {
  if (role === null || role === undefined || role === '') return '';

  const value = String(role).trim();
  const asNumber = Number(value);

  if (!Number.isNaN(asNumber) && Object.prototype.hasOwnProperty.call(ROLE_ID_TO_NAME, asNumber)) {
    return ROLE_ID_TO_NAME[asNumber];
  }

  const normalized = value.toUpperCase();
  return normalized === 'LAB_TECHNICIAN' ? 'LAB_ASSISTANT' : normalized;
}

export function roleMatches(role, expectedRole) {
  return normalizeRoleName(role) === normalizeRoleName(expectedRole);
}

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '');
export const api = axios.create({ baseURL: API_BASE, timeout: 20000 });

let isRefreshing = false;
let refreshSubscribers = [];

function notifyRefreshSubscribers(token) {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
}

function handleAuthExpired() {
  clearAuth();
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cms_access_token');
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;
    if (!originalRequest) return Promise.reject(error);

    const isAuthError = error?.response?.status === 401;
    const isRefreshRequest = originalRequest.__isRefresh || originalRequest.url?.includes('/auth/token/refresh/');

    if (!isAuthError || isRefreshRequest || originalRequest.__isRetry) {
      return Promise.reject(error);
    }

    const refreshToken = localStorage.getItem('cms_refresh_token');
    if (!refreshToken) {
      handleAuthExpired();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshSubscribers.push((token) => {
          try {
            originalRequest.__isRetry = true;
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          } catch (retryError) {
            reject(retryError);
          }
        });
      });
    }

    isRefreshing = true;

    try {
      const refreshResponse = await api.post('/auth/token/refresh/', { refresh: refreshToken }, { __isRefresh: true });
      const newAccessToken = refreshResponse?.data?.access || refreshResponse?.data?.access_token;

      if (!newAccessToken) {
        throw new Error('Refresh token response did not include an access token.');
      }

      localStorage.setItem('cms_access_token', newAccessToken);
      originalRequest.__isRetry = true;
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      notifyRefreshSubscribers(newAccessToken);

      return api(originalRequest);
    } catch (refreshError) {
      handleAuthExpired();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
      refreshSubscribers = [];
    }
  }
);

export function unwrap(data) { return Array.isArray(data) ? data : (data?.results || data?.data || (data ? [data] : [])); }
export function errorMessage(error) {
  const d = error?.response?.data;
  if (!d) return error?.message || 'Request failed. Check that Django is running.';
  if (typeof d.detail === 'string') return d.detail;
  if (typeof d === 'string') return d;
  return Object.entries(d).map(([k,v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
}
export async function apiLogin(username, password) {
  const { data } = await api.post('/auth/login/', { username, password });
  const access = data.access || data.access_token;
  if (!access || !data.user) throw new Error('Login response did not contain an access token and user profile.');
  localStorage.setItem('cms_access_token', access);
  if (data.refresh) localStorage.setItem('cms_refresh_token', data.refresh);
  const u = data.user;
  const role = normalizeRoleName(u.role);
  const user = { id:u.id, username:u.username, name:[u.first_name,u.last_name].filter(Boolean).join(' ') || u.username, role, staffId:u.staff_id, department:u.department };
  localStorage.setItem('cms_session', JSON.stringify(user));
  return user;
}
export function clearAuth(){ ['cms_access_token','cms_refresh_token','cms_session'].forEach(k=>localStorage.removeItem(k)); }
export const endpoints = {
  ADMIN: {
    staff: {url:'/auth/staff/', title:'Staff', fields:['staff_id','username','first_name','last_name','role','department','email','phone_number','is_active']},
    departments:{url:'/auth/departments/',title:'Departments',fields:['department_id','department_name','is_active']},
    specializations:{url:'/auth/specializations/',title:'Specializations',fields:['spec_id','spec_name']},
    doctors:{url:'/auth/staff/',title:'Staff directory',fields:['staff_id','first_name','last_name','role','department','email','is_active'],filterRole:'DOCTOR'},
    medicines:{url:'/pharmacy/medicines/',title:'Medicines',fields:['medicine_id','name','generic_name','category','is_active']},
    'lab-tests':{url:'/lab/tests/',title:'Lab test catalogue',fields:['test_id','test_name','test_type','test_price','is_active']},
  },
  RECEPTIONIST: {
    patients:{url:'/receptionist/patients/',title:'Patients',fields:['patient_id','full_name','dob','gender','phone_number','email','is_active']},
    'patient-register':{url:'/receptionist/patients/',title:'Register patient',fields:['full_name','dob','gender','phone_number','email','address','blood_group','emergency_contact'] ,create:true},
    appointments:{url:'/receptionist/appointments/',title:'Appointments',fields:['appointment_id','patient','doctor','appointment_date','appointment_time_slot','status','advance_amount','advance_payment_status']},
    billing:{url:'/receptionist/bills/',title:'Registration bills',fields:['bill_id','patient','doctor','registration_fee','consultation_fee','total_amount','payment_status','payment_method','bill_date']},
    tokens:{url:'/receptionist/tokens/',title:'Token queue',fields:['token_id','token_number','patient','doctor','token_date','session','status']},
  },
  DOCTOR: {
    appointments:{url:'/doctor/appointments/today/',title:'Today appointments',fields:['appointment_id','patient_name','patient','appointment_date','appointment_time_slot','status']},
    'token-queue':{url:'/doctor/queue/',title:'Your patient queue',fields:['token_id','token_number','patient_name','patient','token_date','session','status'],doctorQueue:true},
    history:{url:'/doctor/queue/',title:'Your current queue',fields:['token_id','token_number','patient_name','patient','status']},
    prescriptions:{url:'/doctor/prescriptions/',title:'Prescriptions',fields:['prescription_id','consultation','patient_name','doctor_name','created_at','items']},
    'lab-requests':{url:'/doctor/lab-requests/list/',title:'Lab requests',fields:['lab_request_id','consultation','test','order_date','priority','status']},
    'lab-results':{url:'/lab/results/',title:'Lab results',fields:['result_id','lab_request','result_value','unit','reference_range','result_date','report']},
    consultation:{url:'/doctor/queue/',title:'Start consultation from a called token',fields:['token_id','token_number','patient_name','patient','status'],consultation:true},
  },
  PHARMACIST: {
    prescriptions:{url:'/pharmacy/prescriptions/',title:'Prescriptions to dispense',fields:['prescription_id','consultation','patient_name','doctor_name','created_at','items']},
    stock:{url:'/pharmacy/stock/',title:'Medicine stock',fields:['stock_id','medicine','medicine_name','quantity','unit_cost_price','selling_price','reorder_level']},
    dispensing:{url:'/pharmacy/prescriptions/',title:'Prescription dispensing',fields:['prescription_id','consultation','patient_name','items']},
    billing:{url:'/pharmacy/bills/',title:'Pharmacy bills',fields:['bill_id','patient','total_amount','payment_status','payment_method','bill_date','items']},
  },
  LAB_ASSISTANT: {
    requests:{url:'/lab/requests/',title:'Lab requests',fields:['lab_request_id','consultation','test','test_name','order_date','priority','status','is_active']},
    billing:{url:'/lab/bills/',title:'Lab billing',fields:['lab_bill_id','patient','total_amount','payment_status','payment_method','bill_date','items'],labBills:true},
    processing:{url:'/lab/requests/',title:'Lab processing',fields:['lab_request_id','consultation','test_name','status','priority']},
    results:{url:'/lab/results/',title:'Lab results',fields:['result_id','lab_request','result_value','unit','reference_range','result_date','report']},
    inventory:{url:null,title:'Lab consumables',fields:[],unavailable:true},
  }
};
export async function getResource(url){const r=await api.get(url);return unwrap(r.data);}
