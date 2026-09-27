// SUPABASE CLIENT INITIALIZATION
// Guarded: if the Supabase CDN script fails to load (flaky network, blocked
// in an app WebView, offline first load, etc.), we used to throw here and
// silently kill the ENTIRE script — meaning every button on the page (even
// ones with nothing to do with Supabase) would stop responding, with no
// visible error. Now we degrade gracefully instead: the rest of the app
// still loads and all buttons still work, only actual data calls will fail
// (and they already log to console / show alerts when that happens).
const SUPABASE_URL = 'https://upjsmekxacecgnxxnkid.supabase.co';
const SUPABASE_KEY = 'sb_publishable_OQhsZ-6GUBqQq3FqcsQBSg_8FenNMwx';
let db = null;
if (typeof supabase === "undefined" || !supabase?.createClient) {
  console.error("[AICSched] Supabase library did not load — check your internet connection or that the CDN <script> tag in index.html loaded before script.js. The app will still open, but schedule data won't load until this is fixed.");
  window.addEventListener("DOMContentLoaded", () => {
    const banner = document.createElement("div");
    banner.style.cssText = "background:#dc2626; color:#fff; padding:10px 14px; text-align:center; font-weight:700; font-size:0.85rem; position:sticky; top:0; z-index:99999;";
    banner.textContent = "Could not load required library (Supabase). Check your internet connection and reload the app.";
    document.body.prepend(banner);
  });
} else {
  db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY ODL"];
const DAYS_CLEAN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday ODL"];
let activeSession = "MORNING";
let isViewingAllSections = false;
let sectionsData = [];
let allSections = [];
let studentSubpanel = "home";
let lastConflictList = [];
let roomsData = [];
let roomsTableAvailable = true;

// ==========================================
// THEME
// ==========================================
function initTheme() { applyTheme(localStorage.getItem("aics_theme") || "dark"); }
function applyTheme(theme) {
  const isLight = theme === "light";
  document.body.classList.toggle("light-mode", isLight);
  document.body.classList.toggle("dark-mode", !isLight);
  localStorage.setItem("aics_theme", theme);
  const moonIcon = "<svg class=\"icon\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path d='M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z'/></svg>";
  const sunIcon = "<svg class=\"icon\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><circle cx='12' cy='12' r='4'/><path d='M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'/></svg>";
  document.querySelectorAll("#theme-toggle-btn").forEach(b => b.innerHTML = (isLight ? moonIcon + " Dark Mode" : sunIcon + " Light Mode"));
}
window.toggleTheme = function () { applyTheme(localStorage.getItem("aics_theme") === "light" ? "dark" : "light"); };

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
// Classes never span past midnight here. If an end time isn't strictly after
// the start, the slot's AM/PM was mis-entered (e.g. "11:00 AM - 12:00 AM"
// meant "12:00 PM"). Treated as invalid instead of wrapping to next day —
// wrapping previously turned a 1-hour typo into a ~13-hour false booking
// that caused a flood of false conflicts.
function getSlotRangeMinutes(slotStr) {
  if (!slotStr) return null;
  const parts = slotStr.split("-").map(s => s.trim());
  if (parts.length !== 2) return null;
  const startMin = pieceToMinutes24(parts[0]);
  const endMin = pieceToMinutes24(parts[1]);
  if (startMin === null || endMin === null) return null;
  if (endMin <= startMin) {
    console.warn(`Invalid time slot (end not after start), skipping: "${slotStr}"`);
    return null;
  }
  return { startMin, endMin };
}
function getSlotStartMinutes(slotStr) { const r = getSlotRangeMinutes(slotStr); return r ? r.startMin % 1440 : null; }
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
// ROOMS DATA & AVAILABILITY ENGINE
// ==========================================
// Rooms are stored in an optional "rooms" table (name, capacity, notes, status).
// If that table doesn't exist yet in Supabase, we fall back to a local list
// (localStorage) so room management still works without any DB migration.
async function loadRooms() {
  try {
    const { data, error } = await db.from("rooms").select("*").order("name");
    if (error) throw error;
    roomsData = data || [];
    roomsTableAvailable = true;
  } catch (err) {
    roomsTableAvailable = false;
    try { roomsData = JSON.parse(localStorage.getItem("aics_local_rooms") || "[]"); } catch { roomsData = []; }
  }
}
function persistLocalRooms() { localStorage.setItem("aics_local_rooms", JSON.stringify(roomsData)); }

// Full list of known room names: rooms explicitly added via Room Management,
// plus any room string already used somewhere in the schedule data (so old
// data keeps working even before an admin formally registers every room).
function getAllKnownRoomNames() {
  const set = new Set();
  roomsData.forEach(r => { if (r.name?.trim() && r.status !== "inactive") set.add(r.name.trim()); });
  sectionsData.forEach(sec => Object.values(sec.cells || {}).forEach(c => {
    const r = (c?.room || "").trim();
    if (r && r.toLowerCase() !== "tba" && r.toLowerCase() !== "online") set.add(r);
  }));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

// For a given day + minute range, returns every known room marked available
// or occupied (with the conflicting booking), reusing the same overlap logic
// as the save-time conflict checker so results are always consistent.
function getRoomAvailability(dayIdx, startMin, endMin, excludeIdentifier) {
  const bookings = collectRoomBookings(excludeIdentifier, null)
    .filter(b => b.dayIdx === dayIdx && b.room && b.room !== "tba" && b.room !== "online");
  return getAllKnownRoomNames().map(name => {
    const clash = bookings.find(b => b.room === name.toLowerCase() && startMin < b.endMin && endMin > b.startMin);
    return { name, available: !clash, conflict: clash || null };
  });
}

window.addRoom = async function () {
  const nameInput = document.getElementById("new-room-name");
  const capInput = document.getElementById("new-room-capacity");
  const notesInput = document.getElementById("new-room-notes");
  const name = nameInput?.value.trim();
  if (!name) { alert("Please enter a room name/number."); return; }
  if (getAllKnownRoomNames().some(r => r.toLowerCase() === name.toLowerCase())) { alert("That room already exists."); return; }
  const capacity = capInput?.value ? parseInt(capInput.value, 10) : null;
  const notes = notesInput?.value.trim() || null;
  if (roomsTableAvailable) {
    try {
      const { error } = await db.from("rooms").insert([{ name, capacity, notes, status: "active" }]);
      if (error) throw error;
      await loadRooms();
    } catch (err) {
      console.error(err);
      roomsTableAvailable = false;
      roomsData.push({ id: crypto.randomUUID(), name, capacity, notes, status: "active" });
      persistLocalRooms();
    }
  } else {
    roomsData.push({ id: crypto.randomUUID(), name, capacity, notes, status: "active" });
    persistLocalRooms();
  }
  nameInput.value = ""; if (capInput) capInput.value = ""; if (notesInput) notesInput.value = "";
  renderRoomManagement();
};
window.setRoomStatus = async function (identifier, status) {
  if (roomsTableAvailable) {
    try { const { error } = await db.from("rooms").update({ status }).eq("id", identifier); if (error) throw error; await loadRooms(); }
    catch (err) { console.error(err); }
  } else {
    const r = roomsData.find(r => r.id === identifier); if (r) { r.status = status; persistLocalRooms(); }
  }
  renderRoomManagement();
};
window.deleteRoom = async function (identifier, name) {
  if (!confirm(`Remove "${name}" from the room list? (Classes already scheduled in this room are not affected.)`)) return;
  if (roomsTableAvailable) {
    try { const { error } = await db.from("rooms").delete().eq("id", identifier); if (error) throw error; await loadRooms(); }
    catch (err) { console.error(err); }
  } else {
    roomsData = roomsData.filter(r => r.id !== identifier); persistLocalRooms();
  }
  renderRoomManagement();
};

// ==========================================
// SMART ROOM PICKER (searchable + availability-aware dropdown)
// Used wherever a room needs to be entered: the section editor grid and the
// simplified "Add Class Entry" popup.
// ==========================================
function closeRoomPickerDropdown() { document.querySelectorAll(".room-picker-dropdown").forEach(d => d.remove()); }
function wireRoomPicker(input, getContext) {
  if (!input) return;
  input.setAttribute("autocomplete", "off");
  input.addEventListener("focus", () => showRoomPickerDropdown(input, getContext));
  input.addEventListener("input", () => showRoomPickerDropdown(input, getContext));
  input.addEventListener("blur", () => setTimeout(closeRoomPickerDropdown, 150));
}
function showRoomPickerDropdown(input, getContext) {
  closeRoomPickerDropdown();
  const { dayIdx, slotStr, excludeIdentifier } = getContext();
  const range = getSlotRangeMinutes(slotStr);
  const query = input.value.trim().toLowerCase();
  const dropdown = document.createElement("div");
  dropdown.className = "chrome-dropdown active room-picker-dropdown";
  dropdown.style.cssText = "position:fixed; z-index:10600; max-height:220px; overflow-y:auto;";
  if (!range) {
    dropdown.innerHTML = `<div class="dropdown-item" style="opacity:0.6; cursor:default;">Set a valid day &amp; time first</div>`;
  } else {
    let results = getRoomAvailability(dayIdx, range.startMin, range.endMin, excludeIdentifier);
    if (query) results = results.filter(r => r.name.toLowerCase().includes(query));
    results.sort((a, b) => (a.available === b.available) ? a.name.localeCompare(b.name) : (a.available ? -1 : 1));
    dropdown.innerHTML = results.length ? results.slice(0, 30).map(r => r.available
      ? `<div class="dropdown-item room-picker-option" data-room="${r.name.replace(/"/g, '&quot;')}"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d='M20 6L9 17l-5-5'/></svg>&nbsp;<span>${r.name.toUpperCase()}</span></div>`
      : `<div class="dropdown-item room-picker-option occupied" title="Occupied by ${r.conflict.sectionCode} (${r.conflict.subject}) ${r.conflict.slotDisplay}"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d='M18 6L6 18M6 6l12 12'/></svg>&nbsp;<span>${r.name.toUpperCase()}</span>&nbsp;<small style="opacity:0.75;">— ${r.conflict.sectionCode}</small></div>`
    ).join('') : `<div class="dropdown-item" style="opacity:0.6; cursor:default;">No matching rooms — try Manage Rooms to add one</div>`;
  }
  const rect = input.getBoundingClientRect();
  dropdown.style.left = rect.left + "px";
  dropdown.style.top = (rect.bottom + 2) + "px";
  dropdown.style.width = Math.max(rect.width, 190) + "px";
  document.body.appendChild(dropdown);
  dropdown.querySelectorAll(".room-picker-option:not(.occupied)").forEach(opt => {
    opt.addEventListener("mousedown", e => {
      e.preventDefault();
      input.value = opt.dataset.room;
      closeRoomPickerDropdown();
      input.dispatchEvent(new Event("change"));
    });
  });
}

// ==========================================
// NAVIGATION, CONTEXTUAL HAMBURGER + BOTTOM NAV
// ==========================================
window.setView = function (viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(viewId)?.classList.add("active");
  document.getElementById("hamburger-menu")?.classList.remove("active");

  if (viewId === "teacher-view") checkTeacherAuth();
  else if (viewId === "student-view") checkStudentAuth();
  else if (viewId === "admin-view") checkAdminAuth();

  updateNotificationButtons();
  renderBottomNav(viewId);
  updateHamburgerContext(viewId);
};

window.toggleHamburger = function (e) {
  if (e?.stopPropagation) e.stopPropagation();
  document.getElementById("hamburger-menu")?.classList.toggle("active");
};

function updateHamburgerContext(viewId) {
  const studentLoggedIn = viewId === "student-view" && !!localStorage.getItem("aics_student_section") && !isViewingAllSections;
  const teacherLoggedIn = viewId === "teacher-view" && !!localStorage.getItem("aics_teacher_name");
  const adminLoggedIn = viewId === "admin-view" && localStorage.getItem("aics_admin_logged_in") === "true";
  const loggedInSomewhere = studentLoggedIn || teacherLoggedIn || adminLoggedIn;

  document.querySelectorAll(".portal-switch-item").forEach(el => { el.style.display = loggedInSomewhere ? "none" : ""; });

  const reportItem = document.getElementById("report-nav-btn");
  if (reportItem) reportItem.style.display = adminLoggedIn ? "none" : (loggedInSomewhere ? "flex" : "none");

  const notifItem = document.getElementById("notif-nav-btn");
  if (notifItem) notifItem.style.display = (studentLoggedIn || teacherLoggedIn || adminLoggedIn) ? "flex" : "none";

  const logoutBtn = document.getElementById("context-logout-btn");
  const logoutDivider = document.getElementById("logout-divider");
  if (logoutBtn && logoutDivider) {
    if (loggedInSomewhere) {
      logoutBtn.style.display = "flex";
      logoutDivider.style.display = "block";
      logoutBtn.onclick = studentLoggedIn ? logoutStudent : teacherLoggedIn ? logoutTeacher : logoutAdmin;
    } else {
      logoutBtn.style.display = "none";
      logoutDivider.style.display = "none";
    }
  }
}

function renderBottomNav(viewId) {
  const container = document.getElementById("bottom-nav-container");
  if (!container) return;
  const studentActive = viewId === "student-view" && !!localStorage.getItem("aics_student_section") && !isViewingAllSections;
  const teacherActive = viewId === "teacher-view" && !!localStorage.getItem("aics_teacher_name");

  if (studentActive) {
    container.innerHTML = `<nav class="bottom-nav" style="display:flex;">
      <button class="bottom-nav-item ${studentSubpanel === 'home' ? 'active' : ''}" onclick="setStudentSubpanel('home')"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d='M3 11l9-8 9 8'/><path d='M5 10v10h14V10'/></svg><br>Home</button>
      <button class="bottom-nav-item ${studentSubpanel === 'section' ? 'active' : ''}" onclick="setStudentSubpanel('section')"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d='M2 9l10-5 10 5-10 5-10-5z'/><path d='M6 11.5V17c0 1.5 2.5 3 6 3s6-1.5 6-3v-5.5'/></svg><br>Section</button>
      <button class="bottom-nav-item ${studentSubpanel === 'profile' ? 'active' : ''}" onclick="setStudentSubpanel('profile')"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx='12' cy='8' r='4'/><path d='M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8'/></svg><br>Profile</button>
    </nav>`;
  } else if (teacherActive) {
    container.innerHTML = `<nav class="bottom-nav" style="display:flex;"><button class="bottom-nav-item active"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx='12' cy='8' r='4'/><path d='M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8'/></svg><br>Schedule</button></nav>`;
  } else {
    container.innerHTML = `<nav class="bottom-nav" style="display:flex;">
      <button class="bottom-nav-item ${viewId === 'home-view' ? 'active' : ''}" onclick="setView('home-view')"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d='M3 11l9-8 9 8'/><path d='M5 10v10h14V10'/></svg><br>Home</button>
      <button class="bottom-nav-item ${viewId === 'student-view' ? 'active' : ''}" onclick="openStudentLogin()"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d='M2 9l10-5 10 5-10 5-10-5z'/><path d='M6 11.5V17c0 1.5 2.5 3 6 3s6-1.5 6-3v-5.5'/></svg><br>Student</button>
      <button class="bottom-nav-item ${viewId === 'teacher-view' ? 'active' : ''}" onclick="openTeacherLogin()"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx='12' cy='8' r='4'/><path d='M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8'/></svg><br>Teacher</button>
      <button class="bottom-nav-item ${viewId === 'admin-view' ? 'active' : ''}" onclick="openAdminModal()"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx='12' cy='12' r='3'/><path d='M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1A1.7 1.7 0 004.6 9a1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9c.4.4.9.7 1.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z'/></svg><br>Admin</button>
    </nav>`;
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
  updateHamburgerContext("student-view");
}

window.openStudentLogin = function () { isViewingAllSections = false; studentSubpanel = "home"; window.setView("student-view"); };
window.viewAllSections = function () { isViewingAllSections = true; window.setView("student-view"); };
window.submitStudentLogin = function () {
  const input = document.getElementById("student-section-input");
  if (!input?.value.trim()) { alert("Please enter a valid section code."); return; }
  localStorage.setItem("aics_student_section", input.value.trim());
  isViewingAllSections = false; studentSubpanel = "home";
  checkStudentAuth();
  updateHamburgerContext("student-view");
  if (localStorage.getItem("aics_notifications_enabled") === "true") {
    const t = localStorage.getItem("aics_fcm_token");
    if (t) saveDeviceTokenToSupabase(t);
  }
};
window.logoutStudent = function () {
  localStorage.removeItem("aics_student_section");
  const si = document.getElementById("student-search-input"); if (si) si.value = "";
  isViewingAllSections = false;
  window.setView("home-view");
};

// A class that runs for several hours is stored as one grid row per hour
// (see commitClassEntry), all with the same subject/teacher/room. Anything
// that lists "today's classes" or counts down to the "next class" needs to
// treat a run of back-to-back identical rows as ONE class, not one per hour
// — otherwise the countdown/next-class card re-fires for the same class at
// every hour boundary, and today's list shows it duplicated hour by hour.
function mergeConsecutiveClassItems(items) {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin);
  const merged = [];
  sorted.forEach(it => {
    const last = merged[merged.length - 1];
    const sameClass = last && it.startMin === last.endMin &&
      (it.section || "") === (last.section || "") &&
      (it.subject || it.name || "").trim().toLowerCase() === (last.subject || last.name || "").trim().toLowerCase() &&
      (it.professor || "").trim().toLowerCase() === (last.professor || "").trim().toLowerCase() &&
      (it.room || "").trim().toLowerCase() === (last.room || "").trim().toLowerCase();
    if (sameClass) last.endMin = it.endMin;
    else merged.push({ ...it });
  });
  merged.forEach(m => { m.timeDisplay = `${minutesToDisplay12(m.startMin)} - ${minutesToDisplay12(m.endMin)}`; });
  return merged;
}

function renderStudentTodayList() {
  const container = document.getElementById("student-today-list");
  if (!container) return;
  const savedSection = localStorage.getItem("aics_student_section");
  const sec = sectionsData.find(s => s.code?.toLowerCase() === savedSection?.toLowerCase());
  if (!sec?.cells || !sec.slots) { container.innerHTML = `<div class="next-class-empty">No schedule loaded.</div>`; return; }
  const dayIdx = getManilaCellDayIndex();
  if (dayIdx === null) { container.innerHTML = `<div class="next-class-empty">No classes today</div>`; return; }

  const rawItems = [];
  Object.keys(sec.cells).forEach(key => {
    const [rStr, cStr] = key.split("-"); // row = slot index, col = day index
    if (parseInt(cStr, 10) !== dayIdx) return;
    const cell = sec.cells[key];
    const range = getSlotRangeMinutes(sec.slots[parseInt(rStr, 10)]);
    if (!range || !cell) return;
    rawItems.push({ ...cell, startMin: range.startMin, endMin: range.endMin });
  });
  if (!rawItems.length) { container.innerHTML = `<div class="next-class-empty">No classes today</div>`; return; }
  const items = mergeConsecutiveClassItems(rawItems);
  const minutesNow = getManilaMinutesNow();

  container.innerHTML = items.map(it => {
    let status = "upcoming", label = '<span class="status-dot upcoming"></span>Upcoming';
    if (minutesNow >= it.startMin && minutesNow < it.endMin) { status = "ongoing"; label = '<span class="status-dot ongoing"></span>Ongoing'; }
    else if (minutesNow >= it.endMin) { status = "completed"; label = '<span class="status-dot completed"></span>Completed'; }
    return `<div class="today-overview-item"><div><strong>${it.subject || it.name}</strong><br><span style="font-size:0.8rem; color:var(--text-muted);"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx='12' cy='12' r='9'/><path d='M12 7v5l3 3'/></svg> ${it.timeDisplay} • <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d='M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z'/><circle cx='12' cy='9' r='2.5'/></svg> ${displayRoom(it.room, dayIdx)} • <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx='12' cy='8' r='4'/><path d='M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8'/></svg> ${it.professor || '—'}</span></div><span class="status-pill ${status}">${label}</span></div>`;
  }).join('');
}
function renderStudentProfile() {
  const section = localStorage.getItem("aics_student_section") || "--";
  const alertsOn = localStorage.getItem("aics_notifications_enabled") === "true";
  const sv = document.getElementById("profile-section-value"), av = document.getElementById("profile-alerts-value");
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
    gateCard.style.display = "none"; mainContent.style.display = "block";
    document.getElementById("active-teacher-badge").textContent = `Faculty: ${savedTeacher}`;
    renderTeacherSchedule(); renderTeacherNextClassCard();
    renderAnnouncementBanner("teacher-announcements-container", "teacher", savedTeacher);
    refreshNotificationBadge();
  } else if (gateCard && mainContent) {
    gateCard.style.display = "block"; mainContent.style.display = "none";
  }
  updateNotificationButtons();
  renderBottomNav("teacher-view");
  updateHamburgerContext("teacher-view");
}
window.openTeacherLogin = function () { window.setView("teacher-view"); };
window.submitTeacherLogin = function () {
  const select = document.getElementById("teacher-name-select-gate");
  if (!select?.value) { alert("Please select your faculty profile."); return; }
  localStorage.setItem("aics_teacher_name", select.value);
  checkTeacherAuth();
  updateHamburgerContext("teacher-view");
  if (localStorage.getItem("aics_notifications_enabled") === "true") {
    const t = localStorage.getItem("aics_fcm_token");
    if (t) saveDeviceTokenToSupabase(t);
  }
};
window.logoutTeacher = function () { localStorage.removeItem("aics_teacher_name"); window.setView("home-view"); };

// ==========================================
// ADMIN PORTAL
// ==========================================
window.openAdminModal = function () { window.setView("admin-view"); };
function checkAdminAuth() {
  const isAdmin = localStorage.getItem("aics_admin_logged_in") === "true";
  const gateCard = document.getElementById("admin-gate-card");
  const mainContent = document.getElementById("admin-main-content");
  if (isAdmin && gateCard && mainContent) {
    gateCard.style.display = "none"; mainContent.style.display = "block";
    renderAdminSections(); renderAdminDashboard();
    refreshNotificationBadge();
  } else if (gateCard && mainContent) {
    gateCard.style.display = "block"; mainContent.style.display = "none";
  }
  renderBottomNav("admin-view");
  updateHamburgerContext("admin-view");
}
window.submitAdminViewLogin = function () {
  const p = document.getElementById("admin-view-pass-input");
  if (!p?.value.trim()) { alert("Please enter the admin passcode."); return; }
  localStorage.setItem("aics_admin_logged_in", "true"); p.value = "";
  checkAdminAuth();
  updateHamburgerContext("admin-view");
};
window.logoutAdmin = function () { localStorage.removeItem("aics_admin_logged_in"); window.setView("home-view"); };

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
  let list = (allSections?.length > 0) ? allSections : sectionsData;
  if (searchVal) list = list.filter(s => (s.code || "").toLowerCase().includes(searchVal) || (s.title || "").toLowerCase().includes(searchVal));
  if (!list?.length) { container.innerHTML = '<p style="color:var(--text-muted); padding:12px;">No sections found.</p>'; return; }
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
    document.getElementById("new-section-code").value = ""; document.getElementById("new-section-title").value = "";
    closeAddSectionModal();
    await window.loadSchedules();
    // Jump straight into the editor with the guided "Add Class Entry" popup
    // open, so the admin's flow is: Add Section -> Day -> Time -> Subject ->
    // Available Room -> Save, without extra manual navigation.
    editSection(newSec.id);
    openAddClassEntryModal();
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
  const modal = document.getElementById("admin-edit-section-modal");
  const excludeIdentifier = modal?.dataset.sectionIdentifier;
  const currentSession = document.getElementById("edit-sec-session")?.value || "MORNING";
  const rows = tbody.querySelectorAll("tr");
  let lastSlotVal = "";
  if (rows.length > 0) { const li = rows[rows.length - 1].querySelector(".edit-slot-input"); if (li?.value.trim()) lastSlotVal = li.value.trim(); }
  const nextSlot = getNextTimeSlot(lastSlotVal, currentSession);
  const tr = document.createElement("tr");
  let html = `<td style="background:var(--card-bg); padding:4px; border:1px solid var(--border-color); width:130px; min-width:130px;">
    <input type="text" class="edit-slot-input" value="${nextSlot}" style="width:100%; border:none; background:transparent; font-weight:800; color:var(--text-main); font-size:0.8rem; text-align:center; outline:none; box-sizing:border-box;"></td>`;
  DAYS.forEach((d, c) => {
    const bg = c === 4 ? 'background:var(--table-odl-bg);' : 'background:var(--card-bg);';
    html += `<td class="edit-day-cell" style="${bg} border:1px solid var(--border-color); padding:4px; vertical-align:top; min-width:140px;">
      <input type="text" class="edit-sub-input" placeholder="Sub Code" style="width:100%; border:none; background:transparent; font-weight:bold; color:var(--text-main); font-size:0.75rem; text-align:center; padding:1px 0; outline:none; box-sizing:border-box;">
      <input type="text" class="edit-prof-input" list="editor-teacher-suggestions" placeholder="Teacher" style="width:100%; border:none; background:transparent; color:var(--text-muted); font-size:0.7rem; text-align:center; padding:1px 0; outline:none; box-sizing:border-box;">
      <input type="text" class="edit-room-input" placeholder="Search room..." autocomplete="off" style="width:100%; border:none; background:transparent; color:var(--primary); font-size:0.68rem; font-weight:600; text-align:center; padding:1px 0; outline:none; box-sizing:border-box;">
    </td>`;
  });
  html += `<td style="background:var(--card-bg); border:1px solid var(--border-color); text-align:center; vertical-align:middle; padding:2px; min-width:44px;">
    <button type="button" onclick="deleteEditorRow(this)" style="background:var(--danger); color:#fff; border:none; width:24px; height:24px; border-radius:4px; font-weight:bold; cursor:pointer;">&times;</button></td>`;
  tr.innerHTML = html; tbody.appendChild(tr);
  wireRowRoomPickers(tr, excludeIdentifier);
  return tr;
};
window.deleteEditorRow = function (btn) { btn.closest("tr")?.remove(); };
// Attaches the smart room picker to every room field in a row, reading that
// row's own time slot and column's day index live (so it always reflects
// whatever is currently typed, without needing to be rewired on edit).
function wireRowRoomPickers(tr, excludeIdentifier) {
  const slotInput = tr.querySelector(".edit-slot-input");
  tr.querySelectorAll(".edit-day-cell").forEach((cell, c) => {
    const roomInput = cell.querySelector(".edit-room-input");
    wireRoomPicker(roomInput, () => ({ dayIdx: c, slotStr: slotInput?.value || "", excludeIdentifier }));
    wireTeacherSuggestion(cell.querySelector(".edit-sub-input"), cell.querySelector(".edit-prof-input"), "editor-teacher-suggestions");
  });
}
// ---- Smart teacher suggestion ----
// Looks at every class already saved anywhere in the schedule and remembers
// which teacher(s) usually hold a given subject code, so typing a subject
// code can suggest (and auto-fill, if the teacher field is still empty) the
// teacher who most often teaches it. `suggestionsListId` points at a
// <datalist> so the admin can still pick a different teacher from a dropdown
// if more than one has taught that subject before.
function getTeacherSuggestionsForSubject(subjectCodeRaw) {
  const code = (subjectCodeRaw || "").trim().toUpperCase();
  if (!code) return [];
  const counts = {};
  sectionsData.forEach(sec => Object.values(sec.cells || {}).forEach(cell => {
    if (!cell) return;
    const subj = (cell.subject || cell.name || "").trim();
    if (!subj) return;
    const subjCode = subj.split(" - ")[0].trim().toUpperCase();
    if (subjCode !== code) return;
    const prof = (cell.professor || "").trim();
    if (!prof) return;
    counts[prof] = (counts[prof] || 0) + 1;
  }));
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name]) => name);
}
function wireTeacherSuggestion(subjectInput, teacherInput, suggestionsListId) {
  if (!subjectInput || !teacherInput) return;
  subjectInput.addEventListener("input", () => {
    const suggestions = getTeacherSuggestionsForSubject(subjectInput.value);
    const dl = document.getElementById(suggestionsListId);
    if (dl) dl.innerHTML = suggestions.map(n => `<option value="${n.replace(/"/g, '&quot;')}"></option>`).join("");
    if (suggestions.length && !teacherInput.value.trim()) teacherInput.value = suggestions[0];
  });
}

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
        <input type="text" class="edit-prof-input" list="editor-teacher-suggestions" placeholder="Teacher" value="${cell.professor || ''}" style="width:100%; border:none; background:transparent; color:var(--text-muted); font-size:0.7rem; text-align:center; padding:1px 0; outline:none; box-sizing:border-box;">
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
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button type="button" class="btn-primary" onclick="openAddClassEntryModal()" style="padding:7px 14px; font-size:0.85rem;"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d='M12 5v14M5 12h14'/></svg> Add Class Entry</button>
          <button type="button" class="btn-success" onclick="addEditorRow()" style="padding:7px 14px; font-size:0.85rem;">+ Add Row (Manual)</button>
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
      <datalist id="editor-teacher-suggestions"></datalist>
      <div style="background:var(--header-bar-bg); color:#ffffff; padding:15px; text-align:center; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div style="font-weight:800; font-size:1.1rem;">${sec.code || 'SECTION'} - ${currentSession} SESSION</div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn-secondary" onclick="openExportScheduleModal('section', '${sec.id || sec.code}')">Export as Image</button>
          <button class="btn-secondary" onclick="document.getElementById('admin-edit-section-modal').remove()">Cancel</button>
          <button class="btn-primary" onclick="saveSectionChanges('${sec.id || sec.code}')">Save Changes</button>
        </div>
      </div>
    </div>`;
  modal.dataset.sectionIdentifier = String(sec.id || sec.code);
  document.body.appendChild(modal);
  modal.querySelectorAll("#admin-edit-table-body tr").forEach(tr => wireRowRoomPickers(tr, modal.dataset.sectionIdentifier));
};

// ---- Conflict detection (with dedupe) ----
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
  const seenRoom = new Set(), seenTeacher = new Set(), seenSection = new Set();
  for (let i = 0; i < bookings.length; i++) {
    for (let j = i + 1; j < bookings.length; j++) {
      const a = bookings[i], b = bookings[j];
      if (a.dayIdx !== b.dayIdx || !timesOverlap(a, b)) continue;
      // Same section double-booked into two overlapping time blocks on the
      // same day (e.g. two different rows both filled for Monday that
      // overlap) — students in that section can't be in two classes at once.
      if (a.sectionCode === b.sectionCode) {
        const key = [a.sectionCode, a.dayIdx, a.startMin, b.startMin].sort().join('|');
        if (!seenSection.has(key)) {
          seenSection.add(key);
          conflicts.push({ type: "section", message: `Section Schedule Conflict\n${a.sectionCode} has two overlapping classes on ${DAYS_CLEAN[a.dayIdx]}: ${a.subject} (${a.slotDisplay}) and ${b.subject} (${b.slotDisplay}).` });
        }
        continue;
      }
      if (a.room && b.room && a.room === b.room && a.room !== "tba" && a.room !== "online") {
        const key = [a.sectionCode, b.sectionCode, a.dayIdx, a.room, a.startMin, b.startMin].sort().join('|');
        if (!seenRoom.has(key)) {
          seenRoom.add(key);
          conflicts.push({ type: "room", message: `Room Conflict\nRoom ${a.room.toUpperCase()} — ${a.sectionCode} (${a.subject}, ${a.slotDisplay}) overlaps ${b.sectionCode} (${b.subject}, ${b.slotDisplay}) on ${DAYS_CLEAN[a.dayIdx]}.` });
        }
      }
      if (a.professor && b.professor && a.professor === b.professor) {
        const key = [a.sectionCode, b.sectionCode, a.dayIdx, a.professor, a.startMin, b.startMin].sort().join('|');
        if (!seenTeacher.has(key)) {
          seenTeacher.add(key);
          conflicts.push({ type: "teacher", message: `Teacher Conflict\n${a.professor.replace(/\b\w/g, c => c.toUpperCase())} — ${a.sectionCode} (${a.subject}, ${a.slotDisplay}) overlaps ${b.sectionCode} (${b.subject}, ${b.slotDisplay}) on ${DAYS_CLEAN[a.dayIdx]}.` });
        }
      }
    }
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
    if (seen[fp]) dups.push(`Duplicate Schedule\n${cell.subject || cell.name} appears twice on ${DAYS_CLEAN[dayIdx]} at the same time and room.`);
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
        notifStudent: `New Class Added\n${newCell.subject || newCell.name} added on ${dayName} at ${newTime}, Room ${newCell.room || "TBA"}.`,
        notifTeacher: newCell.professor ? { teacher: newCell.professor, message: `New Class Assigned\nYou've been assigned ${sectionCode} - ${newCell.subject || newCell.name} on ${dayName} at ${newTime}, Room ${newCell.room || "TBA"}.` } : null });
    } else if (oldCell && !newCell) {
      diffs.push({ key, action: "deleted", oldData: oldCell, newData: null,
        notifStudent: `Class Removed\n${oldCell.subject || oldCell.name} on ${dayName} at ${oldTime} has been removed.`,
        notifTeacher: oldCell.professor ? { teacher: oldCell.professor, message: `Class Removed\nYour ${sectionCode} - ${oldCell.subject || oldCell.name} class on ${dayName} at ${oldTime} has been removed.` } : null });
    } else if (oldCell && newCell) {
      const changes = [];
      if ((oldCell.room || "") !== (newCell.room || "")) changes.push(`Room: ${oldCell.room || "TBA"} → ${newCell.room || "TBA"}`);
      if ((oldCell.professor || "") !== (newCell.professor || "")) changes.push(`Teacher: ${oldCell.professor || "—"} → ${newCell.professor || "—"}`);
      if ((oldCell.subject || oldCell.name || "") !== (newCell.subject || newCell.name || "")) changes.push(`Subject: ${oldCell.subject || oldCell.name} → ${newCell.subject || newCell.name}`);
      if (oldTime !== newTime) changes.push(`Time: ${oldTime} → ${newTime}`);
      if (changes.length > 0) {
        const label = newCell.subject || newCell.name || "Class";
        diffs.push({ key, action: "updated", oldData: oldCell, newData: newCell,
          notifStudent: `Schedule Updated\nYour ${label} class has been updated.\n${changes.join('\n')}`,
          notifTeacher: (oldCell.professor || newCell.professor) ? { teacher: newCell.professor || oldCell.professor, message: `Teaching Schedule Updated\nYour ${sectionCode} - ${label} class has been updated.\n${changes.join('\n')}` } : null });
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
  const timeMap = {}; let hasClasses = false;
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
      if (items?.length) { html += '<td class="class-cell">'; items.forEach(item => html += `<div class="cell-code">${item.subject}</div><div class="cell-name">Sec: ${item.section} (${item.room})</div>`); html += '</td>'; }
      else html += '<td class="class-cell"><div class="cell-empty">-</div></td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table></div><div class="schedule-swipe-hint">← Swipe to see other days →</div></div>';
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
    const exportBtn = document.createElement("button");
    exportBtn.className = "btn-secondary";
    exportBtn.style.cssText = "padding:5px 10px; font-size:0.72rem; flex-shrink:0;";
    exportBtn.title = "Export this schedule as an image";
    exportBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`;
    exportBtn.addEventListener("click", (e) => { e.stopPropagation(); window.openExportScheduleModal("section", sec.id || sec.code); });
    header.appendChild(exportBtn);
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
    const swipeHint = document.createElement("div");
    swipeHint.className = "schedule-swipe-hint";
    swipeHint.textContent = "← Swipe to see other days →";
    card.appendChild(header); card.appendChild(tableDiv); card.appendChild(swipeHint);
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
  if (dayIdx === null) { container.innerHTML = `<div class="next-class-empty">No classes scheduled today</div>`; return; }
  const minutesNow = getManilaMinutesNow();
  const rawItems = [];
  Object.keys(sec.cells).forEach(key => {
    const [rStr, cStr] = key.split("-"); // row = slot index, col = day index
    if (parseInt(cStr, 10) !== dayIdx) return;
    const range = getSlotRangeMinutes(sec.slots[parseInt(rStr, 10)]);
    if (!range) return;
    rawItems.push({ ...sec.cells[key], startMin: range.startMin, endMin: range.endMin });
  });
  // Merge multi-hour classes into one block first, so a class already in
  // progress isn't mistaken for a fresh "upcoming" class at its next hour.
  const merged = mergeConsecutiveClassItems(rawItems);
  let best = null;
  merged.forEach(it => {
    const diff = it.startMin - minutesNow;
    if (diff < 0) return; // already started (or finished) — not "next"
    if (!best || diff < best.diff) best = { diff, cell: it, timeDisplay: it.timeDisplay };
  });
  if (!best) { container.innerHTML = `<div class="next-class-empty">No more classes today</div>`; return; }
  const h = Math.floor(best.diff / 60), m = best.diff % 60;
  container.innerHTML = `<div class="next-class-card"><div class="next-class-eyebrow">Next Class</div>
    <div class="next-class-subject">${best.cell.subject || best.cell.name || "—"}</div>
    <div class="next-class-meta"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx='12' cy='12' r='9'/><path d='M12 7v5l3 3'/></svg> ${best.timeDisplay} &nbsp;•&nbsp; <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d='M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z'/><circle cx='12' cy='9' r='2.5'/></svg> ${displayRoom(best.cell.room, dayIdx)} &nbsp;•&nbsp; <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx='12' cy='8' r='4'/><path d='M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8'/></svg> ${best.cell.professor || "—"}</div>
    <div class="next-class-countdown">Starts in <span class="num">${h > 0 ? `${h}h ${m}m` : `${m}m`}</span></div></div>`;
}
function renderTeacherNextClassCard() {
  const container = document.getElementById("teacher-next-class-container");
  if (!container) return;
  const selectedTeacher = localStorage.getItem("aics_teacher_name") || "";
  if (!selectedTeacher) { container.innerHTML = ""; return; }
  const dayIdx = getManilaCellDayIndex();
  if (dayIdx === null) { container.innerHTML = `<div class="next-class-empty">No classes scheduled today</div>`; return; }
  const minutesNow = getManilaMinutesNow();
  let best = null;
  sectionsData.forEach(sec => {
    if (!sec.cells || !sec.slots) return;
    const rawItems = [];
    Object.keys(sec.cells).forEach(key => {
      const [rStr, cStr] = key.split("-"); // row = slot index, col = day index
      if (parseInt(cStr, 10) !== dayIdx) return;
      const cell = sec.cells[key];
      if (cell.professor?.trim().toLowerCase() !== selectedTeacher.toLowerCase()) return;
      const range = getSlotRangeMinutes(sec.slots[parseInt(rStr, 10)]);
      if (!range) return;
      rawItems.push({ ...cell, startMin: range.startMin, endMin: range.endMin, section: sec.code || sec.title });
    });
    // Merge multi-hour classes into one block first, so a class already in
    // progress isn't mistaken for a fresh "upcoming" class at its next hour.
    mergeConsecutiveClassItems(rawItems).forEach(it => {
      const diff = it.startMin - minutesNow;
      if (diff < 0) return; // already started (or finished) — not "next"
      if (!best || diff < best.diff) best = { diff, cell: it, timeDisplay: it.timeDisplay, section: it.section };
    });
  });
  if (!best) { container.innerHTML = `<div class="next-class-empty">No more classes today</div>`; return; }
  const h = Math.floor(best.diff / 60), m = best.diff % 60;
  container.innerHTML = `<div class="next-class-card"><div class="next-class-eyebrow">Next Class</div>
    <div class="next-class-subject">${best.cell.subject || best.cell.name || "—"}</div>
    <div class="next-class-meta"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx='12' cy='12' r='9'/><path d='M12 7v5l3 3'/></svg> ${best.timeDisplay} &nbsp;•&nbsp; <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d='M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z'/><circle cx='12' cy='9' r='2.5'/></svg> ${displayRoom(best.cell.room, dayIdx)} &nbsp;•&nbsp; <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d='M20.6 12.4L12.6 4.4a2 2 0 00-1.4-.6H5a2 2 0 00-2 2v6.2a2 2 0 00.6 1.4l8 8a2 2 0 002.8 0l6.2-6.2a2 2 0 000-2.8z'/><path d='M7.5 7.5h.01'/></svg> Sec: ${best.section}</div>
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
      updateNotificationButtons(); renderStudentProfile();
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
  const bellIcon = "<svg class=\"icon\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path d='M6 8a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6'/><path d='M10 20a2 2 0 004 0'/></svg>";
  const bellOffIcon = "<svg class=\"icon\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path d='M6 8a6 6 0 0110.7-3.7M18 8c0 5 2 6 2 6H8m-4 0s1.4-.7 1.9-3.4'/><path d='M10 20a2 2 0 004 0'/><path d='M2 2l20 20'/></svg>";
  document.querySelectorAll("#student-notify-btn, #teacher-notify-btn, #profile-notify-btn, .enable-alerts-btn").forEach(btn => {
    if (isEnabled) { btn.innerHTML = bellIcon + " Phone Alerts Active"; btn.classList.add("active"); }
    else { btn.innerHTML = bellOffIcon + " Enable Phone Alerts"; btn.classList.remove("active"); }
  });
}

// ==========================================
// REPORTS — routed into Admin's own Notification Center
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
    const { data: inserted, error } = await db.from("room_reports")
      .insert([{ section_code: section || null, room: room || issueType, day: day || null, time_slot: slot || null, details: `[${issueType}] ${details}`, status: "submitted", is_read: false }])
      .select().single();
    if (error) { alert("Failed to submit report: " + error.message); return; }

    await db.from("notifications").insert([{
      recipient_type: "admin", recipient_value: "admin",
      title: "New Report Received",
      message: `${section || 'Unknown section'} reported: [${issueType}] ${details}${room ? `\nRoom: ${room}` : ''}${day ? `\nDay: ${day}` : ''}${slot ? `\nTime: ${slot}` : ''}`,
      notif_type: "report", related_id: inserted?.id || null, is_read: false
    }]);

    alert("Report submitted! Admin has been notified.");
    closeReportModal();
    ["report-room-input","report-day-select","report-slot-input","report-details-input"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  } catch (err) { console.error(err); alert("Error submitting report."); }
};
window.updateReportStatus = async function (id, newStatus) {
  try { const { error } = await db.from("room_reports").update({ status: newStatus }).eq("id", id); if (error) alert("Failed: " + error.message); } catch (err) { console.error(err); }
};

