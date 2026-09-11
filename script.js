// SUPABASE CLIENT INITIALIZATION
const SUPABASE_URL = 'https://upjsmekxacecgnxxnkid.supabase.co';
const SUPABASE_KEY = 'sb_publishable_OQhsZ-6GUBqQq3FqcsQBSg_8FenNMwx';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// GLOBAL STATE & CONSTANTS
const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY ODL"];
const DAYS_CLEAN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday ODL"];
let activeSession = "MORNING";
let isViewingAllSections = false;
let sectionsData = [];
let allSections = [];

// ==========================================
// 1. THEME SWITCHER LOGIC (DARK / LIGHT MODE)
// ==========================================
function initTheme() {
  const savedTheme = localStorage.getItem("aics_theme") || "dark";
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  const isLight = theme === "light";

  document.documentElement.setAttribute("data-theme", theme);
  document.body.setAttribute("data-theme", theme);

  document.documentElement.classList.toggle("light-mode", isLight);
  document.body.classList.toggle("light-mode", isLight);
  document.documentElement.classList.toggle("dark-mode", !isLight);
  document.body.classList.toggle("dark-mode", !isLight);

  localStorage.setItem("aics_theme", theme);
  updateThemeUI(isLight);
}

window.toggleTheme = function () {
  const currentTheme = localStorage.getItem("aics_theme") === "light" ? "light" : "dark";
  const newTheme = currentTheme === "light" ? "dark" : "light";
  applyTheme(newTheme);
};

function updateThemeUI(isLight) {
  const buttons = document.querySelectorAll(".theme-toggle-btn, #theme-toggle-btn, [data-theme-toggle]");
  buttons.forEach((btn) => {
    btn.textContent = isLight ? "🌙 Dark Mode" : "☀️ Light Mode";
  });
}

// ==========================================
// 2. AUTOMATIC TIME SLOT CALCULATOR PER SESSION (24-HOUR FORMAT)
// ==========================================
function getDefaultSlotsForSession(session = "MORNING") {
  const sess = (session || "MORNING").toUpperCase();
  if (sess === "AFTERNOON") {
    return [
      "09:00 - 10:00", "10:00 - 11:00", "11:00 - 12:00",
      "12:00 - 13:00", "13:00 - 14:00", "14:00 - 15:00",
      "15:00 - 16:00", "16:00 - 17:00", "17:00 - 18:00",
      "18:00 - 19:00", "19:00 - 20:00"
    ];
  } else if (sess === "EVENING") {
    return [
      "15:00 - 16:00", "16:00 - 17:00", "17:00 - 18:00",
      "18:00 - 19:00", "19:00 - 20:00", "20:00 - 21:00"
    ];
  } else {
    return [
      "07:00 - 08:00", "08:00 - 09:00", "09:00 - 10:00",
      "10:00 - 11:00", "11:00 - 12:00", "12:00 - 13:00",
      "13:00 - 14:00"
    ];
  }
}

function getNextTimeSlot(lastSlot, session = "MORNING") {
  if (!lastSlot || !lastSlot.trim()) {
    const defaults = getDefaultSlotsForSession(session);
    return defaults[0];
  }

  const matches = lastSlot.match(/(\d{1,2}):(\d{2})/g);
  if (!matches || matches.length < 2) {
    const defaults = getDefaultSlotsForSession(session);
    return defaults[0];
  }

  function parseTimeToMinutes(timeStr) {
    const m = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (!m) return 0;
    let h = parseInt(m[1], 10);
    let min = parseInt(m[2], 10);
    return h * 60 + min;
  }

  function formatMinutesToTime(totalMins) {
    let total = (totalMins + 1440) % 1440;
    let h = Math.floor(total / 60);
    let min = total % 60;

    const hStr = String(h).padStart(2, '0');
    const minStr = String(min).padStart(2, '0');
    return `${hStr}:${minStr}`;
  }

  const startMins = parseTimeToMinutes(matches[0]);
  const endMins = parseTimeToMinutes(matches[1]);
  let duration = endMins - startMins;
  if (duration <= 0) duration = 60;

  const nextStartMins = endMins;
  const nextEndMins = nextStartMins + duration;

  const newStart = formatMinutesToTime(nextStartMins);
  const newEnd = formatMinutesToTime(nextEndMins);

  return `${newStart} - ${newEnd}`;
}

// ==========================================
// 3. NAVIGATION & VIEWS
// ==========================================
window.setView = function (viewId) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  const target = document.getElementById(viewId);
  if (target) target.classList.add("active");

  const homeBtn = document.getElementById("home-nav-btn");
  if (homeBtn) homeBtn.style.display = viewId === "home-view" ? "none" : "inline-block";

  const menu = document.getElementById("hamburger-menu");
  if (menu) menu.classList.remove("active");

  if (viewId === "teacher-view") {
    checkTeacherAuth();
  } else if (viewId === "student-view") {
    checkStudentAuth();
  } else if (viewId === "admin-view") {
    checkAdminAuth();
  }
  updateNotificationButtons();
};

window.toggleHamburger = function (event) {
  if (event && typeof event.stopPropagation === "function") {
    event.stopPropagation();
  }
  const menu = document.getElementById("hamburger-menu");
  if (menu) menu.classList.toggle("active");
};

