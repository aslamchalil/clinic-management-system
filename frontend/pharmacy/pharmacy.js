/* PHARMACY MODULE — prescription → bill → payment → dispense → stock. */
CMS.ready(async function(session){
 if(!session||session.role!=="PHARMACIST")return;
 var p=document.body.dataset.page;
 if(p==="dashboard")dash();
 if(p==="prescriptions")prescriptions();
 if(p==="stock")stock();
 if(p==="billing")billing();
 if(p==="dispensing")dispensing();
});
function dash(){CMSStore.read(function(db){
 var pending=db.prescription_items.filter(function(i){return i.dispensed_status==="PENDING";}).length;
 var low=db.pharmacy_stock.filter(function(s){return s.quantity<=s.reorder_level;}).length;
 var bills=db.pharmacy_bills.filter(function(b){return b.payment_status==="PENDING";}).length;
 var paid=db.pharmacy_bills.filter(function(b){return b.payment_status==="PAID";}).length;
 var scoped={};db.prescriptions.forEach(function(pr){var c=db.consultations.find(function(x){return x.consult_id===pr.consultation_id;});if(c)scoped[c.patient_id]=1;});db.pharmacy_bills.forEach(function(b){scoped[b.patient_id]=1;});
 var searchPatients=db.patients.filter(function(x){return scoped[x.patient_id];});
 document.getElementById("page-content").innerHTML='<div class="row g-3 mb-4">'+st("prescription2","Pending items",pending,"is-warning")+st("box-seam","Low stock",low,"is-warning")+st("receipt","Pending bills",bills)+st("bag-check","Paid bills",paid,"is-success")+'</div>'+
 CMSX.card("Patient search",'<div id="pharmacy-patient-search"></div>')+
 CMSX.card("Workflow",'<div class="cms-stepper"><div class="cms-step is-active">Prescription</div><div class="cms-step">Billing</div><div class="cms-step">Payment</div><div class="cms-step">Dispensing</div><div class="cms-step">Stock updated</div></div>')+
 CMSX.card("Quick actions",'<div class="d-flex flex-wrap gap-2"><a class="btn btn-primary" href="prescriptions.html">Prescription queue</a><a class="btn btn-outline-primary" href="billing.html">Billing</a><a class="btn btn-outline-primary" href="dispensing.html">Dispensing</a><a class="btn btn-outline-primary" href="stock.html">Stock</a></div>');
 CMSPatientSearch.render("pharmacy-patient-search",db,searchPatients,function(pt){return '<a class="btn btn-sm btn-outline-primary" href="billing.html?patient='+pt.patient_id+'">View bills</a>';});
});}
function st(i,l,v,c){return '<div class="col-6 col-lg-3"><div class="cms-card cms-stat"><div class="cms-stat-icon '+(c||"")+'"><i class="bi bi-'+i+'"></i></div><div><p class="cms-stat-label">'+l+'</p><div class="cms-stat-value">'+v+'</div></div></div></div>';}

function prescriptionRows(db,onlyPending){
 var prs=db.prescriptions.filter(function(pr){return db.prescription_items.some(function(i){return i.prescription_id===pr.prescription_id&&(!onlyPending||i.dispensed_status==="PENDING");});});
 return prs.map(function(pr){
   var c=db.consultations.find(function(x){return x.consult_id===pr.consultation_id;}),items=db.prescription_items.filter(function(i){return i.prescription_id===pr.prescription_id&&(!onlyPending||i.dispensed_status==="PENDING");});
   var hasPending=items.some(function(i){return i.dispensed_status==="PENDING";});
   var action=(hasPending?'<a class="btn btn-sm btn-primary me-1" href="billing.html?prescription='+pr.prescription_id+'">Bill</a>':"")+
     '<button class="btn btn-sm btn-outline-secondary js-print-prescription" data-id="'+pr.prescription_id+'"><i class="bi bi-file-earmark-pdf me-1"></i>Print</button>';
   return CMSX.row([pr.prescription_id,CMSUI.esc(CMSUI.patientName(db,c.patient_id)),CMSUI.date(pr.created_at),items.map(function(i){return '<div>'+CMSUI.esc(CMSUI.medicineName(db,i.medicine_id,i.dosage_id))+' · '+CMSUI.esc(i.frequency)+' · '+CMSUI.esc(i.duration)+' '+CMSUI.badge(i.dispensed_status)+'</div>';}).join(""),action]);
 });
}
function prescriptions(){CMSStore.read(function(db){
 document.getElementById("page-content").innerHTML=CMSX.card("Prescription queue",CMSX.table(["Prescription","Patient","Date","Items","Action"],prescriptionRows(db,false),"No prescriptions available."));
 document.querySelectorAll(".js-print-prescription").forEach(function(btn){btn.onclick=function(){CMSPrint.prescription(db,Number(btn.dataset.id));};});
});}

