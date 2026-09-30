/* DEMO CLOCK — the ONLY source of "now" for workflow decisions.
   Never call new Date() in modules for business logic. Use CMSClock. */
(function () {
  var KEY = "cms_demo_clock_v1";
  function pad(n) { return String(n).padStart(2, "0"); }
  function fmtDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function fmtTime(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function toDate(c) { var p = c.date.split("-"), t = c.time.split(":"); return new Date(+p[0], p[1] - 1, +p[2], +t[0], +t[1]); }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} return c; }
  function load() {
    try { var r = JSON.parse(localStorage.getItem(KEY)); if (r && r.date && r.time) return r; } catch (e) {}
    return save({ date: fmtDate(new Date()), time: "09:30" });   // default: real date, morning
  }
  var C = {
    now: function () { var c = load(); return { date: c.date, time: c.time }; },
    today: function () { return load().date; },
    time: function () { return load().time; },
    stamp: function () { var c = load(); return c.date + "T" + c.time + ":00"; },
    set: function (date, time) { return save({ date: date, time: time }); },
    advanceMinutes: function (m) { var d = toDate(load()); d.setMinutes(d.getMinutes() + m); return save({ date: fmtDate(d), time: fmtTime(d) }); },
    addDays: function (n) { var d = toDate(load()); d.setDate(d.getDate() + n); return save({ date: fmtDate(d), time: fmtTime(d) }); },
    minutes: function (t) { var p = t.split(":"); return +p[0] * 60 + +p[1]; },
    addMinutes: function (t, m) { var x = C.minutes(t) + m; return pad(Math.floor(x / 60) % 24) + ":" + pad(x % 60); },
    addDaysTo: function (date, n) { var p = date.split("-"), d = new Date(+p[0], p[1] - 1, +p[2] + n); return fmtDate(d); },
    label: function () { var d = toDate(load()); return d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" }) + " · " + load().time; },
    period: function () { return C.minutes(load().time) < 14 * 60 ? "MORNING" : "EVENING"; },
    reset: function () { try { localStorage.removeItem(KEY); } catch (e) {} }
  };
  window.CMSClock = C;
})();
