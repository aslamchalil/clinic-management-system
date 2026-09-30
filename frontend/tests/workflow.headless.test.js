const vm=require('vm'),fs=require('fs');const D=require('path').join(__dirname,'../shared/js/')+'';
const store={};const ctx={localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>store[k]=String(v),removeItem:k=>delete store[k]},location:{},console};
ctx.window=ctx;vm.createContext(ctx);
['mock-data','clock','store','ui','navigation','auth','workflow'].forEach(f=>vm.runInContext(fs.readFileSync(D+f+'.js','utf8'),ctx,{filename:f}));
const {CMSWorkflow:W,CMSAuth:A,CMSStore:S,CMSClock:C}=ctx;
let pass=0,bad=0;
async function ok(name,p){try{await p;pass++;console.log('PASS',name)}catch(e){bad++;console.log('FAIL',name,e.message)}}
async function no(name,p,frag){try{await p;bad++;console.log('FAIL (should block)',name)}catch(e){if(frag&&!e.message.includes(frag)){bad++;console.log('FAIL wrong msg',name,e.message)}else{pass++;console.log('PASS blocked:',name,'→',e.message)}}}
const rd=f=>S.read(f);
(async()=>{
 C.set('2026-09-29','09:30');
 await no('bad login',A.login('doctor_arjun','x'));
 await ok('login receptionist',A.login('reception','reception123'));
 await no('receptionist cannot save consultation',W.saveConsultation({token_id:1}),'not allowed');
 const p=await W.registerPatient({full_name:'Test Walkin',dob:'1990-01-01',gender:'F',phone_number:'9999999999'});
 await no('duplicate patient',W.registerPatient({full_name:'Test Walkin',dob:'1990-01-01',gender:'F',phone_number:'9999999999'}),'already');
 const bill=await W.createRegistrationBill({patient_id:p.patient_id,doctor_id:1});
 await no('token before payment',W.generateToken({bill_id:bill.bill_id,session:'MORNING'}),'PAID');
 await no('duplicate open bill',W.createRegistrationBill({patient_id:p.patient_id,doctor_id:1}),'still open');
 await W.payRegistrationBill(bill.bill_id,'CASH');
 const tok=await W.generateToken({bill_id:bill.bill_id,session:'MORNING'});
 console.log('walk-in token number (doctor1 morning; seed has 1):',tok.token_number, tok.appointment_id);
 await no('one token per bill',W.generateToken({bill_id:bill.bill_id,session:'MORNING'}),'already');
  // appointment cap
 for(let i=0;i<7;i++){const q=await W.registerPatient({full_name:'Bulk '+i,dob:'1980-01-01',gender:'M',phone_number:'90000000'+String(10+i)});await W.bookAppointment({patient_id:q.patient_id,doctor_id:2,appointment_date:'2026-09-30',appointment_time_slot:'10:00'});}
 const av=await W.availability(2,'2026-09-30');console.log('doctor2 appts on 30th',av.appointments);
 for(let i=0;i<3;i++){const q=await W.registerPatient({full_name:'Bulk B'+i,dob:'1980-01-01',gender:'M',phone_number:'90000001'+String(10+i)});await W.bookAppointment({patient_id:q.patient_id,doctor_id:2,appointment_date:'2026-09-30',appointment_time_slot:'10:00'});}
 const q11=await W.registerPatient({full_name:'Eleventh',dob:'1980-01-01',gender:'M',phone_number:'9000000199'});
 await no('11th appointment',W.bookAppointment({patient_id:q11.patient_id,doctor_id:2,appointment_date:'2026-09-30',appointment_time_slot:'10:00'}),'10 appointments');
 // no-show
 C.set('2026-09-29','11:31');
 console.log('no-shows processed:',await W.processNoShows());
 const apts=await rd(db=>db.appointments.filter(a=>a.appointment_id<=3).map(a=>a.appointment_id+':'+a.status));console.log(apts.join(' '));
 const tokCount=await rd(db=>db.tokens.length);console.log('tokens (no token consumed by no-show):',tokCount);
 // token for appointment holder Akhil (seed tokens exist). Doctor flow
 C.set('2026-09-29','10:05');
 await A.login('doctor_arjun','doctor123');
 const ses=A.session();console.log('doctor session name:',ses.name,'doctor_id',ses.doctor_id);
 await no('call token of other doctor',W.callToken(2),'another doctor');
 await no('open wrong session token',(async()=>{C.set('2026-09-29','17:00');try{return await W.openToken(1)}finally{C.set('2026-09-29','10:05')}})(),'session');
 await no('consult before call',W.saveConsultation({token_id:1,symptoms:'a',diagnosis:'b'}),'Call the patient');
 await ok('call token 1',W.callToken(1));
 await no('second call while one called',W.callToken(3),'');
 const file=await W.openToken(1);console.log('opened patient:',file.patient.full_name);
 await no('invalid dosage',W.saveConsultation({token_id:1,symptoms:'fever',diagnosis:'viral',items:[{medicine_id:1,dosage_id:3,frequency:'Twice daily',duration:'5 days'}]}),'dosage');
 const before=await rd(db=>db.consultations.length);
 await ok('save consultation',W.saveConsultation({token_id:1,symptoms:'Fever',diagnosis:'Viral fever',remarks:'Rest',items:[{medicine_id:1,dosage_id:1,frequency:'Twice daily',duration:'5 days',instructions:'After food'},{medicine_id:5,dosage_id:6,frequency:'Once daily',duration:'10 days'}],labs:[{test_id:2,priority:'URGENT'},{test_id:1}]}));
 await no('second consultation same token',W.saveConsultation({token_id:1,symptoms:'a',diagnosis:'b'}),'');
 console.log('consults',before,'→',await rd(db=>db.consultations.length),'items',await rd(db=>db.prescription_items.length),'labs',await rd(db=>db.lab_requests.length),'token1',await rd(db=>db.tokens[0].status),'apt1',await rd(db=>db.appointments[0].status));
 // pharmacy
 await A.login('pharmacy','pharmacy123');
 const items=await rd(db=>db.prescription_items.map(i=>({id:i.prescription_item_id,q:W.suggestedQty(i),m:i.medicine_id})));console.log('suggested qty',JSON.stringify(items));
 await no('bill beyond stock (metformin stock 8, need 10)',W.createPharmacyBill({prescription_id:1,lines:[{prescription_item_id:2,quantity:10}]}),'Insufficient');
 const pb=await W.createPharmacyBill({prescription_id:1,lines:[{prescription_item_id:1,quantity:10},{prescription_item_id:2,quantity:6}]});console.log('pharm bill total',pb.total_amount);
 await no('dispense before payment',W.dispense(pb.pharmacy_bill_id),'PAID');
 await no('double bill same items',W.createPharmacyBill({prescription_id:1,lines:[{prescription_item_id:1,quantity:2}]}),'already billed');
 await W.payPharmacyBill(pb.pharmacy_bill_id,'UPI');
 const stk0=await rd(db=>db.pharmacy_stock.map(s=>s.quantity).join(','));
 await W.dispense(pb.pharmacy_bill_id);
 console.log('stock',stk0,'→',await rd(db=>db.pharmacy_stock.map(s=>s.quantity).join(',')),'states',await rd(db=>db.prescription_items.map(i=>i.dispensed_status).join(',')));
 await no('dispense twice',W.dispense(pb.pharmacy_bill_id),'already');
 // lab
 await A.login('lab','lab123');
 await no('process unbilled',W.startProcessing(1),'PAID');
 const lb=await W.createLabBill({lab_request_ids:[1,2]});console.log('lab bill',lb.total_amount);
 await no('process billed-unpaid',W.startProcessing(1),'PAID');
 await W.payLabBill(lb.lab_bill_id,'CASH');
 await no('result before processing',W.saveResult({lab_request_id:1,result_value:'90'}),'Start processing');
 await W.startProcessing(1);await W.saveResult({lab_request_id:1,result_value:'115',unit:'mg/dL'});
 console.log('req statuses',await rd(db=>db.lab_requests.map(r=>r.status).join(',')),'abnormal?',await rd(db=>W.isAbnormal(db,db.lab_results[0])),'range',await rd(db=>db.lab_results[0].reference_range));
 // role guards
 await A.login('reception','reception123');
 await no('receptionist cannot dispense',W.dispense(1),'not allowed');
 // activity timeline
 console.log('timeline patient1:',(await W.timeline(1)).map(a=>a.type).reverse().join(' > '));
 // token 30 cap + duplicate active token
 await A.login('reception','reception123');C.set('2026-09-29','10:10');
 const pats=[];for(let i=0;i<30;i++){const q=await W.registerPatient({full_name:'Cap '+i,dob:'1980-01-01',gender:'M',phone_number:'91000000'+String(10+i)});const b=await W.createRegistrationBill({patient_id:q.patient_id,doctor_id:2});await W.payRegistrationBill(b.bill_id,'CASH');pats.push(b.bill_id)}
 let issued=0,lastErr='';for(const id of pats){try{await W.generateToken({bill_id:id,session:'MORNING'});issued++}catch(e){lastErr=e.message}}
 console.log('doctor2 had 1 token; issued',issued,'more; blocked with:',lastErr);
 // evening after session end
 C.set('2026-09-29','20:30');{const q=await W.registerPatient({full_name:'Late One',dob:'1980-01-01',gender:'M',phone_number:'9200000001'});const b=await W.createRegistrationBill({patient_id:q.patient_id,doctor_id:2});await W.payRegistrationBill(b.bill_id,'CASH');await no('token after session end',W.generateToken({bill_id:b.bill_id,session:'EVENING'}),'ended');}
 // reset
 S.resetAll();console.log('after reset: patients',await rd(db=>db.patients.length),'tokens',await rd(db=>db.tokens.length),'activity',(await S.activity()).length,'session',S.getSession());
 console.log(`\n${pass} passed, ${bad} failed`);
})().catch(e=>console.log('CRASH',e));
