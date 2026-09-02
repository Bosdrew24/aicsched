// SUPABASE CLIENT INITIALIZATION
const SUPABASE_URL = 'https://upjsmekxacecgnxxnkid.supabase.co';
const SUPABASE_KEY = 'sb_publishable_OQhsZ-6GUBqQq3FqcsQBSg_8FenNMwx';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// GLOBAL STATE & CONSTANTS
const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY ODL"];
const DAYS_CLEAN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const VAPID_PUBLIC_KEY = "BOJpCikmUaOrXF7VOE2JMZTVQQx4bef4yoNfcZ8TDJmrwFiSl4pZDwIX-KrIICr1eZo6fosEI08Ycwayx4m-ulE";

let selectedDayIndex = 0;
let activeSession = "MORNING";
let isViewingAllSections = false;
let sectionsData = [];
let swRegistration = null;
let notifiedClasses = new Set();
window.adminSearchQuery = "";

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
  updateNotificationButtons();
};

// HAMBURGER MENU TOGGLE
window.toggleHamburger = function (event) {
  if (event && typeof event.stopPropagation === "function") {
    event.stopPropagation();
  }
  const menu = document.getElementById("hamburger-menu");
  if (menu) {
    menu.classList.toggle("active");
  }
};

// STUDENT PORTAL AUTH & SEPARATION LOGIC
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
      if (searchContainer) searchContainer.style.display = "";
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
  const select =
    document.getElementById("teacher-name-select-gate") ||
    document.getElementById("teacher-name-select");
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

// RENDER TEACHER SCHEDULE AS A TIMETABLE GRID
window.renderTeacherSchedule = function () {
  const container = document.getElementById("teacher-schedule-container");
  if (!container) return;

  const selectedTeacher = localStorage.getItem("aics_teacher_name") || "";
  if (!selectedTeacher) {
    container.innerHTML = `<div style="color: var(--text-muted); text-align:center; padding:30px;">
      Please select your name to view your assigned classes.</div>`;
    return;
  }

  let masterSlots = [];
  sectionsData.forEach((sec) => {
    (sec.slots || []).forEach((slot) => {
      if (!masterSlots.includes(slot)) masterSlots.push(slot);
    });
  });

  if (masterSlots.length === 0) {
    masterSlots = [
      "7:00-8:00 AM",
      "8:00-9:00 AM",
      "9:00-10:00 AM",
      "10:00-11:00 AM",
      "11:00-12:00 PM"
    ];
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
            section: sec.code || sec.title || "-",
            room: cell.room || "TBA"
          });
          hasClasses = true;
        }
      });
    });
  });

  if (!hasClasses) {
    container.innerHTML = `<div style="color: var(--text-muted); text-align:center; padding:30px;">
      No assigned classes found for <strong>${selectedTeacher}</strong>.</div>`;
    return;
  }

  let html = `
  <div class="section-card" style="margin-bottom:20px;">
    <div class="section-header-bar">
      <span class="portal-tag">Faculty Schedule: ${selectedTeacher}</span>
    </div>
    <div class="schedule-table-container">
      <table class="responsive-table show-col-${selectedDayIndex}">
        <thead>
          <tr>
            <th>TIME</th>`;
  DAYS.forEach((d) => (html += `<th>${d}</th>`));
  html += `</tr></thead><tbody>`;

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

    let html = `<table class="responsive-table show-col-${selectedDayIndex}"><thead><tr><th>TIME</th>`;
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
          document.getElementById("subject-card-time").textContent = `${DAYS_CLEAN[c]} ${sec.slots[r]}`;
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

  updateMobileVis();
  applyFilters();
}

// RENDER MOBILE DAY TABS
function renderMobileTabs() {
  const container = document.getElementById("mobile-day-tabs");
  if (!container) return;
  container.innerHTML = "";

  DAYS.forEach((day, idx) => {
    const btn = document.createElement("button");
    btn.className = "day-tab" + (idx === selectedDayIndex ? " active" : "");
    btn.innerHTML = day;
    btn.addEventListener("click", () => {
      selectedDayIndex = idx;
      renderMobileTabs();
      updateMobileVis();
    });
    container.appendChild(btn);
  });
}