// ==========================================
// 4. STUDENT PORTAL AUTH LOGIC
// ==========================================
function checkStudentAuth() {
  const savedSection = localStorage.getItem("aics_student_section");
  const gateCard = document.getElementById("student-gate-card");
  const mainContent = document.getElementById("student-main-content");
  const sessionFilterBar = document.getElementById("session-filter-buttons");
  const badge = document.getElementById("active-student-section-badge");
  const searchInput = document.getElementById("student-search-input");
  const searchContainer = searchInput
    ? searchInput.closest(".chrome-search-container") || searchInput.closest(".search-box") || searchInput.parentElement
    : null;

  if (isViewingAllSections || savedSection) {
    if (gateCard) gateCard.style.display = "none";
    if (mainContent) mainContent.style.display = "block";

    if (isViewingAllSections) {
      if (sessionFilterBar) sessionFilterBar.style.display = "flex";
      if (searchContainer) searchContainer.style.display = "block";
      if (badge) badge.textContent = "Section: All Sections";
      if (searchInput) searchInput.value = "";
    } else {
      if (sessionFilterBar) sessionFilterBar.style.display = "none";
      if (searchContainer) searchContainer.style.display = "none";
      if (badge) badge.textContent = `Section: ${savedSection}`;
      if (searchInput) searchInput.value = savedSection;
    }
    applyFilters();
  } else {
    if (gateCard) gateCard.style.display = "block";
    if (mainContent) mainContent.style.display = "none";
    if (sessionFilterBar) sessionFilterBar.style.display = "none";
    if (searchContainer) searchContainer.style.display = "none";
  }
  updateNotificationButtons();
}

window.openStudentLogin = function () {
  isViewingAllSections = false;
  window.setView("student-view");
  checkStudentAuth();
};

window.viewAllSections = function () {
  isViewingAllSections = true;
  window.setView("student-view");
  checkStudentAuth();
};

window.submitStudentLogin = function () {
  const input = document.getElementById("student-section-input");
  if (!input || !input.value.trim()) {
    alert("Please enter a valid section code.");
    return;
  }
  const sectionCode = input.value.trim();
  localStorage.setItem("aics_student_section", sectionCode);
  isViewingAllSections = false;
  checkStudentAuth();
  
  // Create initial comparison snapshot on login
  checkForScheduleUpdates(sectionCode, true);

  if (localStorage.getItem("aics_notifications_enabled") === "true") {
    scheduleClassNotifications();

    // Re-sync the existing device token to this (possibly new) section,
    // so switching sections updates which section's alerts this device receives.
    const existingToken = localStorage.getItem("aics_fcm_token");
    if (existingToken) {
      saveDeviceTokenToSupabase(existingToken);
    }
  }
};

window.logoutStudent = function () {
  localStorage.removeItem("aics_student_section");
  const input = document.getElementById("student-section-input");
  if (input) input.value = "";
  const searchInput = document.getElementById("student-search-input");
  if (searchInput) searchInput.value = "";
  isViewingAllSections = false;
  checkStudentAuth();
};

// ==========================================
// 5. TEACHER PORTAL AUTH & SCHEDULING
// ==========================================
function checkTeacherAuth() {
  populateTeacherDropdown();
  const savedTeacher = localStorage.getItem("aics_teacher_name");
  const gateCard = document.getElementById("teacher-gate-card");
  const mainContent = document.getElementById("teacher-main-content");
  const badge = document.getElementById("active-teacher-badge");

  if (savedTeacher && gateCard && mainContent) {
    gateCard.style.display = "none";
    mainContent.style.display = "block";
    if (badge) badge.textContent = `Faculty: ${savedTeacher}`;
    renderTeacherSchedule();
  } else if (gateCard && mainContent) {
    gateCard.style.display = "block";
    mainContent.style.display = "none";
  }
  updateNotificationButtons();
}

window.openTeacherLogin = function () {
  window.setView("teacher-view");
};

window.submitTeacherLogin = function () {
  const select = document.getElementById("teacher-name-select-gate") || document.getElementById("teacher-name-select");
  if (!select || !select.value) {
    alert("Please select your faculty profile.");
    return;
  }
  localStorage.setItem("aics_teacher_name", select.value);
  checkTeacherAuth();
};

window.logoutTeacher = function () {
  localStorage.removeItem("aics_teacher_name");
  const select = document.getElementById("teacher-name-select-gate");
  if (select) select.value = "";
  checkTeacherAuth();
};

// ==========================================
// 6. ADMIN PORTAL & AUTH LOGIC
// ==========================================
window.openAdminModal = function () {
  window.setView("admin-view");
};

window.closeAdminModal = function () {
  const modal = document.getElementById("admin-login-modal");
  if (modal) modal.style.display = "none";
  const passInput = document.getElementById("admin-pass-input");
  if (passInput) passInput.value = "";
};

function checkAdminAuth() {
  const isAdmin = localStorage.getItem("aics_admin_logged_in") === "true";
  const gateCard = document.getElementById("admin-gate-card");
  const mainContent = document.getElementById("admin-main-content");
  if (isAdmin && gateCard && mainContent) {
    gateCard.style.display = "none";
    mainContent.style.display = "block";
    renderAdminSections();
  } else if (gateCard && mainContent) {
    gateCard.style.display = "block";
    mainContent.style.display = "none";
  }
}

window.submitAdminViewLogin = function () {
  const passInput = document.getElementById("admin-view-pass-input");
  if (!passInput || !passInput.value.trim()) {
    alert("Please enter the admin passcode.");
    return;
  }
  localStorage.setItem("aics_admin_logged_in", "true");
  passInput.value = "";
  checkAdminAuth();
};

window.logoutAdmin = function () {
  localStorage.removeItem("aics_admin_logged_in");
  checkAdminAuth();
};

