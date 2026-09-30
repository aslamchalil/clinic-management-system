/* SHARED MOCK DATA — single seed for the entire frontend demo.
   Every module reads/writes the same browser database through CMSStore.
   No module should maintain its own copy of patients, medicines, doctors,
   appointments, bills, tokens, consultations, prescriptions or lab data. */
window.CMS_BUILD_SEED = function (today) {
  var at = function (t) { return today + "T" + t + ":00"; };
  var data = {
    roles: [
      {role_id:1,role_name:"ADMIN",is_active:true},{role_id:2,role_name:"DOCTOR",is_active:true},
      {role_id:3,role_name:"RECEPTIONIST",is_active:true},{role_id:4,role_name:"PHARMACIST",is_active:true},
      {role_id:5,role_name:"LAB_TECHNICIAN",is_active:true}
    ],
    departments: [
      {department_id:1,department_name:"General Medicine",is_active:true},
      {department_id:2,department_name:"Cardiology",is_active:true},
      {department_id:3,department_name:"Pediatrics",is_active:true},
      {department_id:4,department_name:"Dermatology",is_active:true},
      {department_id:5,department_name:"Orthopedics",is_active:true}
    ],
    specializations: [
      {spec_id:1,spec_name:"General Physician",is_active:true},
      {spec_id:2,spec_name:"Cardiologist",is_active:true},
      {spec_id:3,spec_name:"Pediatrician",is_active:true},
      {spec_id:4,spec_name:"Dermatologist",is_active:true},
      {spec_id:5,spec_name:"Orthopedic Surgeon",is_active:true}
    ],
    users: [
      {user_id:101,username:"doctor_arjun",password:"doctor123"},
      {user_id:102,username:"doctor_ananya",password:"doctor123"},
      {user_id:103,username:"reception",password:"reception123"},
      {user_id:104,username:"pharmacy",password:"pharmacy123"},
      {user_id:105,username:"lab",password:"lab123"},
      {user_id:106,username:"admin",password:"admin123"}
    ],
    staff: [
      {staff_id:1,user_id:101,role_id:2,department_id:1,first_name:"Arjun",last_name:"Menon",dob:"1986-04-12",gender:"M",phone_number:"9876500011",email:"arjun.menon@clinic.example",is_active:true},
      {staff_id:2,user_id:102,role_id:2,department_id:2,first_name:"Ananya",last_name:"Nair",dob:"1983-09-03",gender:"F",phone_number:"9876500012",email:"ananya.nair@clinic.example",is_active:true},
      {staff_id:3,user_id:103,role_id:3,department_id:1,first_name:"Meera",last_name:"Joseph",dob:"1994-01-22",gender:"F",phone_number:"9876500013",email:"meera.joseph@clinic.example",is_active:true},
      {staff_id:4,user_id:104,role_id:4,department_id:1,first_name:"Rahul",last_name:"Das",dob:"1990-07-30",gender:"M",phone_number:"9876500014",email:"rahul.das@clinic.example",is_active:true},
      {staff_id:5,user_id:105,role_id:5,department_id:1,first_name:"Fathima",last_name:"Ali",dob:"1992-11-18",gender:"F",phone_number:"9876500015",email:"fathima.ali@clinic.example",is_active:true},
      {staff_id:6,user_id:106,role_id:1,department_id:1,first_name:"Sanjay",last_name:"Varma",dob:"1980-02-09",gender:"M",phone_number:"9876500016",email:"sanjay.varma@clinic.example",is_active:true}
    ],
    doctors: [
      {doc_id:1,staff_id:1,specialization_id:1,consultation_fee:400,qualification:"MBBS, MD",exp_year:8,license_no:"KL-DOC-1001",is_active:true},
      {doc_id:2,staff_id:2,specialization_id:2,consultation_fee:650,qualification:"MBBS, MD, DM",exp_year:11,license_no:"KL-DOC-1002",is_active:true}
    ],
    doctor_sessions: [
      {session_id:1,doctor_id:1,session:"MORNING",start_time:"09:00",end_time:"13:00",is_active:true},
      {session_id:2,doctor_id:1,session:"EVENING",start_time:"16:00",end_time:"19:00",is_active:true},
      {session_id:3,doctor_id:2,session:"MORNING",start_time:"09:30",end_time:"13:30",is_active:true},
      {session_id:4,doctor_id:2,session:"EVENING",start_time:"16:30",end_time:"20:00",is_active:true}
    ],
    patients: [
      {patient_id:1,full_name:"Akhil Kumar",dob:"1997-06-14",gender:"M",phone_number:"9895001001",email:"akhil@example.com",address:"Kochi",blood_group:"O+",emergency_contact:"9895001002",is_active:true,created_at:at("08:40")},
      {patient_id:2,full_name:"Diya Thomas",dob:"2002-02-21",gender:"F",phone_number:"9895001003",email:"diya@example.com",address:"Aluva",blood_group:"B+",emergency_contact:"9895001004",is_active:true,created_at:at("08:45")},
      {patient_id:3,full_name:"Mohammed Sameer",dob:"1988-11-03",gender:"M",phone_number:"9895001005",email:"sameer@example.com",address:"Muvattupuzha",blood_group:"A+",emergency_contact:"9895001006",is_active:true,created_at:at("08:50")},
      {patient_id:4,full_name:"Lakshmi Pillai",dob:"1975-08-27",gender:"F",phone_number:"9895001007",email:"lakshmi@example.com",address:"Thrissur",blood_group:"AB+",emergency_contact:"9895001008",is_active:true,created_at:at("08:55")},
      {patient_id:5,full_name:"Riya Nair",dob:"1995-01-17",gender:"F",phone_number:"9895001009",email:"riya@example.com",address:"Kakkanad",blood_group:"O+",emergency_contact:"9895001010",is_active:true,created_at:at("09:00")},
      {patient_id:6,full_name:"Joseph Mathew",dob:"1969-10-05",gender:"M",phone_number:"9895001011",email:"joseph@example.com",address:"Perumbavoor",blood_group:"B+",emergency_contact:"9895001012",is_active:true,created_at:at("09:05")},
      {patient_id:7,full_name:"Sneha Varghese",dob:"1991-03-28",gender:"F",phone_number:"9895001013",email:"sneha@example.com",address:"Ernakulam",blood_group:"A+",emergency_contact:"9895001014",is_active:true,created_at:at("09:10")},
      {patient_id:8,full_name:"Vivek Raj",dob:"1984-12-11",gender:"M",phone_number:"9895001015",email:"vivek@example.com",address:"Kothamangalam",blood_group:"O-",emergency_contact:"9895001016",is_active:true,created_at:at("09:15")}
    ],
    master_medicines: [
      {medicine_id:1,name:"Paracetamol",generic_name:"Paracetamol",category:"Analgesic",is_active:true},
      {medicine_id:2,name:"Amoxicillin",generic_name:"Amoxicillin",category:"Antibiotic",is_active:true},
      {medicine_id:3,name:"Cetirizine",generic_name:"Cetirizine",category:"Antihistamine",is_active:true},
      {medicine_id:4,name:"Omeprazole",generic_name:"Omeprazole",category:"Gastric",is_active:true},
      {medicine_id:5,name:"Metformin",generic_name:"Metformin",category:"Antidiabetic",is_active:true},
      {medicine_id:6,name:"Atorvastatin",generic_name:"Atorvastatin",category:"Statin",is_active:true}
    ],
    dosages: [
      {dosage_id:1,medicine_id:1,dosage_value:500,unit:"mg",description:"Standard adult dose",is_active:true},
      {dosage_id:2,medicine_id:1,dosage_value:650,unit:"mg",description:"Higher adult dose",is_active:true},
      {dosage_id:3,medicine_id:2,dosage_value:500,unit:"mg",description:"Standard dose",is_active:true},
      {dosage_id:4,medicine_id:3,dosage_value:10,unit:"mg",description:"Standard adult dose",is_active:true},
      {dosage_id:5,medicine_id:4,dosage_value:20,unit:"mg",description:"Standard dose",is_active:true},
      {dosage_id:6,medicine_id:5,dosage_value:500,unit:"mg",description:"Standard dose",is_active:true},
      {dosage_id:7,medicine_id:6,dosage_value:10,unit:"mg",description:"Low dose",is_active:true},
      {dosage_id:8,medicine_id:6,dosage_value:20,unit:"mg",description:"Standard dose",is_active:true}
    ],
    pharmacy_stock: [
      {stock_id:1,medicine_id:1,quantity:110,unit_cost_price:1.2,selling_price:2,reorder_level:20},
      {stock_id:2,medicine_id:2,quantity:75,unit_cost_price:4,selling_price:6,reorder_level:15},
      {stock_id:3,medicine_id:3,quantity:85,unit_cost_price:1.5,selling_price:3,reorder_level:20},
      {stock_id:4,medicine_id:4,quantity:60,unit_cost_price:2,selling_price:4,reorder_level:15},
      {stock_id:5,medicine_id:5,quantity:48,unit_cost_price:1.8,selling_price:3,reorder_level:20},
      {stock_id:6,medicine_id:6,quantity:50,unit_cost_price:5,selling_price:9,reorder_level:15}
    ],
    master_lab_tests: [
      {test_id:1,test_name:"Complete Blood Count",test_type:"Blood",description:"CBC test",test_price:350,min_value:null,max_value:null,is_active:true},
      {test_id:2,test_name:"Blood Sugar",test_type:"Blood",description:"Fasting blood glucose",test_price:150,min_value:70,max_value:100,is_active:true},
      {test_id:3,test_name:"Lipid Profile",test_type:"Blood",description:"Cholesterol and lipid analysis",test_price:500,min_value:null,max_value:null,is_active:true},
      {test_id:4,test_name:"Urine Routine",test_type:"Urine",description:"Routine urine examination",test_price:200,min_value:null,max_value:null,is_active:true},
      {test_id:5,test_name:"Liver Function Test",test_type:"Blood",description:"Liver enzyme panel",test_price:600,min_value:null,max_value:null,is_active:true}
    ],
    appointments: [
      {appointment_id:1,patient_id:1,doctor_id:1,appointment_date:today,appointment_time_slot:"10:00",status:"BOOKED",advance_amount:100,advance_payment_status:"PAID",created_at:at("08:41")},
      {appointment_id:2,patient_id:2,doctor_id:2,appointment_date:today,appointment_time_slot:"11:30",status:"BOOKED",advance_amount:150,advance_payment_status:"PAID",created_at:at("08:46")},
      {appointment_id:3,patient_id:3,doctor_id:1,appointment_date:today,appointment_time_slot:"11:00",status:"BOOKED",advance_amount:0,advance_payment_status:"PENDING",created_at:at("08:51")},
      {appointment_id:4,patient_id:4,doctor_id:1,appointment_date:today,appointment_time_slot:"09:30",status:"COMPLETED",advance_amount:100,advance_payment_status:"PAID",created_at:at("08:30")},
      {appointment_id:5,patient_id:7,doctor_id:1,appointment_date:today,appointment_time_slot:"08:30",status:"NO_SHOW",advance_amount:0,advance_payment_status:"PENDING",created_at:at("07:45")},
      {appointment_id:6,patient_id:8,doctor_id:2,appointment_date:today,appointment_time_slot:"10:30",status:"COMPLETED",advance_amount:150,advance_payment_status:"PAID",created_at:at("08:20")}
    ],
    registration_bills: [
      {bill_id:1,patient_id:1,doctor_id:1,registration_fee:50,consultation_fee:400,total_amount:450,payment_status:"PAID",payment_method:"UPI",bill_date:at("08:42")},
      {bill_id:2,patient_id:2,doctor_id:2,registration_fee:50,consultation_fee:650,total_amount:700,payment_status:"PAID",payment_method:"CARD",bill_date:at("08:47")},
      {bill_id:3,patient_id:3,doctor_id:1,registration_fee:50,consultation_fee:400,total_amount:450,payment_status:"PENDING",payment_method:null,bill_date:at("08:52")},
      {bill_id:4,patient_id:4,doctor_id:1,registration_fee:50,consultation_fee:400,total_amount:450,payment_status:"PAID",payment_method:"CASH",bill_date:at("08:31")},
      {bill_id:5,patient_id:8,doctor_id:2,registration_fee:50,consultation_fee:650,total_amount:700,payment_status:"PAID",payment_method:"UPI",bill_date:at("08:21")}
    ],
    tokens: [
      {token_id:1,patient_id:1,doctor_id:1,bill_id:1,appointment_id:1,token_number:1,token_date:today,session:"MORNING",status:"WAITING",created_at:at("08:43")},
      {token_id:2,patient_id:2,doctor_id:2,bill_id:2,appointment_id:2,token_number:1,token_date:today,session:"MORNING",status:"WAITING",created_at:at("08:48")},
      {token_id:3,patient_id:4,doctor_id:1,bill_id:4,appointment_id:4,token_number:2,token_date:today,session:"MORNING",status:"COMPLETED",created_at:at("08:32")},
      {token_id:4,patient_id:8,doctor_id:2,bill_id:5,appointment_id:6,token_number:2,token_date:today,session:"MORNING",status:"COMPLETED",created_at:at("08:22")}
    ],
    consultations: [
      {consult_id:1,token_id:3,patient_id:4,doctor_id:1,symptoms:"Fever, body ache and mild headache",diagnosis:"Viral fever",remarks:"Hydration and rest advised. Return if symptoms worsen.",created_at:at("09:10")},
      {consult_id:2,token_id:4,patient_id:8,doctor_id:2,symptoms:"Occasional chest discomfort and elevated cholesterol history",diagnosis:"Dyslipidemia — review required",remarks:"Continue lifestyle modification and follow up after lipid profile.",created_at:at("09:20")}
    ],
    prescriptions: [
      {prescription_id:1,consultation_id:1,created_at:at("09:10")},
      {prescription_id:2,consultation_id:2,created_at:at("09:20")}
    ],
    prescription_items: [
      {prescription_item_id:1,prescription_id:1,medicine_id:1,dosage_id:1,frequency:"Twice daily",duration:"5 days",instructions:"After food",dispensed_status:"DISPENSED",is_active:true},
      {prescription_item_id:2,prescription_id:1,medicine_id:3,dosage_id:4,frequency:"Once daily",duration:"5 days",instructions:"At night",dispensed_status:"DISPENSED",is_active:true},
      {prescription_item_id:3,prescription_id:2,medicine_id:6,dosage_id:8,frequency:"Once daily",duration:"30 days",instructions:"After dinner",dispensed_status:"PENDING",is_active:true},
      {prescription_item_id:4,prescription_id:2,medicine_id:4,dosage_id:5,frequency:"Once daily",duration:"14 days",instructions:"Before breakfast",dispensed_status:"PENDING",is_active:true}
    ],
    lab_requests: [
      {lab_request_id:1,consultation_id:1,test_id:2,order_date:at("09:11"),priority:"NORMAL",status:"COMPLETED",is_active:true},
      {lab_request_id:2,consultation_id:2,test_id:3,order_date:at("09:21"),priority:"NORMAL",status:"REQUESTED",is_active:true},
      {lab_request_id:3,consultation_id:2,test_id:1,order_date:at("09:21"),priority:"URGENT",status:"PAID",is_active:true}
    ],
    lab_bills: [
      {lab_bill_id:1,patient_id:4,bill_date:at("09:12"),total_amount:150,payment_status:"PAID",payment_method:"UPI"},
      {lab_bill_id:2,patient_id:8,bill_date:at("09:26"),total_amount:350,payment_status:"PAID",payment_method:"CARD"}
    ],
    lab_bill_items: [
      {lab_bill_item_id:1,lab_bill_id:1,lab_request_id:1,quantity:1,unit_price:150,line_amount:150},
      {lab_bill_item_id:2,lab_bill_id:2,lab_request_id:3,quantity:1,unit_price:350,line_amount:350}
    ],
    lab_results: [
      {result_id:1,lab_request_id:1,technician_id:5,bill_id:1,result_value:"92",unit:"mg/dL",reference_range:"70 – 100",result_date:at("10:15"),report:"Fasting blood sugar is within the stated reference range."}
    ],
    pharmacy_bills: [
      {pharmacy_bill_id:1,patient_id:4,pharmacist_id:4,bill_date:at("09:15"),total_amount:19,payment_status:"PAID",payment_method:"CASH"},
      {pharmacy_bill_id:2,patient_id:8,pharmacist_id:4,bill_date:at("09:25"),total_amount:13*0+270,payment_status:"PENDING",payment_method:null}
    ],
    pharmacy_bill_items: [
      {item_bill_id:1,pharmacy_bill_id:1,medicine_id:1,quantity_dispensed:10,unit_selling_price:2,line_amount:20},
      {item_bill_id:2,pharmacy_bill_id:1,medicine_id:3,quantity_dispensed:5,unit_selling_price:3,line_amount:15},
      {item_bill_id:3,pharmacy_bill_id:2,medicine_id:6,quantity_dispensed:30,unit_selling_price:9,line_amount:270}
    ]
  };
  /* Correct the displayed paid bill total to the sum of its lines. */
  data.pharmacy_bills[0].total_amount = 35;

  var activity = [
    {activity_id:1,type:"Patient Registered",patient_id:1,message:"Akhil Kumar registered",actor:"system",created_at:at("08:40")},
    {activity_id:2,type:"Appointment Booked",patient_id:1,message:"Appointment with Dr. Arjun Menon at 10:00",actor:"system",created_at:at("08:41")},
    {activity_id:3,type:"Registration Bill Created",patient_id:1,message:"Bill #1 · ₹450",actor:"system",created_at:at("08:42")},
    {activity_id:4,type:"Payment Completed",patient_id:1,message:"Bill #1 paid by UPI",actor:"system",created_at:at("08:42")},
    {activity_id:5,type:"Token Generated",patient_id:1,message:"Token 1 · Morning · Dr. Arjun Menon",actor:"system",created_at:at("08:43")},
    {activity_id:6,type:"Patient Registered",patient_id:2,message:"Diya Thomas registered",actor:"system",created_at:at("08:45")},
    {activity_id:7,type:"Appointment Booked",patient_id:2,message:"Appointment with Dr. Ananya Nair at 11:30",actor:"system",created_at:at("08:46")},
    {activity_id:8,type:"Registration Bill Created",patient_id:2,message:"Bill #2 · ₹700",actor:"system",created_at:at("08:47")},
    {activity_id:9,type:"Payment Completed",patient_id:2,message:"Bill #2 paid by CARD",actor:"system",created_at:at("08:47")},
    {activity_id:10,type:"Token Generated",patient_id:2,message:"Token 1 · Morning · Dr. Ananya Nair",actor:"system",created_at:at("08:48")},
    {activity_id:11,type:"Consultation Completed",patient_id:4,message:"Consultation #1 · Dr. Arjun Menon",actor:"system",created_at:at("09:10")},
    {activity_id:12,type:"Prescription Created",patient_id:4,message:"Prescription #1 with 2 medicines",actor:"system",created_at:at("09:10")},
    {activity_id:13,type:"Lab Result Added",patient_id:4,message:"Blood Sugar result recorded",actor:"system",created_at:at("10:15")},
    {activity_id:14,type:"Consultation Completed",patient_id:8,message:"Consultation #2 · Dr. Ananya Nair",actor:"system",created_at:at("09:20")},
    {activity_id:15,type:"Prescription Created",patient_id:8,message:"Prescription #2 with 2 medicines",actor:"system",created_at:at("09:20")}
  ];
  return {data:data, activity:activity};
};