function updateMobileVis() {
  document.querySelectorAll(".responsive-table").forEach((tbl) => {
    tbl.className = `responsive-table show-col-${selectedDayIndex}`;
  });
}

// SEARCH FILTERS & SESSION FILTER LOGIC
function applyFilters() {
  const savedSection = localStorage.getItem("aics_student_section");
  const input =
    document.getElementById("student-search-input") ||
    document.querySelector(".chrome-search-input");

  document.querySelectorAll("#sections-container .section-card").forEach((card) => {
    if (!isViewingAllSections && savedSection) {
      const targetSection = savedSection.trim().toLowerCase();
      const secCode = (card.dataset.sectionCode || "").trim().toLowerCase();
      const secTitle = (card.dataset.sectionTitle || "").trim().toLowerCase();
      const isMatch =
        secCode === targetSection ||
        secTitle === targetSection ||
        secCode.includes(targetSection) ||
        secTitle.includes(targetSection);

      card.style.display = isMatch ? "block" : "none";
      card.querySelectorAll(".class-cell").forEach((c) => {
        c.classList.remove("highlight", "dimmed");
      });
      return;
    }

    const cardSession = (card.dataset.session || "").trim().toLowerCase();
    const currentActiveSession = (activeSession || "MORNING").trim().toLowerCase();
    const sessionMatches = !card.dataset.session || cardSession === currentActiveSession;
    const val = input ? input.value.trim().toLowerCase() : "";

    if (!val) {
      card.style.display = sessionMatches ? "block" : "none";
      card.querySelectorAll(".class-cell").forEach((c) => {
        c.classList.remove("highlight", "dimmed");
      });
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
  const searchInput =
    document.getElementById("student-search-input") ||
    document.querySelector(".chrome-search-input");
  const searchContainer =
    document.querySelector(".chrome-search-container") ||
    document.querySelector(".search-box");

  if (!searchInput || !searchContainer) return;

  let dropdown = searchContainer.querySelector(".chrome-dropdown");
  if (!dropdown) {
    dropdown = document.createElement("div");
    dropdown.className = "chrome-dropdown";
    searchContainer.appendChild(dropdown);
  }

  function buildSuggestions(query) {
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
            const subCode = cell.subject.trim();
            const key = `sub-${subCode.toLowerCase()}`;
            if (!addedKeys.has(key)) {
              addedKeys.add(key);
              suggestions.push({ text: subCode, type: "Subject" });
            }
          }
        });
      }
    });

    dropdown.innerHTML = "";
    const matches = suggestions.slice(0, 8);

    if (matches.length === 0) {
      dropdown.innerHTML = '<div class="suggestion-empty">No matching records found</div>';
    } else {
      matches.forEach((item) => {
        const div = document.createElement("div");
        div.className = "suggestion-item";
        div.innerHTML = `<span>${item.text}</span> <small style="opacity:0.6; font-size:0.75rem; float:right;">${item.type}</small>`;
        div.addEventListener("click", () => {
          searchInput.value = item.text;
          dropdown.classList.remove("active");
          applyFilters();
        });
        dropdown.appendChild(div);
      });
    }

    dropdown.classList.add("active");
  }

  searchInput.addEventListener("input", (e) => {
    applyFilters();
    buildSuggestions(e.target.value);
  });

  searchInput.addEventListener("focus", (e) => {
    if (e.target.value.trim()) {
      buildSuggestions(e.target.value);
    }
  });

  document.addEventListener("click", (e) => {
    if (!searchContainer.contains(e.target)) {
      dropdown.classList.remove("active");
    }
  });
}

// NOTIFICATION & PHONE ALERT UTILITIES
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

window.toggleNotifications = async function () {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert("Push notifications are not supported on this browser or page protocol.");
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    alert("Notification permission was denied. Please allow notifications in your browser settings.");
    updateNotificationButtons();
    return;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    const userIdentifier =
      localStorage.getItem('aics_student_section') ||
      localStorage.getItem('aics_teacher_name') ||
      'General';

    const { error } = await db.from('push_subscriptions').insert([
      {
        id: crypto.randomUUID(),
        user_identifier: userIdentifier,
        subscription_json: sub
      }
    ]);

    if (error) {
      console.error("Supabase Error Details:", error);
      alert("Database error: " + error.message);
      return;
    }

    sendClassNotification(
      "Phone Alerts Enabled",
      "You will now receive automatic push notifications before your classes start!"
    );
    alert("Phone alerts enabled successfully! Your device is registered.");
    updateNotificationButtons();
    checkUpcomingClasses();
  } catch (err) {
    console.error("Subscription error:", err);
    alert("Failed to subscribe to alerts: " + err.message);
  }
};