// ==========================================
// ANNOUNCEMENTS — now push in-app + FCM to the right audience
// ==========================================
window.openAnnouncementModal = function () {
  // "End Date" is optional, so a banner with it left blank never expires —
  // which is why old test announcements can end up stuck on screen forever.
  // Pre-filling a sensible default (today + 7 days) means an admin has to
  // deliberately clear it to make something permanent, instead of an expiry
  // being missed by accident. Only fills it in if it's currently empty, so
  // it won't clobber a value you're already editing.
  const endInput = document.getElementById("ann-end-date");
  if (endInput && !endInput.value) {
    const d = new Date(); d.setDate(d.getDate() + 7);
    endInput.value = d.toISOString().slice(0, 10);
  }
  document.getElementById("announcement-modal-overlay").classList.add("open");
};
window.closeAnnouncementModal = function () { document.getElementById("announcement-modal-overlay").classList.remove("open"); };
window.openAnnouncementsListModal = function () { renderAdminAnnouncements(); document.getElementById("announcements-list-modal-overlay").classList.add("open"); };
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
    const { error } = await db.from("announcements").insert([{
      title, content, type, priority, target_type: targetType,
      target_value: targetType === "all" ? null : targetValue,
      start_date: startDate, end_date: endDate, created_by: "admin"
    }]);
    // The Supabase trigger (on_announcement_created) handles the FCM push
    // automatically once this row is inserted — no client call needed here.
    if (error) { alert("Failed: " + error.message); return; }

    // In-app notification: "all" broadcasts to every section AND every
    // teacher via recipient_value = 'ALL'; targeted announcements go
    // straight to that one section or teacher.
    const notifTitle = `${title}`;
    if (targetType === "all") {
      await db.from("notifications").insert([
        { recipient_type: "section", recipient_value: "ALL", title: notifTitle, message: content, notif_type: "announcement", is_read: false },
        { recipient_type: "teacher", recipient_value: "ALL", title: notifTitle, message: content, notif_type: "announcement", is_read: false }
      ]);
    } else {
      await db.from("notifications").insert([{
        recipient_type: targetType, recipient_value: targetValue,
        title: notifTitle, message: content, notif_type: "announcement", is_read: false
      }]);
    }

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
    container.innerHTML = active.map(a => `<div class="announcement-banner ${a.priority}"><div class="announcement-banner-title"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d='M3 11v2a2 2 0 002 2h1l3 5V4L6 9H5a2 2 0 00-2 2z'/><path d='M13 6a4 4 0 010 12M17 4a8 8 0 010 16'/></svg> ${a.title}</div><div class="announcement-banner-content">${a.content}</div></div>`).join('');
  } catch (err) { container.innerHTML = ""; }
}

