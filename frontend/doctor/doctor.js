/* DOCTOR MODULE — frontend demo only. Uses shared CMSStore/CMSWorkflow. */
CMS.ready(async function(session){
  var page=document.body.dataset.page;
  if(!session || session.role!=="DOCTOR") return;
  await CMSWorkflow.processNoShows();
  if(page==="dashboard") renderDashboard(session);
  if(page==="appointments") renderAppointments(session);
  if(page==="token-queue") renderQueue(session);
  if(page==="consultation") renderConsultation(session);
  if(page==="history") renderHistory(session);
  if(page==="prescriptions") renderPrescriptions(session);
  if(page==="lab-requests") renderLabRequests(session);
  if(page==="lab-results") renderLabResults(session);
});

function myDoctor(db,s){return db.doctors.find(function(d){return d.doc_id===s.doctor_id;});}
function myTokens(db,s){return db.tokens.filter(function(t){return t.doctor_id===s.doctor_id&&t.token_date===CMSClock.today();}).sort(function(a,b){return a.token_number-b.token_number;});}
function pName(db,id){return CMSUI.patientName(db,id);}
function docName(db,id){return CMSUI.doctorName(db,id);}
function billForToken(db,t){return db.registration_bills.find(function(b){return b.bill_id===t.bill_id;});}
function conForToken(db,id){return db.consultations.find(function(c){return c.token_id===id;});}

function renderDashboard(s){
 CMSStore.read(function(db){
   var today=CMSClock.today();
   var toks=myTokens(db,s);
   var ap=db.appointments.filter(function(a){return a.doctor_id===s.doctor_id&&a.appointment_date===today;})
     .sort(function(a,b){return a.appointment_time_slot.localeCompare(b.appointment_time_slot);});
   var waiting=toks.filter(function(t){return t.status==="WAITING";});
   var called=toks.filter(function(t){return t.status==="CALLED";});
   var done=db.consultations.filter(function(c){return c.doctor_id===s.doctor_id&&c.created_at.slice(0,10)===today;});
   var booked=ap.filter(function(a){return a.status==="BOOKED";});

   var stats=
    '<div class="row g-3 mb-4">'+
    stat("hourglass-split","Waiting",waiting.length,"is-warning")+
    stat("megaphone","Called",called.length)+
    stat("journal-medical","Consultations done",done.length,"is-success")+
    stat("calendar-check","Booked appointments",booked.length)+
    '</div>';

   var sessionCard=CMSX.card("Current session",
     '<div class="d-flex flex-wrap gap-2 align-items-center">'+
       '<span class="badge text-bg-primary px-3 py-2">'+CMSUI.esc(CMSUI.label(CMSClock.period()))+'</span>'+
       '<span class="text-secondary">'+CMSUI.esc(CMSClock.time())+' · '+CMSUI.esc(docName(db,s.doctor_id))+'</span>'+
     '</div>'
   );

   var queueRows=toks.map(function(t){
     var action="";
     if(t.status==="WAITING") action='<button class="btn btn-sm btn-outline-primary js-call" data-id="'+t.token_id+'">Call</button>';
     else if(t.status==="CALLED") action='<a class="btn btn-sm btn-primary" href="consultation.html?token='+t.token_id+'">Open</a>';
     else action='<span class="small text-secondary">Completed</span>';
     return CMSX.row([
       '<strong>#'+t.token_number+'</strong>',
       CMSUI.esc(pName(db,t.patient_id)),
       '<span class="small text-secondary">'+CMSUI.label(t.session)+'</span>',
       CMSUI.badge(t.status),
       action
     ]);
   });

   var appointmentRows=ap.slice(0,6).map(function(a){
     var t=db.tokens.find(function(x){return x.appointment_id===a.appointment_id&&x.status!=="CANCELLED";});
     var token=t ? '#'+t.token_number+' · '+CMSUI.label(t.status) : 'Not issued';
     return CMSX.row([
       '<strong>'+CMSUI.esc(a.appointment_time_slot)+'</strong>',
       CMSUI.esc(pName(db,a.patient_id)),
       CMSUI.badge(a.status),
       '<span class="small text-secondary">'+CMSUI.esc(token)+'</span>'
     ]);
   });

   var recentRows=done.slice().sort(function(a,b){return b.consult_id-a.consult_id;}).slice(0,5).map(function(c){
     var t=db.tokens.find(function(x){return x.token_id===c.token_id;});
     return CMSX.row([
       CMSUI.dateTime(c.created_at),
       CMSUI.esc(pName(db,c.patient_id)),
       CMSUI.esc(c.diagnosis),
       t ? '<a class="btn btn-sm btn-outline-primary" href="consultation.html?token='+t.token_id+'">View</a>' : '—'
     ]);
   });

   var scopedIds={}; toks.forEach(function(t){scopedIds[t.patient_id]=1;});
   db.consultations.filter(function(c){return c.doctor_id===s.doctor_id;}).forEach(function(c){scopedIds[c.patient_id]=1;});
   var searchPatients=db.patients.filter(function(p){return scopedIds[p.patient_id];});
   document.getElementById("page-content").innerHTML=
     stats+
     CMSX.card("Patient search",'<div id="doctor-patient-search"></div>')+
     '<div class="row g-3">'+
       '<div class="col-xl-5">'+sessionCard+'</div>'+
       '<div class="col-xl-7">'+CMSX.card("Today's appointments",CMSX.table(["Time","Patient","Status","Token"],appointmentRows,"No appointments for today."),'<a class="btn btn-sm btn-primary" href="appointments.html">View all</a>')+'</div>'+
       '<div class="col-xl-7">'+CMSX.card("Today's token queue",CMSX.table(["Token","Patient","Session","Status","Action"],queueRows,"No tokens for today."),'<a class="btn btn-sm btn-primary" href="token-queue.html">Open queue</a>')+'</div>'+
       '<div class="col-xl-5">'+CMSX.card("Recent consultations",CMSX.table(["Date","Patient","Diagnosis",""],recentRows,"No consultations completed today."),'<a class="btn btn-sm btn-outline-primary" href="history.html">History</a>')+'</div>'+
     '</div>';

   CMSPatientSearch.render("doctor-patient-search",db,searchPatients,function(p){
     var t=db.tokens.slice().reverse().find(function(x){return x.doctor_id===s.doctor_id&&x.patient_id===p.patient_id;});
     return t?'<a class="btn btn-sm btn-outline-primary" href="consultation.html?token='+t.token_id+'">Open associated record</a>':'<span class="small text-secondary">No token record</span>';
   });
   bindCalls();
 });
}
function stat(icon,label,value,cl){return '<div class="col-6 col-lg-3"><div class="cms-card cms-stat"><div class="cms-stat-icon '+(cl||"")+'"><i class="bi bi-'+icon+'"></i></div><div><p class="cms-stat-label">'+label+'</p><div class="cms-stat-value">'+value+'</div></div></div></div>';}

