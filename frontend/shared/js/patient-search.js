/* Shared patient search. Search is scoped by module data supplied by each dashboard. */
(function(){
  "use strict";
  function render(containerId, db, patients, actionFn){
    var el=document.getElementById(containerId); if(!el)return;
    var list=patients.filter(function(p){return p&&p.is_active!==false;});
    function draw(q){
      q=(q||"").trim().toLowerCase();
      var hits=list.filter(function(p){return !q||String(p.patient_id).toLowerCase().indexOf(q)>-1||String(p.full_name).toLowerCase().indexOf(q)>-1||String(p.phone_number).toLowerCase().indexOf(q)>-1;});
      var html=hits.length?'<div class="table-responsive"><table class="table cms-table align-middle"><thead><tr><th>Patient ID</th><th>Name</th><th>Phone</th><th>Action</th></tr></thead><tbody>'+
        hits.map(function(p){return '<tr><td>#'+p.patient_id+'</td><td>'+CMSUI.esc(p.full_name)+'</td><td>'+CMSUI.esc(p.phone_number)+'</td><td>'+(actionFn?actionFn(p,db):"")+'</td></tr>';}).join("")+
        '</tbody></table></div>':CMSUI.empty("search","No patient found","Search by patient ID, name or phone number.");
      document.getElementById(containerId+"-results").innerHTML=html;
    }
    el.innerHTML=CMSX.searchBox(containerId+"-input","Search by patient ID, name or phone number");
    el.insertAdjacentHTML("beforeend",'<div id="'+containerId+'-results"></div>');
    document.getElementById(containerId+"-input").addEventListener("input",function(){draw(this.value);});
    draw("");
  }
  window.CMSPatientSearch={render:render};
})();