// ==========================================
// NOTIFICATION CENTER — includes 'admin' identity for reports,
// and broadcast ('ALL') rows for announcements sent to everyone.
// ==========================================
function getCurrentNotifIdentity() {
  const activeView = document.querySelector(".view.active")?.id;
  if (activeView === "teacher-view") { const t = localStorage.getItem("aics_teacher_name"); return t ? { type: "teacher", value: t } : null; }
  if (activeView === "admin-view" && localStorage.getItem("aics_admin_logged_in") === "true") return { type: "admin", value: "admin" };
  const s = localStorage.getItem("aics_student_section");
  return s ? { type: "section", value: s } : null;
}
window.openNotificationCenter = async function () {
  const identity = getCurrentNotifIdentity();
  const overlay = document.getElementById("notif-center-overlay");
  const list = document.getElementById("notif-center-list");
  document.getElementById("hamburger-menu")?.classList.remove("active");
  if (!identity) { list.innerHTML = `<div class="notif-empty">Log in to a portal to view notifications.</div>`; overlay.classList.add("open"); return; }
  try {
    const { data, error } = await db.from("notifications").select("*")
      .eq("recipient_type", identity.type)
      .or(`recipient_value.eq.${identity.value},recipient_value.eq.ALL`)
      .order("created_at", { ascending: false }).limit(50);
    if (error || !data?.length) { list.innerHTML = `<div class="notif-empty">No notifications yet.</div>`; overlay.classList.add("open"); return; }
    list.innerHTML = data.map(n => {
      const reportControls = (n.notif_type === 'report' && n.related_id) ? `
        <select class="report-status-select" onchange="updateReportStatus('${n.related_id}', this.value)">
          <option value="submitted">Submitted</option>
          <option value="under_review">Under Review</option>
          <option value="resolved">Resolved</option>
        </select>` : '';
      return `<div class="notif-item ${n.is_read ? '' : 'unread'}" id="notif-row-${n.id}">
        <div class="notif-item-header"><span class="notif-item-title">${n.title}</span><span class="notif-item-time">${timeAgo(n.created_at)}</span></div>
        <div class="notif-item-message">${n.message}</div>
        <div class="notif-item-actions">${reportControls}${!n.is_read ? `<button onclick="markNotificationRead('${n.id}')">Mark read</button>` : ''}<button onclick="deleteNotification('${n.id}')">Delete</button></div>
      </div>`;
    }).join('');
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
  try {
    await db.from("notifications").update({ is_read: true })
      .eq("recipient_type", identity.type)
      .or(`recipient_value.eq.${identity.value},recipient_value.eq.ALL`)
      .eq("is_read", false);
    openNotificationCenter();
    refreshNotificationBadge();
  } catch (err) { console.error(err); }
};
window.deleteNotification = async function (id) {
  try { await db.from("notifications").delete().eq("id", id); document.getElementById(`notif-row-${id}`)?.remove(); refreshNotificationBadge(); } catch (err) { console.error(err); }
};
async function refreshNotificationBadge() {
  const identity = getCurrentNotifIdentity();
  const badge = document.getElementById("notif-count-badge");
  if (!badge) return;
  if (!identity) { badge.style.display = "none"; return; }
  try {
    const { count, error } = await db.from("notifications").select("id", { count: "exact", head: true })
      .eq("recipient_type", identity.type)
      .or(`recipient_value.eq.${identity.value},recipient_value.eq.ALL`)
      .eq("is_read", false);
    if (error || !count) { badge.style.display = "none"; return; }
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.style.display = "flex";
  } catch (err) { badge.style.display = "none"; }
}

// ==========================================
// ADMIN DASHBOARD
// ==========================================
// A multi-hour class may still be stored as several hourly rows (older data
// saved before entries were merged into one row, or rows added manually one
// at a time). Counting raw cells would report a 4-hour class as 4 "classes",
// so count distinct back-to-back class blocks per day instead — same logic
// as mergeConsecutiveClassItems, just applied across the whole week rather
// than just today.
function countDistinctClasses(sec) {
  if (!sec.cells || !sec.slots) return 0;
  let total = 0;
  for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
    const dayItems = [];
    Object.keys(sec.cells).forEach(key => {
      const [rStr, cStr] = key.split("-");
      if (parseInt(cStr, 10) !== dayIdx) return;
      const cell = sec.cells[key];
      if (!cell) return;
      const range = getSlotRangeMinutes(sec.slots[parseInt(rStr, 10)]);
      if (!range) return;
      dayItems.push({ ...cell, startMin: range.startMin, endMin: range.endMin });
    });
    if (dayItems.length) total += mergeConsecutiveClassItems(dayItems).length;
  }
  return total;
}
async function renderAdminDashboard() {
  const totalSections = sectionsData.length;
  const teacherSet = new Set(), subjectSet = new Set(), roomSet = new Set();
  let totalClasses = 0;
  sectionsData.forEach(sec => {
    totalClasses += countDistinctClasses(sec);
    Object.values(sec.cells || {}).forEach(c => {
      if (!c) return;
      if (c.professor?.trim()) teacherSet.add(c.professor.trim());
      if (c.subject || c.name) subjectSet.add((c.subject || c.name).trim());
      if (c.room?.trim() && c.room.trim().toUpperCase() !== "TBA") roomSet.add(c.room.trim());
    });
  });

  const bookings = collectRoomBookings(null, null);
  const conflicts = findRoomConflicts(bookings);
  lastConflictList = conflicts;

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
      <div class="summary-card ${conflicts.length > 0 ? 'danger' : ''}"><span class="num">${conflicts.length}</span><span class="label">Active Conflicts</span></div>
      <div class="summary-card ${pendingReports > 0 ? 'danger' : ''}"><span class="num">${pendingReports}</span><span class="label">Pending Reports</span></div>
    `;
  }

  const warningEl = document.getElementById("admin-conflict-warning");
  if (warningEl) {
    if (conflicts.length > 0) {
      warningEl.style.display = "flex";
      warningEl.className = "conflict-warning-banner";
      warningEl.innerHTML = `<span><strong><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d='M12 3l10 18H2z'/><path d='M12 10v4M12 17h.01'/></svg> ${conflicts.length} conflict(s) detected.</strong> Click to see exactly which classes overlap.</span>
        <button class="btn-secondary" style="padding:6px 14px; font-size:0.8rem;" onclick="showConflictDetails()">View Conflict Details</button>`;
    } else {
      warningEl.style.display = "none";
    }
  }

  renderRecentActivities();
}

window.showConflictDetails = function () {
  const list = document.getElementById("conflict-details-list");
  if (!list) return;
  list.innerHTML = lastConflictList.length
    ? lastConflictList.map(c => `<div class="conflict-detail-item">${c.message.replace(/\n/g, '<br>')}</div>`).join('')
    : `<p style="color:var(--text-muted);">No conflicts found.</p>`;
  document.getElementById("conflict-details-modal-overlay").classList.add("open");
};

window.openTodayOverviewModal = function () {
  const container = document.getElementById("today-overview-modal-list");
  if (!container) return;
  const dayIdx = getManilaCellDayIndex();
  if (dayIdx === null) { container.innerHTML = `<p style="color:var(--text-muted); padding:8px;">No classes today (weekend).</p>`; document.getElementById("today-overview-modal-overlay").classList.add("open"); return; }
  const minutesNow = getManilaMinutesNow();
  const rawItems = [];
  sectionsData.forEach(sec => {
    Object.keys(sec.cells || {}).forEach(key => {
      const [rStr, cStr] = key.split("-");
      if (parseInt(cStr, 10) !== dayIdx) return;
      const cell = sec.cells[key];
      const range = getSlotRangeMinutes(sec.slots?.[parseInt(rStr, 10)]);
      if (!cell || !range) return;
      rawItems.push({ ...cell, section: sec.code, startMin: range.startMin, endMin: range.endMin });
    });
  });
  if (!rawItems.length) { container.innerHTML = `<p style="color:var(--text-muted); padding:8px;">No classes scheduled today.</p>`; }
  else {
    const items = mergeConsecutiveClassItems(rawItems);
    container.innerHTML = items.map(it => {
      let status = "upcoming", label = '<span class="status-dot upcoming"></span>Upcoming';
      if (minutesNow >= it.startMin && minutesNow < it.endMin) { status = "ongoing"; label = '<span class="status-dot ongoing"></span>Ongoing'; }
      else if (minutesNow >= it.endMin) { status = "completed"; label = '<span class="status-dot completed"></span>Completed'; }
      return `<div class="today-overview-item"><div><strong>${it.subject || it.name}</strong> — ${it.section}<br><span style="font-size:0.8rem; color:var(--text-muted);"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx='12' cy='12' r='9'/><path d='M12 7v5l3 3'/></svg> ${it.timeDisplay} • <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d='M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z'/><circle cx='12' cy='9' r='2.5'/></svg> ${displayRoom(it.room, dayIdx)} • <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx='12' cy='8' r='4'/><path d='M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8'/></svg> ${it.professor || '—'}</span></div><span class="status-pill ${status}">${label}</span></div>`;
    }).join('');
  }
  document.getElementById("today-overview-modal-overlay").classList.add("open");
};

async function renderRecentActivities() {
  const container = document.getElementById("admin-recent-activities");
  if (!container) return;
  try {
    const { data, error } = await db.from("schedule_history").select("*").order("created_at", { ascending: false }).limit(10);
    if (error || !data?.length) { container.innerHTML = `<p style="color:var(--text-muted); padding:8px;">No recent activity.</p>`; return; }
    container.innerHTML = data.map(h => `<div class="activity-item"><strong>${h.section_code}</strong> — ${h.action.replace('_',' ')} <span style="float:right;">${timeAgo(h.created_at)}</span></div>`).join('');
  } catch (err) { console.error(err); }
}

// ---- Room Management (list/add/edit rooms + Availability Checker, merged) ----
window.openRoomManagementModal = function () {
  renderRoomManagement();
  document.getElementById("room-avail-results").innerHTML = "";
  document.getElementById("room-avail-modal-overlay").classList.add("open");
};
window.openRoomAvailabilityModal = window.openRoomManagementModal; // back-compat alias
window.closeRoomAvailabilityModal = function () { document.getElementById("room-avail-modal-overlay").classList.remove("open"); };

function renderRoomManagement() {
  const listEl = document.getElementById("room-mgmt-list");
  if (!listEl) return;
  const names = getAllKnownRoomNames();
  const allBookings = collectRoomBookings(null, null);
  if (!names.length) {
    listEl.innerHTML = `<p style="color:var(--text-muted); padding:8px;">No rooms yet. Add one above.</p>`;
  } else {
    listEl.innerHTML = names.map(name => {
      const record = roomsData.find(r => r.name?.toLowerCase() === name.toLowerCase());
      const status = record?.status || "active";
      const capacity = record?.capacity ? ` • Cap. ${record.capacity}` : "";
      const usageCount = allBookings.filter(b => b.room === name.toLowerCase()).length;
      return `<div class="today-overview-item">
        <div><strong>${name.toUpperCase()}</strong><br><span style="font-size:0.75rem; color:var(--text-muted);">${usageCount} class(es) scheduled${capacity}</span></div>
        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
          <span class="status-pill" style="background:${status === 'inactive' ? 'var(--danger)' : 'var(--success)'}; color:#fff;">${status === 'inactive' ? 'Inactive' : 'Active'}</span>
          ${record ? `<button class="btn-secondary" style="padding:4px 8px; font-size:0.7rem;" onclick="setRoomStatus('${record.id}','${status === 'inactive' ? 'active' : 'inactive'}')">${status === 'inactive' ? 'Reactivate' : 'Deactivate'}</button>
          <button class="btn-danger" style="padding:4px 8px; font-size:0.7rem;" onclick="deleteRoom('${record.id}','${name.replace(/'/g, "\\'")}')">Delete</button>` : `<span style="font-size:0.68rem; color:var(--text-muted);">from schedule data</span>`}
        </div>
      </div>`;
    }).join('');
  }
  const note = document.getElementById("room-mgmt-storage-note");
  if (note) note.style.display = roomsTableAvailable ? "none" : "block";
}

window.checkRoomAvailability = function () {
  const dayIdx = parseInt(document.getElementById("avail-day").value, 10);
  const startStr = document.getElementById("avail-start").value, endStr = document.getElementById("avail-end").value;
  if (!startStr || !endStr) { alert("Please set both start and end time."); return; }
  const [sh, sm] = startStr.split(":").map(Number), [eh, em] = endStr.split(":").map(Number);
  const startMin = sh * 60 + sm, endMin = eh * 60 + em;
  if (endMin <= startMin) { alert("End time must be after start time."); return; }
  const results = getRoomAvailability(dayIdx, startMin, endMin, null);
  const container = document.getElementById("room-avail-results");
  container.innerHTML = results.length ? results.map(r => r.available
    ? `<div class="avail-room-row available"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d='M20 6L9 17l-5-5'/></svg> ${r.name.toUpperCase()} — Available</div>`
    : `<div class="avail-room-row occupied"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d='M18 6L6 18M6 6l12 12'/></svg> ${r.name.toUpperCase()} — ${r.conflict.sectionCode} (${r.conflict.subject}) ${r.conflict.slotDisplay}</div>`
  ).join('') : `<p style="color:var(--text-muted);">No rooms found. Add rooms above.</p>`;
};

// ==========================================
// SIMPLIFIED "ADD CLASS ENTRY" — Day + Time Range + Subject + Room in one
// popup, instead of typing into individual grid cells. Writes straight into
// the section editor's table, so the existing Save Changes / conflict-check
// / history flow underneath is completely unchanged.
// ==========================================
function timeInputsToSlotStr(startStr, endStr) {
  if (!startStr || !endStr) return "";
  const [sh, sm] = startStr.split(":").map(Number), [eh, em] = endStr.split(":").map(Number);
  return `${minutesToDisplay12(sh * 60 + sm)} - ${minutesToDisplay12(eh * 60 + em)}`;
}
window.openAddClassEntryModal = function () {
  const parent = document.getElementById("admin-edit-section-modal");
  if (!parent) return;
  document.getElementById("class-entry-popup")?.remove();
  const excludeIdentifier = parent.dataset.sectionIdentifier;
  const popup = document.createElement("div");
  popup.id = "class-entry-popup";
  popup.style.cssText = `position: fixed; inset:0; background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(6px); display:flex; align-items:center; justify-content:center; z-index:10500; padding:14px;`;
  popup.innerHTML = `
    <div style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:var(--radius-xl); box-shadow:var(--shadow-modal); max-width:420px; width:100%; padding:20px; max-height:92vh; overflow-y:auto;">
      <h3 style="margin:0 0 4px; font-size:1.1rem; font-weight:800;"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d='M12 5v14M5 12h14'/></svg> Add Class Entry</h3>
      <p style="margin:0 0 16px; font-size:0.8rem; color:var(--text-muted);">Set the full time range (e.g. 10:00 AM – 2:00 PM) and it fills every hour in between automatically — no need to add it hour by hour.</p>
      <div class="auth-form">
        <div><label for="ce-day">Day:</label>
          <select id="ce-day">
            <option value="0">Monday</option><option value="1">Tuesday</option><option value="2">Wednesday</option>
            <option value="3">Thursday</option><option value="4">Friday ODL</option>
          </select>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div><label for="ce-start">Start Time:</label><input type="time" id="ce-start" value="09:00"></div>
          <div><label for="ce-end">End Time:</label><input type="time" id="ce-end" value="10:00"></div>
        </div>
        <div><label for="ce-subject">Subject Code:</label><input type="text" id="ce-subject" placeholder="e.g. CC213"></div>
        <div><label for="ce-subname">Subject Name (optional):</label><input type="text" id="ce-subname" placeholder="e.g. Networking 2"></div>
        <div><label for="ce-teacher">Teacher (optional):</label><input type="text" id="ce-teacher" list="ce-teacher-suggestions" placeholder="e.g. J. Muyot"><datalist id="ce-teacher-suggestions"></datalist>
          <small style="display:block; margin-top:4px; font-size:0.7rem; color:var(--text-muted);"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d='M9 18h6M10 21h4'/><path d='M12 3a6 6 0 00-3.7 10.7c.5.4.7 1 .7 1.6V16h6v-.7c0-.6.2-1.2.7-1.6A6 6 0 0012 3z'/></svg> Auto-fills based on who's taught this subject before.</small>
        </div>
        <div><label for="ce-room">Room:</label><input type="text" id="ce-room" placeholder="Search available rooms..." autocomplete="off"></div>
        <div style="display:flex; gap:10px; margin-top:4px;">
          <button type="button" class="btn-primary" style="flex:1;" onclick="commitClassEntry()">Add to Schedule</button>
          <button type="button" class="btn-secondary" style="flex:1;" onclick="document.getElementById('class-entry-popup').remove()">Cancel</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(popup);
  const roomInput = document.getElementById("ce-room");
  const getCtx = () => {
    const dayIdx = parseInt(document.getElementById("ce-day").value, 10);
    const s = document.getElementById("ce-start").value, e = document.getElementById("ce-end").value;
    return { dayIdx, slotStr: timeInputsToSlotStr(s, e), excludeIdentifier };
  };
  wireRoomPicker(roomInput, getCtx);
  ["ce-day", "ce-start", "ce-end"].forEach(id => document.getElementById(id).addEventListener("change", () => { roomInput.value = ""; }));
  wireTeacherSuggestion(document.getElementById("ce-subject"), document.getElementById("ce-teacher"), "ce-teacher-suggestions");
};
window.commitClassEntry = function () {
  const parent = document.getElementById("admin-edit-section-modal");
  if (!parent) return;
  const excludeIdentifier = parent.dataset.sectionIdentifier;
  const dayIdx = parseInt(document.getElementById("ce-day").value, 10);
  const startStr = document.getElementById("ce-start").value, endStr = document.getElementById("ce-end").value;
  const subjectCode = document.getElementById("ce-subject").value.trim();
  const subjectName = document.getElementById("ce-subname").value.trim();
  const teacher = document.getElementById("ce-teacher").value.trim();
  const room = document.getElementById("ce-room").value.trim();
  if (!startStr || !endStr) { alert("Please set start and end time."); return; }
  const [sh, sm] = startStr.split(":").map(Number), [eh, em] = endStr.split(":").map(Number);
  const startMin = sh * 60 + sm, endMin = eh * 60 + em;
  if (endMin <= startMin) { alert("End time must be after start time. Two classes touching exactly at the boundary (e.g. one ending 6:00 PM, the next starting 6:00 PM) is fine — this just checks start is before end."); return; }
  if (!subjectCode) { alert("Please enter a subject code."); return; }
  const subject = subjectName ? `${subjectCode} - ${subjectName}` : subjectCode;
  const slotStr = timeInputsToSlotStr(startStr, endStr);

  if (room) {
    const avail = getRoomAvailability(dayIdx, startMin, endMin, excludeIdentifier).find(r => r.name.toLowerCase() === room.toLowerCase());
    if (avail && !avail.available) {
      if (!confirm(`${room.toUpperCase()} is already booked by ${avail.conflict.sectionCode} (${avail.conflict.subject}) at ${avail.conflict.slotDisplay} on ${DAYS_CLEAN[dayIdx]}.\n\nAdd anyway?`)) return;
    }
  }

  const tbody = document.getElementById("admin-edit-table-body");

  // Store the whole requested range (which may be several hours) as ONE row,
  // instead of one row per hour — a 4-hour class is one scheduled class, not
  // four, and should be saved that way (this is what the "Scheduled Classes"
  // count and the notifications/next-class logic both read from). Reuse an
  // existing row only if its time matches exactly; otherwise create one new
  // row spanning the full range.
  const readRows = () => Array.from(tbody.querySelectorAll("tr")).map(tr => {
    const r = getSlotRangeMinutes(tr.querySelector(".edit-slot-input")?.value || "");
    return r ? { tr, startMin: r.startMin, endMin: r.endMin } : null;
  }).filter(Boolean);

  let targetRow = readRows().find(r => r.startMin === startMin && r.endMin === endMin)?.tr;
  if (!targetRow) {
    targetRow = window.addEditorRow();
    targetRow.querySelector(".edit-slot-input").value = slotStr;
  }

  // Any pre-existing rows that fall entirely inside our new range (e.g. the
  // default hourly rows a new section starts with) are now redundant for
  // this day. If such a row is completely empty across every other day too,
  // remove it outright so the schedule doesn't accumulate empty rows; if
  // another day still uses it, just leave that row's own cell for this day
  // blank rather than filling it with a duplicate of the same class.
  readRows().forEach(r => {
    if (r.tr === targetRow) return;
    if (r.startMin < startMin || r.endMin > endMin) return; // not fully covered — leave alone
    const isEmptyEverywhere = Array.from(r.tr.querySelectorAll(".edit-day-cell")).every(cell =>
      !cell.querySelector(".edit-sub-input")?.value.trim() &&
      !cell.querySelector(".edit-prof-input")?.value.trim() &&
      !cell.querySelector(".edit-room-input")?.value.trim());
    if (isEmptyEverywhere) r.tr.remove();
  });

  // Keep every row in chronological order after inserting/removing rows.
  const orderedRows = Array.from(tbody.querySelectorAll("tr"));
  orderedRows.sort((a, b) => {
    const ra = getSlotRangeMinutes(a.querySelector(".edit-slot-input")?.value || "");
    const rb = getSlotRangeMinutes(b.querySelector(".edit-slot-input")?.value || "");
    return (ra?.startMin ?? 0) - (rb?.startMin ?? 0);
  });
  orderedRows.forEach(r => tbody.appendChild(r));

  const dayCell = targetRow.querySelectorAll(".edit-day-cell")[dayIdx];
  if (dayCell) {
    dayCell.querySelector(".edit-sub-input").value = subject;
    dayCell.querySelector(".edit-prof-input").value = teacher;
    dayCell.querySelector(".edit-room-input").value = room;
  }
  document.getElementById("class-entry-popup")?.remove();
};