function queueTable(db,toks,compact){
 var rows=toks.map(function(t){
  var c=conForToken(db,t.token_id), actions="";
  if(t.status==="WAITING") actions='<button class="btn btn-sm btn-outline-primary js-call" data-id="'+t.token_id+'">Call</button>';
  if(t.status==="CALLED") actions='<a class="btn btn-sm btn-primary" href="consultation.html?token='+t.token_id+'">Open</a>';
  if(t.status==="COMPLETED") actions='<span class="small text-secondary">Completed</span>';
  return CMSX.row([
   '<strong>#'+t.token_number+'</strong>',CMSUI.esc(pName(db,t.patient_id)),
   '<span class="small text-secondary">'+CMSUI.label(t.session)+'</span>',CMSUI.badge(t.status),
   actions
  ]);
 });
 return CMSX.table(["Token","Patient","Session","Status","Action"],rows,"No tokens for today.");
}

function bindCalls(){
 document.querySelectorAll(".js-call").forEach(function(b){b.onclick=async function(){
   try{await CMSWorkflow.callToken(Number(b.dataset.id)); CMSX.alert("Patient called."); location.reload();}
   catch(e){CMSX.alert(e.message,"danger");}
 };});
}

async function renderAppointments(s){
 var db=await CMSStore.read(function(x){return x;});
 var rows=db.appointments.filter(function(a){return a.doctor_id===s.doctor_id&&a.appointment_date===CMSClock.today();}).sort(function(a,b){return a.appointment_time_slot.localeCompare(b.appointment_time_slot);}).map(function(a){
   var t=db.tokens.find(function(x){return x.appointment_id===a.appointment_id&&x.status!=="CANCELLED";});
   var bill=db.registration_bills.find(function(b){return b.patient_id===a.patient_id&&b.doctor_id===a.doctor_id&&b.bill_date.slice(0,10)===a.appointment_date;});
   var action=t&&t.status==="CALLED"?'<a class="btn btn-sm btn-primary" href="consultation.html?token='+t.token_id+'">Consult</a>':t?'<span class="small text-secondary">Token #'+t.token_number+'</span>':a.status==="BOOKED"?'<span class="small text-secondary">Waiting for arrival/payment</span>':"—";
   return CMSX.row([CMSUI.esc(a.appointment_time_slot),CMSUI.esc(pName(db,a.patient_id)),CMSUI.badge(a.status),bill?CMSUI.badge(bill.payment_status):"—",action]);
 });
 document.getElementById("page-content").innerHTML=CMSX.card("Today's appointments",CMSX.table(["Time","Patient","Appointment","Bill","Action"],rows,"No appointments for today."));
}

