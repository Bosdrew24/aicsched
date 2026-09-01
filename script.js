// SUPABASE CLIENT INITIALIZATION
const SUPABASE_URL = 'https://upjsmekxacecgnxxnkid.supabase.co';
const SUPABASE_KEY = 'sb_publishable_OQhsZ-6GUBqQq3FqcsQBSg_8FenNMwx';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// GLOBAL STATE & CONSTANTS
const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY ODL"];
const DAYS_CLEAN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
let selectedDayIndex = 0;
let activeSession = "MORNING";
let sectionsData = [];
let swRegistration = null;
let notifiedClasses = new Set(); // Stores notified IDs to prevent duplicate alerts

//--- NAVIGATION & VIEWS
window.setView = function (viewId) {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    const target = document.getElementById(viewId);
    if (target) target.classList.add("active");
    const homeBtn = document.getElementById("home-nav-btn");
    if (homeBtn) homeBtn.style.display = (viewId === "home-view") ? "none" : "inline-block";
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
    if (menu) {
        menu.classList.toggle("active");
    }
};

//--- STUDENT PORTAL LOGIC & AUTH
function checkStudentAuth() {
    const savedSection = localStorage.getItem("aics_student_section");
    const gateCard = document.getElementById("student-gate-card");
    const mainContent = document.getElementById("student-main-content");
    const sessionFilterBar = document.getElementById("session-filter-buttons");
    const badge = document.getElementById("active-student-section-badge");

    if (savedSection && gateCard && mainContent) {
        gateCard.style.display = "none";
        mainContent.style.display = "block";
        if (sessionFilterBar) sessionFilterBar.style.display = "none";
        if (badge) badge.textContent = `Section: ${savedSection}`;
        const searchInput = document.getElementById("student-search-input");
        if (searchInput && !searchInput.value) {
            searchInput.value = savedSection;
        }
        applyFilters();
    } else if (gateCard && mainContent) {
        gateCard.style.display = "block";
        mainContent.style.display = "none";
        if (sessionFilterBar) sessionFilterBar.style.display = "flex";
    }
}

window.openStudentLogin = function() {
    window.setView("student-view");
};

window.viewAllSections = function() {
    localStorage.removeItem("aics_student_section");
    const searchInput = document.getElementById("student-search-input");
    if (searchInput) searchInput.value = "";
    const gateCard = document.getElementById("student-gate-card");
    const mainContent = document.getElementById("student-main-content");
    const sessionFilterBar = document.getElementById("session-filter-buttons");
    const badge = document.getElementById("active-student-section-badge");
    
    if (gateCard) gateCard.style.display = "none";
    if (mainContent) mainContent.style.display = "block";
    if (sessionFilterBar) sessionFilterBar.style.display = "flex";
    if (badge) badge.textContent = "Section: All Sections";
    window.setView("student-view");
    applyFilters();
};

window.submitStudentLogin = function() {
    const input = document.getElementById("student-section-input");
    if (!input || !input.value.trim()) {
        alert("Please enter a valid section code.");
        return;
    }
    const sectionCode = input.value.trim();
    localStorage.setItem("aics_student_section", sectionCode);
    checkStudentAuth();
};

window.logoutStudent = function() {
    localStorage.removeItem("aics_student_section");
    const input = document.getElementById("student-section-input");
    if (input) input.value = "";
    const searchInput = document.getElementById("student-search-input");
    if (searchInput) searchInput.value = "";
    const sessionFilterBar = document.getElementById("session-filter-buttons");
    if (sessionFilterBar) sessionFilterBar.style.display = "flex";
    checkStudentAuth();
    applyFilters();
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
}

window.openTeacherLogin = function() {
    window.setView("teacher-view");
};

window.submitTeacherLogin = function() {
    const select = document.getElementById("teacher-name-select-gate") || document.getElementById("teacher-name-select");
    if (!select || !select.value) {
        alert("Please select your faculty profile.");
        return;
    }
    localStorage.setItem("aics_teacher_name", select.value);
    checkTeacherAuth();
};

window.logoutTeacher = function() {
    localStorage.removeItem("aics_teacher_name");
    const select = document.getElementById("teacher-name-select-gate");
    if (select) select.value = "";
    checkTeacherAuth();
};

// ADMIN MODAL & VIEW CONTROLS
window.openAdminModal = function() {
    window.setView("admin-view");
};