// ---- Manage Teachers / Subjects ----
window.openManageTeachersModal = function () {
  const teacherMap = {};
  sectionsData.forEach(sec => Object.values(sec.cells || {}).forEach(c => { if (c?.professor?.trim()) { const key = c.professor.trim(); teacherMap[key] = (teacherMap[key] || 0) + 1; } }));
  const list = document.getElementById("manage-teachers-list");
  const entries = Object.entries(teacherMap).sort((a, b) => a[0].localeCompare(b[0]));
  list.innerHTML = entries.length ? entries.map(([name, count]) => `<div class="today-overview-item"><span>${name}</span><span style="color:var(--text-muted); font-size:0.8rem;">${count} class(es)</span></div>`).join('') : '<p style="color:var(--text-muted);">No teachers found.</p>';
  document.getElementById("manage-teachers-modal-overlay").classList.add("open");
};
window.openManageSubjectsModal = function () {
  const subjectMap = {};
  sectionsData.forEach(sec => Object.values(sec.cells || {}).forEach(c => { const s = (c?.subject || c?.name || "").trim(); if (s) subjectMap[s] = (subjectMap[s] || 0) + 1; }));
  const list = document.getElementById("manage-subjects-list");
  const entries = Object.entries(subjectMap).sort((a, b) => a[0].localeCompare(b[0]));
  list.innerHTML = entries.length ? entries.map(([name, count]) => `<div class="today-overview-item"><span>${name}</span><span style="color:var(--text-muted); font-size:0.8rem;">${count} section(s)</span></div>`).join('') : '<p style="color:var(--text-muted);">No subjects found.</p>';
  document.getElementById("manage-subjects-modal-overlay").classList.add("open");
};

