// SUPABASE CLIENT INITIALIZATION
const SUPABASE_URL = 'https://upjsmekxacecgnxxnkid.supabase.co';
const SUPABASE_KEY = 'sb_publishable_OQhsZ-6GUBqQq3FqcsQBSg_8FenNMwx';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY ODL"];
const DAYS_CLEAN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday ODL"];
let activeSession = "MORNING";
let isViewingAllSections = false;
let sectionsData = [];
let allSections = [];
let studentSubpanel = "home"; // home | section | profile

// ==========================================
// THEME
// ==========================================
function initTheme() {
  applyTheme(localStorage.getItem("aics_theme") || "dark");
}
function applyTheme(theme) {
  const isLight = theme === "light";
  document.body.classList.toggle("light-mode", isLight);
  document.body.classList.toggle("dark-mode", !isLight);
  localStorage.setItem("aics_theme", theme);
  document.querySelectorAll("#theme-toggle-btn").forEach(b => b.textContent = isLight ? "🌙 Dark Mode" : "☀️ Light Mode");
}
window.toggleTheme = function () {
  applyTheme(localStorage.getItem("aics_theme") === "light" ? "dark" : "light");
};

// ==========================================
// TIME HELPERS
// ==========================================
function pieceToMinutes24(raw) {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  const hour = parseInt(m[1], 10), min = parseInt(m[2], 10);
  const period = m[3] ? m[3].toUpperCase() : null;
  if (period) { let h = hour % 12; if (period === "PM") h += 12; return h * 60 + min; }
  return hour * 60 + min;
}
function minutesToDisplay12(t) {
  const h24 = Math.floor(t / 60) % 24, min = t % 60;
  const period = h24 >= 12 ? "PM" : "AM", h12 = h24 % 12 || 12;
  return `${h12}:${String(min).padStart(2, '0')} ${period}`;
}
function getSlotRangeMinutes(slotStr) {
  if (!slotStr) return null;
  const parts = slotStr.split("-").map(s => s.trim());
  if (parts.length !== 2) return null;
  const startMin = pieceToMinutes24(parts[0]);
  let endMin = pieceToMinutes24(parts[1]);
  if (startMin === null || endMin === null) return null;
  if (endMin <= startMin) endMin += 1440;
  return { startMin, endMin };
}
function getSlotStartMinutes(slotStr) {
  const r = getSlotRangeMinutes(slotStr);
  return r ? r.startMin % 1440 : null;
}
function formatTimeRangeDisplay(slotStr) {
  const r = getSlotRangeMinutes(slotStr);
  if (!r) return slotStr;
  return `${minutesToDisplay12(r.startMin % 1440)} - ${minutesToDisplay12(r.endMin % 1440)}`;
}
function getDefaultSlotsForSession(session = "MORNING") {
  const sess = (session || "MORNING").toUpperCase();
  let raw24;
  if (sess === "AFTERNOON") raw24 = ["09:00 - 10:00","10:00 - 11:00","11:00 - 12:00","12:00 - 13:00","13:00 - 14:00","14:00 - 15:00","15:00 - 16:00","16:00 - 17:00","17:00 - 18:00","18:00 - 19:00","19:00 - 20:00"];
  else if (sess === "EVENING") raw24 = ["15:00 - 16:00","16:00 - 17:00","17:00 - 18:00","18:00 - 19:00","19:00 - 20:00","20:00 - 21:00"];
  else raw24 = ["07:00 - 08:00","08:00 - 09:00","09:00 - 10:00","10:00 - 11:00","11:00 - 12:00","12:00 - 13:00","13:00 - 14:00"];
  return raw24.map(formatTimeRangeDisplay);
}
function getNextTimeSlot(lastSlot, session = "MORNING") {
  if (!lastSlot || !lastSlot.trim()) return getDefaultSlotsForSession(session)[0];
  const r = getSlotRangeMinutes(lastSlot);
  if (!r) return getDefaultSlotsForSession(session)[0];
  let duration = r.endMin - r.startMin; if (duration <= 0) duration = 60;
  return `${minutesToDisplay12(r.endMin % 1440)} - ${minutesToDisplay12((r.endMin + duration) % 1440)}`;
}
function getManilaCellDayIndex() {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", weekday: "short" });
  const map = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4 };
  return map[fmt.format(new Date())] ?? null;
}
function getManilaMinutesNow() {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false });
  const parts = fmt.formatToParts(new Date());
  const get = t => parts.find(p => p.type === t)?.value;
  return parseInt(get("hour"), 10) * 60 + parseInt(get("minute"), 10);
}
function getManilaDateStr() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function displayRoom(room, dayIdx) {
  const isFriday = dayIdx === 4;
  const isEmpty = !room || !room.trim() || room.trim().toUpperCase() === "TBA";
  if (isFriday && isEmpty) return "Online";
  return room && room.trim() ? room : "TBA";
}
function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ==========================================
// NAVIGATION & CONTEXTUAL BOTTOM NAV
// ==========================================
window.setView = function (viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(viewId)?.classList.add("active");
  const homeBtn = document.getElementById("home-nav-btn");
  if (homeBtn) homeBtn.style.display = viewId === "home-view" ? "none" : "inline-flex";
  document.getElementById("hamburger-menu")?.classList.remove("active");

  if (viewId === "teacher-view") checkTeacherAuth();
  else if (viewId === "student-view") checkStudentAuth();
  else if (viewId === "admin-view") checkAdminAuth();

  updateNotificationButtons();
  renderBottomNav(viewId);
};

window.toggleHamburger = function (e) {
  if (e?.stopPropagation) e.stopPropagation();
  document.getElementById("hamburger-menu")?.classList.toggle("active");
};

function renderBottomNav(viewId) {
  const container = document.getElementById("bottom-nav-container");
  if (!container) return;

  const studentActive = viewId === "student-view" && !!localStorage.getItem("aics_student_section") && !isViewingAllSections;
  const teacherActive = viewId === "teacher-view" && !!localStorage.getItem("aics_teacher_name");
  const logoutBtn = document.getElementById("context-logout-btn");
  const logoutDivider = document.getElementById("logout-divider");

  if (studentActive) {
    container.innerHTML = `
      <nav class="bottom-nav" style="display:flex;">
        <button class="bottom-nav-item ${studentSubpanel === 'home' ? 'active' : ''}" onclick="setStudentSubpanel('home')">🏠<br>Home</button>
        <button class="bottom-nav-item ${studentSubpanel === 'section' ? 'active' : ''}" onclick="setStudentSubpanel('section')">🎓<br>Section</button>
        <button class="bottom-nav-item ${studentSubpanel === 'profile' ? 'active' : ''}" onclick="setStudentSubpanel('profile')">👤<br>Profile</button>
      </nav>`;
    if (logoutBtn) { logoutBtn.style.display = "flex"; logoutBtn.onclick = logoutStudent; }
    if (logoutDivider) logoutDivider.style.display = "block";
  } else if (teacherActive) {
    container.innerHTML = `
      <nav class="bottom-nav" style="display:flex;">
        <button class="bottom-nav-item active">👨‍🏫<br>Schedule</button>
      </nav>`;
    if (logoutBtn) { logoutBtn.style.display = "flex"; logoutBtn.onclick = logoutTeacher; }
    if (logoutDivider) logoutDivider.style.display = "block";
  } else {
    container.innerHTML = `
      <nav class="bottom-nav" style="display:flex;">
        <button class="bottom-nav-item ${viewId === 'home-view' ? 'active' : ''}" onclick="setView('home-view')">🏠<br>Home</button>
        <button class="bottom-nav-item ${viewId === 'student-view' ? 'active' : ''}" onclick="openStudentLogin()">🎓<br>Student</button>
        <button class="bottom-nav-item ${viewId === 'teacher-view' ? 'active' : ''}" onclick="openTeacherLogin()">👨‍🏫<br>Teacher</button>
        <button class="bottom-nav-item ${viewId === 'admin-view' ? 'active' : ''}" onclick="openAdminModal()">⚙️<br>Admin</button>
      </nav>`;
    if (logoutBtn) logoutBtn.style.display = "none";
    if (logoutDivider) logoutDivider.style.display = "none";
  }
}

window.setStudentSubpanel = function (panel) {
  studentSubpanel = panel;
  document.querySelectorAll(".student-subpanel").forEach(p => p.style.display = "none");
  document.getElementById(`student-panel-${panel}`).style.display = "block";
  if (panel === "home") renderStudentTodayList();
  if (panel === "profile") renderStudentProfile();
  renderBottomNav("student-view");
};

// ==========================================
// STUDENT PORTAL
// ==========================================
function checkStudentAuth() {
  const savedSection = localStorage.getItem("aics_student_section");
  const gateCard = document.getElementById("student-gate-card");
  const mainContent = document.getElementById("student-main-content");
  const sessionFilterBar = document.getElementById("session-filter-buttons");

  if (isViewingAllSections || savedSection) {
    gateCard.style.display = "none";
    mainContent.style.display = "block";

    if (isViewingAllSections) {
      studentSubpanel = "section";
      document.querySelectorAll(".student-subpanel").forEach(p => p.style.display = "none");
      document.getElementById("student-panel-section").style.display = "block";
      if (sessionFilterBar) sessionFilterBar.style.display = "flex";
      document.getElementById("active-student-section-badge").textContent = "Section: All Sections";
    } else {
      document.querySelectorAll(".student-subpanel").forEach(p => p.style.display = "none");
      document.getElementById(`student-panel-${studentSubpanel}`).style.display = "block";
      if (sessionFilterBar) sessionFilterBar.style.display = "none";
      document.getElementById("active-student-section-badge").textContent = `Section: ${savedSection}`;
      const si = document.getElementById("student-search-input");
      if (si) si.value = savedSection;
      renderAnnouncementBanner("student-announcements-container", "section", savedSection);
      refreshNotificationBadge();
      if (studentSubpanel === "home") renderStudentTodayList();
      if (studentSubpanel === "profile") renderStudentProfile();
    }
    applyFilters();
    renderNextClassCard();
  } else {
    gateCard.style.display = "block";
    mainContent.style.display = "none";
    if (sessionFilterBar) sessionFilterBar.style.display = "none";
  }
  updateNotificationButtons();
  renderBottomNav("student-view");
}