window.closeAdminModal = function() {
    const modal = document.getElementById("admin-login-modal");
    if (modal) modal.style.display = "none";
    const passInput = document.getElementById("admin-pass-input");
    if (passInput) passInput.value = "";
};

window.submitAdminLogin = function() {
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

window.submitAdminViewLogin = function() {
    const passInput = document.getElementById("admin-view-pass-input");
    if (!passInput || !passInput.value.trim()) {
        alert("Please enter the admin passcode.");
        return;
    }
    localStorage.setItem("aics_admin_logged_in", "true");
    passInput.value = "";
    checkAdminAuth();
};

window.logoutAdmin = function() {
    localStorage.removeItem("aics_admin_logged_in");
    checkAdminAuth();
};

//--- DATABASE API CALL (SUPABASE INTEGRATION)
window.loadSchedules = async function() {
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

    selects.forEach(select => {
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

window.renderTeacherSchedule = function() {
    const container = document.getElementById("teacher-schedule-container");
    if (!container) return;

    const selectedTeacher = localStorage.getItem("aics_teacher_name") || "";
    if (!selectedTeacher) {
        container.innerHTML = `<div style="color: #94a3b8; text-align:center; padding:30px;">Please select your name to view your assigned classes.</div>`;
        return;
    }

    let html = "";
    let classCount = 0;

    sectionsData.forEach((sec) => {
        if (!sec.cells) return;
        let teacherSlots = [];

        (sec.slots || []).forEach((slot, rowIdx) => {
            DAYS.forEach((day, dayIdx) => {
                const key = `${rowIdx}-${dayIdx}`;
                const cell = sec.cells[key];
                if (cell && cell.professor && cell.professor.trim().toLowerCase() === selectedTeacher.toLowerCase()) {
                    teacherSlots.push({
                        day: DAYS_CLEAN[dayIdx],
                        time: slot,
                        subject: cell.subject || cell.name,
                        room: cell.room || "TBA",
                        section: sec.code
                    });
                    classCount++;
                }
            });
        });

        if (teacherSlots.length > 0) {
            html += `<div class="section-card" style="margin-bottom:15px; padding:16px; background: #1e293b; border-radius:10px; border:1px solid #334155;">
                <h3 style="color:#38bdf8; margin-bottom:10px; margin-top:0;">Section: ${sec.code} (${sec.session || 'Regular'})</h3>`;
            teacherSlots.forEach((item) => {
                html += `<div style="padding:10px 0; border-bottom:1px solid #334155; color: #f8fafc; font-size:0.95rem;">
                    <strong style="color:#a7f3d0;">${item.day}</strong> | ${item.time} <strong>${item.subject}</strong> <span style="color:#94a3b8;">(Room: ${item.room})</span>
                </div>`;
            });
            html += `</div>`;
        }
    });

    container.innerHTML = classCount > 0 ? html : `<div style="color:#94a3b8; text-align:center; padding:30px;">No assigned classes found for <strong>${selectedTeacher}</strong>.</div>`;
};

//--- RENDER STUDENT SECTIONS
function renderSections() {
    const studentContainer = document.getElementById("sections-container");
    if (!studentContainer) return;

    studentContainer.innerHTML = "";
    if (!sectionsData.length) {
        studentContainer.innerHTML = `<div style="text-align:center; padding:20px;">No schedules loaded.</div>`;
        return;
    }

    sectionsData.forEach((sec) => {
        const card = document.createElement("div");
        card.className = "section-card";
        card.dataset.session = sec.session;
        card.dataset.sectionTitle = (sec.title || sec.code || "").toLowerCase();

        const header = document.createElement("div");
        header.className = "section-header-bar";

        const toggleBtn = document.createElement("button");
        toggleBtn.className = "section-toggle-btn";
        toggleBtn.innerHTML = `<span>${sec.title || sec.code}</span>`;
        header.appendChild(toggleBtn);

        const tableDiv = document.createElement("div");
        tableDiv.className = "schedule-table-container";

        let html = `<table class="responsive-table show-col-${selectedDayIndex}"><thead><tr><th>TIME</th>`;
        DAYS.forEach(d => html += `<th>${d}</th>`);
        html += `</tr></thead><tbody>`;

        (sec.slots || []).forEach((slot, rowIdx) => {
            html += `<tr><td class="time-cell">${slot}</td>`;
            DAYS.forEach((d, colIdx) => {
                const key = `${rowIdx}-${colIdx}`;
                const cell = sec.cells ? sec.cells[key] : null;
                if (cell && (cell.subject || cell.name)) {
                    const displaySubject = cell.subject || cell.name;
                    html += `<td class="class-cell" data-key="${key}" data-sub="${displaySubject}" data-prof="${cell.professor || ''}" data-room="${cell.room || ''}">
                        <div class="cell-code">${displaySubject} ${cell.room || ''}</div>
                        <div class="cell-name">${cell.professor || ''}</div>
                    </td>`;
                } else {
                    html += `<td class="class-cell" data-key="${key}"><div class="cell-empty">-</div></td>`;
                }
            });
            html += `</tr>`;
        });

        html += `</tbody></table>`;
        tableDiv.innerHTML = html;

        toggleBtn.addEventListener("click", () => {
            tableDiv.classList.toggle("hidden");
        });

        tableDiv.querySelectorAll(".class-cell").forEach(td => {
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

//--- RENDER MOBILE DAY TABS
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

//--- SEARCH FILTERS
function applyFilters() {
    const input = document.getElementById("student-search-input");
    if (!input) return;
    const val = input.value.trim().toLowerCase();

    document.querySelectorAll("#sections-container .section-card").forEach((card) => {
        if (!val) {
            card.style.display = card.dataset.session === activeSession ? "block" : "none";
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

        card.style.display = (found || card.dataset.sectionTitle.includes(val)) ? "block" : "none";
    });
}

// --- NOTIFICATION & ALERT UTILITIES
function requestNotificationPermission() {
    if (!("Notification" in window)) {
        alert("This browser does not support notifications.");
        return;
    }

    Notification.requestPermission().then((permission) => {
        const notifyBtn = document.getElementById("notify-toggle-btn");
        if (permission === "granted") {
            if (notifyBtn) notifyBtn.textContent = "Alerts On";
            sendClassNotification("Test Notification", "Class schedule notifications are actively working!");
            checkUpcomingClasses();
        } else {
            if (notifyBtn) notifyBtn.textContent = "Alerts Off";
            alert("Notification permission was denied.");
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
    if (Notification.permission !== "granted") return;
    if (swRegistration && swRegistration.showNotification) {
        swRegistration.showNotification(title, {
            body: body,
            icon: "logo.jpg",
            badge: "logo.jpg"
        });
    } else {
        new Notification(title, {
            body: body,
            icon: "logo.jpg"
        });
    }
}

function checkUpcomingClasses() {
    if (!("Notification" in window) || Notification.permission !== "granted" || !sectionsData.length) return;

    const now = new Date();
    const currentDayStr = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY ODL", "SATURDAY"][now.getDay()];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const savedTeacher = localStorage.getItem("aics_teacher_name") || "";

    sectionsData.forEach((sec) => {
        if (!sec.slots || !sec.cells) return;
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
                        notifiedClasses.add(notificationId);
                        if (savedTeacher && cell.professor && cell.professor.trim().toLowerCase() === savedTeacher.toLowerCase()) {
                            sendClassNotification(
                                `Class Starting: ${cell.subject || cell.name}`,
                                `Teaching section ${sec.code} in Room ${cell.room || 'TBA'} in ${timeDiff} minutes.`
                            );
                        } else {
                            sendClassNotification(
                                `Class Starting: ${cell.subject || cell.name}`,
                                `Room ${cell.room || 'TBA'} starts in ${timeDiff} minutes (${slot}).`
                            );
                        }
                    }
                }
            }
        });
    });
}

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
            const timeSlotKey = `${colIdx}-${rowIdx}`;
            const timeSlotLabel = sec.slots ? sec.slots[rowIdx] : "Selected Slot";
            const dayLabel = DAYS_CLEAN[colIdx] || "Day";

            // Check Professor Conflict
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

            // Check Room Conflict (Ignores "TBA")
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

    // Collect double-booked conflicts
    [profMap, roomMap].forEach((map) => {
        Object.values(map).forEach((entriesByName) => {
            Object.values(entriesByName).forEach((matches) => {
                if (matches.length > 1) {
                    const first = matches[0];
                    const involvedSections = matches.map(m => m.secCode).join(" and ");
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

window.addTimeSlot = function (secIdx) {
    if (!sectionsData[secIdx]) return;
    if (!sectionsData[secIdx].slots) sectionsData[secIdx].slots = [];
    sectionsData[secIdx].slots.push("12:00 - 1:00 PM");
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
window.addNewSection = async function() {
    const codeInput = document.getElementById("new-section-code");
    const titleInput = document.getElementById("new-section-title");
    const code = codeInput?.value.trim();
    const title = titleInput?.value.trim() || code;
    const session = document.getElementById("new-section-session")?.value;

    if (!code) {
        alert("Please enter a section code.");
        return;
    }

    // Prevent duplicate section code entries
    const sectionExists = sectionsData.some(
        (sec) => sec.code && sec.code.trim().toLowerCase() === code.toLowerCase()
    );

    if (sectionExists) {
        alert(`Section "${code}" already exists. Duplicate sections are not allowed.`);
        return;
    }

    const defaultSlots = [
        "7:00 - 8:00 AM",
        "8:00 - 9:00 AM",
        "9:00 - 10:00 AM",
        "10:00 - 11:00 AM",
        "11:00 - 12:00 PM"
    ];

    const newSec = {
        id: "sec_" + Date.now(),
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

//--- RENDER ADMIN SECTION EDITORS WITH EDITABLE TIME SLOTS
function renderAdminSections() {
    const container = document.getElementById("admin-sections-list");
    if (!container) return;

    if (!sectionsData.length) {
        container.innerHTML = `<div style="color: #94a3b8; text-align:center; padding:20px;">No sections available. Add one above!</div>`;
        return;
    }

    const { conflictSet, conflictDetails } = getScheduleConflicts();
    let html = "";

    // Render Warning Banner
    if (conflictDetails.length > 0) {
        html += `<div style="background: #451a03; border:1px solid #f59e0b; color:#fef3c7; padding: 14px 18px; border-radius:10px; margin-bottom:20px;">
            <h4 style="margin:0 0 8px 0; color:#fbbf24; display: flex; align-items:center; gap:8px;">
                <span>⚠️</span> Class Conflict Warning (${conflictDetails.length} detected)
            </h4>
            <ul style="margin:0; padding-left:20px; font-size:0.88rem;">
                ${conflictDetails.map(item => `<li style="margin-bottom:4px;">${item}</li>`).join('')}
            </ul>
        </div>`;
    }

    sectionsData.forEach((sec, secIdx) => {
        html += `<div class="section-card" style="margin-bottom:20px; padding:18px; background: #1e293b; border-radius:12px; border:1px solid #334155;">
            <div style="display: flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
                <h3 style="color:#38bdf8; margin:0;">${sec.title || sec.code} (${sec.session || 'Regular'})</h3>
                <div style="display:flex; gap:8px;">
                    <button onclick="addTimeSlot(${secIdx})" style="background:#10b981; color:#fff; border:none; padding:6px 12px; border-radius: 6px; cursor:pointer; font-weight:600;">+ Add Time Row</button>
                    <button onclick="deleteSection(${secIdx})" style="background:#ef4444; color:#fff; border:none; padding:6px 12px; border-radius: 6px; cursor:pointer; font-weight:600;">Delete Section</button>
                </div>
            </div>
            <div style="overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse; font-size:0.85rem; color:#f8fafc; text-align:left;">
                    <thead>
                        <tr style="border-bottom:1px solid #475569;">
                            <th style="padding:8px; min-width:130px;">Time Slot</th>
                            ${DAYS_CLEAN.map(d => `<th style="padding:8px;">${d}</th>`).join('')}
                            <th style="padding:8px; width:40px;"></th>
                        </tr>
                    </thead>
                    <tbody>`;

        (sec.slots || []).forEach((slot, rowIdx) => {
            html += `<tr style="border-bottom:1px solid #334155;">
                <td style="padding: 6px; min-width:130px; background: #0f172a;">
                    <input type="text" 
                           placeholder="e.g. 7:00 - 8:00 AM" 
                           value="${slot}" 
                           onchange="updateSlotTime(${secIdx}, ${rowIdx}, this.value)" 
                           style="width:100%; background:transparent; border:none; border-bottom:1px solid #38bdf8; color:#38bdf8; font-weight:600; box-sizing:border-box; padding:2px;">
                </td>`;

            DAYS.forEach((_, colIdx) => {
                const key = `${rowIdx}-${colIdx}`;
                const cell = sec.cells ? sec.cells[key] : null;
                const sub = cell ? (cell.subject || cell.name || "") : "";
                const prof = cell ? (cell.professor || "") : "";
                const room = cell ? (cell.room || "") : "";
                const isConflicted = conflictSet.has(`${secIdx}-${key}`);
                const cellStyle = isConflicted 
                    ? "background: #fef08a !important; color: #854d0e !important; border:2px solid #eab308 !important;" 
                    : "background: #0f172a; border:1px solid #1e293b;";

                html += `<td style="padding:6px; min-width:140px; ${cellStyle}">
                    <input type="text" placeholder="Subject Code" value="${sub}" onchange="updateCellData(${secIdx}, '${key}', 'subject', this.value)" style="width:100%; background:transparent; border:none; border-bottom:1px solid #475569; color:${isConflicted ? '#854d0e' : '#60a5fa'}; font-weight:600; margin-bottom:4px; box-sizing:border-box;">
                    <input type="text" placeholder="Professor" value="${prof}" onchange="updateCellData(${secIdx}, '${key}', 'professor', this.value)" style="width:100%; background:transparent; border:none; border-bottom:1px solid #334155; color:${isConflicted ? '#854d0e' : '#cbd5e1'}; margin-bottom:4px; box-sizing:border-box;">
                    <input type="text" placeholder="Room" value="${room}" onchange="updateCellData(${secIdx}, '${key}', 'room', this.value)" style="width:100%; background:transparent; border:none; color:${isConflicted ? '#854d0e' : '#a7f3d0'}; box-sizing:border-box;">
                    ${isConflicted ? `<div style="display:inline-block; background-color: #eab308; color:#854d0e; font-size:0.75rem; font-weight:700; padding:2px 6px; border-radius: 4px; margin-top:4px;">CONFLICT</div>` : ''}
                </td>`;
            });

            html += `<td style="padding:6px; text-align:center;">
                <button onclick="deleteTimeSlot(${secIdx}, ${rowIdx})" style="background:transparent; border:none; color:#ef4444; cursor:pointer; font-weight:bold;">✕</button>
            </td></tr>`;
        });

        html += `</tbody></table></div></div>`;
    });

    container.innerHTML = html;
}

//--- UPDATE CELL DATA & PERSIST
window.updateCellData = function (secIdx, cellKey, field, val) {
    if (!sectionsData[secIdx]) return;
    if (!sectionsData[secIdx].cells) sectionsData[secIdx].cells = {};
    if (!sectionsData[secIdx].cells[cellKey]) {
        sectionsData[secIdx].cells[cellKey] = { subject: "", name: "", professor: "", room: "" };
    }

    sectionsData[secIdx].cells[cellKey][field] = val;
    if (field === "subject") sectionsData[secIdx].cells[cellKey]["name"] = val;

    const { conflictDetails } = getScheduleConflicts();
    if (conflictDetails.length > 0) {
        triggerConflictPopUp(conflictDetails);
    }

    saveSchedulesToDB();
    renderAdminSections();
};

//--- DELETE SECTION
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

//--- SAVE SCHEDULES TO DATABASE BACKEND
async function saveSchedulesToDB() {
    try {
        if (!sectionsData || sectionsData.length === 0) return;
        const { error } = await db.from("schedules").upsert(sectionsData, { onConflict: "id" });
        if (error) {
            console.error("Error saving schedule data to Supabase:", error);
        }
    } catch (err) {
        console.error("Error saving schedule data:", err);
    }
}

// INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
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

    document.getElementById("notify-toggle-btn")?.addEventListener("click", requestNotificationPermission);
    if ("Notification" in window && Notification.permission === "granted") {
        const notifyBtn = document.getElementById("notify-toggle-btn");
        if (notifyBtn) notifyBtn.textContent = "Alerts On";
    }

    document.getElementById("student-search-input")?.addEventListener("input", applyFilters);

    document.querySelectorAll(".session-filter-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const container = e.target.parentElement;
            container.querySelectorAll(".session-filter-btn").forEach(b => b.classList.remove("active"));
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

    renderMobileTabs();
    window.loadSchedules();
});

setInterval(() => {
    if (typeof window.loadSchedules === "function") {
        window.loadSchedules();
    }
}, 15000);