// ==========================================
// 7. SUPABASE DATA MANAGEMENT & API CALLS
// ==========================================
window.loadSchedules = async function () {
  try {
    const { data, error } = await db.from("schedules").select("*");
    if (error) {
      console.error("Error fetching schedules from Supabase:", error);
      return;
    }
    if (Array.isArray(data)) {
      sectionsData = data;
      allSections = data;

      // Check if student section changed/updated on fetch
      const savedSection = localStorage.getItem("aics_student_section");
      if (savedSection) {
        checkForScheduleUpdates(savedSection, false);
      }

      renderSections();
      populateTeacherDropdown();
      renderTeacherSchedule();
      renderAdminSections();
    }
  } catch (err) {
    console.error("Error loading schedules:", err);
  }
};

// Automated section adjustment alert checker
async function checkForScheduleUpdates(sectionCode, isInitialSetup = false) {
  if (!sectionCode) return;

  const targetSec = sectionsData.find(s => 
    (s.code && s.code.toLowerCase() === sectionCode.toLowerCase()) || 
    (s.title && s.title.toLowerCase().includes(sectionCode.toLowerCase()))
  );

  if (!targetSec) return;

  const snapshotKey = `aics_snapshot_${targetSec.code || sectionCode}`;
  const currentSnapshot = JSON.stringify(targetSec.cells || {});
  const savedSnapshot = localStorage.getItem(snapshotKey);

  if (!isInitialSetup && savedSnapshot && savedSnapshot !== currentSnapshot) {
    // Modification detected! Fire notification
    triggerSectionUpdateAlert(targetSec.code);
  }

  // Update stored snapshot
  localStorage.setItem(snapshotKey, currentSnapshot);
}

async function triggerSectionUpdateAlert(sectionCode) {
  const title = `⚠️ Schedule Modified: ${sectionCode}`;
  const body = `Your room or teacher assignment has been updated by administration.`;

  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
    try {
      await window.Capacitor.Plugins.LocalNotifications.schedule({
        notifications: [{
          title: title,
          body: body,
          id: 999888,
          schedule: { at: new Date(new Date().getTime() + 1000) },
          smallIcon: 'res://ic_stat_icon_config_sample',
          allowWhileIdle: true
        }]
      });
    } catch (e) {
      console.error("Error firing section update notification:", e);
    }
  } else if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body: body });
  }
}

function renderAdminSections() {
  const container = document.getElementById("admin-sections-list");
  if (!container) return;

  const listToRender = (allSections && allSections.length > 0) ? allSections : sectionsData;

  if (!listToRender || listToRender.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted); padding:12px;">No sections found in database.</p>';
    return;
  }

  container.innerHTML = listToRender.map(sec => `
    <div class="admin-section-card" style="border: 1px solid var(--border-color); background: var(--card-bg); border-radius: var(--radius-lg); padding: 16px; margin-bottom: 12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <h4 style="margin:0; font-size:1.05rem; font-weight:800; color:var(--text-main);">${sec.code || sec.section_code || 'Section'}</h4>
          <span style="font-size:0.825rem; color:var(--text-muted);">${sec.title || ''} • <strong>${sec.session || 'MORNING'}</strong></span>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn-secondary" onclick="editSection('${sec.id || sec.code}')" style="padding:6px 14px; font-size:0.85rem;">Edit Schedule</button>
          <button class="btn-danger" onclick="deleteSection('${sec.id || sec.code}')" style="padding:6px 12px; font-size:0.8rem;">Delete</button>
        </div>
      </div>
    </div>
  `).join('');
}

window.addNewSection = async function () {
  const code = document.getElementById("new-section-code")?.value.trim();
  const title = document.getElementById("new-section-title")?.value.trim();
  const session = document.getElementById("new-section-session")?.value || "MORNING";

  if (!code || !title) {
    alert("Please fill in both section code and title.");
    return;
  }

  const defaultSlots = getDefaultSlotsForSession(session);

  const newSec = {
    id: crypto.randomUUID(),
    code: code,
    title: title,
    session: session,
    slots: defaultSlots,
    cells: {}
  };

  try {
    const { error } = await db.from("schedules").insert([newSec]);
    if (error) {
      alert("Error adding section: " + error.message);
      return;
    }
    alert("Section created successfully!");
    if (document.getElementById("new-section-code")) document.getElementById("new-section-code").value = "";
    if (document.getElementById("new-section-title")) document.getElementById("new-section-title").value = "";
    await window.loadSchedules();
  } catch (err) {
    console.error("Error creating section:", err);
  }
};

window.deleteSection = async function (identifier) {
  if (!confirm(`Are you sure you want to delete section ${identifier}?`)) return;
  try {
    const { error } = await db.from("schedules").delete().or(`code.eq.${identifier},id.eq.${identifier}`);
    if (error) {
      alert("Error deleting section: " + error.message);
      return;
    }
    alert("Section deleted!");
    await window.loadSchedules();
  } catch (err) {
    console.error("Error deleting section:", err);
  }
};