window.openStudentLogin = function () {
  isViewingAllSections = false;
  studentSubpanel = "home";
  window.setView("student-view");
};
window.viewAllSections = function () {
  isViewingAllSections = true;
  window.setView("student-view");
};
window.submitStudentLogin = function () {
  const input = document.getElementById("student-section-input");
  if (!input?.value.trim()) { alert("Please enter a valid section code."); return; }
  localStorage.setItem("aics_student_section", input.value.trim());
  isViewingAllSections = false;
  studentSubpanel = "home";
  checkStudentAuth();
  if (localStorage.getItem("aics_notifications_enabled") === "true") {
    const t = localStorage.getItem("aics_fcm_token");
    if (t) saveDeviceTokenToSupabase(t);
  }
};
window.logoutStudent = function () {
  localStorage.removeItem("aics_student_section");
  document.getElementById("student-search-input") && (document.getElementById("student-search-input").value = "");
  isViewingAllSections = false;
  window.setView("home-view");
};

function renderStudentTodayList() {
  const container = document.getElementById("student-today-list");
  if (!container) return;
  const savedSection = localStorage.getItem("aics_student_section");
  const sec = sectionsData.find(s => s.code?.toLowerCase() === savedSection?.toLowerCase());
  if (!sec || !sec.cells || !sec.slots) { container.innerHTML = `<div class="next-class-empty">No schedule loaded.</div>`; return; }

  const dayIdx = getManilaCellDayIndex();
  if (dayIdx === null) { container.innerHTML = `<div class="next-class-empty">No classes today 🎉</div>`; return; }

  const items = [];
  Object.keys(sec.cells).forEach(key => {
    const [rStr, cStr] = key.split("-");
    if (parseInt(cStr, 10) !== dayIdx) return;
    const cell = sec.cells[key];
    const range = getSlotRangeMinutes(sec.slots[parseInt(rStr, 10)]);
    if (!range || !cell) return;
    items.push({ ...cell, startMin: range.startMin, timeDisplay: formatTimeRangeDisplay(sec.slots[parseInt(rStr, 10)]) });
  });

  if (items.length === 0) { container.innerHTML = `<div class="next-class-empty">No classes today 🎉</div>`; return; }
  items.sort((a, b) => a.startMin - b.startMin);
  const minutesNow = getManilaMinutesNow();

  container.innerHTML = items.map(it => {
    let status = "upcoming", label = "🟢 Upcoming";
    if (minutesNow >= it.startMin && minutesNow < (it.startMin + 60)) { status = "ongoing"; label = "🔵 Ongoing"; }
    else if (minutesNow >= it.startMin + 60) { status = "completed"; label = "⚪ Completed"; }
    return `<div class="today-overview-item">
      <div><strong>${it.subject || it.name}</strong><br><span style="font-size:0.8rem; color:var(--text-muted);">🕒 ${it.timeDisplay} • 📍 ${displayRoom(it.room, dayIdx)} • 👤 ${it.professor || '—'}</span></div>
      <span class="status-pill ${status}">${label}</span>
    </div>`;
  }).join('');
}

function renderStudentProfile() {
  const section = localStorage.getItem("aics_student_section") || "--";
  const alertsOn = localStorage.getItem("aics_notifications_enabled") === "true";
  const sv = document.getElementById("profile-section-value");
  const av = document.getElementById("profile-alerts-value");
  if (sv) sv.textContent = section;
  if (av) av.textContent = alertsOn ? "Enabled" : "Disabled";
}

// ==========================================
// TEACHER PORTAL
// ==========================================
function checkTeacherAuth() {
  populateTeacherDropdown();
  const savedTeacher = localStorage.getItem("aics_teacher_name");
  const gateCard = document.getElementById("teacher-gate-card");
  const mainContent = document.getElementById("teacher-main-content");
  if (savedTeacher && gateCard && mainContent) {
    gateCard.style.display = "none";
    mainContent.style.display = "block";
    document.getElementById("active-teacher-badge").textContent = `Faculty: ${savedTeacher}`;
    renderTeacherSchedule();
    renderTeacherNextClassCard();
    renderAnnouncementBanner("teacher-announcements-container", "teacher", savedTeacher);
    refreshNotificationBadge();
  } else if (gateCard && mainContent) {
    gateCard.style.display = "block";
    mainContent.style.display = "none";
  }
  updateNotificationButtons();
  renderBottomNav("teacher-view");
}
window.openTeacherLogin = function () { window.setView("teacher-view"); };
window.submitTeacherLogin = function () {
  const select = document.getElementById("teacher-name-select-gate");
  if (!select?.value) { alert("Please select your faculty profile."); return; }
  localStorage.setItem("aics_teacher_name", select.value);
  checkTeacherAuth();
  if (localStorage.getItem("aics_notifications_enabled") === "true") {
    const t = localStorage.getItem("aics_fcm_token");
    if (t) saveDeviceTokenToSupabase(t);
  }
};
window.logoutTeacher = function () {
  localStorage.removeItem("aics_teacher_name");
  window.setView("home-view");
};

// ==========================================
// ADMIN PORTAL
// ==========================================
window.openAdminModal = function () { window.setView("admin-view"); };
function checkAdminAuth() {
  const isAdmin = localStorage.getItem("aics_admin_logged_in") === "true";
  const gateCard = document.getElementById("admin-gate-card");
  const mainContent = document.getElementById("admin-main-content");
  if (isAdmin && gateCard && mainContent) {
    gateCard.style.display = "none";
    mainContent.style.display = "block";
    renderAdminSections();
    fetchAndRenderReports();
    renderAdminAnnouncements();
    renderAdminDashboard();
  } else if (gateCard && mainContent) {
    gateCard.style.display = "block";
    mainContent.style.display = "none";
  }
  renderBottomNav("admin-view");
}
window.submitAdminViewLogin = function () {
  const p = document.getElementById("admin-view-pass-input");
  if (!p?.value.trim()) { alert("Please enter the admin passcode."); return; }
  localStorage.setItem("aics_admin_logged_in", "true");
  p.value = "";
  checkAdminAuth();
};
window.logoutAdmin = function () {
  localStorage.removeItem("aics_admin_logged_in");
  window.setView("home-view");
};

// ==========================================
// SCHEDULES DATA
// ==========================================
window.loadSchedules = async function () {
  try {
    const { data, error } = await db.from("schedules").select("*");
    if (error) { console.error(error); return; }
    if (Array.isArray(data)) {
      sectionsData = data; allSections = data;
      renderSections(); populateTeacherDropdown(); renderTeacherSchedule();
      renderAdminSections(); renderNextClassCard(); renderTeacherNextClassCard();
      if (document.getElementById("admin-main-content")?.style.display === "block") renderAdminDashboard();
      if (studentSubpanel === "home") renderStudentTodayList();
    }
  } catch (err) { console.error("Error loading schedules:", err); }
};

function renderAdminSections() {
  const container = document.getElementById("admin-sections-list");
  if (!container) return;
  const searchVal = (document.getElementById("admin-section-search-input")?.value || "").trim().toLowerCase();
  let list = (allSections && allSections.length > 0) ? allSections : sectionsData;
  if (searchVal) list = list.filter(s => (s.code || "").toLowerCase().includes(searchVal) || (s.title || "").toLowerCase().includes(searchVal));

  if (!list || list.length === 0) { container.innerHTML = '<p style="color:var(--text-muted); padding:12px;">No sections found.</p>'; return; }

  container.innerHTML = list.map(sec => `
    <div class="admin-section-card" style="border: 1px solid var(--border-color); background: var(--card-bg); border-radius: var(--radius-lg); padding: 16px; margin-bottom: 12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div><h4 style="margin:0; font-size:1.05rem; font-weight:800;">${sec.code || 'Section'}</h4>
          <span style="font-size:0.825rem; color:var(--text-muted);">${sec.title || ''} • <strong>${sec.session || 'MORNING'}</strong></span></div>
        <div style="display:flex; gap:8px;">
          <button class="btn-secondary" onclick="editSection('${sec.id || sec.code}')" style="padding:6px 14px; font-size:0.85rem;">Edit Schedule</button>
          <button class="btn-danger" onclick="deleteSection('${sec.id || sec.code}')" style="padding:6px 12px; font-size:0.8rem;">Delete</button>
        </div>
      </div>
    </div>`).join('');
}

window.openAddSectionModal = function () { document.getElementById("add-section-modal-overlay").classList.add("open"); };
window.closeAddSectionModal = function () { document.getElementById("add-section-modal-overlay").classList.remove("open"); };

window.addNewSection = async function () {
  const code = document.getElementById("new-section-code")?.value.trim();
  const title = document.getElementById("new-section-title")?.value.trim();
  const session = document.getElementById("new-section-session")?.value || "MORNING";
  if (!code || !title) { alert("Please fill in section code and name."); return; }

  const newSec = { id: crypto.randomUUID(), code, title, session, slots: getDefaultSlotsForSession(session), cells: {} };
  try {
    const { error } = await db.from("schedules").insert([newSec]);
    if (error) { alert("Error adding section: " + error.message); return; }
    await db.from("schedule_history").insert([{ section_code: code, action: "created", cell_key: null, previous_data: null, new_data: newSec, changed_by: "admin" }]);
    document.getElementById("new-section-code").value = "";
    document.getElementById("new-section-title").value = "";
    closeAddSectionModal();
    await window.loadSchedules();
    alert("Section created successfully!");
  } catch (err) { console.error(err); }
};