function stock(){CMSStore.read(function(db){
 var rows=db.pharmacy_stock.map(function(s){var low=s.quantity<=s.reorder_level;return CMSX.row([CMSUI.esc(CMSUI.medicineName(db,s.medicine_id)),s.quantity,CMSUI.money(s.unit_cost_price),CMSUI.money(s.selling_price),s.reorder_level,low?CMSUI.badge("PENDING"):'<span class="text-success">Healthy</span>','<button class="btn btn-sm btn-outline-primary js-add" data-id="'+s.medicine_id+'">Add stock</button>']);});
 document.getElementById("page-content").innerHTML=CMSX.card("Pharmacy stock",CMSX.table(["Medicine","Quantity","Cost","Selling","Reorder","Status","Action"],rows,"No stock."));
 document.querySelectorAll(".js-add").forEach(function(b){b.onclick=async function(){var q=prompt("Quantity to add");if(q===null)return;try{await CMSWorkflow.updateStock({medicine_id:Number(b.dataset.id),add_quantity:Number(q)});CMSX.alert("Stock updated.");location.reload();}catch(e){CMSX.alert(e.message,"danger");}}});
});}

function billing(){CMSStore.read(function(db){
 var pid=new URLSearchParams(location.search).get("prescription");
 var content='';
 if(pid){
  var pr=db.prescriptions.find(function(x){return x.prescription_id===Number(pid);});
  if(pr){
   var c=db.consultations.find(function(x){return x.consult_id===pr.consultation_id;}), items=db.prescription_items.filter(function(i){return i.prescription_id===pr.prescription_id&&i.dispensed_status==="PENDING";});
   content='<div class="cms-card"><h2 class="cms-card-title">Create pharmacy bill · Prescription #'+pr.prescription_id+'</h2><p class="text-secondary">'+CMSUI.esc(CMSUI.patientName(db,c.patient_id))+'</p><form id="ph-bill"><div class="table-responsive"><table class="table cms-table"><thead><tr><th>Medicine</th><th>Suggested qty</th><th>Dispense qty</th><th>Unit price</th></tr></thead><tbody>'+
   items.map(function(i){var stock=db.pharmacy_stock.find(function(s){return s.medicine_id===i.medicine_id;});var q=suggested(i.frequency,i.duration);return '<tr><td>'+CMSUI.esc(CMSUI.medicineName(db,i.medicine_id,i.dosage_id))+'</td><td>'+q+'</td><td><input class="form-control qty" data-item="'+i.prescription_item_id+'" value="'+Math.min(q,stock?stock.quantity:0)+'" type="number" min="1" max="'+(stock?stock.quantity:0)+'"></td><td>'+CMSUI.money(stock?stock.selling_price:0)+'</td></tr>';}).join("")+
   '</tbody></table></div><div class="d-flex justify-content-end"><button class="btn btn-primary">Create bill</button></div></form></div>';
  }
 }
 document.getElementById("page-content").innerHTML=content+CMSX.card("Existing bills",billTable(db));
 if(document.getElementById("ph-bill"))document.getElementById("ph-bill").onsubmit=async function(e){e.preventDefault();var lines=[].slice.call(document.querySelectorAll(".qty")).map(function(x){return {prescription_item_id:Number(x.dataset.item),quantity:Number(x.value)};});try{await CMSWorkflow.createPharmacyBill({prescription_id:Number(pid),lines:lines});CMSX.alert("Pharmacy bill created.");location.href="billing.html";}catch(err){CMSX.alert(err.message,"danger");}};
 bindPays();
 document.querySelectorAll(".js-print-ph-bill").forEach(function(btn){btn.onclick=function(){CMSStore.read(function(db2){CMSPrint.bill(db2,"pharmacy",Number(btn.dataset.id));});};});
});}
function suggested(freq,dur){var f={"Once daily":1,"Twice daily":2,"Three times daily":3,"Four times daily":4,"At bedtime":1}[freq]||1,m=String(dur).match(/\d+/);return f*(m?Number(m[0]):1);}
function billTable(db){
 var pid=new URLSearchParams(location.search).get("patient");
 var list=db.pharmacy_bills.filter(function(b){return !pid||b.patient_id===Number(pid);}).slice().sort(function(a,b){return b.pharmacy_bill_id-a.pharmacy_bill_id;});
 return CMSX.table(["Bill","Patient","Total","Payment","Action"],list.map(function(b){
  var action=b.payment_status==="PENDING"?'<div class="d-flex gap-1"><select class="form-select form-select-sm method" data-id="'+b.pharmacy_bill_id+'"><option>CASH</option><option>CARD</option><option>UPI</option></select><button class="btn btn-sm btn-primary pay" data-id="'+b.pharmacy_bill_id+'">Pay</button></div>':CMSUI.badge(b.payment_status);
  action+=' <button class="btn btn-sm btn-outline-secondary js-print-ph-bill" data-id="'+b.pharmacy_bill_id+'"><i class="bi bi-file-earmark-pdf"></i> PDF</button>';
  return CMSX.row([b.pharmacy_bill_id,CMSUI.esc(CMSUI.patientName(db,b.patient_id)),CMSUI.money(b.total_amount),CMSUI.badge(b.payment_status),action]);
 }),"No pharmacy bills.");}