// ==========================================
// EXPORT SCHEDULE AS IMAGE
// ==========================================
function getAllTeacherNames() {
  const set = new Set();
  sectionsData.forEach(sec => Object.values(sec.cells || {}).forEach(c => { if (c?.professor?.trim()) set.add(c.professor.trim()); }));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

// Header used on every exported image: the same calendar mark + wordmark
// shown in the app's own top nav bar, so exports look unmistakably AICSched.
// The AICS seal, embedded as base64 so the exported PNG never depends on a
// network fetch or relative file path when html2canvas rasterizes it.
const AICS_LOGO_DATA_URL = "data:image/png;base64,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";
function exportHeaderHTML(subtitle) {
  return `
    <div style="display:flex; align-items:center; gap:12px; padding:28px 32px 14px; border-bottom:3px solid #1d4ed8;">
      <img src="${AICS_LOGO_DATA_URL}" alt="AICS logo" style="width:48px; height:48px; border-radius:50%; object-fit:cover; flex-shrink:0;">
      <div>
        <div style="font-size:1.4rem; font-weight:800; color:#0f172a; letter-spacing:-0.3px;">AICSchedule</div>
        <div style="font-size:0.78rem; color:#64748b;">${subtitle}</div>
      </div>
    </div>`;
}
function exportFooterHTML() {
  const stamp = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  return `<div style="padding:14px 32px 24px; font-size:0.72rem; color:#94a3b8; text-align:right;">Generated by AICSchedule &nbsp;•&nbsp; ${stamp}</div>`;
}
const EXPORT_TABLE_STYLE = `border-collapse:collapse; width:100%; font-size:0.82rem;`;
const EXPORT_TH_STYLE = `background:#1d4ed8; color:#fff; padding:10px 8px; text-align:center; font-weight:700; border:1px solid #1d4ed8;`;
const EXPORT_TD_TIME_STYLE = `padding:9px 8px; text-align:center; font-weight:700; background:#f1f5f9; border:1px solid #e2e8f0; white-space:nowrap;`;
const EXPORT_TD_STYLE = `padding:9px 8px; text-align:center; border:1px solid #e2e8f0; vertical-align:middle;`;

// Builds the same Time x Day grid already shown on screen for one section
// (used for both "Current Section Schedule" and "Student Schedule" exports,
// since a student's schedule *is* their section's schedule).
function buildSectionGridHTML(sec) {
  let html = `<table style="${EXPORT_TABLE_STYLE}"><thead><tr><th style="${EXPORT_TH_STYLE}">TIME</th>`;
  DAYS.forEach(d => html += `<th style="${EXPORT_TH_STYLE}">${d}</th>`);
  html += "</tr></thead><tbody>";
  (sec.slots || []).forEach((slot, rowIdx) => {
    html += `<tr><td style="${EXPORT_TD_TIME_STYLE}">${formatTimeRangeDisplay(slot)}</td>`;
    DAYS.forEach((d, colIdx) => {
      const cell = sec.cells?.[`${rowIdx}-${colIdx}`];
      if (cell && (cell.subject || cell.name)) {
        html += `<td style="${EXPORT_TD_STYLE}"><div style="font-weight:700; color:#0f172a;">${cell.subject || cell.name}</div><div style="font-size:0.74rem; color:#64748b; margin-top:2px;">${cell.professor || '—'} • ${displayRoom(cell.room, colIdx)}</div></td>`;
      } else html += `<td style="${EXPORT_TD_STYLE}; color:#cbd5e1;">—</td>`;
    });
    html += "</tr>";
  });
  html += "</tbody></table>";
  return html;
}
// Builds the same Time x Day grid already shown for a teacher's aggregated
// schedule across every section they teach.
function buildTeacherGridHTML(teacherName) {
  const timeMap = {};
  sectionsData.forEach(sec => {
    if (!sec.cells || !sec.slots) return;
    sec.slots.forEach((slot, rowIdx) => {
      const range = getSlotRangeMinutes(slot);
      if (!range) return;
      DAYS.forEach((d, dayIdx) => {
        const cell = sec.cells[`${rowIdx}-${dayIdx}`];
        if (!cell || cell.professor?.trim().toLowerCase() !== teacherName.toLowerCase()) return;
        const timeKey = `${range.startMin}-${range.endMin}`;
        if (!timeMap[timeKey]) timeMap[timeKey] = { startMin: range.startMin, display: formatTimeRangeDisplay(slot), byDay: {} };
        if (!timeMap[timeKey].byDay[dayIdx]) timeMap[timeKey].byDay[dayIdx] = [];
        timeMap[timeKey].byDay[dayIdx].push({ subject: cell.subject || cell.name || "—", section: sec.code || sec.title || "", room: displayRoom(cell.room, dayIdx) });
      });
    });
  });
  const rows = Object.values(timeMap).sort((a, b) => a.startMin - b.startMin);
  let html = `<table style="${EXPORT_TABLE_STYLE}"><thead><tr><th style="${EXPORT_TH_STYLE}">TIME</th>`;
  DAYS.forEach(d => html += `<th style="${EXPORT_TH_STYLE}">${d}</th>`);
  html += "</tr></thead><tbody>";
  if (!rows.length) html += `<tr><td colspan="${DAYS.length + 1}" style="${EXPORT_TD_STYLE}; color:#94a3b8; padding:20px;">No classes found for this teacher.</td></tr>`;
  rows.forEach(row => {
    html += `<tr><td style="${EXPORT_TD_TIME_STYLE}">${row.display}</td>`;
    DAYS.forEach((d, dayIdx) => {
      const items = row.byDay[dayIdx];
      if (items?.length) {
        html += `<td style="${EXPORT_TD_STYLE}">${items.map(it => `<div style="font-weight:700; color:#0f172a;">${it.subject}</div><div style="font-size:0.74rem; color:#64748b; margin-top:2px;">Sec: ${it.section} • ${it.room}</div>`).join('<hr style="border:none;border-top:1px solid #e2e8f0;margin:4px 0;">')}</td>`;
      } else html += `<td style="${EXPORT_TD_STYLE}; color:#cbd5e1;">—</td>`;
    });
    html += "</tr>";
  });
  html += "</tbody></table>";
  return html;
}
// Room and full-weekly exports have no matching on-screen grid to mirror, so
// they're built as a clean day-by-day list instead — merging consecutive
// same-class hourly rows first (see mergeConsecutiveClassItems) so a 4-hour
// class prints as one line, not four.
function buildDayListHTML(dayIdx, rawItems, columns) {
  const items = mergeConsecutiveClassItems(rawItems).sort((a, b) => a.startMin - b.startMin);
  if (!items.length) return "";
  let html = `<div style="margin:18px 32px 0;"><div style="font-weight:800; font-size:0.95rem; color:#1d4ed8; padding:6px 0; border-bottom:2px solid #1d4ed8; margin-bottom:6px;">${DAYS_CLEAN[dayIdx]}</div>
    <table style="${EXPORT_TABLE_STYLE}"><thead><tr><th style="${EXPORT_TH_STYLE}">TIME</th>${columns.map(c => `<th style="${EXPORT_TH_STYLE}">${c.label}</th>`).join('')}</tr></thead><tbody>`;
  items.forEach(it => {
    html += `<tr><td style="${EXPORT_TD_TIME_STYLE}">${it.timeDisplay}</td>${columns.map(c => `<td style="${EXPORT_TD_STYLE}">${it[c.key] || '—'}</td>`).join('')}</tr>`;
  });
  html += "</tbody></table></div>";
  return html;
}
function buildRoomListHTML(roomName) {
  let html = "";
  for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
    const rawItems = [];
    sectionsData.forEach(sec => {
      Object.keys(sec.cells || {}).forEach(key => {
        const [rStr, cStr] = key.split("-");
        if (parseInt(cStr, 10) !== dayIdx) return;
        const cell = sec.cells[key];
        if (!cell || (cell.room || "").trim().toLowerCase() !== roomName.trim().toLowerCase()) return;
        const range = getSlotRangeMinutes(sec.slots?.[parseInt(rStr, 10)]);
        if (!range) return;
        rawItems.push({ subject: cell.subject || cell.name, professor: cell.professor, room: cell.room, section: sec.code || sec.title, startMin: range.startMin, endMin: range.endMin });
      });
    });
    html += buildDayListHTML(dayIdx, rawItems, [{ key: "subject", label: "SUBJECT" }, { key: "section", label: "SECTION" }, { key: "professor", label: "TEACHER" }]);
  }
  return html || `<div style="padding:30px 32px; color:#94a3b8; text-align:center;">No classes found for this room.</div>`;
}
function buildFullWeekListHTML() {
  let html = "";
  for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
    const rawItems = [];
    sectionsData.forEach(sec => {
      Object.keys(sec.cells || {}).forEach(key => {
        const [rStr, cStr] = key.split("-");
        if (parseInt(cStr, 10) !== dayIdx) return;
        const cell = sec.cells[key];
        if (!cell || !(cell.subject || cell.name)) return;
        const range = getSlotRangeMinutes(sec.slots?.[parseInt(rStr, 10)]);
        if (!range) return;
        rawItems.push({ subject: cell.subject || cell.name, professor: cell.professor, room: displayRoom(cell.room, dayIdx), section: sec.code || sec.title, startMin: range.startMin, endMin: range.endMin });
      });
    });
    html += buildDayListHTML(dayIdx, rawItems, [{ key: "section", label: "SECTION" }, { key: "subject", label: "SUBJECT" }, { key: "professor", label: "TEACHER" }, { key: "room", label: "ROOM" }]);
  }
  return html || `<div style="padding:30px 32px; color:#94a3b8; text-align:center;">No classes scheduled.</div>`;
}

