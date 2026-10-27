/* RECEPTIONIST MODULE — shared patient/appointment/billing/token workflow. */
CMS.ready(async function(session){
 if(!session||session.role!=="RECEPTIONIST")return;
 await CMSWorkflow.processNoShows();
 var p=document.body.dataset.page;
 if(p==="dashboard") dash();
 if(p==="patients") patients();
 if(p==="patient-register") register();
 if(p==="appointments") appointments();
 if(p==="billing") billing();
 if(p==="tokens") tokens();
});
function dash(){CMSStore.read(function(db){
 var today=CMSClock.today(), pts=db.patients.length, ap=db.appointments.filter(function(a){return a.appointment_date===today&&a.status==="BOOKED";}).length;
 var bills=db.registration_bills.filter(function(b){return b.bill_date.slice(0,10)===today;});
 var toks=db.tokens.filter(function(t){return t.token_date===today&&t.status!=="CANCELLED";});
 document.getElementById("page-content").innerHTML='<div class="row g-3 mb-4">'+
 stat("people","Patients",pts)+stat("calendar-check","Booked today",ap)+stat("receipt","Bills today",bills.length)+stat("ticket-perforated","Tokens today",toks.length)+
 '</div>'+CMSX.card("Patient search",'<div id="reception-patient-search"></div>')+
 CMSX.card("Quick actions",'<div class="d-flex flex-wrap gap-2"><a class="btn btn-primary" href="patient-register.html"><i class="bi bi-person-plus me-1"></i>Register patient</a><a class="btn btn-outline-primary" href="appointments.html">Appointments</a><a class="btn btn-outline-primary" href="billing.html">Billing</a><a class="btn btn-outline-primary" href="tokens.html">Token queue</a></div>')+
 CMSX.card("Today\'s appointments",apptTable(db,db.appointments.filter(function(a){return a.appointment_date===today;})));
 CMSPatientSearch.render("reception-patient-search",db,db.patients,function(p){return '<a class="btn btn-sm btn-outline-primary" href="patients.html#patient-'+p.patient_id+'">View patient</a>';});
});}
function stat(i,l,v){return '<div class="col-6 col-lg-3"><div class="cms-card cms-stat"><div class="cms-stat-icon"><i class="bi bi-'+i+'"></i></div><div><p class="cms-stat-label">'+l+'</p><div class="cms-stat-value">'+v+'</div></div></div></div>';}
function apptTable(db,list){
 return CMSX.table(["Time","Patient","Doctor","Status","Token","Action"],list.slice().sort(function(a,b){return a.appointment_time_slot.localeCompare(b.appointment_time_slot);}).map(function(a){
  var t=db.tokens.find(function(x){return x.appointment_id===a.appointment_id&&x.status!=="CANCELLED";});
  var bill=db.registration_bills.find(function(b){return b.patient_id===a.patient_id&&b.doctor_id===a.doctor_id&&b.bill_date.slice(0,10)===a.appointment_date;});
  var action=a.status==="BOOKED"&&!t?((bill?'':'<button class="btn btn-sm btn-outline-primary js-create-appt-bill" data-id="'+a.appointment_id+'">Create bill</button>')+
    '<button class="btn btn-sm btn-outline-danger js-cancel-appt ms-1" data-id="'+a.appointment_id+'">Cancel</button>'):"—";
  return CMSX.row([a.appointment_time_slot,CMSUI.esc(CMSUI.patientName(db,a.patient_id)),CMSUI.esc(CMSUI.doctorName(db,a.doctor_id)),CMSUI.badge(a.status),t?"#"+t.token_number:"—",action]);
 }),"No appointments.");
}
function patients(){CMSStore.read(function(db){
 var rows=db.patients.map(function(p){return CMSX.row(['<strong>#'+p.patient_id+'</strong>',CMSUI.esc(p.full_name),CMSUI.age(p.dob),CMSUI.esc(p.gender),CMSUI.esc(p.phone_number),CMSUI.esc(p.blood_group||"—")]);});
 document.getElementById("page-content").innerHTML=CMSX.card("Patient search",'<div id="reception-patients-search"></div>')+CMSX.card("Patients",CMSX.table(["ID","Name","Age","Gender","Phone","Blood group"],rows,"No patients."));
 CMSPatientSearch.render("reception-patients-search",db,db.patients);
});}
function register(){
 document.getElementById("page-content").innerHTML=CMSX.card("Register patient",'<form id="patient-form"><div class="row g-3">'+
 field("full_name","Full name","text","",true)+field("dob","Date of birth","date","",true)+
 '<div class="col-md-4"><label class="form-label">Gender *</label><select class="form-select" name="gender" required><option value="">Choose</option><option>Male</option><option>Female</option><option>Other</option></select></div>'+
 field("phone_number","Phone number","tel","10-digit number",true)+field("email","Email","email","")+field("blood_group","Blood group","text","O+, A+, B+, AB+")+field("emergency_contact","Emergency contact","tel","10-digit number")+field("address","Address","text","",false,"col-12")+
 '</div><div class="d-flex justify-content-end mt-4"><button class="btn btn-primary">Register patient</button></div></form>');
 document.getElementById("patient-form").onsubmit=async function(e){e.preventDefault();var f=new FormData(e.target),o={};f.forEach(function(v,k){o[k]=v;});try{var p=await CMSWorkflow.registerPatient(o);CMSX.alert("Patient #"+p.patient_id+" registered successfully.");e.target.reset();}catch(err){CMSX.alert(err.message,"danger");}};
}
function field(n,l,type,ph,req,cl){return '<div class="'+(cl||"col-md-4")+'"><label class="form-label">'+l+(req?" *":"")+'</label><input class="form-control" type="'+type+'" name="'+n+'" placeholder="'+ph+'" '+(req?"required":"")+'></div>';}
function appointments(){CMSStore.read(function(db){
 var docs=db.doctors.filter(function(d){return d.is_active;});
 document.getElementById("page-content").innerHTML=
 CMSX.card("Book appointment",'<form id="appt-form"><div class="row g-3">'+
 '<div class="col-md-4"><label class="form-label">Patient *</label><select class="form-select" name="patient_id" required><option value="">Choose patient</option>'+db.patients.map(function(p){return '<option value="'+p.patient_id+'">'+CMSUI.esc(p.full_name)+' · #'+p.patient_id+' · '+CMSUI.esc(p.phone_number)+'</option>';}).join("")+'</select></div>'+
 '<div class="col-md-4"><label class="form-label">Doctor *</label><select class="form-select" name="doctor_id" required>'+docs.map(function(d){return '<option value="'+d.doc_id+'">'+CMSUI.esc(CMSUI.doctorName(db,d.doc_id))+' · '+CMSUI.money(d.consultation_fee)+'</option>';}).join("")+'</select></div>'+
 '<div class="col-md-4"><label class="form-label">Date *</label><input class="form-control" type="date" name="appointment_date" value="'+CMSClock.today()+'" required></div>'+
 '<div class="col-md-4"><label class="form-label">Time slot *</label><input class="form-control" type="time" name="appointment_time_slot" value="10:00" required></div>'+
 '<div class="col-md-4"><label class="form-label">Advance amount</label><input class="form-control" type="number" name="advance_amount" min="0" step="1" value="0"></div>'+
 '<div class="col-md-4 d-flex align-items-end"><label class="form-check"><input class="form-check-input" type="checkbox" name="advance_paid"><span class="form-check-label">Advance paid</span></label></div>'+
 '</div><div class="d-flex justify-content-end mt-4"><button class="btn btn-primary">Book appointment</button></div></form>')+
 CMSX.card("Appointment list",apptTable(db,db.appointments));
 document.getElementById("appt-form").onsubmit=async function(e){e.preventDefault();var f=new FormData(e.target);try{await CMSWorkflow.bookAppointment({patient_id:Number(f.get("patient_id")),doctor_id:Number(f.get("doctor_id")),appointment_date:f.get("appointment_date"),appointment_time_slot:f.get("appointment_time_slot"),advance_amount:Number(f.get("advance_amount")||0),advance_paid:f.has("advance_paid")});CMSX.alert("Appointment booked. A token is NOT created until billing is fully paid.");setTimeout(function(){location.reload();},500);}catch(err){CMSX.alert(err.message,"danger");}};
 bindAppointmentActions();
 });}
