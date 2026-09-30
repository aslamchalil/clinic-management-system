/* ADMIN MODULE — shared master data screens for the frontend demo. */
CMS.ready(async function(session){
 if(!session||session.role!=="ADMIN")return;
 var p=document.body.dataset.page;
 if(p==="dashboard")dash();
 if(p==="staff")staff();
 if(p==="doctors")doctors();
 if(p==="departments")simple("departments","Departments","department_id","department_name");
 if(p==="specializations")simple("specializations","Specializations","spec_id","spec_name");
 if(p==="medicines")medicines();
 if(p==="dosages")dosages();
 if(p==="lab-tests")labtests();
 if(p==="activity")activity();
});
function dash(){CMSStore.read(function(db){
 document.getElementById("page-content").innerHTML='<div class="row g-3 mb-4">'+
 s("people","Staff",db.staff.length)+s("person-badge","Doctors",db.doctors.length)+s("capsule","Medicines",db.master_medicines.length)+s("clipboard2-pulse","Lab tests",db.master_lab_tests.length)+'</div>'+
 CMSX.card("Master data",'<div class="d-flex flex-wrap gap-2"><a class="btn btn-primary" href="doctors.html">Doctors</a><a class="btn btn-outline-primary" href="staff.html">Staff</a><a class="btn btn-outline-primary" href="medicines.html">Medicines</a><a class="btn btn-outline-primary" href="lab-tests.html">Lab tests</a></div>')+
 CMSX.card("Demo users",CMSX.table(["Role","Staff ID","Display name","Username"],db.staff.map(function(st){var r=db.roles.find(function(x){return x.role_id===st.role_id;});return CMSX.row([CMSUI.label(r.role_name),CMSUI.esc(CMSUI.staffCode(db,st.staff_id)),(r.role_name==="DOCTOR"?"Dr. ":"")+st.first_name+" "+st.last_name,db.users.find(function(u){return u.user_id===st.user_id;}).username]);})));
});}
function s(i,l,v){return '<div class="col-6 col-lg-3"><div class="cms-card cms-stat"><div class="cms-stat-icon"><i class="bi bi-'+i+'"></i></div><div><p class="cms-stat-label">'+l+'</p><div class="cms-stat-value">'+v+'</div></div></div></div>';}
function staff(){CMSStore.read(function(db){var rows=db.staff.map(function(st){var r=db.roles.find(function(x){return x.role_id===st.role_id;}),d=db.departments.find(function(x){return x.department_id===st.department_id;});return CMSX.row([CMSUI.esc(CMSUI.staffCode(db,st.staff_id)),(r.role_name==="DOCTOR"?"Dr. ":"")+CMSUI.esc(st.first_name+" "+st.last_name),CMSUI.label(r.role_name),CMSUI.esc(d.department_name),CMSUI.esc(st.email),CMSUI.badge(st.is_active?"ACTIVE":"INACTIVE")]);});document.getElementById("page-content").innerHTML=CMSX.card("Staff",CMSX.table(["Staff ID","Name","Role","Department","Email","Status"],rows,"No staff."));});}
function doctors(){CMSStore.read(function(db){
 var form='<div class="cms-card"><h2 class="cms-card-title">Add doctor</h2><form id="doctor-form"><div class="row g-3">'+
 inp("username","Username","doctor_...",true)+inp("password","Password","",true)+inp("first_name","First name","",true)+inp("last_name","Last name","",true)+
 '<div class="col-md-4"><label class="form-label">Department</label><select class="form-select" name="department_id" required>'+db.departments.map(function(d){return '<option value="'+d.department_id+'">'+CMSUI.esc(d.department_name)+'</option>';}).join("")+'</select></div>'+
 '<div class="col-md-4"><label class="form-label">Specialization</label><select class="form-select" name="specialization_id" required>'+db.specializations.map(function(x){return '<option value="'+x.spec_id+'">'+CMSUI.esc(x.spec_name)+'</option>';}).join("")+'</select></div>'+
 inp("qualification","Qualification","MBBS, MD")+inp("exp_year","Experience","8",false,"number")+inp("consultation_fee","Consultation fee","400",false,"number")+inp("license_no","License no.","KL-DOC-1003")+
 inp("phone_number","Phone number","10-digit number")+inp("email","Email","doctor@example.com")+inp("dob","Date of birth","YYYY-MM-DD")+inp("gender","Gender","Male / Female / Other")+
 '<div class="col-12"><div class="border rounded p-3"><div class="fw-semibold mb-2">Doctor sessions</div><div class="row g-3"><div class="col-md-4"><label class="form-label">Morning start</label><input class="form-control" name="morning_start" type="time" value="09:00"></div><div class="col-md-4"><label class="form-label">Morning end</label><input class="form-control" name="morning_end" type="time" value="13:00"></div><div class="col-md-4"><label class="form-label">Enable morning</label><select class="form-select" name="morning_enabled"><option value="yes">Yes</option><option value="no">No</option></select></div><div class="col-md-4"><label class="form-label">Evening start</label><input class="form-control" name="evening_start" type="time" value="16:00"></div><div class="col-md-4"><label class="form-label">Evening end</label><input class="form-control" name="evening_end" type="time" value="19:00"></div><div class="col-md-4"><label class="form-label">Enable evening</label><select class="form-select" name="evening_enabled"><option value="yes">Yes</option><option value="no">No</option></select></div></div></div></div>'+
 '</div><div class="d-flex justify-content-end mt-3"><button class="btn btn-primary">Create doctor</button></div></form></div>';
 var rows=db.doctors.map(function(d){var st=db.staff.find(function(x){return x.staff_id===d.staff_id;}),sp=db.specializations.find(function(x){return x.spec_id===d.specialization_id;});return CMSX.row([CMSUI.esc(CMSUI.staffCode(db,st.staff_id)),CMSUI.esc("Dr. "+st.first_name+" "+st.last_name),CMSUI.esc(sp.spec_name),CMSUI.money(d.consultation_fee),d.exp_year+" years",d.license_no]);});
 document.getElementById("page-content").innerHTML=form+CMSX.card("Doctors",CMSX.table(["Doctor ID","Doctor","Specialization","Fee","Experience","License"],rows));
 document.getElementById("doctor-form").onsubmit=async function(e){e.preventDefault();var f=new FormData(e.target),o={};f.forEach(function(v,k){o[k]=v;});o.sessions=[];if(f.get("morning_enabled")==="yes")o.sessions.push({session:"MORNING",start_time:f.get("morning_start"),end_time:f.get("morning_end")});if(f.get("evening_enabled")==="yes")o.sessions.push({session:"EVENING",start_time:f.get("evening_start"),end_time:f.get("evening_end")});try{await CMSWorkflow.adminCreateDoctor(o);CMSX.alert("Doctor created.");e.target.reset();setTimeout(function(){location.reload();},400);}catch(err){CMSX.alert(err.message,"danger");}};
});}
function inp(n,l,ph,req,typ){typ=typ||"text";return '<div class="col-md-4"><label class="form-label">'+l+(req?" *":"")+'</label><input class="form-control" name="'+n+'" type="'+typ+'" placeholder="'+ph+'" '+(req?"required":"")+'></div>';}
function simple(col,title,idf,namef){
 CMSStore.read(function(db){
  var rows=db[col].map(function(x){return CMSX.row([x[idf],CMSUI.esc(x[namef]),CMSUI.badge(x.is_active?"ACTIVE":"INACTIVE")]);});
  var ph=col==="departments"?"e.g. Neurology":"e.g. Neurologist";
  document.getElementById("page-content").innerHTML=
   CMSX.card("Add "+title.toLowerCase(),'<form class="simple-form"><div class="row g-3"><div class="col-md-8"><label class="form-label">'+title.slice(0,-1)+' name</label><input class="form-control" name="name" placeholder="'+ph+'" required></div><div class="col-md-4 d-flex align-items-end"><button class="btn btn-primary w-100">Add</button></div></div></form>')+
   CMSX.card(title,CMSX.table(["ID","Name","Status"],rows));
  document.querySelector(".simple-form").onsubmit=async function(e){e.preventDefault();var n=new FormData(e.target).get("name");var rec={};rec[namef]=n;rec.is_active=true;try{await CMSWorkflow.adminSave(col,rec);CMSX.alert(title.slice(0,-1)+" added.");location.reload();}catch(err){CMSX.alert(err.message,"danger");}};
 });
}
function medicines(){
 CMSStore.read(function(db){
  var rows=db.master_medicines.map(function(m){return CMSX.row([m.medicine_id,CMSUI.esc(m.name),CMSUI.esc(m.generic_name),CMSUI.esc(m.category),CMSUI.badge(m.is_active?"ACTIVE":"INACTIVE")]);});
  document.getElementById("page-content").innerHTML=CMSX.card("Add medicine",'<form id="med-master-form"><div class="row g-3">'+inp("name","Medicine name","Paracetamol",true)+inp("generic_name","Generic name","Paracetamol",true)+inp("category","Category","Analgesic",true)+'</div><button class="btn btn-primary mt-3">Add medicine</button></form>')+CMSX.card("Master medicines",CMSX.table(["ID","Medicine","Generic","Category","Status"],rows));
  document.getElementById("med-master-form").onsubmit=async function(e){e.preventDefault();var f=new FormData(e.target);try{await CMSWorkflow.adminSave("master_medicines",{name:f.get("name"),generic_name:f.get("generic_name"),category:f.get("category"),is_active:true});CMSX.alert("Medicine added.");location.reload();}catch(err){CMSX.alert(err.message,"danger");}};
 });
}
function dosages(){
 CMSStore.read(function(db){
  var rows=db.dosages.map(function(d){return CMSX.row([d.dosage_id,CMSUI.esc(CMSUI.medicineName(db,d.medicine_id)),d.dosage_value+d.unit,CMSUI.esc(d.description),CMSUI.badge(d.is_active?"ACTIVE":"INACTIVE")]);});
  document.getElementById("page-content").innerHTML=CMSX.card("Add dosage",'<form id="dose-form"><div class="row g-3"><div class="col-md-4"><label class="form-label">Medicine</label><select class="form-select" name="medicine_id">'+db.master_medicines.map(function(m){return '<option value="'+m.medicine_id+'">'+CMSUI.esc(m.name)+'</option>';}).join("")+'</select></div>'+inp("dosage_value","Value","500",true,"number")+inp("unit","Unit","mg",true)+inp("description","Description","Standard dose")+'</div><button class="btn btn-primary mt-3">Add dosage</button></form>')+CMSX.card("Dosages",CMSX.table(["ID","Medicine","Dosage","Description","Status"],rows));
  document.getElementById("dose-form").onsubmit=async function(e){e.preventDefault();var f=new FormData(e.target);try{await CMSWorkflow.adminSave("dosages",{medicine_id:Number(f.get("medicine_id")),dosage_value:Number(f.get("dosage_value")),unit:f.get("unit"),description:f.get("description"),is_active:true});CMSX.alert("Dosage added.");location.reload();}catch(err){CMSX.alert(err.message,"danger");}};
 });
}
function labtests(){
 CMSStore.read(function(db){
  var rows=db.master_lab_tests.map(function(t){return CMSX.row([t.test_id,CMSUI.esc(t.test_name),CMSUI.esc(t.test_type),CMSUI.money(t.test_price),t.min_value!=null?t.min_value+" – "+t.max_value:"—",CMSUI.badge(t.is_active?"ACTIVE":"INACTIVE")]);});
  document.getElementById("page-content").innerHTML=CMSX.card("Add lab test",'<form id="test-form"><div class="row g-3">'+inp("test_name","Test name","Thyroid Profile",true)+inp("test_type","Test type","Blood",true)+inp("test_price","Price","450",true,"number")+inp("min_value","Minimum value","",false,"number")+inp("max_value","Maximum value","",false,"number")+inp("description","Description","Test description")+'</div><button class="btn btn-primary mt-3">Add test</button></form>')+CMSX.card("Master lab tests",CMSX.table(["ID","Test","Type","Price","Range","Status"],rows));
  document.getElementById("test-form").onsubmit=async function(e){e.preventDefault();var f=new FormData(e.target),min=f.get("min_value"),max=f.get("max_value");try{await CMSWorkflow.adminSave("master_lab_tests",{test_name:f.get("test_name"),test_type:f.get("test_type"),description:f.get("description"),test_price:Number(f.get("test_price")),min_value:min===""?null:Number(min),max_value:max===""?null:Number(max),is_active:true});CMSX.alert("Lab test added.");location.reload();}catch(err){CMSX.alert(err.message,"danger");}};
 });
}
async function activity(){var rows=await CMSStore.activity();document.getElementById("page-content").innerHTML=CMSX.card("Activity log",CMSX.table(["Time","Type","Patient","Message","Actor"],rows.map(function(a){return CMSX.row([CMSUI.dateTime(a.created_at),CMSUI.esc(a.type),a.patient_id?"#"+a.patient_id:"—",CMSUI.esc(a.message),CMSUI.esc(a.actor||"system")]);}),"No activity."));}