function bindPays(){document.querySelectorAll(".pay").forEach(function(b){b.onclick=async function(){var m=document.querySelector('.method[data-id="'+b.dataset.id+'"]').value;try{await CMSWorkflow.payPharmacyBill(Number(b.dataset.id),m);CMSX.alert("Payment confirmed.");location.reload();}catch(e){CMSX.alert(e.message,"danger");}}});}
function dispensing(){CMSStore.read(function(db){
 var rows=db.pharmacy_bills.filter(function(b){return b.payment_status==="PAID";}).map(function(b){var items=db.pharmacy_bill_items.filter(function(i){return i.pharmacy_bill_id===b.pharmacy_bill_id;});var done=CMSWorkflow.isBillDispensed(db,b);return CMSX.row([b.pharmacy_bill_id,CMSUI.esc(CMSUI.patientName(db,b.patient_id)),items.map(function(i){return CMSUI.esc(CMSUI.medicineName(db,i.medicine_id))+" × "+i.quantity_dispensed;}).join("<br>"),CMSUI.money(b.total_amount),(done?CMSUI.badge("DISPENSED"):'<button class="btn btn-sm btn-primary js-dispense" data-id="'+b.pharmacy_bill_id+'">Dispense</button>')+' <button class="btn btn-sm btn-outline-secondary js-print-ph-bill" data-id="'+b.pharmacy_bill_id+'">PDF</button>']);});
 document.getElementById("page-content").innerHTML=CMSX.card("Paid bills ready for dispensing",CMSX.table(["Bill","Patient","Medicines","Total","Action"],rows,"No paid bills ready for dispensing."));
 document.querySelectorAll(".js-dispense").forEach(function(b){b.onclick=async function(){try{await CMSWorkflow.dispense(Number(b.dataset.id));CMSX.alert("Medicine dispensed and stock deducted.");location.reload();}catch(e){CMSX.alert(e.message,"danger");}}});
 document.querySelectorAll(".js-print-ph-bill").forEach(function(btn){btn.onclick=function(){CMSPrint.bill(db,"pharmacy",Number(btn.dataset.id));};});
});}