function renderQueue(s){
 CMSStore.read(function(db){
  var toks=myTokens(db,s);
  document.getElementById("page-content").innerHTML=
   CMSX.card("Token queue",'<div class="d-flex flex-wrap gap-2 mb-3"><span class="badge text-bg-light border">Max 30/day</span><span class="badge text-bg-light border">'+CMSUI.label(CMSClock.period())+' session</span><span class="small text-secondary align-self-center">A patient can be opened only from a valid token.</span></div><div id="queue-wrap">'+queueTable(db,toks,false)+'</div>');
  bindCalls();
 });
}

function renderConsultation(s){
 var tid=new URLSearchParams(location.search).get("token");
 CMSStore.read(function(db){
   var t=tid&&db.tokens.find(function(x){return x.token_id===Number(tid);});
   if(!t || t.doctor_id!==s.doctor_id){
     document.getElementById("page-content").innerHTML=CMSX.card("No valid token selected",'<p class="text-secondary mb-0">Open a CALLED token from the token queue. The doctor cannot open an arbitrary patient record.</p>','<a href="token-queue.html" class="btn btn-primary btn-sm">Back to queue</a>');
     return;
   }
   var existing=conForToken(db,t.token_id);
   var p=db.patients.find(function(x){return x.patient_id===t.patient_id;});
   if(t.status==="COMPLETED"||existing){
     document.getElementById("page-content").innerHTML=consultationReadOnly(db,t,existing,p);
     document.querySelectorAll(".js-print-consult").forEach(function(btn){btn.onclick=function(){CMSPrint.consultation(db,Number(btn.dataset.id));};});
     return;
   }
   if(t.status!=="CALLED"){
     document.getElementById("page-content").innerHTML=CMSX.card("Token is not ready",'<p class="text-secondary">Current status: '+CMSUI.label(t.status)+'. Call the patient before opening consultation.</p>','<a href="token-queue.html" class="btn btn-primary btn-sm">Back to queue</a>');
     return;
   }
   var meds=db.master_medicines.filter(function(m){return m.is_active;});
   var tests=db.master_lab_tests.filter(function(x){return x.is_active;});
   document.getElementById("page-content").innerHTML=
    '<div class="row g-3"><div class="col-xl-4">'+patientCard(db,p,t)+'</div><div class="col-xl-8">'+
    '<form id="consult-form">'+
    CMSX.card("Clinical consultation",'<div class="row g-3"><div class="col-12"><label class="form-label">Symptoms *</label><textarea class="form-control" name="symptoms" rows="3" required placeholder="Enter patient symptoms"></textarea></div><div class="col-12"><label class="form-label">Diagnosis *</label><textarea class="form-control" name="diagnosis" rows="3" required placeholder="Enter diagnosis"></textarea></div><div class="col-12"><label class="form-label">Remarks</label><textarea class="form-control" name="remarks" rows="2" placeholder="Advice, follow-up, precautions"></textarea></div></div>')+
    '<div class="cms-card"><div class="d-flex justify-content-between align-items-center mb-3"><h2 class="cms-card-title mb-0">Prescription</h2><button type="button" class="btn btn-sm btn-outline-primary" id="add-med">+ Add medicine</button></div><div id="med-lines"></div><div class="small text-secondary mt-2">Medicine, dosage and frequency come from the shared master data.</div></div>'+
    '<div class="cms-card"><div class="d-flex justify-content-between align-items-center mb-3"><h2 class="cms-card-title mb-0">Lab requests</h2><button type="button" class="btn btn-sm btn-outline-primary" id="add-lab">+ Add test</button></div><div id="lab-lines"></div></div>'+
    '<div class="d-flex justify-content-end gap-2"><a href="token-queue.html" class="btn btn-outline-secondary">Cancel</a><button class="btn btn-primary">Save consultation</button></div>'+
    '</form></div></div>';
   var medLines=document.getElementById("med-lines"), labLines=document.getElementById("lab-lines");
   function addMed(){
     var row=document.createElement("div"); row.className="row g-2 mb-2 med-row";
     row.innerHTML='<div class="col-md-4"><select class="form-select medicine"><option value="">Medicine</option>'+meds.map(function(m){return '<option value="'+m.medicine_id+'">'+CMSUI.esc(m.name)+' · '+CMSUI.esc(m.generic_name)+'</option>';}).join("")+'</select></div><div class="col-md-3"><select class="form-select dosage"><option value="">Dosage</option></select></div><div class="col-md-2"><select class="form-select frequency"><option>Once daily</option><option>Twice daily</option><option>Three times daily</option><option>Four times daily</option><option>At bedtime</option></select></div><div class="col-md-2"><input class="form-control duration" placeholder="5 days"></div><div class="col-md-1"><button type="button" class="btn btn-outline-danger w-100 remove-line">×</button></div><div class="col-12"><input class="form-control instructions" placeholder="Instructions e.g. After food"></div>';
     medLines.appendChild(row);
     row.querySelector(".medicine").onchange=function(){var id=Number(this.value);row.querySelector(".dosage").innerHTML='<option value="">Dosage</option>'+db.dosages.filter(function(d){return d.medicine_id===id&&d.is_active;}).map(function(d){return '<option value="'+d.dosage_id+'">'+d.dosage_value+d.unit+' — '+CMSUI.esc(d.description)+'</option>';}).join("");};
     row.querySelector(".remove-line").onclick=function(){row.remove();};
   }
   function addLab(){
     var row=document.createElement("div");row.className="row g-2 mb-2 lab-row";
     row.innerHTML='<div class="col-md-7"><select class="form-select test"><option value="">Lab test</option>'+tests.map(function(x){return '<option value="'+x.test_id+'">'+CMSUI.esc(x.test_name)+' · '+CMSUI.money(x.test_price)+'</option>';}).join("")+'</select></div><div class="col-md-4"><select class="form-select priority"><option value="NORMAL">Normal</option><option value="URGENT">Urgent</option></select></div><div class="col-md-1"><button type="button" class="btn btn-outline-danger w-100 remove-line">×</button></div>';
     labLines.appendChild(row);row.querySelector(".remove-line").onclick=function(){row.remove();};
   }
   document.getElementById("add-med").onclick=addMed;document.getElementById("add-lab").onclick=addLab;addMed();
   document.getElementById("consult-form").onsubmit=async function(e){
     e.preventDefault();
     var fd=new FormData(e.target);
     var items=[].slice.call(document.querySelectorAll(".med-row")).map(function(r){return {medicine_id:Number(r.querySelector(".medicine").value),dosage_id:Number(r.querySelector(".dosage").value),frequency:r.querySelector(".frequency").value,duration:r.querySelector(".duration").value,instructions:r.querySelector(".instructions").value};}).filter(function(x){return x.medicine_id;});
     var labs=[].slice.call(document.querySelectorAll(".lab-row")).map(function(r){return {test_id:Number(r.querySelector(".test").value),priority:r.querySelector(".priority").value};}).filter(function(x){return x.test_id;});
     try{var saved=await CMSWorkflow.saveConsultation({token_id:t.token_id,symptoms:fd.get("symptoms"),diagnosis:fd.get("diagnosis"),remarks:fd.get("remarks"),items:items,labs:labs});location.href="history.html?saved="+saved.consultation.consult_id;}
     catch(err){CMSX.alert(err.message,"danger");}
   };
 });
}
function patientCard(db,p,t){
 return CMSX.card("Patient file",'<div class="d-flex align-items-center gap-3 mb-3"><div class="cms-avatar">'+CMSUI.esc(p.full_name.split(" ").map(function(x){return x[0];}).slice(0,2).join(""))+'</div><div><h3 class="h5 mb-1">'+CMSUI.esc(p.full_name)+'</h3><div class="small text-secondary">Patient #'+p.patient_id+' · '+CMSUI.age(p.dob)+' years</div></div></div>'+
 '<div class="row g-2 small"><div class="col-6"><span class="text-secondary">Gender</span><br><strong>'+CMSUI.esc(p.gender)+'</strong></div><div class="col-6"><span class="text-secondary">Blood group</span><br><strong>'+CMSUI.esc(p.blood_group||"—")+'</strong></div><div class="col-12"><span class="text-secondary">Phone</span><br><strong>'+CMSUI.esc(p.phone_number)+'</strong></div><div class="col-12"><span class="text-secondary">Token</span><br><strong>#'+t.token_number+' · '+CMSUI.label(t.session)+'</strong></div></div>');
}
function consultationReadOnly(db,t,c,p){
 var items=db.prescription_items.filter(function(i){var pr=db.prescriptions.find(function(x){return x.prescription_id===i.prescription_id;});return pr&&pr.consultation_id===c.consult_id;});
 var labs=db.lab_requests.filter(function(l){return l.consultation_id===c.consult_id;});
 return '<div class="row g-3"><div class="col-xl-4">'+patientCard(db,p,t)+'</div><div class="col-xl-8">'+
 CMSX.card("Consultation record",'<div class="d-flex justify-content-end mb-2"><button class="btn btn-sm btn-outline-primary js-print-consult" data-id="'+c.consult_id+'"><i class="bi bi-file-earmark-pdf me-1"></i>Print / Save PDF</button></div><div class="row g-3"><div class="col-12"><label class="small text-secondary">Symptoms</label><p class="mb-0">'+CMSUI.esc(c.symptoms)+'</p></div><div class="col-12"><label class="small text-secondary">Diagnosis</label><p class="mb-0 fw-semibold">'+CMSUI.esc(c.diagnosis)+'</p></div><div class="col-12"><label class="small text-secondary">Remarks</label><p class="mb-0">'+CMSUI.esc(c.remarks||"—")+'</p></div></div>')+
 CMSX.card("Prescription",CMSX.table(["Medicine","Frequency","Duration","Instructions","Status"],items.map(function(i){return CMSX.row([CMSUI.esc(CMSUI.medicineName(db,i.medicine_id,i.dosage_id)),CMSUI.esc(i.frequency),CMSUI.esc(i.duration),CMSUI.esc(i.instructions||"—"),CMSUI.badge(i.dispensed_status)]);}),"No medicines prescribed."))+
 CMSX.card("Lab requests",CMSX.table(["Test","Priority","Status"],labs.map(function(l){return CMSX.row([CMSUI.esc(CMSUI.testName(db,l.test_id)),CMSUI.badge(l.priority),CMSUI.badge(l.status)]);}),"No lab tests requested."))+
 '<div class="alert alert-info border-0"><i class="bi bi-lock me-2"></i>This consultation is read-only after it has been saved. Saved at: <strong>'+CMSUI.dateTime(c.created_at)+'</strong></div></div></div>';
}
function renderHistory(s){
 CMSStore.read(function(db){
  var cs=db.consultations.filter(function(c){return c.doctor_id===s.doctor_id;}).sort(function(a,b){return b.consult_id-a.consult_id;});
  var saved=new URLSearchParams(location.search).get("saved"), notice="";
  if(saved){var sc=cs.find(function(c){return c.consult_id===Number(saved);});if(sc)notice='<div class="alert alert-success"><i class="bi bi-check-circle me-2"></i>Consultation #'+sc.consult_id+' saved successfully at <strong>'+CMSUI.dateTime(sc.created_at)+'</strong>. <button class="btn btn-sm btn-outline-success ms-2 js-print-consult" data-id="'+sc.consult_id+'">Print / Save PDF</button></div>';}
  var rows=cs.map(function(c){var t=db.tokens.find(function(x){return x.token_id===c.token_id;});return CMSX.row([CMSUI.dateTime(c.created_at),CMSUI.esc(pName(db,c.patient_id)),'#'+t.token_number,CMSUI.esc(c.diagnosis),'<a class="btn btn-sm btn-outline-primary" href="consultation.html?token='+t.token_id+'">View</a> <button class="btn btn-sm btn-outline-secondary js-print-consult" data-id="'+c.consult_id+'">PDF</button>']);});
  document.getElementById("page-content").innerHTML=notice+CMSX.card("Consultation history",CMSX.table(["Date","Patient","Token","Diagnosis","Action"],rows,"No consultation history."));
  document.querySelectorAll(".js-print-consult").forEach(function(btn){btn.onclick=function(){CMSStore.read(function(db2){CMSPrint.consultation(db2,Number(btn.dataset.id));});};});
 });
}
function renderPrescriptions(s){
 CMSStore.read(function(db){
  var prs=db.prescriptions.filter(function(pr){var c=db.consultations.find(function(x){return x.consult_id===pr.consultation_id;});return c&&c.doctor_id===s.doctor_id;});
  var rows=[];prs.forEach(function(pr){var c=db.consultations.find(function(x){return x.consult_id===pr.consultation_id;}),items=db.prescription_items.filter(function(i){return i.prescription_id===pr.prescription_id;});items.forEach(function(i){rows.push(CMSX.row([CMSUI.dateTime(pr.created_at),CMSUI.esc(pName(db,c.patient_id)),CMSUI.esc(CMSUI.medicineName(db,i.medicine_id,i.dosage_id)),CMSUI.esc(i.frequency),CMSUI.esc(i.duration),CMSUI.badge(i.dispensed_status)]));});});
  document.getElementById("page-content").innerHTML=CMSX.card("Prescriptions",CMSX.table(["Date","Patient","Medicine","Frequency","Duration","Status"],rows,"No prescriptions."));
 });
}
function renderLabRequests(s){
 CMSStore.read(function(db){
  var rows=db.lab_requests.filter(function(r){var c=db.consultations.find(function(x){return x.consult_id===r.consultation_id;});return c&&c.doctor_id===s.doctor_id;}).map(function(r){var c=db.consultations.find(function(x){return x.consult_id===r.consultation_id;});return CMSX.row([CMSUI.dateTime(r.order_date),CMSUI.esc(pName(db,c.patient_id)),CMSUI.esc(CMSUI.testName(db,r.test_id)),CMSUI.badge(r.priority),CMSUI.badge(r.status)]);});
  document.getElementById("page-content").innerHTML=CMSX.card("Lab requests",CMSX.table(["Ordered","Patient","Test","Priority","Status"],rows,"No lab requests."));
 });
}
function renderLabResults(s){
 CMSStore.read(function(db){
  var rows=db.lab_results.filter(function(r){var req=db.lab_requests.find(function(x){return x.lab_request_id===r.lab_request_id;}),c=req&&db.consultations.find(function(x){return x.consult_id===req.consultation_id;});return c&&c.doctor_id===s.doctor_id;}).map(function(r){var req=db.lab_requests.find(function(x){return x.lab_request_id===r.lab_request_id;}),c=db.consultations.find(function(x){return x.consult_id===req.consultation_id;}),ab=CMSWorkflow.isAbnormal(db,r);return CMSX.row([CMSUI.date(r.result_date),CMSUI.esc(pName(db,c.patient_id)),CMSUI.esc(CMSUI.testName(db,req.test_id)),CMSUI.esc(r.result_value+" "+r.unit),'<span class="'+(ab?"text-danger":"text-success")+'">'+(ab?"Outside range":"Within range")+'</span>','<button class="btn btn-sm btn-outline-primary js-result" data-id="'+r.result_id+'">View</button>']);});
  document.getElementById("page-content").innerHTML=CMSX.card("Lab results",CMSX.table(["Date","Patient","Test","Result","Interpretation","Action"],rows,"No results available."));
  document.querySelectorAll(".js-result").forEach(function(b){b.onclick=function(){var id=Number(b.dataset.id);CMSStore.read(function(db){var r=db.lab_results.find(function(x){return x.result_id===id;});var req=db.lab_requests.find(function(x){return x.lab_request_id===r.lab_request_id;});var t=db.master_lab_tests.find(function(x){return x.test_id===req.test_id;});alert("Patient: "+pName(db,db.consultations.find(function(c){return c.consult_id===req.consultation_id;}).patient_id)+"\nTest: "+t.test_name+"\nResult: "+r.result_value+" "+r.unit+"\nReference: "+r.reference_range+"\n\n"+(r.report||""));});};});
 });
}