function bindAppointmentActions(){
 document.querySelectorAll(".js-cancel-appt").forEach(function(btn){btn.onclick=async function(){if(!confirm("Cancel this appointment?"))return;try{await CMSWorkflow.cancelAppointment(Number(btn.dataset.id));CMSX.alert("Appointment cancelled.");location.reload();}catch(e){CMSX.alert(e.message,"danger");}}});
 /* Create a normal registration/consultation bill for the selected appointment. */
 document.querySelectorAll(".js-create-appt-bill").forEach(function(btn){btn.onclick=async function(){
  var id=Number(btn.dataset.id);
  try{
   var a=await CMSStore.read(function(db){return db.appointments.find(function(x){return x.appointment_id===id;});});
   var b=await CMSWorkflow.createRegistrationBill({patient_id:a.patient_id,doctor_id:a.doctor_id});
   CMSX.alert("Registration and consultation bill created.");
   location.href="billing.html?bill="+b.bill_id+"&appointment="+a.appointment_id;
  }catch(e){CMSX.alert(e.message,"danger");}
 };});
}
function billing(){CMSStore.read(function(db){
 var appointmentParam=new URLSearchParams(location.search).get("appointment");
 var rows=db.registration_bills.slice().sort(function(a,b){return b.bill_id-a.bill_id;}).map(function(b){
   var pay=b.payment_status==="PENDING"?'<div class="d-flex gap-1"><select class="form-select form-select-sm js-method" data-id="'+b.bill_id+'"><option>CASH</option><option>CARD</option><option>UPI</option></select><button class="btn btn-sm btn-primary js-pay" data-id="'+b.bill_id+'">Pay</button></div>':CMSUI.badge(b.payment_status);
   var token=db.tokens.find(function(t){return t.bill_id===b.bill_id;});
   var apt=db.appointments.find(function(a){return a.appointment_id===Number(appointmentParam)&&a.patient_id===b.patient_id&&a.doctor_id===b.doctor_id&&a.appointment_date===b.bill_date.slice(0,10)&&a.status==="BOOKED";});
   var act=token?'<span class="small">Token #'+token.token_number+'</span>':b.payment_status==="PAID"?'<button class="btn btn-sm btn-outline-primary js-token" data-id="'+b.bill_id+'" data-appointment="'+(apt?apt.appointment_id:"")+'">Generate token</button>':"—";
   var print='<button class="btn btn-sm btn-outline-secondary js-print-bill" data-id="'+b.bill_id+'"><i class="bi bi-file-earmark-pdf me-1"></i>PDF</button>';
   return CMSX.row([b.bill_id,CMSUI.esc(CMSUI.patientName(db,b.patient_id)),CMSUI.esc(CMSUI.doctorName(db,b.doctor_id)),CMSUI.money(b.total_amount),pay,act+" "+print]);
 });
 document.getElementById("page-content").innerHTML=CMSX.card("Registration / consultation billing",'<p class="small text-secondary">Registration fee + doctor consultation fee are billed together. Appointment creation alone does not create a token.</p>'+CMSX.table(["Bill","Patient","Doctor","Total","Payment","Token / PDF"],rows,"No bills."));
 document.querySelectorAll(".js-pay").forEach(function(btn){btn.onclick=async function(){var method=document.querySelector('.js-method[data-id="'+btn.dataset.id+'"]').value;try{await CMSWorkflow.payRegistrationBill(Number(btn.dataset.id),method);CMSX.alert("Payment confirmed.");location.reload();}catch(e){CMSX.alert(e.message,"danger");}}});
 document.querySelectorAll(".js-token").forEach(function(btn){btn.onclick=async function(){var bill=Number(btn.dataset.id),aid=btn.dataset.appointment;try{var tok=await CMSWorkflow.generateToken({bill_id:bill,session:CMSClock.period(),appointment_id:aid?Number(aid):null});CMSX.alert("Token #"+tok.token_number+" generated.");location.reload();}catch(e){CMSX.alert(e.message,"danger");}}});
 document.querySelectorAll(".js-print-bill").forEach(function(btn){btn.onclick=function(){CMSStore.read(function(db2){CMSPrint.bill(db2,"registration",Number(btn.dataset.id));});};});
 });}
function tokens(){CMSStore.read(function(db){
 var rows=db.tokens.filter(function(t){return t.token_date===CMSClock.today();}).sort(function(a,b){return a.doctor_id-b.doctor_id||a.token_number-b.token_number;}).map(function(t){return CMSX.row(['#'+t.token_number,CMSUI.esc(CMSUI.patientName(db,t.patient_id)),CMSUI.esc(CMSUI.doctorName(db,t.doctor_id)),CMSUI.label(t.session),CMSUI.badge(t.status),t.appointment_id?"Appointment":"Walk-in"]);});
 document.getElementById("page-content").innerHTML=CMSX.card("Today's tokens",CMSX.table(["Token","Patient","Doctor","Session","Status","Source"],rows,"No tokens."));
 });}
