// SUPABASE CLIENT INITIALIZATION
const SUPABASE_URL = 'https://upjsmekxacecgnxxnkid.supabase.co';
const SUPABASE_KEY = 'sb_publishable_OQhsZ-6GUBqQq3FqcsQBSg_8FenNMwx';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// GLOBAL STATE & CONSTANTS
const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY ODL"];
const DAYS_CLEAN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const VAPID_PUBLIC_KEY = "BOJpCikmUaQrXF7VOE2JMZTVQQx4bef4yoNfcZ8TDJmrwFiSl4pZDwIX-KrIlCr1eZo6fosE108Ycwayx4m-ule";

let selectedDayIndex = 0;
let activeSession = "MORNING";
let isViewingAllSections = false;
let sectionsData = [];
let swRegistration = null;
let notifiedClasses = new Set();
window.adminSearchQuery = "";

// INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
  initNativeNotifications();
  loadSchedules();
  checkStudentAuth();
  checkTeacherAuth();
  checkAdminAuth();
  initSearchDropdown();
  updateNotificationButtons();
});

// CAPACITOR NATIVE NOTIFICATION INITIALIZATION
async function initNativeNotifications() {
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
    try {
      await Capacitor.Plugins.LocalNotifications.requestPermissions();
    } catch (e) {
      console.warn("Capacitor LocalNotifications request failed:", e);
    }
  }
}

// NAVIGATION & VIEWS
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
};

// HAMBURGER MENU TOGGLE
window.toggleHamburger = function (event) {
  if (event && typeof event.stopPropagation === "function") {
    event.stopPropagation();
  }
  const menu = document.getElementById("hamburger-menu");
  if (menu) menu.classList.toggle("active");
};

// NOTIFICATION BUTTON & CAPACITOR NATIVE HANDLER
window.enablePhoneAlerts = async function () {
  // 1. Native Capacitor App Handler
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
    try {
      const perm = await Capacitor.Plugins.LocalNotifications.requestPermissions();
      if (perm.display === "granted") {
        localStorage.setItem("aics_notifications_enabled", "true");
        alert("Native phone alerts enabled successfully!");
        updateNotificationButtons();
        checkUpcomingClasses();
      } else {
        alert("Notification permission was denied in phone settings.");
      }
    } catch (err) {
      alert("Error requesting native permissions: " + err.message);
    }
    return;
  }

  // 2. Standard Web Browser Handler Fallback
  if ("Notification" in window) {
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        localStorage.setItem("aics_notifications_enabled", "true");
        alert("Web notifications enabled successfully!");
        updateNotificationButtons();
        checkUpcomingClasses();
      } else {
        alert("Notification permission denied.");
      }
    } catch (err) {
      alert("Error enabling notifications: " + err.message);
    }
  } else {
    alert("Notifications are not supported on this device/browser.");
  }
};

function updateNotificationButtons() {
  const isEnabled = localStorage.getItem("aics_notifications_enabled") === "true";
  document.querySelectorAll(".enable-alerts-btn").forEach((btn) => {
    btn.textContent = isEnabled ? "Phone Alerts Active" : "Enable Phone Alerts";
    btn.classList.toggle("active", isEnabled);
  });
}

// STUDENT PORTAL AUTH LOGIC
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

// TEACHER PORTAL LOGIC & AUTH
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

// ADMIN MODAL & VIEW CONTROLS
window.openAdminModal = function () {
  window.setView("admin-view");
};

window.closeAdminModal = function () {
  const modal = document.getElementById("admin-login-modal");
  if (modal) modal.style.display = "none";
  const passInput = document.getElementById("admin-pass-input");
  if (passInput) passInput.value = "";
};

window.submitAdminLogin = function () {
  const passInput = document.getElementById("admin-pass-input");
  if (!passInput || !passInput.value.trim()) {
    alert("Please enter an administrative passcode.");
    return;
  }
  alert("Admin mode verified successfully.");
  window.closeAdminModal();
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

// DATABASE API CALL (SUPABASE INTEGRATION)
window.loadSchedules = async function () {
  try {
    const { data, error } = await db.from("schedules").select("*");
    if (error) {
      console.error("Error fetching schedules from Supabase:", error);
      return;
    }
    if (Array.isArray(data)) {
      sectionsData = data;
      renderSections();
      populateTeacherDropdown();
      renderTeacherSchedule();
      checkUpcomingClasses();
      if (document.getElementById("admin-main-content")?.style.display === "block") {
        renderAdminSections();
      }
    }
  } catch (err) {
    console.error("Error loading schedules:", err);
  }
};

// TEACHER SCHEDULE DROPDOWN & RENDERING
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
    container.innerHTML = `<div style="color: var(--text-muted); text-align:center; padding:30px;">
      Please select your name to view your assigned classes.
    </div>`;
    return;
  }

  let masterSlots = [];
  sectionsData.forEach((sec) => {
    (sec.slots || []).forEach((slot) => {
      if (!masterSlots.includes(slot)) masterSlots.push(slot);
    });
  });

  if (masterSlots.length === 0) {
    masterSlots = ["7:00-8:00 AM", "8:00-9:00 AM", "9:00-10:00 AM", "10:00-11:00 AM", "11:00-12:00 PM"];
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
    container.innerHTML = `<div style="color: var(--text-muted); text-align:center; padding:30px;">
      No assigned classes found for <strong>${selectedTeacher}</strong>.
    </div>`;
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
          html += `<div class="cell-code">${item.subject}</div>
                   <div class="cell-name">Sec: ${item.section} (${item.room})</div>`;
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

// RENDER STUDENT SECTIONS
function renderSections() {
  const studentContainer = document.getElementById("sections-container");
  if (!studentContainer) return;
  studentContainer.innerHTML = "";

  if (!sectionsData.length) {
    studentContainer.innerHTML = '<div style="text-align:center; padding:20px;">No schedules loaded.</div>';
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
    });

    tableDiv.querySelectorAll(".class-cell").forEach((td) => {
      td.addEventListener("click", () => {
        const key = td.getAttribute("data-key");
        if (sec.cells && sec.cells[key]) {
          const cell = sec.cells[key];
          const [r, c] = key.split("-");
          const timeElem = document.getElementById("subject-card-time");
          const codeElem = document.getElementById("subject-card-code");
          const nameElem = document.getElementById("subject-card-name");
          const roomElem = document.getElementById("subject-card-room");
          const profElem = document.getElementById("subject-card-professor");
          const overlay = document.getElementById("subject-details-overlay");

          if (timeElem) timeElem.textContent = `${DAYS_CLEAN[c] || ''} ${sec.slots[r] || ''}`;
          if (codeElem) codeElem.textContent = cell.subject || cell.name || "-";
          if (nameElem) nameElem.textContent = cell.name || cell.subject || "-";
          if (roomElem) roomElem.textContent = cell.room || "-";
          if (profElem) profElem.textContent = cell.professor || "-";
          if (overlay) overlay.classList.add("open");
        }
      });
    });

    card.appendChild(header);
    card.appendChild(tableDiv);
    studentContainer.appendChild(card);
  });

  updateMobileVis();
  applyFilters();
}