function updateNotificationButtons() {
  const isGranted = "Notification" in window && Notification.permission === "granted";
  const buttonIds = ["student-notify-btn", "teacher-notify-btn", "notify-toggle-btn"];

  buttonIds.forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) {
      if (isGranted) {
        btn.innerHTML = "Alerts Active";
        btn.style.backgroundColor = "var(--success, #16a34a)";
        btn.style.color = "#ffffff";
      } else {
        btn.innerHTML = "Enable Phone Alerts";
        btn.style.backgroundColor = "";
        btn.style.color = "";
      }
    }
  });
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const str = timeStr.trim().toUpperCase();
  const isPM = str.includes("PM");
  const isAM = str.includes("AM");
  const clean = str.replace(/(AM|PM)/g, "").trim();
  const parts = clean.split(":");
  if (parts.length < 2) return null;

  let hours = parseInt(parts[0], 10);
  let minutes = parseInt(parts[1], 10);

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;
  if (!isAM && !isPM && hours >= 1 && hours <= 6) hours += 12;

  return hours * 60 + minutes;
}

function sendClassNotification(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (swRegistration && swRegistration.showNotification) {
    swRegistration.showNotification(title, {
      body: body,
      icon: "logo.jpg",
      badge: "logo.jpg",
      vibrate: [200, 100, 200]
    });
  } else {
    new Notification(title, {
      body: body,
      icon: "logo.jpg"
    });
  }
}

function checkUpcomingClasses() {
  if (!("Notification" in window) || Notification.permission !== "granted" || !sectionsData.length)
    return;

  const now = new Date();
  const currentDayStr = [
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY ODL",
    "SATURDAY"
  ][now.getDay()];

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const savedTeacher = (localStorage.getItem("aics_teacher_name") || "").trim().toLowerCase();
  const savedStudentSection = (localStorage.getItem("aics_student_section") || "").trim().toLowerCase();

  sectionsData.forEach((sec) => {
    if (!sec.slots || !sec.cells) return;
    const secCode = (sec.code || "").trim().toLowerCase();

    sec.slots.forEach((slot, rowIdx) => {
      const startTimeStr = slot.split("-")[0];
      const classMinutes = parseTimeToMinutes(startTimeStr);
      if (classMinutes === null) return;

      const dayIdx = DAYS.indexOf(currentDayStr);
      if (dayIdx !== -1) {
        const key = `${rowIdx}-${dayIdx}`;
        const cell = sec.cells[key];

        if (cell && (cell.subject || cell.name)) {
          const timeDiff = classMinutes - currentMinutes;
          const notificationId = `${now.toDateString()}-${sec.code}-${key}`;

          if (timeDiff > 0 && timeDiff <= 10 && !notifiedClasses.has(notificationId)) {
            const classTitle = cell.subject || cell.name;
            const profName = cell.professor || "Faculty";
            const roomName = cell.room || "TBA";

            // Teacher Alert Matching
            if (savedTeacher && cell.professor && cell.professor.trim().toLowerCase() === savedTeacher) {
              notifiedClasses.add(notificationId);
              sendClassNotification(
                `Upcoming Class: ${classTitle}`,
                `Teaching section ${sec.code} in Room ${roomName} starts in ${timeDiff} minutes (${slot}).`
              );
            }
            // Student Alert Matching
            else if (savedStudentSection && (secCode === savedStudentSection || secCode.includes(savedStudentSection))) {
              notifiedClasses.add(notificationId);
              sendClassNotification(
                `Upcoming Class: ${classTitle}`,
                `Room ${roomName} (${profName}) starts in ${timeDiff} minutes (${slot}).`
              );
            }
          }
        }
      }
    });
  });
}

// PERIODIC SCHEDULE CHECK (Runs every 30 seconds)
setInterval(checkUpcomingClasses, 30000);