function findSectionByIdentifier(identifier) {
  const list = (allSections?.length > 0) ? allSections : sectionsData;
  return list.find(s => (s.id || s.code) === identifier) || sectionsData.find(s => (s.id || s.code) === identifier);
}

window.openExportScheduleModal = function (presetType, presetValue) {
  document.getElementById("export-step-choose").style.display = "block";
  document.getElementById("export-step-preview").style.display = "none";
  document.getElementById("export-download-btn").disabled = true;
  const typeSelect = document.getElementById("export-type-select");
  typeSelect.value = presetType || "section";
  window._exportPreset = presetValue || "";
  updateExportTargetArea();
  document.getElementById("export-schedule-modal-overlay").classList.add("open");
};
window.closeExportScheduleModal = function () {
  document.getElementById("export-schedule-modal-overlay").classList.remove("open");
  document.getElementById("export-render-target").innerHTML = "";
  const img = document.getElementById("export-preview-img");
  img.src = ""; img.style.display = "none";
};
window.backToExportChoose = function () {
  document.getElementById("export-step-choose").style.display = "block";
  document.getElementById("export-step-preview").style.display = "none";
};
window.updateExportTargetArea = function () {
  const type = document.getElementById("export-type-select").value;
  const area = document.getElementById("export-target-area");
  const preset = window._exportPreset || "";
  if (type === "section") {
    const list = (allSections?.length > 0) ? allSections : sectionsData;
    area.innerHTML = `<div><label for="export-section-select">Section:</label><select id="export-section-select">
      ${list.map(s => `<option value="${s.id || s.code}" ${((s.id || s.code) === preset) ? 'selected' : ''}>${s.code || s.title}</option>`).join('')}
    </select></div>`;
  } else if (type === "student") {
    const savedSection = localStorage.getItem("aics_student_section") || "";
    const list = (allSections?.length > 0) ? allSections : sectionsData;
    const match = list.find(s => (s.code || "").toLowerCase() === savedSection.toLowerCase());
    if (match) {
      area.innerHTML = `<div style="padding:10px; background:var(--input-bg); border-radius:var(--radius-md); font-size:0.85rem;">Exporting your section: <strong>${match.code || match.title}</strong></div>`;
      window._exportStudentSectionId = match.id || match.code;
    } else {
      area.innerHTML = `<div><label for="export-section-select">You're not logged in as a student — pick a section:</label><select id="export-section-select">
        ${list.map(s => `<option value="${s.id || s.code}">${s.code || s.title}</option>`).join('')}
      </select></div>`;
    }
  } else if (type === "teacher") {
    const teachers = getAllTeacherNames();
    const current = preset || localStorage.getItem("aics_teacher_name") || "";
    area.innerHTML = `<div><label for="export-teacher-select">Teacher:</label><select id="export-teacher-select">
      ${teachers.map(t => `<option value="${t}" ${t === current ? 'selected' : ''}>${t}</option>`).join('')}
    </select></div>`;
  } else if (type === "room") {
    const rooms = getAllKnownRoomNames();
    area.innerHTML = `<div><label for="export-room-select">Room:</label><select id="export-room-select">
      ${rooms.map(r => `<option value="${r}">${r}</option>`).join('')}
    </select></div>`;
  } else {
    area.innerHTML = `<div style="padding:10px; background:var(--input-bg); border-radius:var(--radius-md); font-size:0.85rem;">Every section's classes for the whole week, grouped by day.</div>`;
  }
};

