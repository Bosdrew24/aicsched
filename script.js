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
        <div style="display:flex; gap:10px;">
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
window.openAnnouncementModal = function () { document.getElementById("announcement-modal-overlay").classList.add("open"); };
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
  setInterval(() => { renderNextClassCard(); renderTeacherNextClassCard(); }, 30000);
});