// CONFLICT DETECTION & NOTIFICATIONS
function getScheduleConflicts() {
  const profMap = {};
  const roomMap = {};
  const conflictSet = new Set();
  const conflictDetails = [];

  sectionsData.forEach((sec, secIdx) => {
    if (!sec.cells) return;
    Object.keys(sec.cells).forEach((cellKey) => {
      const cell = sec.cells[cellKey];
      if (!cell) return;

      const [rowIdx, colIdx] = cellKey.split("-");
      const rawSlotLabel = sec.slots && sec.slots[rowIdx] ? sec.slots[rowIdx].trim() : `ROW-${rowIdx}`;
      const timeSlotLabel = rawSlotLabel.toUpperCase();
      const timeSlotKey = `${colIdx}_${timeSlotLabel}`;
      const dayLabel = DAYS_CLEAN[colIdx] || "Day";

      if (cell.professor && cell.professor.trim() !== "") {
        const prof = cell.professor.trim().toLowerCase();
        const profDisplay = cell.professor.trim();

        if (!profMap[timeSlotKey]) profMap[timeSlotKey] = {};
        if (!profMap[timeSlotKey][prof]) profMap[timeSlotKey][prof] = [];

        profMap[timeSlotKey][prof].push({
          secCode: sec.code || sec.title,
          timeSlot: timeSlotLabel,
          dayName: dayLabel,
          secIdx,
          cellKey,
          name: profDisplay,
          type: "Professor"
        });
      }

      if (cell.room && cell.room.trim() !== "" && cell.room.trim().toLowerCase() !== "tba") {
        const room = cell.room.trim().toLowerCase();
        const roomDisplay = cell.room.trim();

        if (!roomMap[timeSlotKey]) roomMap[timeSlotKey] = {};
        if (!roomMap[timeSlotKey][room]) roomMap[timeSlotKey][room] = [];

        roomMap[timeSlotKey][room].push({
          secCode: sec.code || sec.title,
          timeSlot: timeSlotLabel,
          dayName: dayLabel,
          secIdx,
          cellKey,
          name: roomDisplay,
          type: "Room"
        });
      }
    });
  });

  [profMap, roomMap].forEach((map) => {
    Object.values(map).forEach((entriesByName) => {
      Object.values(entriesByName).forEach((matches) => {
        if (matches.length > 1) {
          const first = matches[0];
          const involvedSections = matches.map((m) => m.secCode).join(" and ");
          conflictDetails.push(
            `${first.type} Conflict: "${first.name}" is double-booked in ${involvedSections} on ${first.dayName} (${first.timeSlot}).`
          );
          matches.forEach((item) => {
            conflictSet.add(`${item.secIdx}-${item.cellKey}`);
          });
        }
      });
    });
  });

  return { conflictSet, conflictDetails };
}

function triggerConflictPopUp(conflictList) {
  if (!conflictList || conflictList.length === 0) return;
  const message = "CLASS CONFLICT DETECTED!\n\n" + conflictList.join("\n\n");
  alert(message);
}

// EDITABLE TIME SLOTS & ROW MANAGEMENT
window.updateSlotTime = function (secIdx, rowIdx, val) {
  if (!sectionsData[secIdx] || !sectionsData[secIdx].slots) return;
  sectionsData[secIdx].slots[rowIdx] = val;
  saveSchedulesToDB();
  renderSections();
  renderTeacherSchedule();
};

// HELPER: CALCULATE NEXT TIME SLOT BASED ON LAST TIME
function calculateNextSlot(lastSlotStr) {
  if (!lastSlotStr) return "8:00-9:00 AM";

  const parts = lastSlotStr.split(/[–-]/);
  if (parts.length < 2) return "8:00-9:00 AM";

  let endPart = parts[1].trim();

  // Extract period (AM/PM)
  let ampmMatch = endPart.match(/(AM|PM)/i) || lastSlotStr.match(/(AM|PM)/i);
  let period = ampmMatch ? ampmMatch[0].toUpperCase() : "AM";

  let cleanTime = endPart.replace(/(AM|PM)/gi, "").trim();
  let timeParts = cleanTime.split(":");
  if (timeParts.length < 2) return "8:00-9:00 AM";

  let hours = parseInt(timeParts[0], 10);
  let minutes = parseInt(timeParts[1], 10) || 0;

  // Convert to 24-hour format
  let end24 = hours;
  if (period === "PM" && hours !== 12) end24 += 12;
  if (period === "AM" && hours === 12) end24 = 0;

  let nextStart24 = end24;
  let nextEnd24 = (nextStart24 + 1) % 24;

  function format12(h24) {
    let h12 = h24 % 12 || 12;
    let p = h24 >= 12 ? "PM" : "AM";
    let minStr = minutes < 10 ? "0" + minutes : minutes;
    return { h12, minStr, p };
  }

  const s = format12(nextStart24);
  const e = format12(nextEnd24);

  if (s.p === e.p) {
    return `${s.h12}:${s.minStr}-${e.h12}:${e.minStr} ${e.p}`;
  } else {
    return `${s.h12}:${s.minStr} ${s.p}-${e.h12}:${e.minStr} ${e.p}`;
  }
}