window.deleteSection = async function (identifier) {
  if (!confirm(`Delete section ${identifier}?`)) return;
  try {
    const { error } = await db.from("schedules").delete().or(`code.eq.${identifier},id.eq.${identifier}`);
    if (error) { alert("Error: " + error.message); return; }
    await db.from("schedule_history").insert([{ section_code: String(identifier), action: "deleted", changed_by: "admin" }]);
    await window.loadSchedules();
  } catch (err) { console.error(err); }
};

// ==========================================
// EDITOR ROW HELPERS
// ==========================================
window.addEditorRow = function () {
  const tbody = document.getElementById("admin-edit-table-body");
  if (!tbody) return;
  const currentSession = document.getElementById("edit-sec-session")?.value || "MORNING";
  const rows = tbody.querySelectorAll("tr");
  let lastSlotVal = "";
  if (rows.length > 0) {
    const li = rows[rows.length - 1].querySelector(".edit-slot-input");
    if (li?.value.trim()) lastSlotVal = li.value.trim();
  }
  const nextSlot = getNextTimeSlot(lastSlotVal, currentSession);
  const tr = document.createElement("tr");
  let html = `<td style="background:var(--card-bg); padding:4px; border:1px solid var(--border-color); width:130px; min-width:130px;">
    <input type="text" class="edit-slot-input" value="${nextSlot}" style="width:100%; border:none; background:transparent; font-weight:800; color:var(--text-main); font-size:0.8rem; text-align:center; outline:none; box-sizing:border-box;"></td>`;
  DAYS.forEach((d, c) => {
    const bg = c === 4 ? 'background:var(--table-odl-bg);' : 'background:var(--card-bg);';
    html += `<td class="edit-day-cell" style="${bg} border:1px solid var(--border-color); padding:4px; vertical-align:top; min-width:140px;">
      <input type="text" class="edit-sub-input" placeholder="Sub Code" style="width:100%; border:none; background:transparent; font-weight:bold; color:var(--text-main); font-size:0.75rem; text-align:center; padding:1px 0; outline:none; box-sizing:border-box;">
      <input type="text" class="edit-prof-input" placeholder="Teacher" style="width:100%; border:none; background:transparent; color:var(--text-muted); font-size:0.7rem; text-align:center; padding:1px 0; outline:none; box-sizing:border-box;">
      <input type="text" class="edit-room-input" placeholder="Room" style="width:100%; border:none; background:transparent; color:var(--primary); font-size:0.68rem; font-weight:600; text-align:center; padding:1px 0; outline:none; box-sizing:border-box;">
    </td>`;
  });
  html += `<td style="background:var(--card-bg); border:1px solid var(--border-color); text-align:center; vertical-align:middle; padding:2px; min-width:44px;">
    <button type="button" onclick="deleteEditorRow(this)" style="background:var(--danger); color:#fff; border:none; width:24px; height:24px; border-radius:4px; font-weight:bold; cursor:pointer;">&times;</button></td>`;
  tr.innerHTML = html;
  tbody.appendChild(tr);
};
window.deleteEditorRow = function (btn) { btn.closest("tr")?.remove(); };

// ==========================================
// SECTION EDIT MODAL
// ==========================================
window.editSection = function (identifier) {
  const sec = sectionsData.find(s => (s.id && String(s.id) === String(identifier)) || (s.code && String(s.code) === String(identifier)));
  if (!sec) { alert("Section not found."); return; }

  let modal = document.getElementById("admin-edit-section-modal");
  if (modal) modal.remove();
  modal = document.createElement("div");
  modal.id = "admin-edit-section-modal";
  modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 10px; box-sizing: border-box;`;

  const editingCells = sec.cells || {};
  const currentSession = sec.session || "MORNING";
  const slots = (sec.slots?.length > 0) ? sec.slots : getDefaultSlotsForSession(currentSession);

  let rowsHtml = '';
  slots.forEach((slot, r) => {
    rowsHtml += `<tr><td style="background:var(--card-bg); padding:4px; border:1px solid var(--border-color); width:130px; min-width:130px;">
      <input type="text" class="edit-slot-input" value="${formatTimeRangeDisplay(slot)}" style="width:100%; border:none; background:transparent; font-weight:800; color:var(--text-main); font-size:0.8rem; text-align:center; outline:none; box-sizing:border-box;"></td>`;
    DAYS.forEach((d, c) => {
      const key = `${r}-${c}`, cell = editingCells[key] || {};
      const bg = c === 4 ? 'background:var(--table-odl-bg);' : 'background:var(--card-bg);';
      rowsHtml += `<td class="edit-day-cell" style="${bg} border:1px solid var(--border-color); padding:4px; vertical-align:top; min-width:140px;">
        <input type="text" class="edit-sub-input" placeholder="Sub Code" value="${cell.subject || cell.name || ''}" style="width:100%; border:none; background:transparent; font-weight:bold; color:var(--text-main); font-size:0.75rem; text-align:center; padding:1px 0; outline:none; box-sizing:border-box;">
        <input type="text" class="edit-prof-input" placeholder="Teacher" value="${cell.professor || ''}" style="width:100%; border:none; background:transparent; color:var(--text-muted); font-size:0.7rem; text-align:center; padding:1px 0; outline:none; box-sizing:border-box;">
        <input type="text" class="edit-room-input" placeholder="Room" value="${cell.room || ''}" style="width:100%; border:none; background:transparent; color:var(--primary); font-size:0.68rem; font-weight:600; text-align:center; padding:1px 0; outline:none; box-sizing:border-box;">
      </td>`;
    });
    rowsHtml += `<td style="background:var(--card-bg); border:1px solid var(--border-color); text-align:center; vertical-align:middle; padding:2px; min-width:44px;">
      <button type="button" onclick="deleteEditorRow(this)" style="background:var(--danger); color:#fff; border:none; width:24px; height:24px; border-radius:4px; font-weight:bold; cursor:pointer;">&times;</button></td></tr>`;
  });

  modal.innerHTML = `
    <div style="background: var(--card-bg); border-radius: var(--radius-xl); max-width: 1020px; width: 100%; max-height: 95vh; overflow-y: auto; color: var(--text-main); border:1px solid var(--border-color); box-shadow: var(--shadow-modal); padding:0;">
      <div style="background:var(--card-bg); padding:20px; text-align:center; border-bottom: 2px solid var(--border-color);">
        <div style="font-size: 1.1rem; font-weight: 800; color: var(--primary);">ASIAN INSTITUTE OF COMPUTER STUDIES</div>
        <div style="font-size: 1.8rem; font-weight: 900; margin-top:4px;">BS CLASS SCHEDULES</div>
      </div>
      <div style="padding:15px 20px; background:var(--input-bg); border-bottom:1px solid var(--border-color); display:flex; gap:15px; flex-wrap:wrap; align-items:center; justify-content:space-between;">
        <div style="display:flex; gap:12px; align-items:center; flex:1;">
          <span style="font-weight:bold; font-size:0.9rem;">Section Code:</span>
          <input type="text" id="edit-sec-code" value="${sec.code || ''}" style="padding:6px 10px; border:1px solid var(--border-color); border-radius:var(--radius-sm); font-weight:bold; background:var(--card-bg); color:var(--text-main); font-size:0.9rem; width:120px;">
          <span style="font-weight:bold; font-size:0.9rem; margin-left:10px;">Session:</span>
          <select id="edit-sec-session" style="padding:6px 10px; border:1px solid var(--border-color); border-radius:var(--radius-sm); font-weight:bold; background:var(--card-bg); color:var(--text-main); font-size:0.9rem;">
            <option value="MORNING" ${currentSession === 'MORNING' ? 'selected' : ''}>MORNING</option>
            <option value="AFTERNOON" ${currentSession === 'AFTERNOON' ? 'selected' : ''}>AFTERNOON</option>
            <option value="EVENING" ${currentSession === 'EVENING' ? 'selected' : ''}>EVENING</option>
          </select>
        </div>
        <div style="display:flex; gap:10px;">
          <button type="button" class="btn-success" onclick="addEditorRow()" style="padding:7px 14px; font-size:0.85rem;">+ Add Row</button>
          <button class="btn-danger" onclick="document.getElementById('admin-edit-section-modal').remove()" style="padding:7px 14px; font-size:0.85rem;">&times; Close</button>
        </div>
      </div>
      <div style="padding:15px; overflow-x:auto; -webkit-overflow-scrolling:touch;">
        <table style="width:100%; min-width:900px; border-collapse:collapse; border:1px solid var(--border-color); background:var(--card-bg);">
          <thead><tr style="background:var(--table-header-bg); color:var(--table-header-text); font-size:0.75rem; text-align:center; font-weight:bold;">
            <th style="padding:10px 4px; border:1px solid var(--border-color); width:130px;">TIME</th>
            <th style="padding:10px 4px; border:1px solid var(--border-color);">MONDAY</th>
            <th style="padding:10px 4px; border:1px solid var(--border-color);">TUESDAY</th>
            <th style="padding:10px 4px; border:1px solid var(--border-color);">WEDNESDAY</th>
            <th style="padding:10px 4px; border:1px solid var(--border-color);">THURSDAY</th>
            <th style="padding:10px 4px; border:1px solid var(--border-color); background:var(--table-odl-header-bg);">FRIDAY ODL</th>
            <th style="padding:10px 4px; border:1px solid var(--border-color); width:44px;">DEL</th>
          </tr></thead>
          <tbody id="admin-edit-table-body">${rowsHtml}</tbody>
        </table>
      </div>
      <div style="background:var(--header-bar-bg); color:#ffffff; padding:15px; text-align:center; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div style="font-weight:800; font-size:1.1rem;">${sec.code || 'SECTION'} - ${currentSession} SESSION</div>
        <div style="display:flex; gap:10px;">
          <button class="btn-secondary" onclick="document.getElementById('admin-edit-section-modal').remove()">Cancel</button>
          <button class="btn-primary" onclick="saveSectionChanges('${sec.id || sec.code}')">Save Changes</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
};