// ==========================================
// 8. DYNAMIC TABLE ROW ADD/DELETE (MODAL)
// ==========================================
window.addEditorRow = function () {
  const tbody = document.getElementById("admin-edit-table-body");
  if (!tbody) return;

  const sessionSelect = document.getElementById("edit-sec-session");
  const currentSession = sessionSelect ? sessionSelect.value : "MORNING";

  const rows = tbody.querySelectorAll("tr");
  let lastSlotVal = "";
  if (rows.length > 0) {
    const lastRow = rows[rows.length - 1];
    const lastInput = lastRow.querySelector(".edit-slot-input");
    if (lastInput && lastInput.value.trim()) {
      lastSlotVal = lastInput.value.trim();
    }
  }

  const nextSlot = getNextTimeSlot(lastSlotVal, currentSession);

  const tr = document.createElement("tr");
  let cellsHtml = `
    <td style="background:var(--card-bg); padding:4px; border:1px solid var(--border-color);">
      <input type="text" class="edit-slot-input" value="${nextSlot}" 
        style="width:100%; border:none; background:transparent; font-weight:800; color:var(--text-main); font-size:0.8rem; text-align:center; outline:none; box-sizing:border-box;">
    </td>
  `;

  DAYS.forEach((day, c) => {
    const isFriday = (c === 4);
    const bgStyle = isFriday ? 'background:var(--table-odl-bg);' : 'background:var(--card-bg);';
    cellsHtml += `
      <td class="edit-day-cell" style="${bgStyle} border:1px solid var(--border-color); padding:4px; vertical-align:top;">
        <input type="text" class="edit-sub-input" placeholder="Sub Code" value=""
          style="width:100%; border:none; background:transparent; font-weight:bold; color:var(--text-main); font-size:0.75rem; text-align:center; padding:1px 0; outline:none; box-sizing:border-box;">
        <input type="text" class="edit-prof-input" placeholder="Teacher" value=""
          style="width:100%; border:none; background:transparent; color:var(--text-muted); font-size:0.7rem; text-align:center; padding:1px 0; outline:none; box-sizing:border-box;">
        <input type="text" class="edit-room-input" placeholder="Room" value=""
          style="width:100%; border:none; background:transparent; color:var(--primary); font-size:0.68rem; font-weight:600; text-align:center; padding:1px 0; outline:none; box-sizing:border-box;">
      </td>
    `;
  });

  cellsHtml += `
    <td style="background:var(--card-bg); border:1px solid var(--border-color); text-align:center; vertical-align:middle; padding:2px;">
      <button type="button" onclick="deleteEditorRow(this)" style="background:var(--danger); color:#fff; border:none; width:24px; height:24px; border-radius:4px; font-weight:bold; cursor:pointer; line-height:1;" title="Delete Row">&times;</button>
    </td>
  `;

  tr.innerHTML = cellsHtml;
  tbody.appendChild(tr);
};

window.deleteEditorRow = function (btn) {
  const row = btn.closest("tr");
  if (row) row.remove();
};