// DYNAMIC TIME INCREMENT ON ADD ROW
window.addTimeSlot = function (secIdx) {
  if (!sectionsData[secIdx]) return;
  if (!sectionsData[secIdx].slots) sectionsData[secIdx].slots = [];

  const slots = sectionsData[secIdx].slots;
  let nextSlot = "8:00-9:00 AM";

  if (slots.length > 0) {
    const lastSlot = slots[slots.length - 1];
    nextSlot = calculateNextSlot(lastSlot);
  }

  sectionsData[secIdx].slots.push(nextSlot);
  saveSchedulesToDB();
  renderAdminSections();
  renderSections();
};

window.deleteTimeSlot = function (secIdx, rowIdx) {
  if (!sectionsData[secIdx] || !sectionsData[secIdx].slots) return;
  sectionsData[secIdx].slots.splice(rowIdx, 1);
  saveSchedulesToDB();
  renderAdminSections();
  renderSections();
};

// ADD NEW SECTION
window.addNewSection = async function () {
  const codeInput = document.getElementById("new-section-code");
  const titleInput = document.getElementById("new-section-title");
  const code = codeInput?.value.trim();
  const title = titleInput?.value.trim() || code;
  const session = document.getElementById("new-section-session")?.value;

  if (!code) {
    alert("Please enter a section code.");
    return;
  }

  const sectionExists = sectionsData.some(
    (sec) => sec.code && sec.code.trim().toLowerCase() === code.toLowerCase()
  );
  if (sectionExists) {
    alert(`Section "${code}" already exists. Duplicate sections are not allowed.`);
    return;
  }

  const defaultSlots = [
    "7:00-8:00 AM",
    "8:00-9:00 AM",
    "9:00-10:00 AM",
    "10:00-11:00 AM",
    "11:00-12:00 PM"
  ];

  const newSec = {
    id: "sec" + Date.now(),
    code: code,
    title: title,
    session: session,
    slots: defaultSlots,
    cells: {}
  };

  sectionsData.push(newSec);
  await saveSchedulesToDB();

  if (codeInput) codeInput.value = "";
  if (titleInput) titleInput.value = "";

  renderAdminSections();
  renderSections();
  alert(`Section "${code}" created successfully!`);
};

// ADMIN SECTION SEARCH FILTER
window.filterAdminSections = function () {
  const input = document.getElementById("admin-search-input");
  const val = input ? input.value.trim().toLowerCase() : window.adminSearchQuery || "";
  window.adminSearchQuery = val;

  document.querySelectorAll("#admin-sections-list .admin-section-card").forEach((card) => {
    const textContent = card.textContent.toLowerCase();
    const code = (card.dataset.sectionCode || "").toLowerCase();
    const title = (card.dataset.sectionTitle || "").toLowerCase();

    if (!val || textContent.includes(val) || code.includes(val) || title.includes(val)) {
      card.style.display = "block";
    } else {
      card.style.display = "none";
    }
  });
};