// ---- Conflict detection ----
function addBookingsFromSection(sectionCode, slots, cells, bookings) {
  Object.keys(cells).forEach(key => {
    const cell = cells[key]; if (!cell) return;
    const [rStr, cStr] = key.split("-");
    const dayIdx = parseInt(cStr, 10);
    const range = getSlotRangeMinutes(slots[parseInt(rStr, 10)]);
    if (!range) return;
    bookings.push({ sectionCode, dayIdx, room: (cell.room || "").trim().toLowerCase(), professor: (cell.professor || "").trim().toLowerCase(),
      startMin: range.startMin, endMin: range.endMin, subject: cell.subject || cell.name || "", slotDisplay: formatTimeRangeDisplay(slots[parseInt(rStr, 10)]) });
  });
}
function collectRoomBookings(excludeIdentifier, override) {
  const bookings = [];
  sectionsData.forEach(sec => {
    const editing = (sec.id && String(sec.id) === String(excludeIdentifier)) || (sec.code && String(sec.code) === String(excludeIdentifier));
    if (editing) return;
    addBookingsFromSection(sec.code, sec.slots || [], sec.cells || {}, bookings);
  });
  if (override) addBookingsFromSection(override.code, override.slots, override.cells, bookings);
  return bookings;
}
function timesOverlap(a, b) { return a.startMin < b.endMin && a.endMin > b.startMin; }
function findRoomConflicts(bookings) {
  const conflicts = [];
  for (let i = 0; i < bookings.length; i++) for (let j = i + 1; j < bookings.length; j++) {
    const a = bookings[i], b = bookings[j];
    if (a.sectionCode === b.sectionCode || a.dayIdx !== b.dayIdx || !timesOverlap(a, b)) continue;
    if (a.room && b.room && a.room === b.room && a.room !== "tba" && a.room !== "online")
      conflicts.push({ type: "room", message: `⚠️ Room Conflict Detected\nRoom ${a.room.toUpperCase()} is already occupied by ${a.sectionCode} (${a.subject}) from ${a.slotDisplay}, conflicting with ${b.sectionCode} (${b.subject}) at ${b.slotDisplay} on ${DAYS_CLEAN[a.dayIdx]}.` });
    if (a.professor && b.professor && a.professor === b.professor)
      conflicts.push({ type: "teacher", message: `⚠️ Teacher Conflict Detected\n${a.professor.replace(/\b\w/g, c => c.toUpperCase())} is already assigned to ${a.sectionCode} (${a.subject}) from ${a.slotDisplay}, conflicting with ${b.sectionCode} (${b.subject}) at ${b.slotDisplay} on ${DAYS_CLEAN[a.dayIdx]}.` });
  }
  return conflicts;
}
function findDuplicateSchedules(slots, cells) {
  const seen = {}, dups = [];
  Object.keys(cells).forEach(key => {
    const cell = cells[key]; if (!cell) return;
    const [rStr, cStr] = key.split("-");
    const dayIdx = parseInt(cStr, 10);
    const range = getSlotRangeMinutes(slots[parseInt(rStr, 10)]);
    if (!range) return;
    const fp = `${dayIdx}-${range.startMin}-${range.endMin}-${(cell.subject || "").toLowerCase()}-${(cell.room || "").toLowerCase()}`;
    if (seen[fp]) dups.push(`⚠️ Duplicate Schedule Detected\n${cell.subject || cell.name} appears twice on ${DAYS_CLEAN[dayIdx]} at the same time and room.`);
    seen[fp] = true;
  });
  return dups;
}

// ---- Detailed diff & history/notifications ----
function diffSectionCells(sectionCode, oldSlots, oldCells, newSlots, newCells) {
  const diffs = [];
  const allKeys = new Set([...Object.keys(oldCells || {}), ...Object.keys(newCells || {})]);
  allKeys.forEach(key => {
    const oldCell = (oldCells || {})[key], newCell = (newCells || {})[key];
    const [rStr, cStr] = key.split("-");
    const dayIdx = parseInt(cStr, 10), dayName = DAYS_CLEAN[dayIdx] || `Day ${dayIdx}`;
    const oldTime = oldSlots?.[rStr] ? formatTimeRangeDisplay(oldSlots[rStr]) : "";
    const newTime = newSlots?.[rStr] ? formatTimeRangeDisplay(newSlots[rStr]) : "";

    if (!oldCell && newCell) {
      diffs.push({ key, action: "created", oldData: null, newData: newCell,
        notifStudent: `📅 New Class Added\n${newCell.subject || newCell.name} added on ${dayName} at ${newTime}, Room ${newCell.room || "TBA"}.`,
        notifTeacher: newCell.professor ? { teacher: newCell.professor, message: `👨‍🏫 New Class Assigned\nYou've been assigned ${sectionCode} - ${newCell.subject || newCell.name} on ${dayName} at ${newTime}, Room ${newCell.room || "TBA"}.` } : null });
    } else if (oldCell && !newCell) {
      diffs.push({ key, action: "deleted", oldData: oldCell, newData: null,
        notifStudent: `❌ Class Removed\n${oldCell.subject || oldCell.name} on ${dayName} at ${oldTime} has been removed from your schedule.`,
        notifTeacher: oldCell.professor ? { teacher: oldCell.professor, message: `❌ Class Removed\nYour ${sectionCode} - ${oldCell.subject || oldCell.name} class on ${dayName} at ${oldTime} has been removed.` } : null });
    } else if (oldCell && newCell) {
      const changes = [];
      if ((oldCell.room || "") !== (newCell.room || "")) changes.push(`Room: ${oldCell.room || "TBA"} → ${newCell.room || "TBA"}`);
      if ((oldCell.professor || "") !== (newCell.professor || "")) changes.push(`Teacher: ${oldCell.professor || "—"} → ${newCell.professor || "—"}`);
      if ((oldCell.subject || oldCell.name || "") !== (newCell.subject || newCell.name || "")) changes.push(`Subject: ${oldCell.subject || oldCell.name} → ${newCell.subject || newCell.name}`);
      if (oldTime !== newTime) changes.push(`Time: ${oldTime} → ${newTime}`);
      if (changes.length > 0) {
        const label = newCell.subject || newCell.name || "Class";
        diffs.push({ key, action: "updated", oldData: oldCell, newData: newCell,
          notifStudent: `📅 Schedule Updated\nYour ${label} class has been updated.\n${changes.join('\n')}`,
          notifTeacher: (oldCell.professor || newCell.professor) ? { teacher: newCell.professor || oldCell.professor, message: `👨‍🏫 Teaching Schedule Updated\nYour ${sectionCode} - ${label} class has been updated.\n${changes.join('\n')}` } : null });
      }
    }
  });
  return diffs;
}
async function writeScheduleHistoryAndNotifications(sectionCode, diffs) {
  if (!diffs?.length) return;
  const historyRows = diffs.map(d => ({ section_code: sectionCode, action: d.action, cell_key: d.key, previous_data: d.oldData, new_data: d.newData, changed_by: "admin" }));
  const notifRows = [];
  diffs.forEach(d => {
    notifRows.push({ recipient_type: "section", recipient_value: sectionCode,
      title: d.action === "created" ? "New Class Added" : d.action === "deleted" ? "Class Removed" : "Schedule Updated",
      message: d.notifStudent, notif_type: d.action === "created" ? "schedule_update" : d.action === "deleted" ? "cancellation" : "schedule_update",
      related_id: sectionCode, is_read: false });
    if (d.notifTeacher) notifRows.push({ recipient_type: "teacher", recipient_value: d.notifTeacher.teacher,
      title: d.action === "created" ? "New Class Assigned" : d.action === "deleted" ? "Class Removed" : "Teaching Schedule Updated",
      message: d.notifTeacher.message, notif_type: "schedule_update", related_id: sectionCode, is_read: false });
  });
  try {
    if (historyRows.length) await db.from("schedule_history").insert(historyRows);
    if (notifRows.length) await db.from("notifications").insert(notifRows);
  } catch (err) { console.error(err); }
}

