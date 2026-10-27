/* Common helpers are intentionally tiny; business rules remain in CMSWorkflow. */
window.CMSX = window.CMSX || {
  q: function (s){ return document.querySelector(s); },
  esc: function(v){ return CMSUI.esc(v); },
  row: function(cells){ return "<tr>"+cells.map(function(x){return "<td>"+x+"</td>";}).join("")+"</tr>"; },
  searchBox: function(id, placeholder){
    return '<div class="input-group mb-3" style="max-width:520px"><span class="input-group-text"><i class="bi bi-search"></i></span><input id="'+id+'" type="search" class="form-control" placeholder="'+(placeholder||"Search...")+'" autocomplete="off"></div>';
  },
  bindTableSearch: function(inputId, tableSelector){
    var input=document.getElementById(inputId); if(!input)return;
    input.addEventListener("input",function(){
      var q=input.value.trim().toLowerCase();
      document.querySelectorAll(tableSelector+" tbody tr").forEach(function(tr){
        tr.style.display=!q||tr.textContent.toLowerCase().indexOf(q)>-1?"":"none";
      });
    });
  },
  table: function(headers, rows, empty){
    return '<div class="table-responsive"><table class="table cms-table align-middle mb-0"><thead><tr>'+
      headers.map(function(h){return "<th>"+h+"</th>";}).join("")+
      "</tr></thead><tbody>"+(rows.length?rows.join(""):'<tr><td colspan="'+headers.length+'" class="text-center text-secondary py-4">'+(empty||"No records found.")+"</td></tr>")+
      "</tbody></table></div>";
  },
  card: function(title,body,actions){ return '<div class="cms-card mb-3"><div class="d-flex align-items-center justify-content-between gap-2 mb-3"><h2 class="cms-card-title mb-0">'+title+'</h2>'+(actions||"")+'</div>'+body+'</div>'; },
  alert: function(msg,type){ CMSUI.alert(msg,type||"success"); },
  selectOptions: function(items,valueField,textFn,selected){ return items.map(function(x){return '<option value="'+x[valueField]+'" '+(String(x[valueField])===String(selected||"")?"selected":"")+'>'+CMSUI.esc(textFn(x))+"</option>";}).join(""); }
};