// RENDER ADMIN SECTION EDITORS
function renderAdminSections() {
  const container = document.getElementById("admin-sections-list");
  if (!container) return;

  if (!sectionsData.length) {
    container.innerHTML = '<div style="color: var(--text-muted); text-align:center; padding:20px;">No sections available. Add one above!</div>';
    return;
  }

  const { conflictSet, conflictDetails } = getScheduleConflicts();

  let html = `
  <div class="admin-search-container" style="margin-bottom: 20px;">
    <input
      type="text"
      id="admin-search-input"
      placeholder="Search sections, subjects, rooms, or faculty..."
      oninput="filterAdminSections()"
      value="${window.adminSearchQuery || ''}"
      style="width: 100%; padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-main); font-size: 0.95rem; box-sizing: border-box;"
    />
  </div>`;

  if (conflictDetails.length > 0) {
    html += `
    <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid var(--warning, #f59e0b); color: var(--text-main); padding: 14px 18px; border-radius: 10px; margin-bottom:20px;">
      <h4 style="margin:0 0 8px 0; color:var(--warning, #f59e0b); display: flex; align-items:center; gap:8px;">
        <span>⚠️</span> Class Conflict Warning (${conflictDetails.length} detected)
      </h4>
      <ul style="margin:0; padding-left:20px; font-size:0.88rem;">
        ${conflictDetails.map((item) => `<li style="margin-bottom:4px;">${item}</li>`).join('')}
      </ul>
    </div>`;
  }

  sectionsData.forEach((sec, secIdx) => {
    html += `
    <div class="section-card admin-section-card"
      data-section-code="${(sec.code || '').toLowerCase()}"
      data-section-title="${(sec.title || sec.code || '').toLowerCase()}"
      style="margin-bottom:20px; padding: 18px;">
      <div style="display: flex; justify-content: space-between; align-items:center; margin-bottom: 12px;">
        <h3 style="color:var(--primary); margin:0;">${sec.title || sec.code} (${sec.session || 'Regular'})</h3>
        <div style="display: flex; gap:8px;">
          <button onclick="addTimeSlot(${secIdx})" class="btn-success">+ Add Time Row</button>
          <button onclick="deleteSection(${secIdx})" class="btn-danger">Delete Section</button>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table class="responsive-table">
          <thead>
            <tr>
              <th style="min-width:130px;">Time Slot</th>
              ${DAYS_CLEAN.map((d) => `<th>${d}</th>`).join('')}
              <th style="width:40px;"></th>
            </tr>
          </thead>
          <tbody>`;

    (sec.slots || []).forEach((slot, rowIdx) => {
      html += `
      <tr>
        <td class="time-cell">
          <input type="text" placeholder="e.g. 7:00-8:00 AM"
            value="${slot}" onchange="updateSlotTime(${secIdx}, ${rowIdx}, this.value)"
            style="width:100%; background: transparent; border:none; border-bottom:1px solid var(--primary); color:var(--text-main); font-weight:600; padding:2px; box-sizing:border-box;">
        </td>`;

      DAYS.forEach((d, colIdx) => {
        const key = `${rowIdx}-${colIdx}`;
        const cell = sec.cells ? sec.cells[key] : null;
        const sub = cell ? cell.subject || cell.name || "" : "";
        const prof = cell ? cell.professor || "" : "";
        const room = cell ? cell.room || "" : "";

        const isConflicted = conflictSet.has(`${secIdx}-${key}`);
        const cellClass = isConflicted ? 'class-cell highlight' : 'class-cell';

        html += `
        <td class="${cellClass}" style="padding:6px; min-width: 140px;">
          <input type="text" placeholder="Subject Code" value="${sub}"
            onchange="updateCellData(${secIdx}, '${key}', 'subject', this.value)"
            style="width:100%; background:transparent; border:none; border-bottom:1px solid var(--border-color); color:var(--text-main); font-weight:600; margin-bottom:4px; box-sizing:border-box;">
          <input type="text" placeholder="Professor" value="${prof}"
            onchange="updateCellData(${secIdx}, '${key}', 'professor', this.value)"
            style="width:100%; background:transparent; border:none; border-bottom:1px solid var(--border-color); color:var(--text-muted); margin-bottom:4px; box-sizing:border-box;">
          <input type="text" placeholder="Room" value="${room}"
            onchange="updateCellData(${secIdx}, '${key}', 'room', this.value)"
            style="width:100%; background:transparent; border:none; color:var(--text-muted); box-sizing:border-box;">
          ${isConflicted ? '<div style="display:inline-block; background-color: var(--warning, #eab308); color: var(--bg-card, #30f172a); padding:2px 6px; border-radius: 4px; font-size:0.75rem; font-weight:700; margin-top: 4px;">CONFLICT</div>' : ''}
        </td>`;
      });

      html += `
        <td style="padding: 6px; text-align:center;">
          <button onclick="deleteTimeSlot(${secIdx}, ${rowIdx})"
            style="background:transparent; border: none; color: var(--danger); cursor:pointer; font-weight:bold;">X</button>
        </td>
      </tr>`;
    });

    html += '</tbody></table></div></div>';
  });

  container.innerHTML = html;
  filterAdminSections();
}