window.saveSectionChanges = async function (identifier) {
  const sec = sectionsData.find(s => (s.id && String(s.id) === String(identifier)) || (s.code && String(s.code) === String(identifier)));
  if (!sec) return;
  const newCode = document.getElementById("edit-sec-code").value.trim();
  const newSession = document.getElementById("edit-sec-session").value;
  const newSlots = [], updatedCells = {};
  document.querySelectorAll("#admin-edit-table-body tr").forEach((row, r) => {
    const si = row.querySelector(".edit-slot-input");
    newSlots.push(si ? si.value.trim() : `Slot ${r + 1}`);
    row.querySelectorAll(".edit-day-cell").forEach((cell, c) => {
      const key = `${r}-${c}`;
      const sub = cell.querySelector(".edit-sub-input")?.value.trim() || "";
      const prof = cell.querySelector(".edit-prof-input")?.value.trim() || "";
      const room = cell.querySelector(".edit-room-input")?.value.trim() || "";
      if (sub || prof || room) updatedCells[key] = { subject: sub, name: sub, professor: prof, room };
    });
  });

  const bookings = collectRoomBookings(identifier, { code: newCode, slots: newSlots, cells: updatedCells });
  const conflicts = findRoomConflicts(bookings);
  const dups = findDuplicateSchedules(newSlots, updatedCells);
  const allIssues = [...conflicts.map(c => c.message), ...dups];
  if (allIssues.length > 0) {
    const preview = allIssues.slice(0, 4).join('\n\n');
    const more = allIssues.length > 4 ? `\n\n...and ${allIssues.length - 4} more issue(s)` : '';
    if (!confirm(`${preview}${more}\n\nSave anyway?`)) return;
  }

  const diffs = diffSectionCells(newCode, sec.slots || [], sec.cells || {}, newSlots, updatedCells);
  const payload = { code: newCode, title: `${newCode} - ${newSession} SESSION`, session: newSession, slots: newSlots, cells: updatedCells };

  try {
    let q = db.from("schedules");
    q = sec.id ? q.update(payload).eq("id", sec.id) : q.update(payload).eq("code", sec.code);
    const { error } = await q;
    if (error) { alert("Failed to save: " + error.message); return; }
    await writeScheduleHistoryAndNotifications(newCode, diffs);
    alert("Schedule saved successfully!");
    document.getElementById("admin-edit-section-modal")?.remove();
    await window.loadSchedules();
  } catch (err) { console.error(err); alert("Error saving schedule changes."); }
};

// ==========================================
// FACULTY DROPDOWN & TEACHER SCHEDULE
// ==========================================
function populateTeacherDropdown() {
  const selects = [document.getElementById("teacher-name-select-gate")].filter(Boolean);
  if (!selects.length) return;
  const current = localStorage.getItem("aics_teacher_name") || "";
  const teachers = new Set();
  sectionsData.forEach(sec => Object.values(sec.cells || {}).forEach(c => { if (c?.professor?.trim()) teachers.add(c.professor.trim()); }));
  const sorted = Array.from(teachers).sort();
  selects.forEach(select => {
    const prev = select.value || current;
    select.innerHTML = '<option value="">-- Select Your Name --</option>';
    sorted.forEach(prof => {
      const opt = document.createElement("option");
      opt.value = prof; opt.textContent = prof;
      if (prof === prev) opt.selected = true;
      select.appendChild(opt);
    });
  });
}