window.generateExportPreview = async function () {
  if (typeof html2canvas === "undefined") {
    alert("Could not load the image export library. Check your internet connection and try again.");
    return;
  }
  const type = document.getElementById("export-type-select").value;
  let bodyHTML = "", subtitle = "", filenamePart = "schedule";

  if (type === "section") {
    const sec = findSectionByIdentifier(document.getElementById("export-section-select")?.value);
    if (!sec) { alert("Please select a section."); return; }
    subtitle = `Section Schedule — ${sec.code || sec.title} • ${sec.session || 'MORNING'} SESSION`;
    bodyHTML = `<div style="padding:20px 32px 0;">${buildSectionGridHTML(sec)}</div>`;
    filenamePart = (sec.code || sec.title || "section").replace(/\s+/g, "_");
  } else if (type === "student") {
    const identifier = window._exportStudentSectionId || document.getElementById("export-section-select")?.value;
    const sec = findSectionByIdentifier(identifier);
    if (!sec) { alert("Please select a section."); return; }
    subtitle = `Student Schedule — ${sec.code || sec.title} • ${sec.session || 'MORNING'} SESSION`;
    bodyHTML = `<div style="padding:20px 32px 0;">${buildSectionGridHTML(sec)}</div>`;
    filenamePart = (sec.code || sec.title || "student").replace(/\s+/g, "_");
  } else if (type === "teacher") {
    const teacher = document.getElementById("export-teacher-select")?.value;
    if (!teacher) { alert("Please select a teacher."); return; }
    subtitle = `Faculty Schedule — ${teacher}`;
    bodyHTML = `<div style="padding:20px 32px 0;">${buildTeacherGridHTML(teacher)}</div>`;
    filenamePart = teacher.replace(/\s+/g, "_");
  } else if (type === "room") {
    const room = document.getElementById("export-room-select")?.value;
    if (!room) { alert("Please select a room."); return; }
    subtitle = `Room Schedule — ${room}`;
    bodyHTML = buildRoomListHTML(room);
    filenamePart = `room_${room}`.replace(/\s+/g, "_");
  } else {
    subtitle = "Full Weekly Schedule — All Sections";
    bodyHTML = buildFullWeekListHTML();
    filenamePart = "full_weekly_schedule";
  }

  document.getElementById("export-step-choose").style.display = "none";
  document.getElementById("export-step-preview").style.display = "block";
  const loadingText = document.getElementById("export-loading-text");
  const img = document.getElementById("export-preview-img");
  const downloadBtn = document.getElementById("export-download-btn");
  loadingText.style.display = "block"; loadingText.textContent = "Generating image…";
  img.style.display = "none"; downloadBtn.disabled = true;

  const target = document.getElementById("export-render-target");
  target.innerHTML = exportHeaderHTML(subtitle) + bodyHTML + exportFooterHTML();

  // Give the browser a frame to finish layout, and make sure the logo image
  // has actually finished decoding — html2canvas can otherwise rasterize a
  // frame before an <img> has painted, leaving the logo blank.
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  await Promise.all(Array.from(target.querySelectorAll("img")).map(im =>
    im.complete ? Promise.resolve() : new Promise(res => { im.onload = res; im.onerror = res; })
  ));
  try {
    const canvas = await html2canvas(target, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const dataUrl = canvas.toDataURL("image/png");
    window._exportDataUrl = dataUrl;
    window._exportFilename = `AICSchedule_${filenamePart}_${new Date().toISOString().slice(0, 10)}.png`;
    img.src = dataUrl; img.style.display = "inline-block";
    loadingText.style.display = "none";
    downloadBtn.disabled = false;
  } catch (err) {
    console.error(err);
    loadingText.textContent = "Couldn't generate the image. Please try again.";
  }
};
window.downloadExportedImage = async function () {
  if (!window._exportDataUrl) return;
  const fileName = window._exportFilename || "AICSchedule_export.png";

  // Inside the packaged Android app, there's no browser "Downloads" — the
  // anchor-download trick that works on the web/PWA silently does nothing
  // in a native WebView. When running as the real app (window.Capacitor is
  // only present there, never in a plain browser or installed PWA), save
  // the PNG straight to the device's Photos/Gallery using the Media plugin,
  // which accepts the data URL directly — no separate file-write step needed.
  const isNative = window.Capacitor?.isNativePlatform?.();
  if (isNative && window.Capacitor?.Plugins?.Media) {
    try {
      await window.Capacitor.Plugins.Media.savePhoto({ path: window._exportDataUrl });
      alert("Saved to your gallery.");
    } catch (err) {
      console.error("Native gallery save failed:", err);
      alert("Could not save the image to your gallery. Please try again.");
    }
    return;
  }

  const a = document.createElement("a");
  a.href = window._exportDataUrl;
  a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
};

// ==========================================
// INIT
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  loadRooms();
  window.loadSchedules();
  setupSessionFilters();
  initSearchDropdown();
  updateNotificationButtons();
  renderBottomNav("home-view");
  updateHamburgerContext("home-view");
  document.getElementById("admin-section-search-input")?.addEventListener("input", renderAdminSections);
  setInterval(() => {
    renderNextClassCard(); renderTeacherNextClassCard();
    // Announcement banners were previously only rendered once per page
    // load, so a banner past its own end date would stay stuck on screen
    // until the person manually reloaded the app. Re-checking on the same
    // timer as the next-class card makes it disappear on its own instead.
    const savedSection = localStorage.getItem("aics_student_section");
    const savedTeacher = localStorage.getItem("aics_teacher_name");
    if (savedSection && document.getElementById("student-announcements-container")) {
      renderAnnouncementBanner("student-announcements-container", "section", savedSection);
    }
    if (savedTeacher && document.getElementById("teacher-announcements-container")) {
      renderAnnouncementBanner("teacher-announcements-container", "teacher", savedTeacher);
    }
  }, 30000);
});