// ==========================================
// 9. SCHEDULE EDIT MODAL (THEME-ADAPTIVE)
// ==========================================
window.editSection = function (identifier) {
  const sec = sectionsData.find(s => (s.id && String(s.id) === String(identifier)) || (s.code && String(s.code) === String(identifier)));
  if (!sec) {
    alert("Section not found.");
    return;
  }

  let modal = document.getElementById("admin-edit-section-modal");
  if (modal) modal.remove();

  modal = document.createElement("div");
  modal.id = "admin-edit-section-modal";
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(8px); display: flex; align-items: center;
    justify-content: center; z-index: 10000; padding: 10px; box-sizing: border-box;
  `;

  const editingCells = sec.cells || {};
  const currentSession = sec.session || "MORNING";
  const slots = (sec.slots && sec.slots.length > 0) ? sec.slots : getDefaultSlotsForSession(currentSession);

  let rowsHtml = '';
  slots.forEach((slot, r) => {
    rowsHtml += `<tr>
      <td style="background:var(--card-bg); padding:4px; border:1px solid var(--border-color);">
        <input type="text" class="edit-slot-input" value="${slot}" 
          style="width:100%; border:none; background:transparent; font-weight:800; color:var(--text-main); font-size:0.8rem; text-align:center; outline:none; box-sizing:border-box;">
      </td>`;

    DAYS.forEach((day, c) => {
      const key = `${r}-${c}`;
      const cell = editingCells[key] || {};
      const isFriday = (c === 4);
      const bgStyle = isFriday ? 'background:var(--table-odl-bg);' : 'background:var(--card-bg);';

      rowsHtml += `
        <td class="edit-day-cell" style="${bgStyle} border:1px solid var(--border-color); padding:4px; vertical-align:top;">
          <input type="text" class="edit-sub-input" placeholder="Sub Code" value="${cell.subject || cell.name || ''}"
            style="width:100%; border:none; background:transparent; font-weight:bold; color:var(--text-main); font-size:0.75rem; text-align:center; padding:1px 0; outline:none; box-sizing:border-box;">
          <input type="text" class="edit-prof-input" placeholder="Teacher" value="${cell.professor || ''}"
            style="width:100%; border:none; background:transparent; color:var(--text-muted); font-size:0.7rem; text-align:center; padding:1px 0; outline:none; box-sizing:border-box;">
          <input type="text" class="edit-room-input" placeholder="Room" value="${cell.room || ''}"
            style="width:100%; border:none; background:transparent; color:var(--primary); font-size:0.68rem; font-weight:600; text-align:center; padding:1px 0; outline:none; box-sizing:border-box;">
        </td>
      `;
    });

    rowsHtml += `
      <td style="background:var(--card-bg); border:1px solid var(--border-color); text-align:center; vertical-align:middle; padding:2px;">
        <button type="button" onclick="deleteEditorRow(this)" style="background:var(--danger); color:#fff; border:none; width:24px; height:24px; border-radius:4px; font-weight:bold; cursor:pointer; line-height:1;" title="Delete Row">&times;</button>
      </td>
    </tr>`;
  });

  modal.innerHTML = `
    <div style="background: var(--card-bg); border-radius: var(--radius-xl); max-width: 1020px; width: 100%; max-height: 95vh; overflow-y: auto; color: var(--text-main); border:1px solid var(--border-color); box-shadow: var(--shadow-modal); font-family: inherit; box-sizing: border-box; padding:0;">
      
      <!-- HEADER BANNER -->
      <div style="background:var(--card-bg); padding:20px; text-align:center; border-bottom: 2px solid var(--border-color);">
        <div style="font-size: 1.1rem; font-weight: 800; color: var(--primary); letter-spacing: 0.5px;">ASIAN INSTITUTE OF COMPUTER STUDIES</div>
        <div style="font-size: 1.8rem; font-weight: 900; color: var(--text-main); margin-top:4px; letter-spacing: 1px;">BS CLASS SCHEDULES</div>
        <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-muted);">1<sup>ST</sup> SEMESTER ACADEMIC YEAR</div>
      </div>

      <!-- EDITABLE SECTION CONTROLS -->
      <div style="padding:15px 20px; background:var(--input-bg); border-bottom:1px solid var(--border-color); display:flex; gap:15px; flex-wrap:wrap; align-items:center; justify-content:space-between;">
        <div style="display:flex; gap:12px; align-items:center; flex:1;">
          <span style="font-weight:bold; color:var(--text-main); font-size:0.9rem;">Section Code:</span>
          <input type="text" id="edit-sec-code" value="${sec.code || ''}" style="padding:6px 10px; border:1px solid var(--border-color); border-radius:var(--radius-sm); font-weight:bold; color:var(--text-main); background:var(--card-bg); font-size:0.9rem; width:120px;">
          
          <span style="font-weight:bold; color:var(--text-main); font-size:0.9rem; margin-left:10px;">Session:</span>
          <select id="edit-sec-session" style="padding:6px 10px; border:1px solid var(--border-color); border-radius:var(--radius-sm); font-weight:bold; color:var(--text-main); background:var(--card-bg); font-size:0.9rem;">
            <option value="MORNING" ${currentSession === 'MORNING' ? 'selected' : ''}>MORNING (07:00 - 14:00)</option>
            <option value="AFTERNOON" ${currentSession === 'AFTERNOON' ? 'selected' : ''}>AFTERNOON (09:00 - 20:00)</option>
            <option value="EVENING" ${currentSession === 'EVENING' ? 'selected' : ''}>EVENING (15:00 - 21:00)</option>
          </select>
        </div>
        
        <div style="display:flex; gap:10px;">
          <button type="button" class="btn-success" onclick="addEditorRow()" style="padding:7px 14px; font-size:0.85rem;">+ Add Row</button>
          <button class="btn-danger" onclick="document.getElementById('admin-edit-section-modal').remove()" style="padding:7px 14px; font-size:0.85rem;">&times; Close</button>
        </div>
      </div>

      <!-- TIMETABLE GRID -->
      <div style="padding:15px; overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; border:1px solid var(--border-color); background:var(--card-bg);">
          <thead>
            <tr style="background:var(--table-header-bg); color:var(--table-header-text); font-size:0.75rem; text-align:center; font-weight:bold;">
              <th style="padding:10px 4px; border:1px solid var(--border-color); width:130px;">TIME</th>
              <th style="padding:10px 4px; border:1px solid var(--border-color);">MONDAY</th>
              <th style="padding:10px 4px; border:1px solid var(--border-color);">TUESDAY</th>
              <th style="padding:10px 4px; border:1px solid var(--border-color);">WEDNESDAY</th>
              <th style="padding:10px 4px; border:1px solid var(--border-color);">THURSDAY</th>
              <th style="padding:10px 4px; border:1px solid var(--border-color); background:var(--table-odl-header-bg);">FRIDAY ODL<br><span style="font-size:0.65rem; font-weight:normal;">(Sync/Async)</span></th>
              <th style="padding:10px 4px; border:1px solid var(--border-color); width:35px;">DEL</th>
            </tr>
          </thead>
          <tbody id="admin-edit-table-body">
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <!-- FOOTER ACTIONS -->
      <div style="background:var(--header-bar-bg); color:#ffffff; padding:15px; text-align:center; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div style="font-weight:800; font-size:1.1rem; letter-spacing:0.5px;">
          ${sec.code || 'SECTION'} - ${currentSession} SESSION
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn-secondary" onclick="document.getElementById('admin-edit-section-modal').remove()">Cancel</button>
          <button class="btn-primary" onclick="saveSectionChanges('${sec.id || sec.code}')">Save Changes</button>
        </div>
      </div>

    </div>
  `;

  document.body.appendChild(modal);
};

window.saveSectionChanges = async function (identifier) {
  const sec = sectionsData.find(s => (s.id && String(s.id) === String(identifier)) || (s.code && String(s.code) === String(identifier)));
  if (!sec) return;

  const newCode = document.getElementById("edit-sec-code").value.trim();
  const newSession = document.getElementById("edit-sec-session").value;

  const newSlots = [];
  const updatedCells = {};

  const rows = document.querySelectorAll("#admin-edit-table-body tr");
  rows.forEach((row, r) => {
    const slotInput = row.querySelector(".edit-slot-input");
    const slotVal = slotInput ? slotInput.value.trim() : `Slot ${r + 1}`;
    newSlots.push(slotVal);

    const cells = row.querySelectorAll(".edit-day-cell");
    cells.forEach((cell, c) => {
      const key = `${r}-${c}`;
      const sub = cell.querySelector(".edit-sub-input")?.value.trim() || "";
      const prof = cell.querySelector(".edit-prof-input")?.value.trim() || "";
      const room = cell.querySelector(".edit-room-input")?.value.trim() || "";

      if (sub || prof || room) {
        updatedCells[key] = {
          subject: sub,
          name: sub,
          professor: prof,
          room: room
        };
      }
    });
  });

  const payload = {
    code: newCode,
    title: `${newCode} - ${newSession} SESSION`,
    session: newSession,
    slots: newSlots,
    cells: updatedCells
  };

  try {
    let query = db.from("schedules");
    if (sec.id) {
      query = query.update(payload).eq("id", sec.id);
    } else {
      query = query.update(payload).eq("code", sec.code);
    }

    const { error } = await query;
    if (error) {
      alert("Failed to save changes: " + error.message);
      return;
    }

    alert("Schedule saved successfully!");
    document.getElementById("admin-edit-section-modal")?.remove();
    await window.loadSchedules();
  } catch (err) {
    console.error("Error saving schedule changes:", err);
    alert("Error saving schedule changes.");
  }
};

// ==========================================
// 10. FACULTY DROPDOWN & SCHEDULE RENDERING
// ==========================================
function populateTeacherDropdown() {
  const selects = [
    document.getElementById("teacher-name-select-gate"),
    document.getElementById("teacher-name-select")
  ].filter(Boolean);

  if (selects.length === 0 || !sectionsData) return;
  const currentSelection = localStorage.getItem("aics_teacher_name") || "";
  const teachers = new Set();

  sectionsData.forEach((sec) => {
    if (sec.cells) {
      Object.values(sec.cells).forEach((cell) => {
        if (cell && cell.professor && cell.professor.trim() !== "") {
          teachers.add(cell.professor.trim());
        }
      });
    }
  });

  const sortedTeachers = Array.from(teachers).sort();
  selects.forEach((select) => {
    const prevValue = select.value || currentSelection;
    select.innerHTML = '<option value="">-- Select Your Name --</option>';
    sortedTeachers.forEach((prof) => {
      const opt = document.createElement("option");
      opt.value = prof;
      opt.textContent = prof;
      if (prof === prevValue) opt.selected = true;
      select.appendChild(opt);
    });
  });
}

window.renderTeacherSchedule = function () {
  const container = document.getElementById("teacher-schedule-container");
  if (!container) return;

  const selectedTeacher = localStorage.getItem("aics_teacher_name") || "";
  if (!selectedTeacher) {
    container.innerHTML = '<div style="color: var(--text-muted); text-align:center; padding:30px;">Please select your name to view your assigned classes.</div>';
    return;
  }

  let masterSlots = [];
  sectionsData.forEach((sec) => {
    (sec.slots || []).forEach((slot) => {
      if (!masterSlots.includes(slot)) masterSlots.push(slot);
    });
  });

  if (masterSlots.length === 0) {
    masterSlots = getDefaultSlotsForSession("MORNING");
  }

  let gridMap = {};
  let hasClasses = false;

  sectionsData.forEach((sec) => {
    if (!sec.cells || !sec.slots) return;
    sec.slots.forEach((slot, rowIdx) => {
      DAYS.forEach((day, dayIdx) => {
        const cellKey = `${rowIdx}-${dayIdx}`;
        const cell = sec.cells[cellKey];
        if (cell && cell.professor && cell.professor.trim().toLowerCase() === selectedTeacher.toLowerCase()) {
          const mapKey = `${slot}_${dayIdx}`;
          if (!gridMap[mapKey]) gridMap[mapKey] = [];
          gridMap[mapKey].push({
            subject: cell.subject || cell.name || "-",
            section: sec.code || sec.title || "",
            room: cell.room || "TBA"
          });
          hasClasses = true;
        }
      });
    });
  });

  if (!hasClasses) {
    container.innerHTML = `<div style="color: var(--text-muted); text-align:center; padding:30px;">No assigned classes found for <strong>${selectedTeacher}</strong>.</div>`;
    return;
  }

  let html = `
  <div class="section-card" style="margin-bottom:20px;">
    <div class="section-header-bar">
      <span class="portal-tag">Faculty Schedule: ${selectedTeacher}</span>
    </div>
    <div class="schedule-table-container">
      <table class="responsive-table">
        <thead>
          <tr>
            <th>TIME</th>`;
  DAYS.forEach((d) => (html += `<th>${d}</th>`));
  html += '</tr></thead><tbody>';

  masterSlots.forEach((slot) => {
    html += `<tr><td class="time-cell">${slot}</td>`;
    DAYS.forEach((d, dayIdx) => {
      const mapKey = `${slot}_${dayIdx}`;
      const items = gridMap[mapKey];
      if (items && items.length > 0) {
        html += '<td class="class-cell">';
        items.forEach((item) => {
          html += `<div class="cell-code">${item.subject}</div><div class="cell-name">Sec: ${item.section} (${item.room})</div>`;
        });
        html += '</td>';
      } else {
        html += '<td class="class-cell"><div class="cell-empty">-</div></td>';
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table></div></div>';
  container.innerHTML = html;
};

// ==========================================
// 11. RENDER STUDENT SCHEDULE SECTIONS
// ==========================================
function renderSections() {
  const studentContainer = document.getElementById("sections-container");
  if (!studentContainer) return;
  studentContainer.innerHTML = "";

  if (!sectionsData.length) {
    studentContainer.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">No schedules loaded.</div>';
    return;
  }

  sectionsData.forEach((sec) => {
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
    DAYS.forEach((d) => (html += `<th>${d}</th>`));
    html += '</tr></thead><tbody>';

    (sec.slots || []).forEach((slot, rowIdx) => {
      html += `<tr><td class="time-cell">${slot}</td>`;
      DAYS.forEach((d, colIdx) => {
        const key = `${rowIdx}-${colIdx}`;
        const cell = sec.cells ? sec.cells[key] : null;
        if (cell && (cell.subject || cell.name)) {
          const displaySubject = cell.subject || cell.name;
          html += `<td class="class-cell" data-key="${key}" data-sub="${displaySubject}" data-prof="${cell.professor || ''}" data-room="${cell.room || ''}">
            <div class="cell-code">${displaySubject}</div>
            <div class="cell-name">${cell.professor || ''} (${cell.room || 'TBA'})</div>
          </td>`;
        } else {
          html += `<td class="class-cell" data-key="${key}"><div class="cell-empty">-</div></td>`;
        }
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    tableDiv.innerHTML = html;

    toggleBtn.addEventListener("click", () => {
      tableDiv.classList.toggle("hidden");
      toggleBtn.classList.toggle("collapsed");
    });

    tableDiv.querySelectorAll(".class-cell").forEach((td) => {
      td.addEventListener("click", () => {
        const key = td.getAttribute("data-key");
        if (sec.cells && sec.cells[key]) {
          const cell = sec.cells[key];
          const [r, c] = key.split("-");
          document.getElementById("subject-card-time").textContent = `${DAYS_CLEAN[c] || 'Day'} · ${(sec.slots && sec.slots[r]) || ''}`;
          document.getElementById("subject-card-code").textContent = cell.subject || cell.name || "-";
          document.getElementById("subject-card-name").textContent = cell.name || cell.subject || "-";
          document.getElementById("subject-card-room").textContent = cell.room || "-";
          document.getElementById("subject-card-professor").textContent = cell.professor || "-";
          document.getElementById("subject-details-overlay").classList.add("open");
        }
      });
    });

    card.appendChild(header);
    card.appendChild(tableDiv);
    studentContainer.appendChild(card);
  });

  applyFilters();
}

// ==========================================
// 12. SESSION FILTERS & AUTOSEARCH LOGIC
// ==========================================
function setupSessionFilters() {
  const filterContainer = document.getElementById("session-filter-buttons");
  if (!filterContainer) return;

  filterContainer.addEventListener("click", (e) => {
    const btn = e.target.closest(".session-filter-btn");
    if (!btn) return;

    document.querySelectorAll(".session-filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    activeSession = btn.getAttribute("data-session") || "MORNING";
    applyFilters();
  });
}

function applyFilters() {
  const savedSection = localStorage.getItem("aics_student_section");
  const input = document.getElementById("student-search-input") || document.querySelector(".chrome-search-input");
  const val = input ? input.value.trim().toLowerCase() : "";

  document.querySelectorAll("#sections-container .section-card").forEach((card) => {
    const cardSession = (card.dataset.session || "").trim().toLowerCase();
    const currentActiveSession = (activeSession || "MORNING").trim().toLowerCase();
    const sessionMatches = !card.dataset.session || cardSession === currentActiveSession;

    if (!isViewingAllSections && savedSection) {
      const targetSection = savedSection.trim().toLowerCase();
      const secCode = (card.dataset.sectionCode || "").trim().toLowerCase();
      const secTitle = (card.dataset.sectionTitle || "").trim().toLowerCase();
      const isMatch = secCode === targetSection || secTitle === targetSection || secCode.includes(targetSection) || secTitle.includes(targetSection);

      card.style.display = isMatch ? "block" : "none";
      card.querySelectorAll(".class-cell").forEach((c) => c.classList.remove("highlight", "dimmed"));
      return;
    }

    if (!val) {
      card.style.display = sessionMatches ? "block" : "none";
      card.querySelectorAll(".class-cell").forEach((c) => c.classList.remove("highlight", "dimmed"));
      return;
    }

    let found = false;
    card.querySelectorAll(".class-cell").forEach((cell) => {
      const sub = (cell.dataset.sub || "").toLowerCase();
      const prof = (cell.dataset.prof || "").toLowerCase();
      const room = (cell.dataset.room || "").toLowerCase();
      if (sub.includes(val) || prof.includes(val) || room.includes(val)) {
        cell.classList.add("highlight");
        cell.classList.remove("dimmed");
        found = true;
      } else {
        cell.classList.remove("highlight");
        cell.classList.add("dimmed");
      }
    });

    const secCode = (card.dataset.sectionCode || "").toLowerCase();
    const secTitle = (card.dataset.sectionTitle || "").toLowerCase();
    const searchMatches = found || secCode.includes(val) || secTitle.includes(val);

    card.style.display = sessionMatches && searchMatches ? "block" : "none";
  });
}

function initSearchDropdown() {
  const searchInput = document.getElementById("student-search-input") || document.querySelector(".chrome-search-input");
  const searchContainer = document.querySelector(".chrome-search-container") || document.querySelector(".search-box");
  if (!searchInput || !searchContainer) return;

  let dropdown = searchContainer.querySelector(".chrome-dropdown");
  if (!dropdown) {
    dropdown = document.createElement("div");
    dropdown.className = "chrome-dropdown";
    searchContainer.appendChild(dropdown);
  }

  searchInput.addEventListener("input", (e) => {
    buildSuggestions(e.target.value);
    applyFilters();
  });
}

function buildSuggestions(query) {
  const dropdown = document.querySelector(".chrome-dropdown");
  if (!dropdown) return;

  if (!query || !query.trim()) {
    dropdown.classList.remove("active");
    return;
  }

  const cleanQuery = query.trim().toLowerCase();
  const suggestions = [];
  const addedKeys = new Set();

  sectionsData.forEach((sec) => {
    if (sec.code && sec.code.toLowerCase().includes(cleanQuery)) {
      const key = `sec-${sec.code}`;
      if (!addedKeys.has(key)) {
        addedKeys.add(key);
        suggestions.push({ text: sec.code, type: "Section" });
      }
    }
    if (sec.cells) {
      Object.values(sec.cells).forEach((cell) => {
        if (cell.professor && cell.professor.toLowerCase().includes(cleanQuery)) {
          const profName = cell.professor.trim();
          const key = `prof-${profName.toLowerCase()}`;
          if (!addedKeys.has(key)) {
            addedKeys.add(key);
            suggestions.push({ text: profName, type: "Faculty" });
          }
        }
        if (cell.subject && cell.subject.toLowerCase().includes(cleanQuery)) {
          const subName = cell.subject.trim();
          const key = `sub-${subName.toLowerCase()}`;
          if (!addedKeys.has(key)) {
            addedKeys.add(key);
            suggestions.push({ text: subName, type: "Subject" });
          }
        }
      });
    }
  });

  if (suggestions.length === 0) {
    dropdown.classList.remove("active");
    return;
  }

  dropdown.innerHTML = suggestions.slice(0, 6).map(s => `
    <div class="dropdown-item" onclick="selectSuggestion('${s.text.replace(/'/g, "\\'")}')">
      <span>${s.text}</span>
      <small style="opacity:0.6; margin-left:8px;">${s.type}</small>
    </div>
  `).join('');

  dropdown.classList.add("active");
}

window.selectSuggestion = function (text) {
  const searchInput = document.getElementById("student-search-input") || document.querySelector(".chrome-search-input");
  if (searchInput) {
    searchInput.value = text;
    applyFilters();
  }
  const dropdown = document.querySelector(".chrome-dropdown");
  if (dropdown) dropdown.classList.remove("active");
};

// ==========================================
// 13. NOTIFICATION & SYSTEM ALERT HANDLERS (FCM INTEGRATION)
// ==========================================
window.enablePhoneAlerts = async function () {
  window.toggleNotifications();
};

window.toggleNotifications = async function () {
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications) {
    try {
      const PushNotifications = window.Capacitor.Plugins.PushNotifications;
      
      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        alert("Push notification permission was denied.");
        return;
      }

      await PushNotifications.register();

      PushNotifications.addListener('registration', async (token) => {
        console.log('FCM Token successfully received:', token.value);
        localStorage.setItem("aics_fcm_token", token.value);
        await saveDeviceTokenToSupabase(token.value);
      });

      PushNotifications.addListener('registrationError', (error) => {
        console.error('Error during push registration:', JSON.stringify(error));
      });

      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('Push notification received:', JSON.stringify(notification));
      });

      PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        console.log('Push notification action performed:', JSON.stringify(notification));
      });

      localStorage.setItem("aics_notifications_enabled", "true");
      alert("True push notifications enabled successfully!");
      updateNotificationButtons();

    } catch (err) {
      console.error("Capacitor PushNotification error:", err);
      fallbackWebNotification();
    }
  } else {
    fallbackWebNotification();
  }
};

async function saveDeviceTokenToSupabase(fcmToken) {
  const savedSection = localStorage.getItem("aics_student_section");
  if (!savedSection || !fcmToken) return;

  try {
    const { error } = await db.from("device_tokens").upsert([
      { 
        section_code: savedSection, 
        token: fcmToken,
        updated_at: new Date()
      }
    ], { onConflict: 'token' });

    if (error) {
      console.error("Error saving FCM token to Supabase:", error.message);
    } else {
      console.log("FCM Token successfully synced to Supabase database.");
    }
  } catch (err) {
    console.error("Exception saving FCM token:", err);
  }
}

async function scheduleClassNotifications() {
  console.log("FCM cloud notifications active.");
}

function fallbackWebNotification() {
  if (!("Notification" in window)) {
    alert("Notifications are not supported on this device/browser.");
    return;
  }
  if (Notification.permission === "granted") {
    localStorage.setItem("aics_notifications_enabled", "true");
    alert("Phone alerts enabled!");
    updateNotificationButtons();
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((perm) => {
      if (perm === "granted") {
        localStorage.setItem("aics_notifications_enabled", "true");
        alert("Phone alerts enabled!");
        updateNotificationButtons();
      }
    });
  } else {
    alert("Notifications are blocked in system settings.");
  }
}

function updateNotificationButtons() {
  const isEnabled = localStorage.getItem("aics_notifications_enabled") === "true";
  document.querySelectorAll("#student-notify-btn, #teacher-notify-btn, .enable-alerts-btn").forEach((btn) => {
    if (isEnabled) {
      btn.textContent = "🔔 Phone Alerts Active";
      btn.classList.add("active");
    } else {
      btn.textContent = "🔕 Enable Phone Alerts";
      btn.classList.remove("active");
    }
  });
}

// ==========================================
// 14. INITIALIZATION
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  window.loadSchedules();
  setupSessionFilters();
  initSearchDropdown();
  updateNotificationButtons();
});
