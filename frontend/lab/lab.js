/* LAB MODULE — request → bill → payment → processing → result. */
CMS.ready(async function(session){
 if(!session||session.role!=="LAB_TECHNICIAN")return;
 var p=document.body.dataset.page;
 if(p==="dashboard")dash();
 if(p==="requests")requests();
 if(p==="billing")billing();
 if(p==="processing")processing();
 if(p==="results")results();
});
function dash(){CMSStore.read(function(db){
 var requested=db.lab_requests.filter(function(r){return r.status==="REQUESTED";}).length;
 var billed=db.lab_requests.filter(function(r){return r.status==="BILLED";}).length;
 var paid=db.lab_requests.filter(function(r){return r.status==="PAID";}).length;
 var done=db.lab_requests.filter(function(r){return r.status==="COMPLETED";}).length;
 var scoped={};db.lab_requests.forEach(function(r){var x=reqInfo(db,r);if(x.p)scoped[x.p.patient_id]=1;});db.lab_bills.forEach(function(b){scoped[b.patient_id]=1;});
 var searchPatients=db.patients.filter(function(x){return scoped[x.patient_id];});
 document.getElementById("page-content").innerHTML='<div class="row g-3 mb-4">'+st("clipboard2-pulse","Requested",requested,"is-warning")+st("receipt","Billed",billed)+st("cash-coin","Paid",paid)+st("check2-circle","Completed",done,"is-success")+'</div>'+
 CMSX.card("Patient search",'<div id="lab-patient-search"></div>')+
 CMSX.card("Laboratory workflow",'<div class="cms-stepper"><div class="cms-step is-active">Request</div><div class="cms-step">Bill</div><div class="cms-step">Payment</div><div class="cms-step">Processing</div><div class="cms-step">Result</div></div>')+
 CMSX.card("Quick actions",'<div class="d-flex flex-wrap gap-2"><a class="btn btn-primary" href="requests.html">Requests</a><a class="btn btn-outline-primary" href="billing.html">Billing</a><a class="btn btn-outline-primary" href="processing.html">Processing</a><a class="btn btn-outline-primary" href="results.html">Results</a></div>');
 CMSPatientSearch.render("lab-patient-search",db,searchPatients,function(pt){return '<a class="btn btn-sm btn-outline-primary" href="billing.html?patient='+pt.patient_id+'">View bills</a>';});
});}
function st(i,l,v,c){return '<div class="col-6 col-lg-3"><div class="cms-card cms-stat"><div class="cms-stat-icon '+(c||"")+'"><i class="bi bi-'+i+'"></i></div><div><p class="cms-stat-label">'+l+'</p><div class="cms-stat-value">'+v+'</div></div></div></div>';}
function reqInfo(db,r){var c=db.consultations.find(function(x){return x.consult_id===r.consultation_id;});return {c:c,p:c&&db.patients.find(function(x){return x.patient_id===c.patient_id;})};}
function requests(){CMSStore.read(function(db){
 function billForRequest(id){var item=db.lab_bill_items.find(function(x){return x.lab_request_id===id;});return item&&db.lab_bills.find(function(b){return b.lab_bill_id===item.lab_bill_id;});}
 var rows=db.lab_requests.map(function(r){
   var x=reqInfo(db,r),action="",bill=billForRequest(r.lab_request_id),result=db.lab_results.find(function(z){return z.lab_request_id===r.lab_request_id;});
   if(r.status==="REQUESTED") action='<a class="btn btn-sm btn-primary" href="billing.html?request='+r.lab_request_id+'">Bill</a>';
   else if(r.status==="BILLED") action='<a class="btn btn-sm btn-outline-primary" href="billing.html?patient='+(x.p?x.p.patient_id:"")+'">View bill</a>';
   else if(r.status==="PAID") action='<button class="btn btn-sm btn-primary js-start-request" data-id="'+r.lab_request_id+'">Start processing</button>';
   else if(r.status==="IN_PROGRESS") action='<a class="btn btn-sm btn-outline-primary" href="results.html?request='+r.lab_request_id+'">Enter result</a>';
   else if(r.status==="COMPLETED") action='<a class="btn btn-sm btn-outline-secondary" href="results.html">View result</a>'+(result?' <button class="btn btn-sm btn-outline-secondary js-print-result" data-id="'+result.result_id+'">PDF</button>':"");
   else if(r.status==="CANCELLED") action=CMSUI.badge("CANCELLED");
   return CMSX.row([r.lab_request_id,CMSUI.esc(x.p?x.p.full_name:"—"),CMSUI.esc(CMSUI.testName(db,r.test_id)),CMSUI.badge(r.priority),CMSUI.badge(r.status),action]);
 });
 document.getElementById("page-content").innerHTML=CMSX.card("Lab requests",CMSX.table(["ID","Patient","Test","Priority","Status","Action"],rows,"No lab requests."));
 document.querySelectorAll(".js-start-request").forEach(function(btn){btn.onclick=async function(){try{await CMSWorkflow.startProcessing(Number(btn.dataset.id));CMSX.alert("Processing started.");location.reload();}catch(e){CMSX.alert(e.message,"danger");}}});
 document.querySelectorAll(".js-print-result").forEach(function(btn){btn.onclick=function(){var r=db.lab_results.find(function(x){return x.result_id===Number(btn.dataset.id);}),rq=db.lab_requests.find(function(x){return x.lab_request_id===r.lab_request_id;});CMSPrint.open("Lab Result #"+r.result_id,'<h2>Laboratory Result</h2><p><strong>Hospital:</strong> CMS Hospital Thiruvananthapuram</p><p><strong>Patient:</strong> '+CMSUI.esc(reqInfo(db,rq).p.full_name)+' &nbsp; <strong>Test:</strong> '+CMSUI.esc(CMSUI.testName(db,rq.test_id))+'</p><p><strong>Result:</strong> '+CMSUI.esc(r.result_value)+' '+CMSUI.esc(r.unit)+'<br><strong>Reference range:</strong> '+CMSUI.esc(r.reference_range)+'</p><p><strong>Report:</strong> '+CMSUI.esc(r.report||"—")+'</p>');};});
});}
function billing(){CMSStore.read(function(db){
 var params=new URLSearchParams(location.search),q=params.get("request"),patientFilter=params.get("patient");
 var requested=db.lab_requests.filter(function(r){return r.status==="REQUESTED";});
 if(patientFilter) requested=requested.filter(function(r){var x=reqInfo(db,r);return x.p&&x.p.patient_id===Number(patientFilter);});
 var selectedId=q?Number(q):null;
 var form=CMSX.card("Create lab bill",
   '<p class="small text-secondary mb-3">Select one or more REQUESTED tests for the same patient. A bill becomes PAID before processing can begin.</p>'+
   '<div class="table-responsive"><table class="table cms-table align-middle"><thead><tr><th></th><th>Request</th><th>Patient</th><th>Test</th><th>Priority</th><th>Price</th></tr></thead><tbody>'+
   (requested.length?requested.map(function(r){var x=reqInfo(db,r),t=db.master_lab_tests.find(function(z){return z.test_id===r.test_id;});return '<tr><td><input class="form-check-input lab-bill-check" type="checkbox" value="'+r.lab_request_id+'" '+(selectedId===r.lab_request_id?"checked":"")+'></td><td>#'+r.lab_request_id+'</td><td>'+CMSUI.esc(x.p?x.p.full_name:"—")+'</td><td>'+CMSUI.esc(t?t.test_name:"—")+'</td><td>'+CMSUI.badge(r.priority)+'</td><td>'+CMSUI.money(t?t.test_price:0)+'</td></tr>';}).join(""):'<tr><td colspan="6" class="text-center text-secondary py-4">No lab requests are waiting for billing.</td></tr>')+
   '</tbody></table></div><button class="btn btn-primary" id="make-lab-bill"><i class="bi bi-receipt me-1"></i>Create bill</button>');
 var billPatient=new URLSearchParams(location.search).get("patient");
 var billList=db.lab_bills.filter(function(b){return !billPatient||b.patient_id===Number(billPatient);});
 document.getElementById("page-content").innerHTML=form+CMSX.card("Lab bills",CMSX.table(["Bill","Patient","Total","Payment","Action"],billList.map(function(b){var a=b.payment_status==="PENDING"?'<div class="d-flex gap-1"><select class="form-select form-select-sm method" data-id="'+b.lab_bill_id+'"><option>CASH</option><option>CARD</option><option>UPI</option></select><button class="btn btn-sm btn-primary pay" data-id="'+b.lab_bill_id+'">Pay</button></div>':CMSUI.badge(b.payment_status);a+=' <button class="btn btn-sm btn-outline-secondary js-print-lab-bill" data-id="'+b.lab_bill_id+'"><i class="bi bi-file-earmark-pdf"></i> PDF</button>';return CMSX.row([b.lab_bill_id,CMSUI.esc(CMSUI.patientName(db,b.patient_id)),CMSUI.money(b.total_amount),CMSUI.badge(b.payment_status),a]);}),"No lab bills."));
 document.getElementById("make-lab-bill").onclick=async function(){var ids=[].slice.call(document.querySelectorAll(".lab-bill-check:checked")).map(function(x){return Number(x.value);});try{await CMSWorkflow.createLabBill({lab_request_ids:ids});CMSX.alert("Lab bill created.");location.reload();}catch(e){CMSX.alert(e.message,"danger");}};
 bindPay();
 document.querySelectorAll(".js-print-lab-bill").forEach(function(btn){btn.onclick=function(){CMSPrint.bill(db,"lab",Number(btn.dataset.id));};});
});}
function bindPay(){document.querySelectorAll(".pay").forEach(function(b){b.onclick=async function(){var m=document.querySelector('.method[data-id="'+b.dataset.id+'"]').value;try{await CMSWorkflow.payLabBill(Number(b.dataset.id),m);CMSX.alert("Lab payment confirmed.");location.reload();}catch(e){CMSX.alert(e.message,"danger");}}});}
function processing(){CMSStore.read(function(db){
 var rows=db.lab_requests.filter(function(r){return r.status==="PAID"||r.status==="IN_PROGRESS";}).map(function(r){var x=reqInfo(db,r),action=r.status==="PAID"?'<button class="btn btn-sm btn-primary start" data-id="'+r.lab_request_id+'">Start processing</button>':'<a class="btn btn-sm btn-outline-primary" href="results.html?request='+r.lab_request_id+'">Enter result</a>';return CMSX.row([r.lab_request_id,CMSUI.esc(x.p.full_name),CMSUI.esc(CMSUI.testName(db,r.test_id)),CMSUI.badge(r.status),action]);});
 document.getElementById("page-content").innerHTML=CMSX.card("Processing queue",CMSX.table(["ID","Patient","Test","Status","Action"],rows,"No paid requests ready for processing."));
 document.querySelectorAll(".start").forEach(function(b){b.onclick=async function(){try{await CMSWorkflow.startProcessing(Number(b.dataset.id));CMSX.alert("Processing started.");location.reload();}catch(e){CMSX.alert(e.message,"danger");}}});
});}
function results(){CMSStore.read(function(db){
 var q=new URLSearchParams(location.search).get("request"),req=q&&db.lab_requests.find(function(r){return r.lab_request_id===Number(q);});
 var form="";
 if(req&&req.status==="IN_PROGRESS"){var x=reqInfo(db,req),t=db.master_lab_tests.find(function(t){return t.test_id===req.test_id;});form='<div class="cms-card"><h2 class="cms-card-title">Enter result</h2><p class="text-secondary">'+CMSUI.esc(x.p.full_name)+' · '+CMSUI.esc(t.test_name)+'</p><form id="result-form"><div class="row g-3">'+
 '<div class="col-md-4"><label class="form-label">Result *</label><input class="form-control" name="result_value" required></div><div class="col-md-4"><label class="form-label">Unit</label><input class="form-control" name="unit" value="'+(t.test_id===2?"mg/dL":"")+'"></div><div class="col-md-4"><label class="form-label">Reference range</label><input class="form-control" name="reference_range" value="'+(t.min_value!=null?t.min_value+" – "+t.max_value:"")+'"></div><div class="col-12"><label class="form-label">Report</label><textarea class="form-control" name="report" rows="3"></textarea></div></div><div class="d-flex justify-content-end mt-3"><button class="btn btn-primary">Save result</button></div></form></div>';}
 var rows=db.lab_results.slice().sort(function(a,b){return b.result_id-a.result_id;}).map(function(r){var req2=db.lab_requests.find(function(x){return x.lab_request_id===r.lab_request_id;}),x=reqInfo(db,req2);return CMSX.row([r.result_id,CMSUI.esc(x.p.full_name),CMSUI.esc(CMSUI.testName(db,req2.test_id)),CMSUI.esc(r.result_value+" "+r.unit),CMSUI.esc(r.reference_range),CMSUI.date(r.result_date),'<button class="btn btn-sm btn-outline-secondary js-print-result" data-id="'+r.result_id+'">PDF</button>']);});
 document.getElementById("page-content").innerHTML=form+CMSX.card("Completed results",CMSX.table(["ID","Patient","Test","Result","Reference","Date","Report"],rows,"No results."));
 if(document.getElementById("result-form"))document.getElementById("result-form").onsubmit=async function(e){e.preventDefault();var f=new FormData(e.target),o={lab_request_id:Number(q),result_value:f.get("result_value"),unit:f.get("unit"),reference_range:f.get("reference_range"),report:f.get("report")};try{await CMSWorkflow.saveResult(o);CMSX.alert("Result saved.");location.href="results.html";}catch(err){CMSX.alert(err.message,"danger");}};
 document.querySelectorAll(".js-print-result").forEach(function(btn){btn.onclick=function(){var r=db.lab_results.find(function(x){return x.result_id===Number(btn.dataset.id);}),rq=db.lab_requests.find(function(x){return x.lab_request_id===r.lab_request_id;});CMSPrint.open("Lab Result #"+r.result_id,'<h2>Laboratory Result</h2><p><strong>Patient:</strong> '+CMSUI.esc(reqInfo(db,rq).p.full_name)+' &nbsp; <strong>Test:</strong> '+CMSUI.esc(CMSUI.testName(db,rq.test_id))+'</p><p><strong>Result:</strong> '+CMSUI.esc(r.result_value)+' '+CMSUI.esc(r.unit)+'<br><strong>Reference range:</strong> '+CMSUI.esc(r.reference_range)+'</p><p><strong>Report:</strong> '+CMSUI.esc(r.report||"—")+'</p>');};});
});}