// UPDATE CELL DATA & PERSIST
window.updateCellData = function (secIdx, cellKey, field, val) {
  if (!sectionsData[secIdx]) return;
  if (!sectionsData[secIdx].cells) sectionsData[secIdx].cells = {};
  if (!sectionsData[secIdx].cells[cellKey]) {
    sectionsData[secIdx].cells[cellKey] = {
      subject: "",
      name: "",
      professor: "",
      room: ""
    };
  }

  sectionsData[secIdx].cells[cellKey][field] = val;
  if (field === "subject") {
    sectionsData[secIdx].cells[cellKey]["name"] = val;
  }

  const { conflictDetails } = getScheduleConflicts();
  if (conflictDetails.length > 0) {
    triggerConflictPopUp(conflictDetails);
  }

  saveSchedulesToDB();
  renderAdminSections();
};

// DELETE SECTION
window.deleteSection = async function (secIdx) {
  const targetSection = sectionsData[secIdx];
  if (confirm(`Are you sure you want to delete section "${targetSection?.code}"?`)) {
    if (targetSection && targetSection.id) {
      try {
        await db.from("schedules").delete().eq("id", targetSection.id);
      } catch (err) {
        console.error("Error deleting section from Supabase:", err);
      }
    }
    sectionsData.splice(secIdx, 1);
    renderAdminSections();
    renderSections();
  }
};

// SAVE SCHEDULES TO DATABASE BACKEND
async function saveSchedulesToDB() {
  try {
    if (!sectionsData || sectionsData.length === 0) return;
    const { error } = await db.from("schedules").upsert(sectionsData, {
      onConflict: "id"
    });
    if (error) {
      console.error("Error saving schedule data to Supabase:", error);
    }
  } catch (err) {
    console.error("Error saving schedule data:", err);
  }
}

// INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('sw.js')
      .then((reg) => {
        swRegistration = reg;
      })
      .catch((err) => {
        console.error("Service Worker registration failed:", err);
      });
  }

  document.getElementById("hamburger-btn")?.addEventListener("click", window.toggleHamburger);

  document.addEventListener("click", (e) => {
    const menu = document.getElementById("hamburger-menu");
    const btn = document.getElementById("hamburger-btn");
    if (menu && menu.classList.contains("active")) {
      if (!menu.contains(e.target) && (!btn || !btn.contains(e.target))) {
        menu.classList.remove("active");
      }
    }
  });

  updateNotificationButtons();

  document.querySelectorAll(".session-filter-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const container = e.target.parentElement;
      container.querySelectorAll(".session-filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeSession = btn.dataset.session;
      applyFilters();
    });
  });

  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  function applyTheme(theme) {
    if (theme === "light") {
      document.body.classList.remove("dark-mode");
      document.body.classList.add("light-mode");
      if (themeToggleBtn) themeToggleBtn.textContent = "Dark Mode";
    } else {
      document.body.classList.add("dark-mode");
      document.body.classList.remove("light-mode");
      if (themeToggleBtn) themeToggleBtn.textContent = "Light Mode";
    }
  }

  const savedTheme = localStorage.getItem("theme") || "dark";
  applyTheme(savedTheme);

  themeToggleBtn?.addEventListener("click", () => {
    const isDark = document.body.classList.contains("dark-mode");
    const newTheme = isDark ? "light" : "dark";
    localStorage.setItem("theme", newTheme);
    applyTheme(newTheme);
  });

  document.getElementById("subject-card-close-btn")?.addEventListener("click", () => {
    document.getElementById("subject-details-overlay").classList.remove("open");
  });

  initSearchDropdown();
  renderMobileTabs();
  window.loadSchedules();
});

setInterval(() => {
  if (typeof window.loadSchedules === "function") {
    window.loadSchedules();
  }
}, 15000);