function updateMobileVis() {
  document.querySelectorAll(".responsive-table").forEach((tbl) => {
    tbl.className = "responsive-table";
  });
}

// SEARCH FILTERS & SESSION FILTER LOGIC
function applyFilters() {
  const savedSection = localStorage.getItem("aics_student_section");
  const input = document.getElementById("student-search-input") || document.querySelector(".chrome-search-input");

  document.querySelectorAll("#sections-container .section-card").forEach((card) => {
    if (!isViewingAllSections && savedSection) {
      const targetSection = savedSection.trim().toLowerCase();
      const secCode = (card.dataset.sectionCode || "").trim().toLowerCase();
      const secTitle = (card.dataset.sectionTitle || "").trim().toLowerCase();
      const isMatch = secCode === targetSection || secTitle === targetSection || secCode.includes(targetSection) || secTitle.includes(targetSection);

      card.style.display = isMatch ? "block" : "none";
      card.querySelectorAll(".class-cell").forEach((c) => c.classList.remove("highlight", "dimmed"));
      return;
    }

    const cardSession = (card.dataset.session || "").trim().toLowerCase();
    const currentActiveSession = (activeSession || "MORNING").trim().toLowerCase();
    const sessionMatches = !card.dataset.session || cardSession === currentActiveSession;

    const val = input ? input.value.trim().toLowerCase() : "";
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

  function buildSuggestions(query) {
    if (!query || !query.trim()) {
      dropdown.classList.remove("active");
      dropdown.innerHTML = "";
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
      dropdown.innerHTML = "";
      return;
    }

    dropdown.innerHTML = suggestions
      .slice(0, 6)
      .map((s) => `<div class="dropdown-item" data-val="${s.text}"><span>${s.text}</span><small>${s.type}</small></div>`)
      .join("");

    dropdown.classList.add("active");

    dropdown.querySelectorAll(".dropdown-item").forEach((item) => {
      item.addEventListener("click", () => {
        searchInput.value = item.getAttribute("data-val");
        dropdown.classList.remove("active");
        applyFilters();
      });
    });
  }
}

// UPCOMING CLASS SCHEDULE & NOTIFICATION CHECKER
function checkUpcomingClasses() {
  if (localStorage.getItem("aics_notifications_enabled") !== "true") return;

  const savedSection = localStorage.getItem("aics_student_section");
  if (!savedSection || !sectionsData) return;

  const userSec = sectionsData.find(
    (s) => (s.code || "").toLowerCase() === savedSection.toLowerCase() || (s.title || "").toLowerCase() === savedSection.toLowerCase()
  );
  if (!userSec || !userSec.cells || !userSec.slots) return;

  let notifIdCounter = 100;
  userSec.slots.forEach((slot, r) => {
    DAYS.forEach((d, c) => {
      const cell = userSec.cells[`${r}-${c}`];
      if (cell && (cell.subject || cell.name)) {
        notifIdCounter++;
        scheduleClassAlert(
          notifIdCounter,
          cell.subject || cell.name,
          cell.room || "TBA",
          c,
          slot
        );
      }
    });
  });
}

async function scheduleClassAlert(id, subject, room, dayIdx, timeSlot) {
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
    try {
      await Capacitor.Plugins.LocalNotifications.schedule({
        notifications: [
          {
            id: id,
            title: `Upcoming Class: ${subject}`,
            body: `Room ${room} starts soon (${timeSlot}).`,
            schedule: { at: new Date(Date.now() + 5000) }
          }
        ]
      });
    } catch (e) {
      console.warn("Error scheduling Capacitor native notification:", e);
    }
  }
}

function renderAdminSections() {
  const container = document.getElementById("admin-sections-list");
  if (container) {
    container.innerHTML = `<div style="padding:15px;">Admin Control Active. ${sectionsData.length} sections loaded.</div>`;
  }
}
 