window.renderTeacherSchedule = function () {
  const container = document.getElementById("teacher-schedule-container");
  if (!container) return;
  const selectedTeacher = localStorage.getItem("aics_teacher_name") || "";
  if (!selectedTeacher) { container.innerHTML = '<div style="color: var(--text-muted); text-align:center; padding:30px;">Please select your name.</div>'; return; }

  const timeMap = {};
  let hasClasses = false;
  sectionsData.forEach(sec => {
    if (!sec.cells || !sec.slots) return;
    sec.slots.forEach((slot, rowIdx) => {
      const range = getSlotRangeMinutes(slot);
      if (!range) return;
      DAYS.forEach((d, dayIdx) => {
        const cell = sec.cells[`${rowIdx}-${dayIdx}`];
        if (!cell || cell.professor?.trim().toLowerCase() !== selectedTeacher.toLowerCase()) return;
        const timeKey = `${range.startMin}-${range.endMin}`;
        if (!timeMap[timeKey]) timeMap[timeKey] = { startMin: range.startMin, display: formatTimeRangeDisplay(slot), byDay: {} };
        if (!timeMap[timeKey].byDay[dayIdx]) timeMap[timeKey].byDay[dayIdx] = [];
        timeMap[timeKey].byDay[dayIdx].push({ subject: cell.subject || cell.name || "-", section: sec.code || sec.title || "", room: displayRoom(cell.room, dayIdx) });
        hasClasses = true;
      });
    });
  });

  if (!hasClasses) { container.innerHTML = `<div style="color: var(--text-muted); text-align:center; padding:30px;">No assigned classes found for <strong>${selectedTeacher}</strong>.</div>`; return; }
  const rows = Object.values(timeMap).sort((a, b) => a.startMin - b.startMin);

  let html = `<div class="section-card" style="margin-bottom:20px;"><div class="section-header-bar"><span class="portal-tag">Faculty Schedule: ${selectedTeacher}</span></div>
    <div class="schedule-table-container"><table class="responsive-table"><thead><tr><th>TIME</th>`;
  DAYS.forEach(d => html += `<th>${d}</th>`);
  html += '</tr></thead><tbody>';
  rows.forEach(row => {
    html += `<tr><td class="time-cell">${row.display}</td>`;
    DAYS.forEach((d, dayIdx) => {
      const items = row.byDay[dayIdx];
      if (items?.length) {
        html += '<td class="class-cell">';
        items.forEach(item => html += `<div class="cell-code">${item.subject}</div><div class="cell-name">Sec: ${item.section} (${item.room})</div>`);
        html += '</td>';
      } else html += '<td class="class-cell"><div class="cell-empty">-</div></td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table></div></div>';
  container.innerHTML = html;
};

// ==========================================
// RENDER STUDENT SECTIONS
// ==========================================
function renderSections() {
  const container = document.getElementById("sections-container");
  if (!container) return;
  container.innerHTML = "";
  if (!sectionsData.length) { container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">No schedules loaded.</div>'; return; }

  sectionsData.forEach(sec => {
    const card = document.createElement("div");
    card.className = "section-card";
    card.dataset.session = sec.session || "";
    card.dataset.sectionCode = (sec.code || "").trim().toLowerCase();
    card.dataset.sectionTitle = (sec.title || sec.code || "").trim().toLowerCase();

    const header = document.createElement("div");
    header.className = "section-header-bar";
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "section-toggle-btn";
    toggleBtn.innerHTML = `<span>${sec.title || sec.code}</span>`;
    header.appendChild(toggleBtn);

    const tableDiv = document.createElement("div");
    tableDiv.className = "schedule-table-container";
    let html = '<table class="responsive-table"><thead><tr><th>TIME</th>';
    DAYS.forEach(d => html += `<th>${d}</th>`);
    html += '</tr></thead><tbody>';
    (sec.slots || []).forEach((slot, rowIdx) => {
      html += `<tr><td class="time-cell">${formatTimeRangeDisplay(slot)}</td>`;
      DAYS.forEach((d, colIdx) => {
        const key = `${rowIdx}-${colIdx}`, cell = sec.cells?.[key];
        if (cell && (cell.subject || cell.name)) {
          const subj = cell.subject || cell.name, room = displayRoom(cell.room, colIdx);
          html += `<td class="class-cell" data-key="${key}" data-sub="${subj}" data-prof="${cell.professor || ''}" data-room="${cell.room || ''}">
            <div class="cell-code">${subj}</div><div class="cell-name">${cell.professor || ''} (${room})</div></td>`;
        } else html += `<td class="class-cell" data-key="${key}"><div class="cell-empty">-</div></td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    tableDiv.innerHTML = html;

    toggleBtn.addEventListener("click", () => { tableDiv.classList.toggle("hidden"); toggleBtn.classList.toggle("collapsed"); });
    tableDiv.querySelectorAll(".class-cell").forEach(td => {
      td.addEventListener("click", () => {
        const key = td.getAttribute("data-key");
        if (sec.cells?.[key]) {
          const cell = sec.cells[key];
          const [r, c] = key.split("-"), cIdx = parseInt(c, 10);
          document.getElementById("subject-card-time").textContent = `${DAYS_CLEAN[cIdx] || 'Day'} · ${formatTimeRangeDisplay(sec.slots?.[r] || '')}`;
          document.getElementById("subject-card-code").textContent = cell.subject || cell.name || "-";
          document.getElementById("subject-card-name").textContent = cell.name || cell.subject || "-";
          document.getElementById("subject-card-room").textContent = displayRoom(cell.room, cIdx);
          document.getElementById("subject-card-professor").textContent = cell.professor || "-";
          document.getElementById("subject-details-overlay").classList.add("open");
        }
      });
    });
    card.appendChild(header); card.appendChild(tableDiv);
    container.appendChild(card);
  });
  applyFilters();
}

// ==========================================
// NEXT CLASS CARDS
// ==========================================
function renderNextClassCard() {
  const container = document.getElementById("next-class-container");
  if (!container) return;
  const savedSection = localStorage.getItem("aics_student_section");
  if (!savedSection || isViewingAllSections) { container.innerHTML = ""; return; }
  const sec = sectionsData.find(s => s.code?.toLowerCase() === savedSection.toLowerCase());
  if (!sec?.cells || !sec.slots) { container.innerHTML = ""; return; }
  const dayIdx = getManilaCellDayIndex();
  if (dayIdx === null) { container.innerHTML = `<div class="next-class-empty">No classes scheduled today 🎉</div>`; return; }
  const minutesNow = getManilaMinutesNow();
  let best = null;
  Object.keys(sec.cells).forEach(key => {
    const [dStr, sStr] = key.split("-");
    if (parseInt(dStr, 10) !== dayIdx) return;
    const startMinutes = getSlotStartMinutes(sec.slots[parseInt(sStr, 10)]);
    if (startMinutes === null) return;
    const diff = startMinutes - minutesNow;
    if (diff < 0) return;
    if (!best || diff < best.diff) best = { diff, cell: sec.cells[key], slot: sec.slots[parseInt(sStr, 10)], dayIdx };
  });
  if (!best) { container.innerHTML = `<div class="next-class-empty">No more classes today 🎉</div>`; return; }
  const h = Math.floor(best.diff / 60), m = best.diff % 60;
  container.innerHTML = `<div class="next-class-card"><div class="next-class-eyebrow">Next Class</div>
    <div class="next-class-subject">${best.cell.subject || best.cell.name || "—"}</div>
    <div class="next-class-meta">🕒 ${formatTimeRangeDisplay(best.slot)} &nbsp;•&nbsp; 📍 ${displayRoom(best.cell.room, best.dayIdx)} &nbsp;•&nbsp; 👤 ${best.cell.professor || "—"}</div>
    <div class="next-class-countdown">Starts in <span class="num">${h > 0 ? `${h}h ${m}m` : `${m}m`}</span></div></div>`;
}
function renderTeacherNextClassCard() {
  const container = document.getElementById("teacher-next-class-container");
  if (!container) return;
  const selectedTeacher = localStorage.getItem("aics_teacher_name") || "";
  if (!selectedTeacher) { container.innerHTML = ""; return; }
  const dayIdx = getManilaCellDayIndex();
  if (dayIdx === null) { container.innerHTML = `<div class="next-class-empty">No classes scheduled today 🎉</div>`; return; }
  const minutesNow = getManilaMinutesNow();
  let best = null;
  sectionsData.forEach(sec => {
    if (!sec.cells || !sec.slots) return;
    Object.keys(sec.cells).forEach(key => {
      const [dStr, sStr] = key.split("-");
      if (parseInt(dStr, 10) !== dayIdx) return;
      const cell = sec.cells[key];
      if (cell.professor?.trim().toLowerCase() !== selectedTeacher.toLowerCase()) return;
      const startMinutes = getSlotStartMinutes(sec.slots[parseInt(sStr, 10)]);
      if (startMinutes === null) return;
      const diff = startMinutes - minutesNow;
      if (diff < 0) return;
      if (!best || diff < best.diff) best = { diff, cell, slot: sec.slots[parseInt(sStr, 10)], dayIdx, section: sec.code || sec.title };
    });
  });
  if (!best) { container.innerHTML = `<div class="next-class-empty">No more classes today 🎉</div>`; return; }
  const h = Math.floor(best.diff / 60), m = best.diff % 60;
  container.innerHTML = `<div class="next-class-card"><div class="next-class-eyebrow">Next Class</div>
    <div class="next-class-subject">${best.cell.subject || best.cell.name || "—"}</div>
    <div class="next-class-meta">🕒 ${formatTimeRangeDisplay(best.slot)} &nbsp;•&nbsp; 📍 ${displayRoom(best.cell.room, best.dayIdx)} &nbsp;•&nbsp; 🏷️ Sec: ${best.section}</div>
    <div class="next-class-countdown">Starts in <span class="num">${h > 0 ? `${h}h ${m}m` : `${m}m`}</span></div></div>`;
}

// ==========================================
// SESSION FILTERS & SEARCH
// ==========================================
function setupSessionFilters() {
  const bar = document.getElementById("session-filter-buttons");
  if (!bar) return;
  bar.addEventListener("click", e => {
    const btn = e.target.closest(".session-filter-btn");
    if (!btn) return;
    document.querySelectorAll(".session-filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeSession = btn.getAttribute("data-session") || "MORNING";
    applyFilters();
  });
}
function applyFilters() {
  const savedSection = localStorage.getItem("aics_student_section");
  const input = document.getElementById("student-search-input");
  const val = input ? input.value.trim().toLowerCase() : "";
  document.querySelectorAll("#sections-container .section-card").forEach(card => {
    const cardSession = (card.dataset.session || "").trim().toLowerCase();
    const sessionMatches = !card.dataset.session || cardSession === activeSession.toLowerCase();
    if (!isViewingAllSections && savedSection) {
      const target = savedSection.trim().toLowerCase();
      const sc = (card.dataset.sectionCode || "").trim().toLowerCase();
      const st = (card.dataset.sectionTitle || "").trim().toLowerCase();
      card.style.display = (sc === target || st === target || sc.includes(target) || st.includes(target)) ? "block" : "none";
      card.querySelectorAll(".class-cell").forEach(c => c.classList.remove("highlight", "dimmed"));
      return;
    }
    if (!val) { card.style.display = sessionMatches ? "block" : "none"; card.querySelectorAll(".class-cell").forEach(c => c.classList.remove("highlight", "dimmed")); return; }
    let found = false;
    card.querySelectorAll(".class-cell").forEach(cell => {
      const sub = (cell.dataset.sub || "").toLowerCase(), prof = (cell.dataset.prof || "").toLowerCase(), room = (cell.dataset.room || "").toLowerCase();
      if (sub.includes(val) || prof.includes(val) || room.includes(val)) { cell.classList.add("highlight"); cell.classList.remove("dimmed"); found = true; }
      else { cell.classList.remove("highlight"); cell.classList.add("dimmed"); }
    });
    const sc = (card.dataset.sectionCode || "").toLowerCase(), st = (card.dataset.sectionTitle || "").toLowerCase();
    card.style.display = (sessionMatches && (found || sc.includes(val) || st.includes(val))) ? "block" : "none";
  });
}
function initSearchDropdown() {
  const searchInput = document.getElementById("student-search-input");
  const searchContainer = document.querySelector(".chrome-search-container");
  if (!searchInput || !searchContainer) return;
  let dropdown = searchContainer.querySelector(".chrome-dropdown");
  if (!dropdown) { dropdown = document.createElement("div"); dropdown.className = "chrome-dropdown"; searchContainer.appendChild(dropdown); }
  searchInput.addEventListener("input", e => { buildSuggestions(e.target.value); applyFilters(); });
}
function buildSuggestions(query) {
  const dropdown = document.querySelector(".chrome-dropdown");
  if (!dropdown) return;
  if (!query?.trim()) { dropdown.classList.remove("active"); return; }
  const q = query.trim().toLowerCase(), suggestions = [], added = new Set();
  sectionsData.forEach(sec => {
    if (sec.code?.toLowerCase().includes(q) && !added.has(`sec-${sec.code}`)) { added.add(`sec-${sec.code}`); suggestions.push({ text: sec.code, type: "Section" }); }
    Object.values(sec.cells || {}).forEach(cell => {
      if (cell.professor?.toLowerCase().includes(q)) { const k = `prof-${cell.professor.toLowerCase()}`; if (!added.has(k)) { added.add(k); suggestions.push({ text: cell.professor.trim(), type: "Faculty" }); } }
      if (cell.subject?.toLowerCase().includes(q)) { const k = `sub-${cell.subject.toLowerCase()}`; if (!added.has(k)) { added.add(k); suggestions.push({ text: cell.subject.trim(), type: "Subject" }); } }
    });
  });
  if (!suggestions.length) { dropdown.classList.remove("active"); return; }
  dropdown.innerHTML = suggestions.slice(0, 6).map(s => `<div class="dropdown-item" onclick="selectSuggestion('${s.text.replace(/'/g, "\\'")}')"><span>${s.text}</span><small style="opacity:0.6; margin-left:8px;">${s.type}</small></div>`).join('');
  dropdown.classList.add("active");
}
window.selectSuggestion = function (text) {
  const si = document.getElementById("student-search-input");
  if (si) { si.value = text; applyFilters(); }
  document.querySelector(".chrome-dropdown")?.classList.remove("active");
};

// ==========================================
// NOTIFICATIONS (FCM)
// ==========================================
window.enablePhoneAlerts = async function () { window.toggleNotifications(); };
window.toggleNotifications = async function () {
  if (window.Capacitor?.Plugins?.PushNotifications) {
    try {
      const PN = window.Capacitor.Plugins.PushNotifications;
      let perm = await PN.checkPermissions();
      if (perm.receive === 'prompt') perm = await PN.requestPermissions();
      if (perm.receive !== 'granted') { alert("Push notification permission was denied."); return; }
      await PN.register();
      PN.addListener('registration', async token => { localStorage.setItem("aics_fcm_token", token.value); await saveDeviceTokenToSupabase(token.value); });
      PN.addListener('registrationError', e => console.error(e));
      localStorage.setItem("aics_notifications_enabled", "true");
      alert("True push notifications enabled successfully!");
      updateNotificationButtons();
      renderStudentProfile();
    } catch (err) { console.error(err); fallbackWebNotification(); }
  } else fallbackWebNotification();
};
async function saveDeviceTokenToSupabase(fcmToken) {
  if (!fcmToken) return;
  const activeView = document.querySelector(".view.active")?.id;
  const savedTeacher = localStorage.getItem("aics_teacher_name");
  const savedSection = localStorage.getItem("aics_student_section");
  let payload = null;
  if (activeView === "teacher-view" && savedTeacher) payload = { section_code: null, teacher_name: savedTeacher, token: fcmToken, updated_at: new Date() };
  else if (savedSection) payload = { section_code: savedSection, teacher_name: null, token: fcmToken, updated_at: new Date() };
  else return;
  try { await db.from("device_tokens").upsert([payload], { onConflict: 'token' }); } catch (err) { console.error(err); }
}
function fallbackWebNotification() {
  if (!("Notification" in window)) { alert("Notifications are not supported on this device/browser."); return; }
  if (Notification.permission === "granted") { localStorage.setItem("aics_notifications_enabled", "true"); alert("Phone alerts enabled!"); updateNotificationButtons(); renderStudentProfile(); }
  else if (Notification.permission !== "denied") Notification.requestPermission().then(p => { if (p === "granted") { localStorage.setItem("aics_notifications_enabled", "true"); alert("Phone alerts enabled!"); updateNotificationButtons(); renderStudentProfile(); } });
  else alert("Notifications are blocked in system settings.");
}
function updateNotificationButtons() {
  const isEnabled = localStorage.getItem("aics_notifications_enabled") === "true";
  document.querySelectorAll("#student-notify-btn, #teacher-notify-btn, #profile-notify-btn, .enable-alerts-btn").forEach(btn => {
    if (isEnabled) { btn.textContent = "🔔 Phone Alerts Active"; btn.classList.add("active"); }
    else { btn.textContent = "🔕 Enable Phone Alerts"; btn.classList.remove("active"); }
  });
}

// ==========================================
// ROOM CONFLICT / ISSUE REPORTS
// ==========================================
window.openReportModal = function () {
  const savedSection = localStorage.getItem("aics_student_section");
  const si = document.getElementById("report-section-input");
  if (si) si.value = savedSection || "";
  document.getElementById("report-modal-overlay")?.classList.add("open");
  document.getElementById("hamburger-menu")?.classList.remove("active");
};
window.closeReportModal = function () { document.getElementById("report-modal-overlay")?.classList.remove("open"); };
window.submitRoomReport = async function () {
  const section = document.getElementById("report-section-input")?.value.trim() || "";
  const issueType = document.getElementById("report-issue-type")?.value || "Other";
  const room = document.getElementById("report-room-input")?.value.trim() || "";
  const day = document.getElementById("report-day-select")?.value || "";
  const slot = document.getElementById("report-slot-input")?.value.trim() || "";
  const details = document.getElementById("report-details-input")?.value.trim() || "";
  if (!details) { alert("Please describe the issue."); return; }
  try {
    const { error } = await db.from("room_reports").insert([{ section_code: section || null, room: room || issueType, day: day || null, time_slot: slot || null, details: `[${issueType}] ${details}`, status: "submitted", is_read: false }]);
    if (error) { alert("Failed to submit report: " + error.message); return; }
    alert("Report submitted! Admin has been notified.");
    closeReportModal();
    ["report-room-input","report-day-select","report-slot-input","report-details-input"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  } catch (err) { console.error(err); alert("Error submitting report."); }
};
async function fetchAndRenderReports() {
  const container = document.getElementById("admin-reports-list");
  if (!container) return;
  try {
    const { data, error } = await db.from("room_reports").select("*").order("created_at", { ascending: false });
    if (error) { container.innerHTML = `<p style="color:var(--text-muted); padding:12px;">Could not load reports.</p>`; return; }
    if (!data?.length) { container.innerHTML = `<p style="color:var(--text-muted); padding:12px;">No reports submitted.</p>`; return; }
    container.innerHTML = data.map(r => {
      const status = (r.status === 'pending') ? 'submitted' : (r.status === 'dismissed' ? 'resolved' : r.status);
      const badgeColor = status === 'resolved' ? 'var(--success)' : status === 'under_review' ? '#f59e0b' : 'var(--danger)';
      return `<div class="report-item">
        <div class="report-item-header">
          <span class="report-item-badge" style="background:${badgeColor};">${status.replace('_',' ')}</span>
          <span class="report-item-meta">${r.section_code || 'Unknown'} • ${r.day || '—'} • ${r.time_slot || '—'}</span>
        </div>
        <div class="report-item-details"><strong>Room:</strong> ${r.room}${r.details ? `<br><strong>Details:</strong> ${r.details}` : ''}</div>
        <div class="report-item-actions">
          <select class="report-status-select" onchange="updateReportStatus('${r.id}', this.value)">
            <option value="submitted" ${status==='submitted'?'selected':''}>Submitted</option>
            <option value="under_review" ${status==='under_review'?'selected':''}>Under Review</option>
            <option value="resolved" ${status==='resolved'?'selected':''}>Resolved</option>
          </select>
        </div>
      </div>`;
    }).join('');
  } catch (err) { console.error(err); }
}
window.updateReportStatus = async function (id, newStatus) {
  try { const { error } = await db.from("room_reports").update({ status: newStatus }).eq("id", id); if (error) alert("Failed: " + error.message); }
  catch (err) { console.error(err); }
};

// ==========================================
// ANNOUNCEMENTS
// ==========================================
window.openAnnouncementModal = function () { document.getElementById("announcement-modal-overlay").classList.add("open"); };
window.closeAnnouncementModal = function () { document.getElementById("announcement-modal-overlay").classList.remove("open"); };
window.toggleAnnTargetValue = function () {
  const type = document.getElementById("ann-target-type").value;
  document.getElementById("ann-target-value-wrapper").style.display = (type === "all") ? "none" : "block";
};
window.submitAnnouncement = async function () {
  const title = document.getElementById("ann-title")?.value.trim();
  const content = document.getElementById("ann-content")?.value.trim();
  const type = document.getElementById("ann-type")?.value || "general";
  const priority = document.getElementById("ann-priority")?.value || "normal";
  const targetType = document.getElementById("ann-target-type")?.value || "all";
  const targetValue = document.getElementById("ann-target-value")?.value.trim() || null;
  const startDate = document.getElementById("ann-start-date")?.value || getManilaDateStr();
  const endDate = document.getElementById("ann-end-date")?.value || null;
  if (!title || !content) { alert("Please fill in title and message."); return; }
  if (targetType !== "all" && !targetValue) { alert("Please specify the target."); return; }
  try {
    const { error } = await db.from("announcements").insert([{ title, content, type, priority, target_type: targetType, target_value: targetType === "all" ? null : targetValue, start_date: startDate, end_date: endDate, created_by: "admin" }]);
    if (error) { alert("Failed: " + error.message); return; }
    await db.from("schedule_history").insert([{ section_code: targetType === "section" ? targetValue : "SYSTEM", action: "announcement posted", changed_by: "admin", new_data: { title } }]);
    alert("Announcement posted!");
    document.getElementById("ann-title").value = ""; document.getElementById("ann-content").value = ""; document.getElementById("ann-target-value").value = "";
    closeAnnouncementModal();
    await renderAdminAnnouncements();
  } catch (err) { console.error(err); }
};
async function renderAdminAnnouncements() {
  const container = document.getElementById("admin-announcements-list");
  if (!container) return;
  try {
    const { data, error } = await db.from("announcements").select("*").order("created_at", { ascending: false });
    if (error || !data?.length) { container.innerHTML = `<p style="color:var(--text-muted); padding:12px;">No announcements posted.</p>`; return; }
    container.innerHTML = data.map(a => `<div class="report-item">
      <div class="report-item-header"><span class="report-item-badge" style="background:${a.priority === 'urgent' ? 'var(--danger)' : a.priority === 'important' ? '#f59e0b' : 'var(--secondary)'};">${a.priority}</span>
      <span class="report-item-meta">${a.target_type === 'all' ? 'Everyone' : `${a.target_type}: ${a.target_value}`} • ${a.start_date}${a.end_date ? ' - ' + a.end_date : ''}</span></div>
      <div class="report-item-details"><strong>${a.title}</strong><br>${a.content}</div>
      <div class="report-item-actions"><button class="btn-danger" style="padding:6px 14px; font-size:0.8rem;" onclick="deleteAnnouncement('${a.id}')">Delete</button></div>
    </div>`).join('');
  } catch (err) { console.error(err); }
}
window.deleteAnnouncement = async function (id) {
  if (!confirm("Delete this announcement?")) return;
  try { await db.from("announcements").delete().eq("id", id); await renderAdminAnnouncements(); } catch (err) { console.error(err); }
};
async function renderAnnouncementBanner(containerId, recipientType, recipientValue) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const today = getManilaDateStr();
  try {
    const { data, error } = await db.from("announcements").select("*")
      .or(`target_type.eq.all,and(target_type.eq.${recipientType},target_value.eq.${recipientValue})`)
      .lte("start_date", today).order("created_at", { ascending: false });
    if (error) { container.innerHTML = ""; return; }
    const active = (data || []).filter(a => !a.end_date || a.end_date >= today);
    if (!active.length) { container.innerHTML = ""; return; }
    container.innerHTML = active.map(a => `<div class="announcement-banner ${a.priority}"><div class="announcement-banner-title">📢 ${a.title}</div><div class="announcement-banner-content">${a.content}</div></div>`).join('');
  } catch (err) { container.innerHTML = ""; }
}

// ==========================================
// NOTIFICATION CENTER
// ==========================================
function getCurrentNotifIdentity() {
  const activeView = document.querySelector(".view.active")?.id;
  if (activeView === "teacher-view") { const t = localStorage.getItem("aics_teacher_name"); return t ? { type: "teacher", value: t } : null; }
  const s = localStorage.getItem("aics_student_section");
  return s ? { type: "section", value: s } : null;
}
window.openNotificationCenter = async function () {
  const identity = getCurrentNotifIdentity();
  const overlay = document.getElementById("notif-center-overlay");
  const list = document.getElementById("notif-center-list");
  document.getElementById("hamburger-menu")?.classList.remove("active");
  if (!identity) { list.innerHTML = `<div class="notif-empty">Log in as a student or teacher to view notifications.</div>`; overlay.classList.add("open"); return; }
  try {
    const { data, error } = await db.from("notifications").select("*").eq("recipient_type", identity.type).eq("recipient_value", identity.value).order("created_at", { ascending: false }).limit(50);
    if (error || !data?.length) { list.innerHTML = `<div class="notif-empty">No notifications yet.</div>`; overlay.classList.add("open"); return; }
    list.innerHTML = data.map(n => `<div class="notif-item ${n.is_read ? '' : 'unread'}" id="notif-row-${n.id}">
      <div class="notif-item-header"><span class="notif-item-title">${n.title}</span><span class="notif-item-time">${timeAgo(n.created_at)}</span></div>
      <div class="notif-item-message">${n.message}</div>
      <div class="notif-item-actions">${!n.is_read ? `<button onclick="markNotificationRead('${n.id}')">Mark read</button>` : ''}<button onclick="deleteNotification('${n.id}')">Delete</button></div>
    </div>`).join('');
    overlay.classList.add("open");
  } catch (err) { console.error(err); }
};
window.closeNotificationCenter = function () { document.getElementById("notif-center-overlay")?.classList.remove("open"); };
window.markNotificationRead = async function (id) {
  try { await db.from("notifications").update({ is_read: true }).eq("id", id);
    const row = document.getElementById(`notif-row-${id}`);
    if (row) { row.classList.remove("unread"); row.querySelector(".notif-item-actions button")?.remove(); }
    refreshNotificationBadge();
  } catch (err) { console.error(err); }
};
window.markAllNotificationsRead = async function () {
  const identity = getCurrentNotifIdentity();
  if (!identity) return;
  try { await db.from("notifications").update({ is_read: true }).eq("recipient_type", identity.type).eq("recipient_value", identity.value).eq("is_read", false); openNotificationCenter(); refreshNotificationBadge(); }
  catch (err) { console.error(err); }
};
window.deleteNotification = async function (id) {
  try { await db.from("notifications").delete().eq("id", id); document.getElementById(`notif-row-${id}`)?.remove(); refreshNotificationBadge(); }
  catch (err) { console.error(err); }
};
async function refreshNotificationBadge() {
  const identity = getCurrentNotifIdentity();
  const badge = document.getElementById("notif-count-badge");
  if (!badge) return;
  if (!identity) { badge.style.display = "none"; return; }
  try {
    const { count, error } = await db.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_type", identity.type).eq("recipient_value", identity.value).eq("is_read", false);
    if (error || !count) { badge.style.display = "none"; return; }
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.style.display = "flex";
  } catch (err) { badge.style.display = "none"; }
}

// ==========================================
// PHASE 4: ADMIN DASHBOARD
// ==========================================
async function renderAdminDashboard() {
  const totalSections = sectionsData.length;
  const teacherSet = new Set(), subjectSet = new Set(), roomSet = new Set();
  let totalClasses = 0;
  sectionsData.forEach(sec => Object.values(sec.cells || {}).forEach(c => {
    if (!c) return;
    totalClasses++;
    if (c.professor?.trim()) teacherSet.add(c.professor.trim());
    if (c.subject || c.name) subjectSet.add((c.subject || c.name).trim());
    if (c.room?.trim() && c.room.trim().toUpperCase() !== "TBA") roomSet.add(c.room.trim());
  }));

  const bookings = collectRoomBookings(null, null);
  const conflictCount = findRoomConflicts(bookings).length;

  let pendingReports = 0;
  try {
    const { count } = await db.from("room_reports").select("id", { count: "exact", head: true }).neq("status", "resolved").neq("status", "dismissed");
    pendingReports = count || 0;
  } catch (e) {}

  const cardsContainer = document.getElementById("admin-summary-cards");
  if (cardsContainer) {
    cardsContainer.innerHTML = `
      <div class="summary-card"><span class="num">${totalSections}</span><span class="label">Sections</span></div>
      <div class="summary-card"><span class="num">${teacherSet.size}</span><span class="label">Teachers</span></div>
      <div class="summary-card"><span class="num">${subjectSet.size}</span><span class="label">Subjects</span></div>
      <div class="summary-card"><span class="num">${roomSet.size}</span><span class="label">Rooms</span></div>
      <div class="summary-card"><span class="num">${totalClasses}</span><span class="label">Scheduled Classes</span></div>
      <div class="summary-card ${conflictCount > 0 ? 'danger' : ''}"><span class="num">${conflictCount}</span><span class="label">Active Conflicts</span></div>
      <div class="summary-card ${pendingReports > 0 ? 'danger' : ''}"><span class="num">${pendingReports}</span><span class="label">Pending Reports</span></div>
    `;
  }

  renderTodayOverview();
  renderRecentActivities();
}

function renderTodayOverview() {
  const container = document.getElementById("admin-today-overview");
  if (!container) return;
  const dayIdx = getManilaCellDayIndex();
  if (dayIdx === null) { container.innerHTML = `<p style="color:var(--text-muted); padding:8px;">No classes today (weekend).</p>`; return; }
  const minutesNow = getManilaMinutesNow();
  const items = [];
  sectionsData.forEach(sec => {
    Object.keys(sec.cells || {}).forEach(key => {
      const [rStr, cStr] = key.split("-");
      if (parseInt(cStr, 10) !== dayIdx) return;
      const cell = sec.cells[key];
      const range = getSlotRangeMinutes(sec.slots?.[parseInt(rStr, 10)]);
      if (!cell || !range) return;
      items.push({ ...cell, section: sec.code, startMin: range.startMin, timeDisplay: formatTimeRangeDisplay(sec.slots[parseInt(rStr, 10)]) });
    });
  });
  if (!items.length) { container.innerHTML = `<p style="color:var(--text-muted); padding:8px;">No classes scheduled today.</p>`; return; }
  items.sort((a, b) => a.startMin - b.startMin);
  container.innerHTML = items.map(it => {
    let status = "upcoming", label = "🟢 Upcoming";
    if (minutesNow >= it.startMin && minutesNow < it.startMin + 60) { status = "ongoing"; label = "🔵 Ongoing"; }
    else if (minutesNow >= it.startMin + 60) { status = "completed"; label = "⚪ Completed"; }
    return `<div class="today-overview-item">
      <div><strong>${it.subject || it.name}</strong> — ${it.section}<br><span style="font-size:0.8rem; color:var(--text-muted);">🕒 ${it.timeDisplay} • 📍 ${displayRoom(it.room, dayIdx)} • 👤 ${it.professor || '—'}</span></div>
      <span class="status-pill ${status}">${label}</span>
    </div>`;
  }).join('');
}

async function renderRecentActivities() {
  const container = document.getElementById("admin-recent-activities");
  if (!container) return;
  try {
    const { data, error } = await db.from("schedule_history").select("*").order("created_at", { ascending: false }).limit(10);
    if (error || !data?.length) { container.innerHTML = `<p style="color:var(--text-muted); padding:8px;">No recent activity.</p>`; return; }
    container.innerHTML = data.map(h => `<div class="activity-item"><strong>${h.section_code}</strong> — ${h.action.replace('_',' ')} <span style="float:right;">${timeAgo(h.created_at)}</span></div>`).join('');
  } catch (err) { console.error(err); }
}

// ---- Room Availability Checker ----
window.openRoomAvailabilityModal = function () { document.getElementById("room-avail-modal-overlay").classList.add("open"); };
window.closeRoomAvailabilityModal = function () { document.getElementById("room-avail-modal-overlay").classList.remove("open"); };
window.checkRoomAvailability = function () {
  const dayIdx = parseInt(document.getElementById("avail-day").value, 10);
  const startStr = document.getElementById("avail-start").value; // "HH:MM"
  const endStr = document.getElementById("avail-end").value;
  if (!startStr || !endStr) { alert("Please set both start and end time."); return; }
  const [sh, sm] = startStr.split(":").map(Number);
  const [eh, em] = endStr.split(":").map(Number);
  const startMin = sh * 60 + sm, endMin = eh * 60 + em;
  if (endMin <= startMin) { alert("End time must be after start time."); return; }

  const bookings = collectRoomBookings(null, null).filter(b => b.dayIdx === dayIdx && b.room && b.room !== "tba" && b.room !== "online");
  const allRooms = new Set(bookings.map(b => b.room));
  const results = document.getElementById("room-avail-results");
  let html = "";

  allRooms.forEach(room => {
    const clash = bookings.find(b => b.room === room && startMin < b.endMin && endMin > b.startMin);
    if (clash) {
      html += `<div class="avail-room-row occupied">❌ ${room.toUpperCase()} — ${clash.sectionCode} (${clash.subject}) ${clash.slotDisplay}</div>`;
    } else {
      html += `<div class="avail-room-row available">✅ ${room.toUpperCase()} — Available</div>`;
    }
  });

  results.innerHTML = html || `<p style="color:var(--text-muted);">No rooms found in schedule data.</p>`;
};

// ---- Manage Teachers / Subjects (read-only) ----
window.openManageTeachersModal = function () {
  const teacherMap = {};
  sectionsData.forEach(sec => Object.values(sec.cells || {}).forEach(c => {
    if (c?.professor?.trim()) { const key = c.professor.trim(); teacherMap[key] = (teacherMap[key] || 0) + 1; }
  }));
  const list = document.getElementById("manage-teachers-list");
  const entries = Object.entries(teacherMap).sort((a, b) => a[0].localeCompare(b[0]));
  list.innerHTML = entries.length ? entries.map(([name, count]) => `<div class="today-overview-item"><span>${name}</span><span style="color:var(--text-muted); font-size:0.8rem;">${count} class(es)</span></div>`).join('') : '<p style="color:var(--text-muted);">No teachers found.</p>';
  document.getElementById("manage-teachers-modal-overlay").classList.add("open");
};
window.openManageSubjectsModal = function () {
  const subjectMap = {};
  sectionsData.forEach(sec => Object.values(sec.cells || {}).forEach(c => {
    const s = (c?.subject || c?.name || "").trim();
    if (s) subjectMap[s] = (subjectMap[s] || 0) + 1;
  }));
  const list = document.getElementById("manage-subjects-list");
  const entries = Object.entries(subjectMap).sort((a, b) => a[0].localeCompare(b[0]));
  list.innerHTML = entries.length ? entries.map(([name, count]) => `<div class="today-overview-item"><span>${name}</span><span style="color:var(--text-muted); font-size:0.8rem;">${count} section(s)</span></div>`).join('') : '<p style="color:var(--text-muted);">No subjects found.</p>';
  document.getElementById("manage-subjects-modal-overlay").classList.add("open");
};

// ==========================================
// INIT
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  window.loadSchedules();
  setupSessionFilters();
  initSearchDropdown();
  updateNotificationButtons();
  renderBottomNav("home-view");
  document.getElementById("admin-section-search-input")?.addEventListener("input", renderAdminSections);
  setInterval(() => { renderNextClassCard(); renderTeacherNextClassCard(); }, 30000);
});
