import React,{useEffect,useMemo,useState} from 'react';
import {api,endpoints,unwrap,errorMessage,roleMatches} from '../services/api';
import {Card,Status,Search,Empty} from '../components/UI';
const labelize=k=>String(k).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const val=v=>v===null||v===undefined||v===''?'—':typeof v==='object'?JSON.stringify(v):String(v);
const prompts={
  patient:[['full_name','Full name'],['dob','Date of birth (YYYY-MM-DD)'],['gender','Gender: MALE/FEMALE/OTHER'],['phone_number','Phone number'],['email','Email (optional)'],['address','Address'],['blood_group','Blood group (optional)'],['emergency_contact','Emergency contact (optional)']],
  appointment:[['patient','Patient ID'],['doctor','Doctor ID'],['appointment_date','Date (YYYY-MM-DD)'],['appointment_time_slot','Time (HH:MM)'],['advance_amount','Advance amount']],
  registrationBill:[['patient','Patient ID'],['doctor','Doctor ID'],['registration_fee','Registration fee'],['consultation_fee','Consultation fee']],
  consultation:[['token','Called token ID'],['symptoms','Symptoms'],['diagnosis','Diagnosis'],['remarks','Remarks (optional)']],
  prescription:[['consultation','Consultation ID']],
  prescriptionItem:[['prescription','Prescription ID'],['medicine','Medicine ID'],['dosage','Dosage ID'],['frequency','Frequency'],['duration','Duration'],['prescribed_quantity','Quantity'],['instructions','Instructions (optional)']],
  labRequest:[['consultation','Consultation ID'],['test','Lab test ID'],['priority','Priority: NORMAL or URGENT']],
  labResult:[['result_value','Result value'],['unit','Unit (optional)'],['reference_range','Reference range (optional)'],['report','Report / notes']],
  pharmacyBill:[['patient','Patient ID'],['items','Items JSON: [{"medicine":1,"prescription_item":1,"quantity_dispensed":1}]']],
  stock:[['medicine','Medicine ID'],['quantity','Quantity'],['unit_cost_price','Unit cost price'],['selling_price','Selling price'],['reorder_level','Reorder level']],
  medicine:[['name','Medicine name'],['generic_name','Generic name'],['category','Category']],
  staff:[['username','Username'],['password','Temporary password (min 8 chars)'],['first_name','First name'],['last_name','Last name'],['email','Email'],['dob','Date of birth (YYYY-MM-DD)'],['gender','Gender: MALE/FEMALE/OTHER'],['phone_number','Phone number'],['role','Role ID'],['department','Department ID']],
  department:[['department_name','Department name']],
  specialization:[['spec_name','Specialization name']],
  labTest:[['test_name','Test name'],['test_type','Test type'],['description','Description'],['test_price','Price'],['min_value','Minimum value (optional)'],['max_value','Maximum value (optional)']],
};
function askPayload(kind){const fields=prompts[kind];if(!fields)return null;const out={};for(const [key,label] of fields){const answer=window.prompt(label,'');if(answer===null)return null;if(!answer.trim() && !/optional/i.test(label))return {__error:`${label} is required.`};if(!answer.trim())continue;try{out[key]=key==='items'?JSON.parse(answer):(['patient','doctor','bill_id','appointment','token','consultation','prescription','medicine','dosage','test','prescribed_quantity','quantity','role','department','registration_fee','consultation_fee','advance_amount','unit_cost_price','selling_price','reorder_level','test_price','min_value','max_value'].includes(key)?Number(answer):answer)}catch{return {__error:`Invalid JSON for ${label}.`}}}return out;}
export default function WorkspacePage({page,user}){
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [departmentForm,setDepartmentForm]=useState({department_name:'',is_active:true});
 const [showDepartmentModal,setShowDepartmentModal]=useState(false);
 const [submittingDepartment,setSubmittingDepartment]=useState(false);
 const cfg=endpoints[user.role]?.[page];
 async function load(){if(!cfg?.url){setRows([]);setLoading(false);return}setLoading(true);setError('');try{const r=await api.get(cfg.url);let list=unwrap(r.data);if(cfg.filterRole)list=list.filter(x=>roleMatches(x.role,cfg.filterRole));setRows(list)}catch(e){setError(errorMessage(e));setRows([])}finally{setLoading(false)}}
 useEffect(()=>{load()},[page,user.role]);
 const fields=cfg?.fields||[];const visible=useMemo(()=>rows.filter(r=>JSON.stringify(r).toLowerCase().includes(query.toLowerCase())),[rows,query]);
 async function run(label,method,url,kind,row){let payload={};if(kind){payload=askPayload(kind);if(payload===null)return;if(payload.__error){setError(payload.__error);return}}setBusy(true);setError('');setNotice('');try{const response=await api({method,url,data:payload});setNotice(`${label} completed successfully${response?.data?.detail?`: ${response.data.detail}`:''}`);await load()}catch(e){setError(errorMessage(e))}finally{setBusy(false)}}
 if(!cfg)return <Card title={labelize(page)} subtitle="This workspace is not configured for the signed-in role."><Empty title="No configured API" description="No matching API endpoint is configured for this role and page. No demo data is shown."/></Card>;
 if(cfg.unavailable)return <Card title={cfg.title} subtitle="The current Django backend has no persistent consumables endpoint."><Empty title="Backend endpoint required" description="Lab consumables must be stored and updated by Django before this page can display or modify live stock. No inventory data is fabricated."/></Card>;
 const actions=[];
 if(user.role==='ADMIN'&&page==='staff')actions.push(['Create staff account','POST','/auth/staff/','staff']);
 if(user.role==='ADMIN'&&page==='departments')actions.push(['Add department','POST','/auth/departments/','department']);
 if(user.role==='ADMIN'&&page==='specializations')actions.push(['Add specialization','POST','/auth/specializations/','specialization']);
 if(user.role==='ADMIN'&&page==='medicines')actions.push(['Add medicine','POST','/pharmacy/medicines/','medicine']);
 if(user.role==='RECEPTIONIST'&&page==='patient-register')actions.push(['Register patient','POST','/receptionist/patients/','patient']);
 if(user.role==='RECEPTIONIST'&&page==='appointments')actions.push(['Create appointment','POST','/receptionist/appointments/','appointment']);
 if(user.role==='RECEPTIONIST'&&page==='billing')actions.push(['Create registration bill','POST','/receptionist/bills/','registrationBill']);
 if(user.role==='DOCTOR'&&page==='consultation')actions.push(['Start consultation','POST','/doctor/consultations/','consultation']);
 if(user.role==='DOCTOR'&&page==='prescriptions')actions.push(['Create prescription','POST','/doctor/prescriptions/','prescription'],['Add prescription item','POST','/doctor/prescription-items/','prescriptionItem']);
 if(user.role==='DOCTOR'&&page==='lab-requests')actions.push(['Request lab test','POST','/doctor/lab-requests/','labRequest']);
 if(user.role==='PHARMACIST'&&page==='stock')actions.push(['Add stock record','POST','/pharmacy/stock/','stock']);
 if(user.role==='PHARMACIST'&&page==='billing')actions.push(['Create pharmacy bill','POST','/pharmacy/bills/','pharmacyBill']);
 const rowActions=(r)=>{
  const a=[];
  if(user.role==='RECEPTIONIST'&&page==='billing'&&r.payment_status==='PENDING')a.push(<button key="pay" className="btn btn-sm btn-primary me-1 mb-1" disabled={busy} onClick={async()=>{const method=window.prompt('Payment method: CASH, CARD, or UPI','CASH');if(!method)return;setBusy(true);try{await api.post(`/receptionist/bills/${r.bill_id}/pay/`,{payment_method:method.toUpperCase()});setNotice('Registration payment recorded.');await load()}catch(e){setError(errorMessage(e))}finally{setBusy(false)}}}>Record payment</button>);
  if(user.role==='LAB_ASSISTANT'&&page==='requests'&&r.status==='REQUESTED')a.push(<button key="bill" className="btn btn-sm btn-outline-primary me-1 mb-1" disabled={busy} onClick={async()=>{setBusy(true);try{await api.post('/lab/bills/',{lab_request_id:r.lab_request_id});setNotice(`Lab bill created for request #${r.lab_request_id}.`);await load()}catch(e){setError(errorMessage(e))}finally{setBusy(false)}}}>Create bill</button>);
  if(user.role==='LAB_ASSISTANT'&&page==='billing'&&r.payment_status==='PENDING')a.push(<button key="paylab" className="btn btn-sm btn-primary me-1 mb-1" disabled={busy} onClick={async()=>{const method=window.prompt('Payment method: CASH, CARD, or UPI','CASH');if(!method)return;setBusy(true);try{await api.patch(`/lab/bills/${r.lab_bill_id||r.bill_id}/payment/`,{payment_method:method.toUpperCase()});setNotice('Lab payment recorded.');await load()}catch(e){setError(errorMessage(e))}finally{setBusy(false)}}}>Record payment</button>);
  if(user.role==='LAB_ASSISTANT'&&page==='processing'&&['PAID','IN_PROGRESS'].includes(r.status))a.push(<button key="result" className="btn btn-sm btn-outline-primary me-1 mb-1" disabled={busy} onClick={()=>{const p=askPayload('labResult');if(p===null)return;if(p.__error){setError(p.__error);return}runPayload('Lab result',`/lab/requests/${r.lab_request_id}/result/`,p)}}>Enter result</button>);
  return a;
 };
 async function runPayload(label,url,payload){setBusy(true);setError('');try{await api.post(url,payload);setNotice(`${label} saved successfully.`);await load()}catch(e){setError(errorMessage(e))}finally{setBusy(false)}}
 const submitDepartment = async (event) => {
  event.preventDefault();
  const departmentName = departmentForm.department_name.trim();
  if (!departmentName) {
    setError('Department name is required.');
    return;
  }
  setSubmittingDepartment(true);
  setError('');
  setNotice('');
  try {
    await api.post('/auth/departments/', { department_name: departmentName, is_active: Boolean(departmentForm.is_active) });
    setNotice('Department created successfully.');
    setShowDepartmentModal(false);
    setDepartmentForm({department_name:'',is_active:true});
    await load();
  } catch (e) {
    setError(errorMessage(e));
  } finally {
    setSubmittingDepartment(false);
  }
 };
 return <div className="workspace-content">{error&&<div className="alert alert-danger" role="alert">{error}</div>}{notice&&<div className="alert alert-success alert-dismissible" role="status">{notice}<button className="btn-close float-end" onClick={()=>setNotice('')} aria-label="Dismiss"/></div>}
 <Card title={cfg.title} subtitle="Live data returned by your Django REST API. Actions submit to the backend; no mock records are used.">
 <div className="cms-toolbar"><Search value={query} onChange={setQuery} placeholder={`Search ${cfg.title.toLowerCase()}…`}/><div className="d-flex gap-2 flex-wrap">{page==='departments'&&user.role==='ADMIN' ? <button className="btn btn-primary btn-sm" disabled={busy||submittingDepartment} onClick={()=>setShowDepartmentModal(true)}><i className="bi bi-plus-lg me-1"/>Add department</button> : actions.map(([label,method,url,kind])=><button key={label} className="btn btn-primary btn-sm" disabled={busy} onClick={()=>run(label,method,url,kind)}><i className="bi bi-plus-lg me-1"/>{label}</button>)}<button className="btn btn-outline-primary btn-sm" onClick={load} disabled={loading||busy}><i className="bi bi-arrow-clockwise me-1"/>Refresh</button></div></div>
 {loading?<div className="loading-line"><span/> Loading from Django…</div>:visible.length===0?<Empty title="No records found" description={error?'The API request failed. Check the error above and your Django server.':'The backend returned no matching records. Create records using the available actions or complete the required workflow.'}/>:<div className="table-responsive"><table className="table align-middle"><thead><tr>{fields.map(k=><th key={k}>{labelize(k)}</th>)}{page==='departments'&&<th>Actions</th>}{(user.role==='LAB_ASSISTANT'&&['requests','billing','processing'].includes(page))&&<th>Actions</th>}</tr></thead><tbody>{visible.map((r,i)=><tr key={r.token_id||r.patient_id||r.bill_id||r.lab_bill_id||r.result_id||r.staff_id||r.appointment_id||r.prescription_id||r.stock_id||r.test_id||r.department_id||r.spec_id||r.lab_request_id||i}>{fields.map(k=><td key={k}>{k==='status'||k==='payment_status'||k==='is_active'||k==='advance_payment_status'?<Status value={k==='is_active'?(r[k]?'ACTIVE':'INACTIVE'):r[k]}/>:<span className={typeof r[k]==='object'?'small':''}>{val(r[k])}</span>}</td>)}{page==='departments' ? <td><button className="btn btn-sm btn-outline-secondary" disabled title={r.is_active ? 'Deactivate is not supported by the current API.' : 'Activate is not supported by the current API.'}>{r.is_active ? 'Deactivate' : 'Activate'}</button><div className="small text-secondary mt-1">Status changes are not supported by the current API.</div></td> : (user.role==='LAB_ASSISTANT'&&['requests','billing','processing'].includes(page))&&<td>{rowActions(r)}</td>}</tr>)}</tbody></table></div>}
 </Card>
 {user.role==='DOCTOR'&&page==='token-queue'&&<Card title="Queue workflow notes"><p className="mb-1">Consultations can be started only for tokens already marked <b>CALLED</b> by the backend.</p><p className="small text-secondary mb-0">The current backend URL configuration does not expose a token-call endpoint, so this frontend will not pretend that the Call Patient action works. Add the corresponding Django route/view to enable it.</p></Card>}
 {showDepartmentModal && user.role==='ADMIN' && page==='departments' && <div className="modal show d-block" tabIndex="-1" style={{backgroundColor:'rgba(0,0,0,0.35)'}}>
  <div className="modal-dialog modal-dialog-centered">
   <div className="modal-content">
    <form onSubmit={submitDepartment}>
     <div className="modal-header">
      <h5 className="modal-title">Add department</h5>
      <button type="button" className="btn-close" aria-label="Close" onClick={()=>setShowDepartmentModal(false)}></button>
     </div>
     <div className="modal-body">
      <div className="mb-3">
       <label className="form-label">Department name</label>
       <input className="form-control" value={departmentForm.department_name} onChange={(e)=>setDepartmentForm((current)=>({...current, department_name:e.target.value}))} placeholder="e.g. Cardiology" required />
      </div>
      <div className="form-check">
       <input id="department-active" className="form-check-input" type="checkbox" checked={departmentForm.is_active} onChange={(e)=>setDepartmentForm((current)=>({...current, is_active:e.target.checked}))} />
       <label className="form-check-label" htmlFor="department-active">Active department</label>
      </div>
     </div>
     <div className="modal-footer">
      <button type="button" className="btn btn-outline-secondary" onClick={()=>setShowDepartmentModal(false)} disabled={submittingDepartment}>Cancel</button>
      <button type="submit" className="btn btn-primary" disabled={submittingDepartment}>{submittingDepartment ? 'Saving…' : 'Save department'}</button>
     </div>
    </form>
   </div>
  </div>
 </div>}
 </div>
}