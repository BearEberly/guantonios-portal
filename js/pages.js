(function setupPageLoaders() {
  const GPortal = window.GPortal;

  function toLocalDatetimeInput(isoString) {
    if (!isoString) {
      return "";
    }

    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const pad = function pad(value) {
      return String(value).padStart(2, "0");
    };

    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hour = pad(date.getHours());
    const minute = pad(date.getMinutes());

    return `${year}-${month}-${day}T${hour}:${minute}`;
  }

  async function loadDashboard(session, profile) {
    if (!GPortal.qs("#dashboardPage")) {
      return;
    }

    const sb = GPortal.getSupabase();

    const nextShiftEl = GPortal.qs("#nextShift");
    const tipsSummaryEl = GPortal.qs("#tipsSummary");
    const trainingDueEl = GPortal.qs("#trainingDue");
    const announcementsEl = GPortal.qs("#announcements");
    const specialsEl = GPortal.qs("#dashboardSpecials");

    function normalizeRoleLabel(rawValue) {
      const value = String(rawValue || "").trim();
      const lower = value.toLowerCase();
      if (!value) return "";
      if (lower === "kitchen") return "Kitchen";
      if (lower === "server") return "Server";
      if (lower === "busser") return "Busser";
      if (lower === "host") return "Host";
      if (lower === "manager") return "Manager";
      if (lower === "owner") return "Owner";
      return value;
    }

    function roleModifierClass(roleLabel) {
      const role = String(roleLabel || "").trim().toLowerCase();
      if (role === "kitchen") return "dashboard-next-shift--kitchen";
      if (role === "server") return "dashboard-next-shift--server";
      if (role === "busser") return "dashboard-next-shift--busser";
      if (role === "host") return "dashboard-next-shift--host";
      if (role === "manager") return "dashboard-next-shift--manager";
      if (role === "owner") return "dashboard-next-shift--owner";
      return "";
    }

    function normalizeNameKey(value) {
      return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    function resolveCurrentStaffRole() {
      const rows = readStaffRows();
      if (!rows.length) {
        return "";
      }

      const email = String(profile && profile.email || session && session.user && session.user.email || "").trim().toLowerCase();
      if (email) {
        const emailMatch = rows.find(function matchEmail(row) {
          return String(row && row.email || "").trim().toLowerCase() === email;
        });
        if (emailMatch && emailMatch.position) {
          return normalizeRoleLabel(emailMatch.position);
        }
      }

      const candidates = [
        String(profile && profile.full_name || "").trim(),
        String(profile && profile.email || "").split("@")[0].trim(),
        String(session && session.user && session.user.email || "").split("@")[0].trim()
      ].map(normalizeNameKey).filter(Boolean);

      if (!candidates.length) {
        return "";
      }

      const exact = rows.find(function findExact(row) {
        return candidates.includes(normalizeNameKey(row && row.name || ""));
      });
      if (exact && exact.position) {
        return normalizeRoleLabel(exact.position);
      }

      const fuzzy = rows.find(function findFuzzy(row) {
        const rowKey = normalizeNameKey(row && row.name || "");
        return candidates.some(function matchCandidate(candidate) {
          return candidate.length >= 3 && (rowKey.includes(candidate) || candidate.includes(rowKey));
        });
      });
      return fuzzy && fuzzy.position ? normalizeRoleLabel(fuzzy.position) : "";
    }

    function formatShiftTime(isoString) {
      const date = new Date(isoString);
      if (Number.isNaN(date.getTime())) {
        return "";
      }
      return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }

    function formatShiftDate(isoString) {
      const date = new Date(isoString);
      if (Number.isNaN(date.getTime())) {
        return "";
      }
      return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    }

    function renderNextShift(roleLabel, startAt, endAt) {
      if (!nextShiftEl) {
        return;
      }
      if (!startAt || !endAt) {
        nextShiftEl.innerHTML = "<p class='small'>No upcoming shifts.</p>";
        return;
      }

      const resolvedRole = normalizeRoleLabel(roleLabel) || "Shift";
      const modifier = roleModifierClass(resolvedRole);
      const startTime = formatShiftTime(startAt);
      const endTime = formatShiftTime(endAt);
      const longDate = formatShiftDate(startAt);

      nextShiftEl.innerHTML = `
        <section class="dashboard-next-shift ${modifier}">
          <p class="dashboard-next-shift__title">Next Shift - ${escapedHtml(resolvedRole)}</p>
          <p class="dashboard-next-shift__date">${escapedHtml(longDate)}</p>
          <p class="dashboard-next-shift__time">${escapedHtml(startTime)} to ${escapedHtml(endTime)}</p>
        </section>
      `;
    }

    function renderDashboardSpecials() {
      if (!specialsEl) {
        return;
      }
      const menuState = readMenuHubState();
      const specials = Array.isArray(menuState.specials) ? menuState.specials : [];
      if (!specials.length) {
        specialsEl.innerHTML = "<p class='small'>No specials posted.</p>";
        return;
      }

      const sorted = specials
        .slice()
        .sort(function sortSpecials(a, b) {
          return String(b.created_at || "").localeCompare(String(a.created_at || ""));
        })
        .slice(0, 8);

      specialsEl.innerHTML = sorted.map(function renderSpecial(item) {
        const safeName = escapedHtml(item.name || "Special");
        const safeNotes = escapedHtml(item.notes || "");
        const created = item.created_at ? escapedHtml(GPortal.dateTime(item.created_at)) : "";
        const by = item.created_by ? ` by ${escapedHtml(item.created_by)}` : "";
        const imageMarkup = /^data:image\//i.test(String(item.file_data_url || ""))
          ? `<img class="dashboard-special-image" src="${item.file_data_url}" alt="${safeName}" />`
          : "";

        return `
          <article class="dashboard-special-item">
            ${imageMarkup}
            <div class="dashboard-special-item__body">
              <h4>${safeName}</h4>
              ${safeNotes ? `<p class="small">${safeNotes}</p>` : ""}
              ${created ? `<p class="small">Posted ${created}${by}</p>` : ""}
            </div>
          </article>
        `;
      }).join("");
    }

    if (specialsEl && !specialsEl.dataset.bound) {
      window.addEventListener("gportal:menu-hub-updated", renderDashboardSpecials);
      window.addEventListener("storage", function onDashboardMenuStorage(event) {
        if (event.key === MENU_HUB_STORAGE_KEY) {
          renderDashboardSpecials();
        }
      });
      specialsEl.dataset.bound = "1";
    }
    renderDashboardSpecials();

    const shifts = await sb
      .from("shifts")
      .select("start_at,end_at,station")
      .eq("employee_id", session.user.id)
      .gte("start_at", new Date().toISOString())
      .order("start_at", { ascending: true })
      .limit(1);

    if (shifts.error) {
      renderNextShift("", "", "");
    } else if (!shifts.data.length) {
      renderNextShift("", "", "");
    } else {
      const shift = shifts.data[0];
      const staffRole = resolveCurrentStaffRole();
      const role = staffRole || normalizeRoleLabel(shift.station) || "Shift";
      renderNextShift(role, shift.start_at, shift.end_at);
    }

    const tips = await sb
      .from("tip_statements")
      .select("period_end,net_tips")
      .eq("employee_id", session.user.id)
      .order("period_end", { ascending: false })
      .limit(1);

    tipsSummaryEl.textContent = tips.error || !tips.data.length
      ? "No tip statements yet."
      : `Latest payout: ${GPortal.money(tips.data[0].net_tips)}`;

    const training = await sb
      .from("training_assignments")
      .select("title,status,due_at")
      .eq("employee_id", session.user.id)
      .in("status", ["ASSIGNED", "IN_PROGRESS"])
      .order("due_at", { ascending: true })
      .limit(3);

    trainingDueEl.textContent = training.error || !training.data.length
      ? "Nothing due."
      : training.data.map(function render(item) {
          return `${item.title} (${item.status})`;
        }).join(" • ");

    const announcements = await sb
      .from("announcements")
      .select("title,created_at")
      .order("created_at", { ascending: false })
      .limit(4);

    if (announcements.error || !announcements.data.length) {
      announcementsEl.innerHTML = "<p class='small'>No announcements.</p>";
    } else {
      announcementsEl.innerHTML = `
        <ul class="dashboard-announcement-list">
          ${announcements.data.map(function render(item) {
            return `<li>${escapedHtml(item.title)} (${escapedHtml(GPortal.dateOnly(item.created_at))})</li>`;
          }).join("")}
        </ul>
      `;
    }
  }

  async function loadSchedule(session, profile) {
    const headRow = GPortal.qs("#scheduleGridHead");
    const body = GPortal.qs("#scheduleGridRows");
    const mobileList = GPortal.qs("#scheduleMobileList");
    const savedSection = GPortal.qs("#scheduleSavedSection");
    const savedHeadRow = GPortal.qs("#scheduleSavedGridHead");
    const savedRoleCountsRow = GPortal.qs("#scheduleSavedGridRoleCounts");
    const savedBody = GPortal.qs("#scheduleSavedGridRows");
    const savedMobileList = GPortal.qs("#scheduleSavedMobileList");
    const savedRange = GPortal.qs("#scheduleSavedRange");
    const whoami = GPortal.qs("#whoami");
    const weekAnchorInput = GPortal.qs("#scheduleWeekAnchor");
    const weekRange = GPortal.qs("#scheduleWeekRange");
    const prevBtn = GPortal.qs("#scheduleWeekPrev");
    const nextBtn = GPortal.qs("#scheduleWeekNext");
    const savedPrevBtn = GPortal.qs("#scheduleSavedPrev");
    const savedNextBtn = GPortal.qs("#scheduleSavedNext");
    const saveBtn = GPortal.qs("#scheduleSaveBtn");
    const calendarExportBtn = GPortal.qs("#scheduleCalendarExportBtn");
    const saveWrap = GPortal.qs(".schedule-save-wrap");
    const savedFlash = GPortal.qs("#scheduleSavedFlash");
    if (!headRow || !body || !weekAnchorInput || !weekRange || !prevBtn || !nextBtn || !saveBtn) {
      return;
    }

    const canEdit = profile && (profile.role === "admin" || profile.role === "manager");
    if (whoami) {
      whoami.hidden = !canEdit;
      if (!canEdit) {
        whoami.textContent = "";
      }
    }
    document.body.classList.toggle("schedule-staff-view", !canEdit);
    document.body.classList.toggle("schedule-can-edit", Boolean(canEdit));

    let scheduleBook = readScheduleBook();
    let weekStart = sundayForIso(scheduleBook.week_anchor || localIsoDate(new Date()));
    let weekDates = weekDatesFromSunday(weekStart);
    let isDirty = false;
    let currentStaffName = "";
    let flashFadeTimer = null;
    let flashHideTimer = null;
    const SAVED_SCHEDULE_DAYS = 17;
    let slotPopover = null;
    let slotPopoverAnchor = null;
    let slotPopoverState = null;
    let slotPopoverHideTimer = null;
    let slotPopoverInPicker = null;
    let slotPopoverInHour = null;
    let slotPopoverInMinute = null;
    let slotPopoverInMeridiem = null;
    let slotPopoverOutPicker = null;
    let slotPopoverOutHour = null;
    let slotPopoverOutMinute = null;
    let slotPopoverOutMeridiem = null;
    let slotPopoverCloseToggle = null;
    let slotPopoverError = null;

    weekAnchorInput.step = "1";
    weekAnchorInput.min = "2026-01-04";

    if (canEdit) {
      const hourOptions = Array.from({ length: 12 }, function mapHour(_item, index) {
        const value = String(index + 1).padStart(2, "0");
        return `<option value="${value}">${index + 1}</option>`;
      }).join("");
      const minuteOptions = Array.from({ length: 60 }, function mapMinute(_item, index) {
        const value = String(index).padStart(2, "0");
        return `<option value="${value}">${value}</option>`;
      }).join("");
      const meridiemOptions = "<option value='AM'>AM</option><option value='PM'>PM</option>";

      slotPopover = document.createElement("div");
      slotPopover.className = "schedule-time-popover";
      slotPopover.setAttribute("role", "dialog");
      slotPopover.setAttribute("aria-label", "Adjust shift time");
      slotPopover.hidden = true;
      slotPopover.innerHTML = `
        <button class="schedule-time-popover__preset" type="button" data-schedule-popover-preset="${SCHEDULE_DEFAULT_START_CLOCK}|${SCHEDULE_CLOSE_TOKEN}">
          4 to Close
        </button>
        <button class="schedule-time-popover__preset" type="button" data-schedule-popover-preset="${SCHEDULE_EXTENDED_START_CLOCK}|${SCHEDULE_CLOSE_TOKEN}">
          1 to Close
        </button>
        <div class="schedule-time-popover__custom">
          <label class="schedule-time-popover__field">
            <span>In</span>
            <div class="schedule-time-popover__picker" data-schedule-time-picker="in">
              <select data-schedule-popover-time="in-hour" aria-label="In hour">${hourOptions}</select>
              <select data-schedule-popover-time="in-minute" aria-label="In minute">${minuteOptions}</select>
              <select data-schedule-popover-time="in-meridiem" aria-label="In AM or PM">${meridiemOptions}</select>
            </div>
          </label>
          <label class="schedule-time-popover__field">
            <span>Out</span>
            <div class="schedule-time-popover__out-row">
              <div class="schedule-time-popover__picker" data-schedule-time-picker="out">
                <select data-schedule-popover-time="out-hour" aria-label="Out hour">${hourOptions}</select>
                <select data-schedule-popover-time="out-minute" aria-label="Out minute">${minuteOptions}</select>
                <select data-schedule-popover-time="out-meridiem" aria-label="Out AM or PM">${meridiemOptions}</select>
              </div>
              <button class="schedule-time-popover__close-toggle" type="button" data-schedule-popover-action="toggle-close">
                Close
              </button>
            </div>
          </label>
        </div>
        <button class="schedule-time-popover__apply" type="button" data-schedule-popover-action="apply-custom">
          Apply
        </button>
        <button class="schedule-time-popover__off" type="button" data-schedule-popover-action="set-off">
          Off
        </button>
        <p class="schedule-time-popover__error" id="scheduleTimePopoverError" hidden></p>
      `;
      document.body.appendChild(slotPopover);
      slotPopoverInPicker = GPortal.qs("[data-schedule-time-picker='in']", slotPopover);
      slotPopoverInHour = GPortal.qs("[data-schedule-popover-time='in-hour']", slotPopover);
      slotPopoverInMinute = GPortal.qs("[data-schedule-popover-time='in-minute']", slotPopover);
      slotPopoverInMeridiem = GPortal.qs("[data-schedule-popover-time='in-meridiem']", slotPopover);
      slotPopoverOutPicker = GPortal.qs("[data-schedule-time-picker='out']", slotPopover);
      slotPopoverOutHour = GPortal.qs("[data-schedule-popover-time='out-hour']", slotPopover);
      slotPopoverOutMinute = GPortal.qs("[data-schedule-popover-time='out-minute']", slotPopover);
      slotPopoverOutMeridiem = GPortal.qs("[data-schedule-popover-time='out-meridiem']", slotPopover);
      slotPopoverCloseToggle = GPortal.qs("[data-schedule-popover-action='toggle-close']", slotPopover);
      slotPopoverError = GPortal.qs("#scheduleTimePopoverError", slotPopover);
    }

    function seededPreviewRole(name, index) {
      const value = String(name || "").trim().toLowerCase();
      if (value === "bear") {
        return "Server";
      }
      const cycle = ["Kitchen", "Server", "Busser", "Host", "Server", "Kitchen", "Server"];
      return cycle[index % cycle.length];
    }

    function pickName(pool, index) {
      if (!Array.isArray(pool) || !pool.length) {
        return "";
      }
      const safeIndex = ((index % pool.length) + pool.length) % pool.length;
      return pool[safeIndex];
    }

    function ensureTempSchedulePreviewSeedForWeek() {
      if (!session || !session.isTemp) {
        return;
      }

      const sourceRows = readStaffRows();
      if (!sourceRows.length) {
        return;
      }

      let rowsChanged = false;
      const seededRows = sourceRows.map(function seedRow(row, index) {
        const next = emptyStaffRow(
          row && row.name,
          row && row.position,
          row && row.email,
          row && row.phone,
          row && row.user_id,
          row && row.status,
          index
        );
        if (next.position === "Off") {
          next.position = seededPreviewRole(next.name, index);
          rowsChanged = true;
        }
        return next;
      });

      if (rowsChanged) {
        writeStaffRows(seededRows);
        syncTipWorkbookStorageFromStaff(seededRows);
      }

      const weekSeeds = weekDatesFromSunday(weekStart);
      const hasAssignments = weekSeeds.some(function hasAssignmentsForDay(dateIso) {
        return Array.isArray(scheduleBook.assignments[dateIso]) && scheduleBook.assignments[dateIso].length > 0;
      });
      if (hasAssignments) {
        return;
      }

      const activeRows = seededRows.filter(function keepActive(row) {
        return row.name && row.position !== "Off";
      });
      if (!activeRows.length) {
        return;
      }

      const byRole = {
        Kitchen: [],
        Server: [],
        Busser: [],
        Host: [],
        Manager: [],
        Owner: []
      };
      activeRows.forEach(function bucketRow(row) {
        if (byRole[row.position]) {
          byRole[row.position].push(row.name);
        }
      });

      const allNames = activeRows.map(function mapName(row) {
        return row.name;
      });
      const fallbackPool = byRole.Server.length ? byRole.Server : allNames;
      const bearName = activeRows.find(function findBear(row) {
        return String(row.name || "").trim().toLowerCase() === "bear";
      });

      weekSeeds.forEach(function seedDay(dateIso, dayIndex) {
        const dayNames = [
          bearName ? bearName.name : pickName(fallbackPool, dayIndex),
          pickName(byRole.Kitchen.length ? byRole.Kitchen : allNames, dayIndex),
          pickName(fallbackPool, dayIndex + 1),
          pickName(byRole.Busser.length ? byRole.Busser : allNames, dayIndex),
          pickName(byRole.Host.length ? byRole.Host : allNames, dayIndex),
          pickName(allNames, dayIndex + 2),
          pickName(allNames, dayIndex + 5)
        ];
        scheduleBook.assignments[dateIso] = uniqueNames(dayNames);
      });

      writeScheduleBook(scheduleBook);
    }

    function markDirty(nextState) {
      isDirty = Boolean(nextState);
      saveBtn.disabled = !canEdit || !isDirty;
    }

    function showSavedFlash() {
      if (!savedFlash) {
        return;
      }

      if (flashFadeTimer) {
        window.clearTimeout(flashFadeTimer);
      }
      if (flashHideTimer) {
        window.clearTimeout(flashHideTimer);
      }

      savedFlash.classList.remove("is-visible", "is-fading");
      void savedFlash.offsetWidth;
      savedFlash.classList.add("is-visible");

      flashFadeTimer = window.setTimeout(function startScheduleSavedFade() {
        savedFlash.classList.add("is-fading");
      }, 1000);

      flashHideTimer = window.setTimeout(function hideScheduleSavedFlash() {
        savedFlash.classList.remove("is-visible", "is-fading");
      }, 2800);
    }

    function roleBadgeCode(position) {
      const role = String(position || "").trim();
      if (role === "Kitchen") return "KT";
      if (role === "Server") return "SV";
      if (role === "Busser") return "BS";
      if (role === "Host") return "HS";
      if (role === "Manager") return "MG";
      if (role === "Owner") return "OW";
      return "--";
    }

    function roleCardClass(position) {
      const role = String(position || "").trim();
      if (role === "Kitchen") return "schedule-shift-card--kitchen";
      if (role === "Server") return "schedule-shift-card--server";
      if (role === "Busser") return "schedule-shift-card--busser";
      if (role === "Host") return "schedule-shift-card--host";
      if (role === "Manager") return "schedule-shift-card--manager";
      if (role === "Owner") return "schedule-shift-card--owner";
      return "schedule-shift-card--off";
    }

    function savedShiftToneClass(position) {
      const role = String(position || "").trim();
      if (role === "Kitchen") return "schedule-saved-cell--on-kitchen";
      if (role === "Server") return "schedule-saved-cell--on-server";
      if (role === "Busser") return "schedule-saved-cell--on-busser";
      if (role === "Host") return "schedule-saved-cell--on-host";
      if (role === "Manager") return "schedule-saved-cell--on-manager";
      if (role === "Owner") return "schedule-saved-cell--on-owner";
      return "schedule-saved-cell--on";
    }

    function resolveCurrentStaffName(rows) {
      const candidates = [];
      const profileName = String(profile && profile.full_name || "").trim();
      const profileEmail = String(profile && profile.email || session && session.user && session.user.email || "").trim().toLowerCase();
      const profileEmailName = String(profile && profile.email || "").split("@")[0].trim();
      const sessionEmailName = String(session && session.user && session.user.email || "").split("@")[0].trim();
      if (profileName) candidates.push(profileName);
      if (profileEmailName) candidates.push(profileEmailName);
      if (sessionEmailName) candidates.push(sessionEmailName);

      if (profileEmail) {
        const emailMatch = rows.find(function matchByEmail(row) {
          return String(row && row.email || "").trim().toLowerCase() === profileEmail;
        });
        if (emailMatch && emailMatch.name) {
          return emailMatch.name;
        }
      }

      const normalizedCandidates = candidates
        .map(function normalize(text) {
          return String(text || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        })
        .filter(function keep(text) {
          return Boolean(text);
        });

      const exactMatch = rows.find(function findExact(row) {
        const rowName = String(row.name || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        return normalizedCandidates.includes(rowName);
      });
      if (exactMatch) {
        return exactMatch.name;
      }

      const fuzzyMatch = rows.find(function findFuzzy(row) {
        const rowNameRaw = String(row.name || "").trim().toLowerCase();
        const rowName = rowNameRaw.replace(/[^a-z0-9]/g, "");
        const rowFirst = String(rowNameRaw.split(/\s+/)[0] || "").replace(/[^a-z0-9]/g, "");
        return normalizedCandidates.some(function check(candidate) {
          if (!candidate) {
            return false;
          }
          if (candidate === rowFirst || rowFirst === candidate) {
            return true;
          }
          if (candidate.length >= 3 && rowName.includes(candidate)) {
            return true;
          }
          return false;
        });
      });
      return fuzzyMatch ? fuzzyMatch.name : "";
    }

    function updateWeekRangeLabel() {
      weekRange.textContent = `${longDateFull(weekDates[0])} to ${longDateFull(weekDates[6])}`;
    }

    function runningDatesFrom(startIso, dayCount) {
      const dates = [];
      for (let index = 0; index < dayCount; index += 1) {
        dates.push(addDaysIsoDate(startIso, index));
      }
      return dates;
    }

    function renderHead() {
      headRow.innerHTML = `
        <th>Name</th>
        ${weekDates.map(function mapDate(dateIso) {
          return `
            <th>
              <span class="schedule-day-head">
                <strong>${weekdayShort(dateIso)}</strong>
                <span>${monthDay(dateIso)}</span>
              </span>
            </th>
          `;
        }).join("")}
      `;
    }

    function isScheduled(name, dateIso) {
      const dayEntry = scheduleBook.assignments[dateIso];
      return Array.isArray(dayEntry) && dayEntry.includes(name);
    }

    function ensureShiftDetailDay(dateIso) {
      if (!scheduleBook.shift_details || typeof scheduleBook.shift_details !== "object") {
        scheduleBook.shift_details = {};
      }
      if (!scheduleBook.shift_details[dateIso] || typeof scheduleBook.shift_details[dateIso] !== "object") {
        scheduleBook.shift_details[dateIso] = {};
      }
      return scheduleBook.shift_details[dateIso];
    }

    function getShiftDetail(name, dateIso) {
      return scheduleShiftDetailFor(scheduleBook, dateIso, name);
    }

    function setShiftDetail(name, dateIso, detailValue) {
      const cleanName = String(name || "").trim();
      if (!cleanName || !isIsoDateString(dateIso)) {
        return;
      }
      const dayDetails = ensureShiftDetailDay(dateIso);
      dayDetails[cleanName] = normalizeScheduleShiftDetail(detailValue);
    }

    function removeShiftDetail(name, dateIso) {
      const cleanName = String(name || "").trim();
      if (!cleanName || !scheduleBook.shift_details || typeof scheduleBook.shift_details !== "object") {
        return;
      }
      const dayDetails = scheduleBook.shift_details[dateIso];
      if (!dayDetails || typeof dayDetails !== "object") {
        return;
      }
      delete dayDetails[cleanName];
      if (!Object.keys(dayDetails).length) {
        delete scheduleBook.shift_details[dateIso];
      }
    }

    function setScheduledSlot(name, dateIso, detailValue) {
      const cleanName = String(name || "").trim();
      if (!cleanName || !isIsoDateString(dateIso)) {
        return;
      }
      const currentDay = Array.isArray(scheduleBook.assignments[dateIso])
        ? scheduleBook.assignments[dateIso].slice()
        : [];
      const nextDay = currentDay.filter(function keep(other) {
        return other !== cleanName;
      });
      nextDay.push(cleanName);
      scheduleBook.assignments[dateIso] = uniqueNames(nextDay);
      setShiftDetail(cleanName, dateIso, detailValue);
    }

    function clearScheduledSlot(name, dateIso) {
      const cleanName = String(name || "").trim();
      if (!cleanName || !isIsoDateString(dateIso)) {
        return;
      }
      const currentDay = Array.isArray(scheduleBook.assignments[dateIso])
        ? scheduleBook.assignments[dateIso].slice()
        : [];
      scheduleBook.assignments[dateIso] = uniqueNames(currentDay.filter(function keep(other) {
        return other !== cleanName;
      }));
      removeShiftDetail(cleanName, dateIso);
    }

    function icsSafe(text) {
      return String(text || "")
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
    }

    function ymdToIcsDate(dateIso) {
      return String(dateIso || "").replace(/-/g, "");
    }

    function shiftClockToIcsTime(clockValue, fallbackClock) {
      if (isShiftCloseValue(clockValue)) {
        return `${SCHEDULE_DEFAULT_END_CLOCK.replace(":", "")}00`;
      }
      const normalized = normalizeShiftClockValue(clockValue, fallbackClock || SCHEDULE_DEFAULT_START_CLOCK);
      return `${normalized.replace(":", "")}00`;
    }

    function utcNowStamp() {
      const now = new Date();
      return `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`;
    }

    function slugifyName(name) {
      return String(name || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "staff";
    }

    function buildWeekIcs(name) {
      const eventDates = weekDates.filter(function onlyScheduled(dateIso) {
        return isScheduled(name, dateIso);
      });
      if (!eventDates.length) {
        return "";
      }

      const stamp = utcNowStamp();
      const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Guantonios//StaffHub//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH"
      ];

      eventDates.forEach(function appendEvent(dateIso) {
        const dayKey = ymdToIcsDate(dateIso);
        const detail = getShiftDetail(name, dateIso);
        const shiftLabel = scheduleShiftRangeLabel(detail);
        lines.push("BEGIN:VEVENT");
        lines.push(`UID:${dayKey}-${slugifyName(name)}@guantonios.local`);
        lines.push(`DTSTAMP:${stamp}`);
        lines.push(`DTSTART:${dayKey}T${shiftClockToIcsTime(detail.start, SCHEDULE_DEFAULT_START_CLOCK)}`);
        lines.push(`DTEND:${dayKey}T${shiftClockToIcsTime(detail.end, SCHEDULE_DEFAULT_END_CLOCK)}`);
        lines.push(`SUMMARY:${icsSafe("Guantonio's Shift")}`);
        lines.push(`DESCRIPTION:${icsSafe(`Scheduled shift for ${name} (${shiftLabel})`)}`);
        lines.push(`LOCATION:${icsSafe("Guantonio's Wood Fired")}`);
        lines.push("END:VEVENT");
      });

      lines.push("END:VCALENDAR");
      return lines.join("\r\n");
    }

    function downloadScheduleIcs() {
      const name = currentStaffName || resolveCurrentStaffName(readStaffRows()) || "Staff";
      const ics = buildWeekIcs(name);
      if (!ics) {
        return;
      }

      const start = weekDates[0];
      const end = weekDates[6];
      const fileName = `${slugifyName(name)}-${start}-to-${end}-calendar.ics`;
      const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    function updateExportButtons() {
      if (!calendarExportBtn || canEdit) {
        return;
      }
      const name = currentStaffName || resolveCurrentStaffName(readStaffRows());
      const hasShift = Boolean(name) && weekDates.some(function anyShift(dateIso) {
        return isScheduled(name, dateIso);
      });
      calendarExportBtn.disabled = !hasShift;
      const helpText = hasShift ? "" : "No shifts in this week";
      calendarExportBtn.title = helpText;
    }

    function renderBody() {
      const rows = readStaffRows();
      const table = body.closest("table");
      if (table) {
        table.classList.toggle("schedule-grid-table--staff", !canEdit);
      }
      if (!rows.length) {
        currentStaffName = "";
        body.innerHTML = "<tr><td colspan='8'>No staff added yet.</td></tr>";
        if (mobileList) {
          mobileList.innerHTML = "<p class='small schedule-mobile-empty'>No staff added yet.</p>";
        }
        return;
      }

      const currentName = resolveCurrentStaffName(rows);
      currentStaffName = currentName;
      const originalIndexByName = new Map();
      rows.forEach(function rememberIndex(row, index) {
        originalIndexByName.set(row.name, index);
      });
      const currentRow = rows.find(function findCurrentRow(row) {
        return currentName && row.name === currentName;
      });
      const currentRole = currentRow ? String(currentRow.position || "Off") : "";

      function roleBucket(position) {
        const role = String(position || "Off");
        const priorityByCurrent = {
          Server: ["Server", "Kitchen", "Busser"],
          Kitchen: ["Kitchen", "Server", "Busser"],
          Busser: ["Busser", "Kitchen", "Server"]
        };
        const baseOrder = priorityByCurrent[currentRole] || ["Kitchen", "Server", "Busser"];
        const roleIndex = baseOrder.indexOf(role);
        if (roleIndex >= 0) {
          return roleIndex;
        }
        if (role === "Host") return 50;
        if (role === "Manager") return 51;
        if (role === "Owner") return 52;
        if (role === "Off") return 99;
        return 80;
      }

      const orderedRows = canEdit
        ? rows.slice()
        : rows.slice().sort(function sortForStaffView(a, b) {
            const aCurrent = currentName && a.name === currentName;
            const bCurrent = currentName && b.name === currentName;
            if (aCurrent && !bCurrent) return -1;
            if (!aCurrent && bCurrent) return 1;

            const roleRank = roleBucket(a.position) - roleBucket(b.position);
            if (roleRank !== 0) {
              return roleRank;
            }

            return (originalIndexByName.get(a.name) || 0) - (originalIndexByName.get(b.name) || 0);
          });

      function renderMobileBody(orderedRowsValue) {
        if (!mobileList) {
          return;
        }

        mobileList.innerHTML = orderedRowsValue.map(function mapMobileRow(row) {
          const isCurrent = !canEdit && currentName && row.name === currentName;
          const position = String(row.position || "Off");
          const roleCode = roleBadgeCode(position);
          const roleClass = roleCardClass(position);

          return `
            <article class="schedule-mobile-row${isCurrent ? " schedule-mobile-row--current" : ""}">
              <header class="schedule-mobile-row__head">
                <div class="schedule-mobile-row__staff">
                  <div class="schedule-staff-name">
                    <span>${escapedHtml(row.name)}</span>
                    ${isCurrent ? "<span class='schedule-me-pill'>You</span>" : ""}
                  </div>
                  <span class="schedule-staff-position">${escapedHtml(position)}</span>
                </div>
              </header>
              <div class="schedule-mobile-days">
                ${weekDates.map(function mapMobileDay(dateIso) {
                  const scheduled = isScheduled(row.name, dateIso);
                  const detail = getShiftDetail(row.name, dateIso);
                  const slotClass = scheduled ? roleClass : "schedule-shift-card--off";
                  const dayLabel = weekdayShort(dateIso);
                  const dayStamp = monthDay(dateIso);
                  const cardMarkup = `
                    <span class="schedule-mobile-day-label">
                      <strong>${dayLabel}</strong>
                      <span>${dayStamp}</span>
                    </span>
                    <span class="schedule-shift-card ${canEdit ? "schedule-shift-card--edit " : ""}${slotClass}">
                      <span class="schedule-shift-card__role">${roleCode}</span>
                      <span class="schedule-shift-card__time">${scheduleShiftCardHtml(detail)}</span>
                    </span>
                  `;

                  if (canEdit) {
                    return `
                      <button
                        class="schedule-mobile-slot-btn"
                        type="button"
                        data-schedule-slot-name="${escapedHtml(row.name)}"
                        data-schedule-slot-date="${dateIso}"
                        aria-label="Set ${escapedHtml(row.name)} shift on ${longDateFull(dateIso)}"
                      >
                        ${cardMarkup}
                      </button>
                    `;
                  }

                  return `
                    <div class="schedule-mobile-slot" aria-label="${longDateFull(dateIso)}">
                      ${cardMarkup}
                    </div>
                  `;
                }).join("")}
              </div>
            </article>
          `;
        }).join("");
      }

      body.innerHTML = orderedRows.map(function mapStaff(row) {
        const isCurrent = !canEdit && currentName && row.name === currentName;
        const position = String(row.position || "Off");
        const roleCode = roleBadgeCode(position);
        const roleClass = roleCardClass(position);

        if (!canEdit) {
          return `
            <tr class="${isCurrent ? "schedule-row-current" : ""}">
              <td>
                <div class="schedule-staff-name">
                  <span>${escapedHtml(row.name)}</span>
                  ${isCurrent ? "<span class='schedule-me-pill'>You</span>" : ""}
                </div>
                <span class="schedule-staff-position">${escapedHtml(position)}</span>
              </td>
              ${weekDates.map(function mapDate(dateIso) {
                const scheduled = isScheduled(row.name, dateIso);
                if (!scheduled) {
                  return `<td><div class="schedule-shift-card schedule-shift-card--off"></div></td>`;
                }
                const detail = getShiftDetail(row.name, dateIso);
                return `
                  <td>
                    <div class="schedule-shift-card ${roleClass}">
                      <span class="schedule-shift-card__role">${roleCode}</span>
                      <span class="schedule-shift-card__time">${scheduleShiftCardHtml(detail)}</span>
                    </div>
                  </td>
                `;
              }).join("")}
            </tr>
          `;
        }

        return `
          <tr>
            <td>
              <div class="schedule-staff-name">
                <span>${escapedHtml(row.name)}</span>
              </div>
              <span class="schedule-staff-position">${escapedHtml(position)}</span>
            </td>
            ${weekDates.map(function mapDate(dateIso) {
              const scheduled = isScheduled(row.name, dateIso);
              const detail = getShiftDetail(row.name, dateIso);
              const slotClass = scheduled ? roleClass : "schedule-shift-card--off";
              return `
                <td>
                  <button
                    class="schedule-slot-btn"
                    type="button"
                    data-schedule-slot-name="${escapedHtml(row.name)}"
                    data-schedule-slot-date="${dateIso}"
                    aria-label="Set ${escapedHtml(row.name)} shift on ${longDateFull(dateIso)}"
                  >
                    <span class="schedule-shift-card schedule-shift-card--edit schedule-shift-card--interactive ${slotClass}">
                      <span class="schedule-shift-card__role">${roleCode}</span>
                      <span class="schedule-shift-card__time">${scheduleShiftCardHtml(detail)}</span>
                    </span>
                  </button>
                </td>
              `;
            }).join("")}
          </tr>
        `;
      }).join("");

      renderMobileBody(orderedRows);
    }

    function renderSavedScheduleGrid() {
      if (!savedSection || !savedHeadRow || !savedRoleCountsRow || !savedBody || !savedRange) {
        return;
      }

      if (!canEdit) {
        savedSection.hidden = true;
        return;
      }

      savedSection.hidden = false;

      const rows = readStaffRows();
      const rowByName = new Map();
      rows.forEach(function rememberByName(row) {
        const name = String(row && row.name || "").trim();
        if (!name || rowByName.has(name)) {
          return;
        }
        rowByName.set(name, row);
      });

      const summaryDates = runningDatesFrom(weekStart, SAVED_SCHEDULE_DAYS);
      const dayNamesByDay = summaryDates.map(function mapDayNames(dateIso) {
        const names = Array.isArray(scheduleBook.assignments[dateIso]) ? scheduleBook.assignments[dateIso] : [];
        return uniqueNames(names);
      });
      const dayHasAssignments = dayNamesByDay.map(function mapDay(names) {
        return names.length > 0;
      });
      const roleCountsByDay = dayNamesByDay.map(function mapRoleCounts(names) {
        const counts = { kitchen: 0, servers: 0, bussers: 0 };
        names.forEach(function countRole(name) {
          const row = rowByName.get(String(name || "").trim());
          const role = String(row && row.position || "").trim();
          if (role === "Kitchen") {
            counts.kitchen += 1;
          } else if (role === "Server") {
            counts.servers += 1;
          } else if (role === "Busser") {
            counts.bussers += 1;
          }
        });
        return counts;
      });

      savedRange.textContent = `${longDateFull(summaryDates[0])} to ${longDateFull(summaryDates[summaryDates.length - 1])}`;

      savedHeadRow.innerHTML = `
        <th>Name</th>
        ${summaryDates.map(function mapSavedHead(dateIso, dayIndex) {
          const emptyClass = dayHasAssignments[dayIndex] ? "" : " schedule-saved-day-col--empty";
          return `
            <th class="schedule-saved-day-col${emptyClass}">
              <span class="schedule-saved-day-head">
                <strong>${weekdayShort(dateIso)}</strong>
                <span>${monthDay(dateIso)}</span>
              </span>
            </th>
          `;
        }).join("")}
      `;
      savedRoleCountsRow.innerHTML = `
        <th class="schedule-saved-role-label">Roles</th>
        ${summaryDates.map(function mapRoleCountCell(_dateIso, dayIndex) {
          const emptyClass = dayHasAssignments[dayIndex] ? "" : " schedule-saved-day-col--empty";
          const counts = roleCountsByDay[dayIndex];
          const aria = `Kitchen ${counts.kitchen}, Servers ${counts.servers}, Bussers ${counts.bussers}`;
          return `
            <th class="schedule-saved-role-col${emptyClass}">
              <span class="schedule-saved-role-stack" aria-label="${aria}">
                <span><strong>KT</strong>${counts.kitchen}</span>
                <span><strong>SV</strong>${counts.servers}</span>
                <span><strong>BS</strong>${counts.bussers}</span>
              </span>
            </th>
          `;
        }).join("")}
      `;

      if (savedMobileList) {
        savedMobileList.innerHTML = summaryDates.map(function mapMobileDay(dateIso, dayIndex) {
          const names = dayNamesByDay[dayIndex];
          const counts = roleCountsByDay[dayIndex];
          const empty = !names.length;
          return `
            <article class="schedule-saved-mobile-day${empty ? " schedule-saved-mobile-day--empty" : ""}">
              <header class="schedule-saved-mobile-day__head">
                <span class="schedule-saved-mobile-day__date">
                  <strong>${weekdayShort(dateIso)}</strong>
                  <span>${monthDay(dateIso)}</span>
                </span>
                <span class="schedule-saved-mobile-day__total">${names.length} staff</span>
              </header>
              <div class="schedule-saved-mobile-day__counts" aria-label="Kitchen ${counts.kitchen}, Servers ${counts.servers}, Bussers ${counts.bussers}">
                <span><strong>KT</strong>${counts.kitchen}</span>
                <span><strong>SV</strong>${counts.servers}</span>
                <span><strong>BS</strong>${counts.bussers}</span>
              </div>
              ${empty ? `
                <p class="small schedule-saved-mobile-day__empty">No one scheduled</p>
              ` : `
                <ul class="schedule-saved-mobile-people">
                  ${names.map(function mapPerson(name) {
                    const row = rowByName.get(String(name || "").trim());
                    const role = String(row && row.position || "Off");
                    const roleCode = roleBadgeCode(role);
                    const toneClass = savedShiftToneClass(role);
                    return `
                      <li>
                        <span class="schedule-saved-mobile-person__role ${toneClass}">${roleCode}</span>
                        <span class="schedule-saved-mobile-person__name">${escapedHtml(name)}</span>
                      </li>
                    `;
                  }).join("")}
                </ul>
              `}
            </article>
          `;
        }).join("");
      }

      if (!rows.length) {
        savedBody.innerHTML = `<tr><td colspan="${summaryDates.length + 1}">No staff added yet.</td></tr>`;
        if (savedMobileList) {
          savedMobileList.innerHTML = "<p class='small schedule-saved-mobile-empty'>No staff added yet.</p>";
        }
        return;
      }

      savedBody.innerHTML = rows.map(function mapSavedRow(row) {
        return `
          <tr>
            <td>
              <span class="schedule-saved-name">${escapedHtml(row.name)}</span>
            </td>
            ${summaryDates.map(function mapSavedCell(dateIso, dayIndex) {
              const scheduled = isScheduled(row.name, dateIso);
              const classes = [
                "schedule-saved-cell",
                scheduled ? "schedule-saved-cell--on" : "schedule-saved-cell--off",
                scheduled ? savedShiftToneClass(row.position) : "",
                dayHasAssignments[dayIndex] ? "" : "schedule-saved-cell--empty-day"
              ].join(" ").trim();
              return `
                <td>
                  <span class="${classes}" aria-label="${scheduled ? "Scheduled" : "Not scheduled"}"></span>
                </td>
              `;
            }).join("")}
          </tr>
        `;
      }).join("");
    }

    function renderAll() {
      hideSlotPopover(true);
      weekDates = weekDatesFromSunday(weekStart);
      ensureTempSchedulePreviewSeedForWeek();
      weekAnchorInput.value = weekStart;
      renderHead();
      renderBody();
      renderSavedScheduleGrid();
      updateWeekRangeLabel();
      updateExportButtons();
    }

    function persistAndNotify() {
      scheduleBook.week_anchor = weekStart;
      writeScheduleBook(scheduleBook);
      markDirty(false);
      showSavedFlash();
      window.dispatchEvent(new CustomEvent("gportal:schedule-updated"));
    }

    function clearSlotPopoverError() {
      if (!slotPopoverError) {
        return;
      }
      slotPopoverError.hidden = true;
      slotPopoverError.textContent = "";
    }

    function setSlotPopoverError(message) {
      if (!slotPopoverError) {
        return;
      }
      slotPopoverError.hidden = false;
      slotPopoverError.textContent = message;
    }

    function slotPopoverUsesCloseOut() {
      return Boolean(slotPopover && slotPopover.dataset.customOutMode === "close");
    }

    function clockToPickerParts(clockValue, fallbackClock) {
      const normalized = normalizeShiftClockValue(clockValue, fallbackClock || SCHEDULE_DEFAULT_START_CLOCK);
      const totalMinutes = minutesFromClockValue(normalized);
      const hour24 = Number.isFinite(totalMinutes) ? Math.floor(totalMinutes / 60) : 16;
      const minute = Number.isFinite(totalMinutes) ? (totalMinutes % 60) : 0;
      const meridiem = hour24 >= 12 ? "PM" : "AM";
      const hour12 = hour24 % 12 || 12;
      return {
        hour: String(hour12).padStart(2, "0"),
        minute: pad2(minute),
        meridiem: meridiem
      };
    }

    function pickerPartsToClock(hourValue, minuteValue, meridiemValue) {
      const hour = Number(String(hourValue || "").replace(/\D+/g, ""));
      const minute = Number(String(minuteValue || "").replace(/\D+/g, ""));
      const meridiem = String(meridiemValue || "").trim().toUpperCase();
      if (!Number.isInteger(hour) || hour < 1 || hour > 12) {
        return "";
      }
      if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
        return "";
      }
      if (meridiem !== "AM" && meridiem !== "PM") {
        return "";
      }
      let hour24 = hour % 12;
      if (meridiem === "PM") {
        hour24 += 12;
      }
      return `${pad2(hour24)}:${pad2(minute)}`;
    }

    function setSlotPopoverOutMode(mode) {
      if (
        !slotPopover
        || !slotPopoverOutPicker
        || !slotPopoverOutHour
        || !slotPopoverOutMinute
        || !slotPopoverOutMeridiem
        || !slotPopoverCloseToggle
      ) {
        return;
      }
      const closeMode = mode === "close";
      slotPopover.dataset.customOutMode = closeMode ? "close" : "time";
      slotPopoverOutHour.disabled = closeMode;
      slotPopoverOutMinute.disabled = closeMode;
      slotPopoverOutMeridiem.disabled = closeMode;
      slotPopoverOutPicker.classList.toggle("is-disabled", closeMode);
      slotPopoverCloseToggle.setAttribute("aria-pressed", closeMode ? "true" : "false");
      slotPopoverCloseToggle.textContent = closeMode ? "Close ✓" : "Close";
      if (closeMode) {
        return;
      }
      const currentOut = pickerPartsToClock(
        slotPopoverOutHour.value,
        slotPopoverOutMinute.value,
        slotPopoverOutMeridiem.value
      );
      if (!currentOut) {
        const fallback = clockToPickerParts(SCHEDULE_DEFAULT_END_CLOCK, SCHEDULE_DEFAULT_END_CLOCK);
        slotPopoverOutHour.value = fallback.hour;
        slotPopoverOutMinute.value = fallback.minute;
        slotPopoverOutMeridiem.value = fallback.meridiem;
      }
    }

    function focusSlotPopoverSelect(selectElement) {
      if (!selectElement || selectElement.disabled) {
        return;
      }
      selectElement.focus({ preventScroll: true });
      if (typeof selectElement.showPicker === "function") {
        try {
          selectElement.showPicker();
        } catch (_ignored) {
          // showPicker is not available in all browsers/states.
        }
      }
    }

    function positionSlotPopover(anchorButton) {
      if (!slotPopover || slotPopover.hidden || !anchorButton) {
        return;
      }
      const rect = anchorButton.getBoundingClientRect();
      const margin = 8;
      const width = Math.max(186, Math.round(rect.width * 1.62));
      slotPopover.style.width = `${width}px`;

      const popRect = slotPopover.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let left = rect.left + window.scrollX;
      left = Math.max(window.scrollX + margin, Math.min(left, window.scrollX + viewportWidth - popRect.width - margin));

      let top = rect.bottom + window.scrollY + 6;
      if (rect.bottom + popRect.height + 10 > viewportHeight) {
        top = rect.top + window.scrollY - popRect.height - 6;
      }
      top = Math.max(window.scrollY + margin, top);

      slotPopover.style.left = `${Math.round(left)}px`;
      slotPopover.style.top = `${Math.round(top)}px`;
    }

    function hideSlotPopover(immediate) {
      if (!slotPopover) {
        return;
      }
      if (slotPopoverHideTimer) {
        window.clearTimeout(slotPopoverHideTimer);
        slotPopoverHideTimer = null;
      }

      if (immediate) {
        slotPopover.classList.remove("is-open");
        slotPopover.hidden = true;
      } else if (!slotPopover.hidden) {
        slotPopover.classList.remove("is-open");
        slotPopoverHideTimer = window.setTimeout(function finishSlotPopoverHide() {
          slotPopover.hidden = true;
          slotPopoverHideTimer = null;
        }, 150);
      }

      slotPopoverState = null;
      slotPopoverAnchor = null;
      clearSlotPopoverError();
    }

    function refreshAfterSlotChange() {
      markDirty(true);
      renderBody();
      renderSavedScheduleGrid();
      updateExportButtons();
    }

    function openSlotPopover(name, dateIso, anchorButton) {
      if (!canEdit || !slotPopover) {
        return;
      }
      const cleanName = String(name || "").trim();
      if (!cleanName || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
        return;
      }
      slotPopoverState = { name: cleanName, dateIso: dateIso };
      slotPopoverAnchor = anchorButton;
      clearSlotPopoverError();
      const detail = getShiftDetail(cleanName, dateIso);
      const inParts = clockToPickerParts(detail.start, SCHEDULE_DEFAULT_START_CLOCK);
      if (slotPopoverInHour) {
        slotPopoverInHour.value = inParts.hour;
      }
      if (slotPopoverInMinute) {
        slotPopoverInMinute.value = inParts.minute;
      }
      if (slotPopoverInMeridiem) {
        slotPopoverInMeridiem.value = inParts.meridiem;
      }

      const outParts = clockToPickerParts(
        isShiftCloseValue(detail.end) ? SCHEDULE_DEFAULT_END_CLOCK : detail.end,
        SCHEDULE_DEFAULT_END_CLOCK
      );
      if (slotPopoverOutHour) {
        slotPopoverOutHour.value = outParts.hour;
      }
      if (slotPopoverOutMinute) {
        slotPopoverOutMinute.value = outParts.minute;
      }
      if (slotPopoverOutMeridiem) {
        slotPopoverOutMeridiem.value = outParts.meridiem;
      }
      setSlotPopoverOutMode(isShiftCloseValue(detail.end) ? "close" : "time");

      if (slotPopoverHideTimer) {
        window.clearTimeout(slotPopoverHideTimer);
        slotPopoverHideTimer = null;
      }

      slotPopover.hidden = false;
      positionSlotPopover(anchorButton);
      window.requestAnimationFrame(function animateSlotPopoverOpen() {
        slotPopover.classList.add("is-open");
      });
    }

    function applySlotPreset(startClock, endClock) {
      if (!slotPopoverState) {
        return;
      }
      setScheduledSlot(slotPopoverState.name, slotPopoverState.dateIso, { start: startClock, end: endClock });
      refreshAfterSlotChange();
      hideSlotPopover(true);
    }

    function applySlotCustom() {
      if (!slotPopoverState) {
        return;
      }
      const startClock = pickerPartsToClock(
        slotPopoverInHour && slotPopoverInHour.value,
        slotPopoverInMinute && slotPopoverInMinute.value,
        slotPopoverInMeridiem && slotPopoverInMeridiem.value
      );
      const useClose = slotPopoverUsesCloseOut();
      const endClock = useClose
        ? SCHEDULE_CLOSE_TOKEN
        : pickerPartsToClock(
            slotPopoverOutHour && slotPopoverOutHour.value,
            slotPopoverOutMinute && slotPopoverOutMinute.value,
            slotPopoverOutMeridiem && slotPopoverOutMeridiem.value
          );
      if (!startClock || !endClock) {
        setSlotPopoverError("Set clock-in and clock-out.");
        return;
      }
      if (!useClose && minutesFromClockValue(endClock) <= minutesFromClockValue(startClock)) {
        setSlotPopoverError("Out must be after in.");
        return;
      }
      applySlotPreset(startClock, endClock);
    }

    function applySlotOff() {
      if (!slotPopoverState) {
        return;
      }
      clearScheduledSlot(slotPopoverState.name, slotPopoverState.dateIso);
      refreshAfterSlotChange();
      hideSlotPopover(true);
    }

    function bindScheduleSlotClicks(targetRoot) {
      if (!targetRoot) {
        return;
      }
      targetRoot.addEventListener("click", function onScheduleSlotClick(event) {
        const slotButton = event.target.closest("button[data-schedule-slot-name][data-schedule-slot-date]");
        if (!slotButton || !targetRoot.contains(slotButton)) {
          return;
        }
        event.preventDefault();
        const name = String(slotButton.getAttribute("data-schedule-slot-name") || "").trim();
        const dateIso = String(slotButton.getAttribute("data-schedule-slot-date") || "").trim();
        if (!name || !isIsoDateString(dateIso)) {
          return;
        }
        if (!slotPopover.hidden && slotPopoverState && slotPopoverState.name === name && slotPopoverState.dateIso === dateIso) {
          hideSlotPopover();
          return;
        }
        openSlotPopover(name, dateIso, slotButton);
      });
    }

    if (canEdit && slotPopover) {
      bindScheduleSlotClicks(body);
      bindScheduleSlotClicks(mobileList);

      slotPopover.addEventListener("click", function onSlotPopoverClick(event) {
        const presetButton = event.target.closest("button[data-schedule-popover-preset]");
        if (presetButton) {
          const preset = String(presetButton.getAttribute("data-schedule-popover-preset") || "");
          const parts = preset.split("|");
          if (parts.length === 2) {
            applySlotPreset(parts[0], parts[1]);
          }
          return;
        }
        const actionButton = event.target.closest("button[data-schedule-popover-action]");
        if (!actionButton) {
          return;
        }
        const action = String(actionButton.getAttribute("data-schedule-popover-action") || "");
        if (action === "toggle-close") {
          setSlotPopoverOutMode(slotPopoverUsesCloseOut() ? "time" : "close");
          clearSlotPopoverError();
          return;
        }
        if (action === "apply-custom") {
          applySlotCustom();
          return;
        }
        if (action === "set-off") {
          applySlotOff();
        }
      });

      [
        slotPopoverInHour,
        slotPopoverInMinute,
        slotPopoverInMeridiem,
        slotPopoverOutHour,
        slotPopoverOutMinute,
        slotPopoverOutMeridiem
      ].forEach(function bindSlotPopoverSelect(selectElement) {
        selectElement?.addEventListener("keydown", function onSlotPopoverSelectKeydown(event) {
          if (event.key === "Enter") {
            event.preventDefault();
            applySlotCustom();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            hideSlotPopover();
          }
        });
        selectElement?.addEventListener("change", function onSlotPopoverSelectChange() {
          clearSlotPopoverError();
        });
      });

      [slotPopoverInPicker, slotPopoverOutPicker].forEach(function bindSlotPopoverPicker(pickerElement) {
        pickerElement?.addEventListener("click", function onSlotPopoverPickerClick(event) {
          const pickerKind = String(pickerElement.getAttribute("data-schedule-time-picker") || "").trim();
          if (pickerKind === "out" && slotPopoverUsesCloseOut()) {
            setSlotPopoverOutMode("time");
            clearSlotPopoverError();
          }
          const clickedSelect = event.target.closest("select");
          if (clickedSelect) {
            return;
          }
          const firstSelect = GPortal.qs("select:not(:disabled)", pickerElement);
          focusSlotPopoverSelect(firstSelect);
        });
      });

      document.addEventListener("click", function onDocumentSlotPopoverClick(event) {
        if (!slotPopover || slotPopover.hidden) {
          return;
        }
        if (slotPopover.contains(event.target)) {
          return;
        }
        const trigger = event.target.closest("button[data-schedule-slot-name][data-schedule-slot-date]");
        if (trigger) {
          return;
        }
        hideSlotPopover();
      });

      document.addEventListener("keydown", function onDocumentSlotPopoverKeydown(event) {
        if (event.key === "Escape" && slotPopover && !slotPopover.hidden) {
          event.preventDefault();
          hideSlotPopover();
        }
      });

      window.addEventListener("resize", function onSlotPopoverResize() {
        if (!slotPopover || slotPopover.hidden) {
          return;
        }
        positionSlotPopover(slotPopoverAnchor);
      });

      window.addEventListener("scroll", function onSlotPopoverScroll() {
        if (!slotPopover || slotPopover.hidden) {
          return;
        }
        positionSlotPopover(slotPopoverAnchor);
      }, true);
    }

    function weekHasAnyAssignments(startIso) {
      return weekDatesFromSunday(startIso).some(function hasDayAssignments(dateIso) {
        return Array.isArray(scheduleBook.assignments[dateIso]) && scheduleBook.assignments[dateIso].length > 0;
      });
    }

    function cloneWeekAssignments(fromWeekStart, toWeekStart) {
      const fromDates = weekDatesFromSunday(fromWeekStart);
      const toDates = weekDatesFromSunday(toWeekStart);
      let changed = false;

      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const fromDateIso = fromDates[dayIndex];
        const toDateIso = toDates[dayIndex];
        const fromNames = Array.isArray(scheduleBook.assignments[fromDateIso])
          ? scheduleBook.assignments[fromDateIso]
          : [];
        const nextNames = uniqueNames(fromNames);
        const currentNames = Array.isArray(scheduleBook.assignments[toDateIso])
          ? uniqueNames(scheduleBook.assignments[toDateIso])
          : [];
        const fromDetailsSource = scheduleBook.shift_details && scheduleBook.shift_details[fromDateIso];
        const currentDetailsSource = scheduleBook.shift_details && scheduleBook.shift_details[toDateIso];
        const nextDetails = {};
        const currentDetails = {};

        nextNames.forEach(function mapNextDetail(name) {
          const raw = fromDetailsSource && typeof fromDetailsSource === "object"
            ? fromDetailsSource[name]
            : null;
          nextDetails[name] = normalizeScheduleShiftDetail(raw);
        });
        currentNames.forEach(function mapCurrentDetail(name) {
          const raw = currentDetailsSource && typeof currentDetailsSource === "object"
            ? currentDetailsSource[name]
            : null;
          currentDetails[name] = normalizeScheduleShiftDetail(raw);
        });

        const namesChanged = JSON.stringify(currentNames) !== JSON.stringify(nextNames);
        const detailsChanged = JSON.stringify(currentDetails) !== JSON.stringify(nextDetails);
        if (!namesChanged && !detailsChanged) {
          continue;
        }

        scheduleBook.assignments[toDateIso] = nextNames;
        if (!scheduleBook.shift_details || typeof scheduleBook.shift_details !== "object") {
          scheduleBook.shift_details = {};
        }
        if (nextNames.length) {
          scheduleBook.shift_details[toDateIso] = nextDetails;
        } else {
          delete scheduleBook.shift_details[toDateIso];
        }
        changed = true;
      }

      return changed;
    }

    function maybeCarryForwardWeek(sourceWeekStart, targetWeekStart) {
      if (!canEdit) {
        return;
      }
      if (sourceWeekStart === targetWeekStart) {
        return;
      }
      if (weekHasAnyAssignments(targetWeekStart)) {
        return;
      }
      if (!weekHasAnyAssignments(sourceWeekStart)) {
        return;
      }
      if (cloneWeekAssignments(sourceWeekStart, targetWeekStart)) {
        markDirty(true);
      }
    }

    function moveWeek(weekOffset) {
      const sourceWeekStart = weekStart;
      const targetWeekStart = sundayForIso(addDaysIsoDate(weekStart, weekOffset * 7));
      weekStart = targetWeekStart;
      maybeCarryForwardWeek(sourceWeekStart, targetWeekStart);
      renderAll();
    }

    function bindWeekNavButton(button, offset) {
      if (!button) {
        return;
      }
      button.disabled = false;
      button.addEventListener("click", function onWeekNavClick() {
        moveWeek(offset);
      });
    }

    bindWeekNavButton(prevBtn, -1);
    bindWeekNavButton(nextBtn, 1);
    bindWeekNavButton(savedPrevBtn, -1);
    bindWeekNavButton(savedNextBtn, 1);

    weekAnchorInput.disabled = false;
    weekAnchorInput.addEventListener("change", function onAnchorChange() {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekAnchorInput.value)) {
        return;
      }
      const sourceWeekStart = weekStart;
      const targetWeekStart = sundayForIso(weekAnchorInput.value);
      weekStart = targetWeekStart;
      maybeCarryForwardWeek(sourceWeekStart, targetWeekStart);
      renderAll();
    });
    weekAnchorInput.addEventListener("click", function onAnchorClick() {
      openNativeDatePicker(weekAnchorInput);
    });
    weekAnchorInput.addEventListener("dblclick", function onAnchorDoubleClick() {
      openNativeDatePicker(weekAnchorInput);
    });
    weekAnchorInput.addEventListener("focus", function onAnchorFocus() {
      openNativeDatePicker(weekAnchorInput);
    });

    if (saveWrap) {
      saveWrap.hidden = false;
    }
    saveBtn.hidden = !canEdit;
    saveBtn.disabled = !canEdit;
    if (savedFlash) {
      savedFlash.hidden = !canEdit;
    }
    if (calendarExportBtn) {
      calendarExportBtn.hidden = canEdit;
      calendarExportBtn.addEventListener("click", function onCalendarDownload() {
        downloadScheduleIcs();
      });
    }
    saveBtn.addEventListener("click", function onScheduleSaveClick() {
      if (!canEdit) {
        return;
      }
      persistAndNotify();
    });

    window.addEventListener("storage", function onScheduleStorage(event) {
      if (event.key !== SCHEDULE_STORAGE_KEY && event.key !== STAFF_ROSTER_STORAGE_KEY) {
        return;
      }
      scheduleBook = readScheduleBook();
      weekStart = sundayForIso(scheduleBook.week_anchor || weekStart);
      markDirty(false);
      renderAll();
    });

    window.addEventListener("gportal:schedule-updated", function onScheduleUpdated() {
      scheduleBook = readScheduleBook();
      weekStart = sundayForIso(scheduleBook.week_anchor || weekStart);
      markDirty(false);
      renderAll();
    });

    markDirty(false);
    renderAll();
  }

  const TIP_WORKBOOK_STORAGE_KEY = "gportal_tip_workbook_v1";
  const TIP_WORKBOOK_REV_KEY = "gportal_tip_workbook_rev_v1";
  const TIP_SELECTED_DAY_KEY = "gportal_tip_selected_day";
  const TIP_SUMMARY_START_DATE_KEY = "gportal_tip_summary_start_day";
  const TIP_SUMMARY_END_DATE_KEY = "gportal_tip_summary_end_day";
  const STAFF_ROSTER_STORAGE_KEY = "gportal_staff_roster_v1";
  const SCHEDULE_STORAGE_KEY = "gportal_schedule_grid_v1";
  const SQUARE_INTEGRATION_STORAGE_KEY = "gportal_square_integration_v1";
  const MENU_HUB_STORAGE_KEY = "gportal_menu_hub_v1";
  const PORTAL_STATE_TABLE = "portal_state";
  const PORTAL_SYNC_STATE_KEYS = [
    STAFF_ROSTER_STORAGE_KEY,
    SCHEDULE_STORAGE_KEY,
    TIP_WORKBOOK_STORAGE_KEY,
    SQUARE_INTEGRATION_STORAGE_KEY,
    MENU_HUB_STORAGE_KEY
  ];
  const SCHEDULE_DEFAULT_START_CLOCK = "16:00";
  const SCHEDULE_DEFAULT_END_CLOCK = "21:00";
  const SCHEDULE_EXTENDED_START_CLOCK = "13:00";
  const SCHEDULE_CLOSE_TOKEN = "CLOSE";
  const TIP_DAY_COUNT = 17;
  const MENU_UPLOAD_MAX_BYTES = 2621440; // 2.5MB
  const TEMP_STAFF_EMPLOYEES = [
    "Donavan Parrish",
    "Austin Andrade",
    "Marcus Gilliland",
    "Leo Lorentzen",
    "Kylee Cox",
    "Ivey Graffigna",
    "Brooke Haro",
    "Gianni Pitto",
    "Natalie Riggs",
    "Mateah Saragoza",
    "Julianna Crisp",
    "Lucca Guantone",
    "Sofia Guantone",
    "Celeste Plateau",
    "Bear"
  ];
  const TIP_ROSTER_SIZE = 40;
  const STAFF_POSITIONS = ["Kitchen", "Server", "Busser", "Host", "Manager", "Owner", "Off"];
  const STAFF_DIRECTORY_POSITIONS = STAFF_POSITIONS.filter(function keepDirectoryPosition(position) {
    return position !== "Off";
  });
  const TIP_POSITIONS = ["Kitchen", "Server", "Busser", "OOP", "Off"];
  const ROLE_SELECT_THEME_CLASSES = [
    "role-theme--kitchen",
    "role-theme--server",
    "role-theme--busser",
    "role-theme--host",
    "role-theme--manager",
    "role-theme--owner",
    "role-theme--oop",
    "role-theme--off"
  ];
  const portalStateSync = {
    session: null,
    profile: null,
    hydrated: false,
    loading: null,
    writeQueue: new Map(),
    flushTimer: null,
    supported: true,
    lastError: "",
    listenersBound: false
  };

  function safeParseJson(rawValue) {
    try {
      return JSON.parse(rawValue);
    } catch (_error) {
      return null;
    }
  }

  function readRawLocalState(stateKey) {
    const raw = window.localStorage.getItem(stateKey);
    if (!raw) {
      return null;
    }
    return safeParseJson(raw);
  }

  function writeRawLocalState(stateKey, payload) {
    if (payload === undefined) {
      return;
    }
    window.localStorage.setItem(stateKey, JSON.stringify(payload));
  }

  function canUsePortalSync(session) {
    return Boolean(session && !session.isTemp && GPortal.hasSupabaseConfig());
  }

  function setPortalSyncContext(session, profile) {
    portalStateSync.session = session || null;
    portalStateSync.profile = profile || null;

    if (!portalStateSync.listenersBound) {
      window.addEventListener("beforeunload", function onBeforeUnload() {
        if (portalStateSync.flushTimer) {
          window.clearTimeout(portalStateSync.flushTimer);
          portalStateSync.flushTimer = null;
        }
        void flushPortalSyncWrites();
      });

      document.addEventListener("visibilitychange", function onVisibilityChange() {
        if (document.visibilityState === "hidden") {
          if (portalStateSync.flushTimer) {
            window.clearTimeout(portalStateSync.flushTimer);
            portalStateSync.flushTimer = null;
          }
          void flushPortalSyncWrites();
        }
      });

      portalStateSync.listenersBound = true;
    }
  }

  function queuePortalSyncWrite(stateKey, payload) {
    if (!canUsePortalSync(portalStateSync.session) || !portalStateSync.supported) {
      return;
    }

    if (!PORTAL_SYNC_STATE_KEYS.includes(stateKey)) {
      return;
    }

    portalStateSync.writeQueue.set(stateKey, payload);
    if (portalStateSync.flushTimer) {
      window.clearTimeout(portalStateSync.flushTimer);
    }
    portalStateSync.flushTimer = window.setTimeout(function flushSoon() {
      portalStateSync.flushTimer = null;
      void flushPortalSyncWrites();
    }, 220);
  }

  async function flushPortalSyncWrites() {
    if (!canUsePortalSync(portalStateSync.session) || !portalStateSync.supported) {
      return;
    }

    if (!portalStateSync.writeQueue.size) {
      return;
    }

    const pendingRows = Array.from(portalStateSync.writeQueue.entries()).map(function mapPending(entry) {
      return {
        state_key: entry[0],
        payload: entry[1],
        updated_by: portalStateSync.session.user.id,
        updated_at: new Date().toISOString()
      };
    });
    portalStateSync.writeQueue.clear();

    try {
      const sb = GPortal.getSupabase();
      const result = await sb
        .from(PORTAL_STATE_TABLE)
        .upsert(pendingRows, { onConflict: "state_key" });
      if (result.error) {
        portalStateSync.lastError = String(result.error.message || result.error || "Unknown portal sync error");
        console.warn("Portal shared-state write failed.", result.error);
      } else {
        portalStateSync.lastError = "";
      }
    } catch (error) {
      portalStateSync.lastError = String(error && error.message ? error.message : error);
      console.warn("Portal shared-state write failed.", error);
    }
  }

  async function hydratePortalSyncState(session) {
    if (!canUsePortalSync(session) || !portalStateSync.supported) {
      return;
    }

    if (portalStateSync.hydrated) {
      return;
    }

    if (portalStateSync.loading) {
      await portalStateSync.loading;
      return;
    }

    portalStateSync.loading = (async function runHydration() {
      try {
        const sb = GPortal.getSupabase();
        const remote = await sb
          .from(PORTAL_STATE_TABLE)
          .select("state_key,payload")
          .in("state_key", PORTAL_SYNC_STATE_KEYS);

        if (remote.error) {
          portalStateSync.lastError = String(remote.error.message || remote.error || "Unknown portal sync error");
          if (String(remote.error.message || "").toLowerCase().includes("portal_state")) {
            portalStateSync.supported = false;
          }
          console.warn("Portal shared-state hydration failed.", remote.error);
          return;
        }

        const remoteByKey = new Map();
        (remote.data || []).forEach(function mapRow(row) {
          if (!row || !row.state_key) {
            return;
          }
          remoteByKey.set(String(row.state_key), row.payload);
        });

        const seedRows = [];
        PORTAL_SYNC_STATE_KEYS.forEach(function forEachStateKey(stateKey) {
          if (remoteByKey.has(stateKey)) {
            const payload = remoteByKey.get(stateKey);
            if (payload !== null && payload !== undefined) {
              writeRawLocalState(stateKey, payload);
            }
            return;
          }

          const localPayload = readRawLocalState(stateKey);
          if (localPayload !== null) {
            seedRows.push({
              state_key: stateKey,
              payload: localPayload,
              updated_by: session.user.id,
              updated_at: new Date().toISOString()
            });
          }
        });

        if (seedRows.length) {
          const seedResult = await sb
            .from(PORTAL_STATE_TABLE)
            .upsert(seedRows, { onConflict: "state_key" });
          if (seedResult.error) {
            portalStateSync.lastError = String(seedResult.error.message || seedResult.error || "Unknown portal sync error");
            console.warn("Portal shared-state seed failed.", seedResult.error);
          }
        }

        portalStateSync.hydrated = true;
        portalStateSync.lastError = "";
      } catch (error) {
        portalStateSync.lastError = String(error && error.message ? error.message : error);
        console.warn("Portal shared-state hydration failed.", error);
      } finally {
        portalStateSync.loading = null;
      }
    })();

    await portalStateSync.loading;
  }

  function renderPortalDataModeNotice(session, profile) {
    const notice = GPortal.qs("#appSetupNotice");
    if (!notice) {
      return;
    }

    const canManage = Boolean(profile && (profile.role === "admin" || profile.role === "manager"));

    if (session && session.isTemp) {
      GPortal.showNotice(
        notice,
        "Temporary login mode is device-local. Data changed here does not sync across devices.",
        "error"
      );
      return;
    }

    if (portalStateSync.lastError && canManage) {
      GPortal.showNotice(
        notice,
        "Shared sync is not ready. Run db/migrations/2026-03-08-portal-shared-state.sql in Supabase.",
        "error"
      );
      return;
    }

    notice.hidden = true;
    notice.textContent = "";
    notice.classList.remove("notice--error", "notice--ok");
  }

  function roleThemeKey(roleValue) {
    const role = String(roleValue || "").trim();
    if (role === "Kitchen") return "kitchen";
    if (role === "Server") return "server";
    if (role === "Busser") return "busser";
    if (role === "Host") return "host";
    if (role === "Manager") return "manager";
    if (role === "Owner") return "owner";
    if (role === "OOP") return "oop";
    return "off";
  }

  function roleThemeClassName(roleValue) {
    return `role-theme--${roleThemeKey(roleValue)}`;
  }

  function roleOptionInlineStyle(roleValue) {
    const key = roleThemeKey(roleValue);
    if (key === "kitchen") return "background:#e8f2ff;color:#1c3554;";
    if (key === "server") return "background:#fff7db;color:#5a4617;";
    if (key === "busser") return "background:#f0f8e8;color:#2f4f1f;";
    if (key === "host") return "background:#f5f0ff;color:#46346f;";
    if (key === "manager") return "background:#e9f6f1;color:#1e4c3d;";
    if (key === "owner") return "background:#fcefd7;color:#5f4718;";
    if (key === "oop") return "background:#fff0f0;color:#6d2f2f;";
    return "background:#f3f3f3;color:#3d3d3d;";
  }

  function applyRoleSelectTheme(selectElement, roleValue) {
    if (!selectElement) {
      return;
    }
    ROLE_SELECT_THEME_CLASSES.forEach(function removeTheme(className) {
      selectElement.classList.remove(className);
    });
    selectElement.classList.add(roleThemeClassName(roleValue));
    selectElement.setAttribute("data-role-colored", "true");
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function localIsoDate(inputDate) {
    const date = inputDate instanceof Date ? inputDate : new Date(inputDate);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function addDaysIsoDate(isoDate, dayOffset) {
    const base = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(base.getTime())) {
      return "";
    }
    base.setDate(base.getDate() + dayOffset);
    return localIsoDate(base);
  }

  function sundayForIso(isoDate) {
    const base = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(base.getTime())) {
      return localIsoDate(new Date());
    }
    base.setDate(base.getDate() - base.getDay());
    return localIsoDate(base);
  }

  function weekDatesFromSunday(sundayIso) {
    return Array.from({ length: 7 }, function mapWeek(_item, index) {
      return addDaysIsoDate(sundayIso, index);
    });
  }

  function isSundayIso(isoDate) {
    const date = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return false;
    }
    return date.getDay() === 0;
  }

  function weekdayShort(isoDate) {
    const date = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }

  function monthDay(isoDate) {
    const date = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }
    return date.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
  }

  function longDate(isoDate) {
    const date = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }
    return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }

  function shortDate(isoDate) {
    const date = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }
    return date.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
  }

  function longDateFull(isoDate) {
    const date = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }
    return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }

  function parseMoneyValue(rawValue) {
    if (typeof rawValue === "number") {
      return Number.isFinite(rawValue) ? rawValue : 0;
    }
    const cleaned = String(rawValue || "").replace(/[^0-9.-]/g, "");
    if (!cleaned) {
      return 0;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizedMoney(rawValue) {
    const parsed = parseMoneyValue(rawValue);
    return Math.round(parsed * 100) / 100;
  }

  function toCents(amount) {
    return Math.round(normalizedMoney(amount) * 100);
  }

  function moneyInputValue(amount) {
    const value = normalizedMoney(amount);
    return value === 0 ? "" : value.toFixed(2);
  }

  function escapedHtml(rawValue) {
    return String(rawValue || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function minutesFromClockValue(clockValue) {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(clockValue || "").trim());
    if (!match) {
      return Number.NaN;
    }
    return (Number(match[1]) * 60) + Number(match[2]);
  }

  function isShiftCloseValue(rawValue) {
    const normalized = String(rawValue || "").trim().toUpperCase();
    return normalized === SCHEDULE_CLOSE_TOKEN || normalized === "CLOSE";
  }

  function normalizeShiftClockValue(rawValue, fallbackClock) {
    const value = String(rawValue || "").trim();
    if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) {
      return value;
    }
    return String(fallbackClock || "").trim();
  }

  function normalizeShiftEndValue(rawValue, fallbackValue) {
    if (isShiftCloseValue(rawValue)) {
      return SCHEDULE_CLOSE_TOKEN;
    }
    const direct = normalizeShiftClockValue(rawValue, "");
    if (direct) {
      return direct;
    }
    if (isShiftCloseValue(fallbackValue)) {
      return SCHEDULE_CLOSE_TOKEN;
    }
    return normalizeShiftClockValue(fallbackValue, SCHEDULE_DEFAULT_END_CLOCK);
  }

  function normalizeScheduleShiftDetail(rawValue) {
    const source = rawValue && typeof rawValue === "object" ? rawValue : {};
    let start = normalizeShiftClockValue(source.start || source.in || source.clock_in, SCHEDULE_DEFAULT_START_CLOCK);
    let end = normalizeShiftEndValue(source.end || source.out || source.clock_out, SCHEDULE_DEFAULT_END_CLOCK);
    if (!isShiftCloseValue(end) && minutesFromClockValue(end) <= minutesFromClockValue(start)) {
      start = SCHEDULE_DEFAULT_START_CLOCK;
      end = SCHEDULE_DEFAULT_END_CLOCK;
    }
    return { start: start, end: end };
  }

  function formatShiftClockLabel(clockValue, fallbackClock) {
    if (isShiftCloseValue(clockValue)) {
      return "Close";
    }
    const normalized = normalizeShiftClockValue(clockValue, fallbackClock || SCHEDULE_DEFAULT_START_CLOCK);
    const totalMinutes = minutesFromClockValue(normalized);
    if (!Number.isFinite(totalMinutes)) {
      return formatShiftClockLabel(fallbackClock || SCHEDULE_DEFAULT_START_CLOCK, SCHEDULE_DEFAULT_START_CLOCK);
    }
    const hour24 = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    const hour12 = hour24 % 12 || 12;
    const suffix = hour24 >= 12 ? "PM" : "AM";
    return `${hour12}:${pad2(minute)} ${suffix}`;
  }

  function scheduleShiftRangeLabel(detailValue) {
    const detail = normalizeScheduleShiftDetail(detailValue);
    return `${formatShiftClockLabel(detail.start, SCHEDULE_DEFAULT_START_CLOCK)} - ${formatShiftClockLabel(detail.end, SCHEDULE_DEFAULT_END_CLOCK)}`;
  }

  function scheduleShiftCardHtml(detailValue) {
    const detail = normalizeScheduleShiftDetail(detailValue);
    return `${escapedHtml(formatShiftClockLabel(detail.start, SCHEDULE_DEFAULT_START_CLOCK))}<br>${escapedHtml(formatShiftClockLabel(detail.end, SCHEDULE_DEFAULT_END_CLOCK))}`;
  }

  function scheduleShiftDetailFor(scheduleBook, dateIso, staffName) {
    if (!scheduleBook || !isIsoDateString(dateIso)) {
      return normalizeScheduleShiftDetail({});
    }
    const dayDetails = scheduleBook.shift_details && scheduleBook.shift_details[dateIso];
    const rawDetail = dayDetails && dayDetails[String(staffName || "").trim()];
    return normalizeScheduleShiftDetail(rawDetail);
  }

  function normalizeStaffEmail(email) {
    return String(email || "").trim().toLowerCase().slice(0, 120);
  }

  function normalizeStaffPhone(phone) {
    const formatted = typeof GPortal.formatPhoneUS === "function"
      ? GPortal.formatPhoneUS(String(phone || ""))
      : String(phone || "");
    return String(formatted || "").trim().slice(0, 24);
  }

  function normalizeStaffStatus(status) {
    const value = String(status || "").trim().toLowerCase();
    return value === "inactive" ? "Inactive" : "Active";
  }

  function normalizeStaffUserId(userId) {
    return String(userId || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "")
      .slice(0, 64);
  }

  function emptyStaffRow(name, position, email, phone, userId, status, index) {
    const safeName = String(name || "").trim().slice(0, 80);
    const safePosition = STAFF_POSITIONS.includes(position) ? position : "Off";
    const safeEmail = normalizeStaffEmail(email);
    const safeIndex = Number.isInteger(index) && index >= 0 ? index + 1 : 1;
    const emailPrefix = safeEmail ? safeEmail.split("@")[0] : "";
    const namePrefix = safeName.toLowerCase().replace(/[^a-z0-9]+/g, ".");
    const fallbackUserId = normalizeStaffUserId(emailPrefix || namePrefix || `local-${safeIndex}`) || `local-${safeIndex}`;
    return {
      name: safeName,
      position: safePosition,
      email: safeEmail,
      phone: normalizeStaffPhone(phone),
      user_id: normalizeStaffUserId(userId) || fallbackUserId,
      status: normalizeStaffStatus(status)
    };
  }

  function normalizeStaffRows(rows) {
    if (!Array.isArray(rows)) {
      return [];
    }

    return rows
      .slice(0, TIP_ROSTER_SIZE)
      .map(function mapRows(row, index) {
        return emptyStaffRow(row && row.name, row && row.position, row && row.email, row && row.phone, row && row.user_id, row && row.status, index);
      })
      .filter(function keepNamed(row) {
        return Boolean(row.name);
      });
  }

  function defaultStaffRows() {
    return TEMP_STAFF_EMPLOYEES.map(function mapNames(name, index) {
      return emptyStaffRow(name, "Off", "", "", "", "Active", index);
    });
  }

  function readStaffRows() {
    try {
      const raw = window.localStorage.getItem(STAFF_ROSTER_STORAGE_KEY);
      if (!raw) {
        return defaultStaffRows();
      }
      const parsed = JSON.parse(raw);
      const normalized = normalizeStaffRows(parsed);
      return normalized;
    } catch (_error) {
      return defaultStaffRows();
    }
  }

  function writeStaffRows(rows) {
    const normalized = normalizeStaffRows(rows);
    window.localStorage.setItem(STAFF_ROSTER_STORAGE_KEY, JSON.stringify(normalized));
    queuePortalSyncWrite(STAFF_ROSTER_STORAGE_KEY, normalized);
  }

  function uniqueNames(names) {
    const set = new Set();
    names.forEach(function addName(name) {
      const cleaned = String(name || "").trim();
      if (cleaned) {
        set.add(cleaned);
      }
    });
    return Array.from(set);
  }

  function normalizeScheduleBook(rawValue) {
    const source = rawValue && typeof rawValue === "object" ? rawValue : {};
    const assignments = {};
    const shiftDetails = {};
    if (source.assignments && typeof source.assignments === "object") {
      Object.keys(source.assignments).forEach(function mapDay(dateIso) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
          return;
        }
        assignments[dateIso] = uniqueNames(Array.isArray(source.assignments[dateIso]) ? source.assignments[dateIso] : []);
      });
    }

    if (source.shift_details && typeof source.shift_details === "object") {
      Object.keys(source.shift_details).forEach(function mapShiftDetailDay(dateIso) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
          return;
        }
        const daySource = source.shift_details[dateIso];
        if (!daySource || typeof daySource !== "object") {
          return;
        }
        const dayDetails = {};
        Object.keys(daySource).forEach(function mapShiftDetailName(rawName) {
          const name = String(rawName || "").trim();
          if (!name) {
            return;
          }
          dayDetails[name] = normalizeScheduleShiftDetail(daySource[rawName]);
        });
        if (Object.keys(dayDetails).length) {
          shiftDetails[dateIso] = dayDetails;
        }
      });
    }

    Object.keys(assignments).forEach(function ensureShiftDetailsForAssigned(dateIso) {
      const assignedNames = Array.isArray(assignments[dateIso]) ? assignments[dateIso] : [];
      if (!assignedNames.length) {
        delete shiftDetails[dateIso];
        return;
      }
      const dayDetails = shiftDetails[dateIso] && typeof shiftDetails[dateIso] === "object"
        ? shiftDetails[dateIso]
        : {};
      const nextDayDetails = {};
      assignedNames.forEach(function ensureName(name) {
        nextDayDetails[name] = normalizeScheduleShiftDetail(dayDetails[name]);
      });
      shiftDetails[dateIso] = nextDayDetails;
    });

    return {
      week_anchor: sundayForIso(source.week_anchor || localIsoDate(new Date())),
      assignments: assignments,
      shift_details: shiftDetails
    };
  }

  function readScheduleBook() {
    try {
      const raw = window.localStorage.getItem(SCHEDULE_STORAGE_KEY);
      if (!raw) {
        return normalizeScheduleBook({});
      }
      const parsed = JSON.parse(raw);
      return normalizeScheduleBook(parsed);
    } catch (_error) {
      return normalizeScheduleBook({});
    }
  }

  function writeScheduleBook(scheduleBook) {
    const normalized = normalizeScheduleBook(scheduleBook);
    window.localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(normalized));
    queuePortalSyncWrite(SCHEDULE_STORAGE_KEY, normalized);
  }

  function tipNamesFromStaffRows(staffRows) {
    const names = normalizeStaffRows(staffRows).map(function mapRow(row) {
      return row.name;
    });

    while (names.length < TIP_ROSTER_SIZE) {
      names.push("");
    }

    return names.slice(0, TIP_ROSTER_SIZE);
  }

  function syncTipWorkbookRowsFromStaff(workbook, staffRows) {
    const names = tipNamesFromStaffRows(staffRows);
    let changed = false;

    workbook.days.forEach(function syncDay(day) {
      while (day.rows.length < TIP_ROSTER_SIZE) {
        day.rows.push(emptyTipRow(""));
        changed = true;
      }

      for (let index = 0; index < TIP_ROSTER_SIZE; index += 1) {
        const nextName = names[index] || "";
        const row = day.rows[index];

        if (row.name !== nextName) {
          row.name = nextName;
          changed = true;
        }

        if (!nextName && (row.position !== "Off" || toCents(row.override_amount) !== 0)) {
          row.position = "Off";
          row.override_amount = 0;
          changed = true;
        }
      }
    });

    return changed;
  }

  function syncTipWorkbookStorageFromStaff(staffRows) {
    const workbook = readTipWorkbook();
    const sourceRows = Array.isArray(staffRows) ? staffRows : readStaffRows();
    if (!syncTipWorkbookRowsFromStaff(workbook, sourceRows)) {
      return;
    }
    writeTipWorkbook(workbook);
  }

  function defaultRosterRows() {
    const seedNames = tipNamesFromStaffRows(readStaffRows());
    return Array.from({ length: TIP_ROSTER_SIZE }, function buildRows(_item, index) {
      return {
        name: seedNames[index] || "",
        position: "Off",
        override_amount: 0
      };
    });
  }

  function emptyTipRow(name) {
    return {
      name: String(name || ""),
      position: "Off",
      override_amount: 0
    };
  }

  function emptyTipDay(dayIndex, startDate) {
    return {
      date: addDaysIsoDate(startDate, dayIndex),
      saved_at: "",
      square_tips: 0,
      large_party_tips: 0,
      cash_due: 0,
      cash_on_hand: 0,
      rows: defaultRosterRows().map(function cloneRow(row) {
        return emptyTipRow(row.name);
      })
    };
  }

  function defaultTipWorkbook() {
    const start = localIsoDate(new Date()) || "2026-03-01";
    return {
      pay_period_start: start,
      days: Array.from({ length: TIP_DAY_COUNT }, function buildDays(_item, index) {
        return emptyTipDay(index, start);
      })
    };
  }

  function normalizeTipRow(row) {
    const raw = row && typeof row === "object" ? row : {};
    const position = TIP_POSITIONS.includes(raw.position) ? raw.position : "Off";
    return {
      name: String(raw.name || "").trim().slice(0, 80),
      position: position,
      override_amount: normalizedMoney(raw.override_amount)
    };
  }

  function normalizeSavedAt(value) {
    const normalized = String(value || "").trim();
    return normalized || "";
  }

  function normalizeTipDay(day, dayIndex, startDate) {
    const raw = day && typeof day === "object" ? day : {};
    const resolvedDate = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)
      ? raw.date
      : addDaysIsoDate(startDate, dayIndex);
    const templateRows = defaultRosterRows();
    const rows = Array.from({ length: TIP_ROSTER_SIZE }, function mapRows(_item, index) {
      return normalizeTipRow(Array.isArray(raw.rows) ? raw.rows[index] : templateRows[index]);
    });

    templateRows.forEach(function applyTemplate(templateRow, index) {
      if (!rows[index].name && templateRow.name) {
        rows[index].name = templateRow.name;
      }
    });

    return {
      date: resolvedDate,
      saved_at: normalizeSavedAt(raw.saved_at),
      square_tips: normalizedMoney(raw.square_tips),
      large_party_tips: normalizedMoney(raw.large_party_tips),
      cash_due: normalizedMoney(raw.cash_due),
      cash_on_hand: normalizedMoney(raw.cash_on_hand),
      rows: rows
    };
  }

  function normalizeTipWorkbook(workbook) {
    const fallback = defaultTipWorkbook();
    const raw = workbook && typeof workbook === "object" ? workbook : {};
    const startDate = typeof raw.pay_period_start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.pay_period_start)
      ? raw.pay_period_start
      : fallback.pay_period_start;
    const days = Array.from({ length: TIP_DAY_COUNT }, function mapDays(_item, index) {
      return normalizeTipDay(Array.isArray(raw.days) ? raw.days[index] : null, index, startDate);
    });
    return {
      pay_period_start: startDate,
      days: days
    };
  }

  function readTipWorkbook() {
    try {
      const raw = window.localStorage.getItem(TIP_WORKBOOK_STORAGE_KEY);
      if (!raw) {
        return defaultTipWorkbook();
      }
      const parsed = JSON.parse(raw);
      return normalizeTipWorkbook(parsed);
    } catch (_error) {
      return defaultTipWorkbook();
    }
  }

  function writeTipWorkbook(workbook) {
    const normalized = normalizeTipWorkbook(workbook);
    const revision = String(Date.now());
    window.localStorage.setItem(TIP_WORKBOOK_STORAGE_KEY, JSON.stringify(normalized));
    window.localStorage.setItem(TIP_WORKBOOK_REV_KEY, revision);
    queuePortalSyncWrite(TIP_WORKBOOK_STORAGE_KEY, normalized);
    window.dispatchEvent(new CustomEvent("gportal:tips-workbook-updated", { detail: { revision: revision } }));
  }

  function normalizeSquareIntegrationState(rawValue) {
    const source = rawValue && typeof rawValue === "object" ? rawValue : {};
    return {
      provider: "square",
      connected: Boolean(source.connected),
      source: String(source.source || "").trim().slice(0, 24),
      location_id: String(source.location_id || "").trim().slice(0, 80),
      location_name: String(source.location_name || "").trim().slice(0, 80),
      connected_at: String(source.connected_at || "").trim(),
      last_sync_at: String(source.last_sync_at || "").trim(),
      last_sync_date: String(source.last_sync_date || "").trim(),
      last_square_tips: normalizedMoney(source.last_square_tips)
    };
  }

  function readSquareIntegrationState() {
    try {
      const raw = window.localStorage.getItem(SQUARE_INTEGRATION_STORAGE_KEY);
      if (!raw) {
        return normalizeSquareIntegrationState({});
      }
      return normalizeSquareIntegrationState(JSON.parse(raw));
    } catch (_error) {
      return normalizeSquareIntegrationState({});
    }
  }

  function writeSquareIntegrationState(nextState) {
    const normalized = normalizeSquareIntegrationState(nextState);
    window.localStorage.setItem(SQUARE_INTEGRATION_STORAGE_KEY, JSON.stringify(normalized));
    queuePortalSyncWrite(SQUARE_INTEGRATION_STORAGE_KEY, normalized);
    return normalized;
  }

  function menuFileIsSafeDataUrl(value) {
    const dataUrl = String(value || "").trim();
    if (!dataUrl) {
      return false;
    }
    return /^data:(image\/(png|jpeg|webp)|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/vnd\.oasis\.opendocument\.text);base64,/i.test(dataUrl);
  }

  function normalizeMenuHubFile(rawValue) {
    const source = rawValue && typeof rawValue === "object" ? rawValue : {};
    const dataUrl = String(source.data_url || "").trim();
    if (!menuFileIsSafeDataUrl(dataUrl)) {
      return null;
    }

    return {
      name: String(source.name || "menu-file").trim().slice(0, 180),
      type: String(source.type || "").trim().slice(0, 120),
      size: Math.max(0, Math.floor(Number(source.size || 0))),
      date_for: isIsoDateString(source.date_for) ? source.date_for : "",
      uploaded_at: String(source.uploaded_at || "").trim(),
      uploaded_by: String(source.uploaded_by || "").trim().slice(0, 120),
      data_url: dataUrl
    };
  }

  function normalizeMenuSpecial(rawValue) {
    const source = rawValue && typeof rawValue === "object" ? rawValue : {};
    const name = String(source.name || "").trim().slice(0, 140);
    const notes = String(source.notes || "").slice(0, 3000);
    const fileDataUrl = String(source.file_data_url || "").trim();
    const hasFile = menuFileIsSafeDataUrl(fileDataUrl);
    if (!name && !notes && !hasFile) {
      return null;
    }
    return {
      id: String(source.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`).slice(0, 64),
      name: name || "Special",
      notes,
      file_name: String(source.file_name || "").trim().slice(0, 180),
      file_type: String(source.file_type || "").trim().slice(0, 120),
      file_size: Math.max(0, Math.floor(Number(source.file_size || 0))),
      file_data_url: hasFile ? fileDataUrl : "",
      created_at: String(source.created_at || "").trim(),
      created_by: String(source.created_by || "").trim().slice(0, 120)
    };
  }

  function normalizeMenuHubState(rawValue) {
    const source = rawValue && typeof rawValue === "object" ? rawValue : {};
    const specials = Array.isArray(source.specials)
      ? source.specials
          .map(function mapSpecial(item) {
            return normalizeMenuSpecial(item);
          })
          .filter(function keepSpecial(item) {
            return Boolean(item);
          })
          .slice(0, 30)
      : [];
    return {
      notes: String(source.notes || "").slice(0, 8000),
      notes_updated_at: String(source.notes_updated_at || "").trim(),
      notes_updated_by: String(source.notes_updated_by || "").trim().slice(0, 120),
      beverage_current: String(source.beverage_current || "").slice(0, 10000),
      beverage_notes: String(source.beverage_notes || "").slice(0, 10000),
      beverage_updated_at: String(source.beverage_updated_at || "").trim(),
      beverage_updated_by: String(source.beverage_updated_by || "").trim().slice(0, 120),
      specials,
      file: normalizeMenuHubFile(source.file)
    };
  }

  function readMenuHubState() {
    try {
      const raw = window.localStorage.getItem(MENU_HUB_STORAGE_KEY);
      if (!raw) {
        return normalizeMenuHubState({});
      }
      return normalizeMenuHubState(JSON.parse(raw));
    } catch (_error) {
      return normalizeMenuHubState({});
    }
  }

  function writeMenuHubState(nextState) {
    const normalized = normalizeMenuHubState(nextState);
    window.localStorage.setItem(MENU_HUB_STORAGE_KEY, JSON.stringify(normalized));
    queuePortalSyncWrite(MENU_HUB_STORAGE_KEY, normalized);
    window.dispatchEvent(new CustomEvent("gportal:menu-hub-updated"));
    return normalized;
  }

  function isIsoDateString(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  }

  function findOrAssignTipDayIndexForDate(workbook, isoDate) {
    let dayIndex = workbook.days.findIndex(function matchByDate(day) {
      return day.date === isoDate;
    });
    if (dayIndex >= 0) {
      return dayIndex;
    }

    dayIndex = workbook.days.findIndex(function firstUnused(day) {
      return !hasTipDayData(day);
    });
    if (dayIndex >= 0) {
      workbook.days[dayIndex].date = isoDate;
      return dayIndex;
    }

    dayIndex = 0;
    workbook.days[dayIndex].date = isoDate;
    return dayIndex;
  }

  function hasProvidedMoneyValue(source, key) {
    if (!source || typeof source !== "object") {
      return false;
    }
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      return false;
    }
    const value = source[key];
    return value !== null && value !== undefined && value !== "";
  }

  function syncSquareDayIntoWorkbook(isoDate, payload) {
    if (!isIsoDateString(isoDate)) {
      throw new Error("Valid date is required");
    }

    const source = payload && typeof payload === "object"
      ? payload
      : { square_tips: payload };
    const suggested = source.suggested_inputs && typeof source.suggested_inputs === "object"
      ? source.suggested_inputs
      : source;

    const workbook = readTipWorkbook();
    const staffRows = readStaffRows();
    syncTipWorkbookRowsFromStaff(workbook, staffRows);

    const dayIndex = findOrAssignTipDayIndexForDate(workbook, isoDate);
    const day = workbook.days[dayIndex];
    const appliedFields = [];

    day.date = isoDate;

    if (hasProvidedMoneyValue(suggested, "square_tips")) {
      day.square_tips = normalizedMoney(suggested.square_tips);
      appliedFields.push("Square Tips");
    }
    if (hasProvidedMoneyValue(suggested, "large_party_tips")) {
      day.large_party_tips = normalizedMoney(suggested.large_party_tips);
      appliedFields.push("Large Party Tips");
    }
    if (hasProvidedMoneyValue(suggested, "cash_on_hand")) {
      day.cash_on_hand = normalizedMoney(suggested.cash_on_hand);
      appliedFields.push("Cash On Hand");
    }
    if (hasProvidedMoneyValue(suggested, "cash_due")) {
      day.cash_due = normalizedMoney(suggested.cash_due);
      appliedFields.push("Cash Due");
    }

    day.saved_at = new Date().toISOString();
    writeTipWorkbook(workbook);

    return {
      dayIndex: dayIndex,
      day: day,
      appliedFields: appliedFields
    };
  }

  function syncSquareTipsIntoWorkbook(isoDate, squareTipsAmount) {
    return syncSquareDayIntoWorkbook(isoDate, {
      square_tips: squareTipsAmount,
      suggested_inputs: {
        square_tips: squareTipsAmount
      }
    });
  }

  function computeTipDay(day) {
    const normalizedDay = normalizeTipDay(day, 0, localIsoDate(new Date()));
    const rows = normalizedDay.rows;

    const poolCents = toCents(normalizedDay.square_tips)
      + toCents(normalizedDay.large_party_tips)
      + toCents(normalizedDay.cash_due)
      + toCents(normalizedDay.cash_on_hand);

    const roleCounts = {
      Kitchen: rows.filter(function byKitchen(row) { return row.position === "Kitchen"; }).length,
      Busser: rows.filter(function byBusser(row) { return row.position === "Busser"; }).length,
      Server: rows.filter(function byServer(row) { return row.position === "Server"; }).length
    };

    const kitchenPoolCents = poolCents * 0.15;
    const busserRate = roleCounts.Busser >= 2 ? 0.15 : (roleCounts.Busser === 1 ? 0.10 : 0);
    const postKitchenPoolCents = poolCents - kitchenPoolCents;
    const busserPoolCents = roleCounts.Busser > 0 ? (postKitchenPoolCents * busserRate) : 0;
    const serverPoolCents = poolCents - kitchenPoolCents - busserPoolCents;

    const rolePools = {
      Kitchen: kitchenPoolCents,
      Busser: busserPoolCents,
      Server: serverPoolCents
    };

    const payouts = Array.from({ length: TIP_ROSTER_SIZE }, function buildPayouts() {
      return 0;
    });
    const autoRows = {
      Kitchen: [],
      Busser: [],
      Server: []
    };
    const roleOverrides = {
      Kitchen: 0,
      Busser: 0,
      Server: 0
    };

    let oopCents = 0;

    rows.forEach(function inspectRow(row, rowIndex) {
      const role = row.position;
      const overrideCents = toCents(row.override_amount);

      if (role === "Off") {
        payouts[rowIndex] = 0;
        return;
      }

      if (role === "OOP") {
        payouts[rowIndex] = overrideCents > 0 ? overrideCents : 0;
        oopCents += payouts[rowIndex];
        return;
      }

      if (!Object.prototype.hasOwnProperty.call(rolePools, role)) {
        payouts[rowIndex] = 0;
        return;
      }

      if (overrideCents > 0) {
        payouts[rowIndex] = overrideCents;
        roleOverrides[role] += overrideCents;
        return;
      }

      autoRows[role].push(rowIndex);
    });

    const warnings = [];
    let unassignedCents = 0;

    function distributeAcrossRows(amountCents, rowIndexes) {
      if (!rowIndexes.length || amountCents === 0) {
        return;
      }
      const share = amountCents / rowIndexes.length;
      rowIndexes.forEach(function setShare(rowIndex) {
        payouts[rowIndex] += share;
      });
    }

    Object.keys(rolePools).forEach(function splitRole(role) {
      const poolForRole = rolePools[role];
      const overrideTotal = roleOverrides[role];
      const remaining = poolForRole - overrideTotal;
      const targetRows = autoRows[role];

      if (!targetRows.length) {
        if (remaining !== 0 && roleCounts[role] > 0) {
          warnings.push(`${role} overrides exceed or underfill the ${role.toLowerCase()} pool.`);
        }
        unassignedCents += remaining;
        return;
      }

      distributeAcrossRows(remaining, targetRows);
    });

    if (unassignedCents !== 0) {
      const fallbackRows = rows
        .map(function mapRow(row, index) {
          return { row: row, index: index };
        })
        .filter(function onlyPooled(item) {
          return item.row.position === "Kitchen" || item.row.position === "Server" || item.row.position === "Busser";
        })
        .map(function pluckIndex(item) {
          return item.index;
        });

      if (fallbackRows.length) {
        distributeAcrossRows(unassignedCents, fallbackRows);
      } else {
        warnings.push("No pooled staff selected to receive tip pool.");
      }
    }

    const paidCents = payouts.reduce(function sum(current, value) {
      return current + value;
    }, 0);
    const expectedCents = poolCents + oopCents;
    const rawDifferenceCents = expectedCents - paidCents;
    const differenceCents = Math.abs(rawDifferenceCents) < 0.0001 ? 0 : rawDifferenceCents;

    return {
      poolCents: poolCents,
      kitchenPoolCents: kitchenPoolCents,
      busserPoolCents: busserPoolCents,
      serverPoolCents: serverPoolCents,
      oopCents: oopCents,
      paidCents: paidCents,
      expectedCents: expectedCents,
      differenceCents: differenceCents,
      payouts: payouts,
      warnings: warnings
    };
  }

  function hasTipDayData(day) {
    const check = normalizeTipDay(day, 0, localIsoDate(new Date()));
    if (toCents(check.square_tips) || toCents(check.large_party_tips) || toCents(check.cash_due) || toCents(check.cash_on_hand)) {
      return true;
    }
    return check.rows.some(function anyRow(row) {
      return row.position !== "Off" || toCents(row.override_amount) !== 0;
    });
  }

  function tipDayDataScore(day) {
    const check = normalizeTipDay(day, 0, localIsoDate(new Date()));
    let score = 0;
    score += Math.abs(toCents(check.square_tips));
    score += Math.abs(toCents(check.large_party_tips));
    score += Math.abs(toCents(check.cash_due));
    score += Math.abs(toCents(check.cash_on_hand));

    check.rows.forEach(function scoreRow(row) {
      if (row.position !== "Off") {
        score += 1000;
      }
      score += Math.abs(toCents(row.override_amount));
    });

    return score;
  }

  function roundedCents(value) {
    const parsed = Number(value || 0);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    return Math.round(parsed);
  }

  function centsToMoney(cents) {
    return GPortal.money(roundedCents(cents) / 100);
  }

  function centsToFixed(cents) {
    return (roundedCents(cents) / 100).toFixed(2);
  }

  function filenameDatePart(isoDate) {
    return String(isoDate || "").replace(/[^0-9-]/g, "") || "date";
  }

  function csvEscape(value) {
    const text = String(value === null || value === undefined ? "" : value);
    if (!/[",\n]/.test(text)) {
      return text;
    }
    return `"${text.replace(/"/g, "\"\"")}"`;
  }

  function safeSummaryStartDate(inputDate, workbook) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(inputDate || ""))) {
      return inputDate;
    }

    const fallbackDay = workbook && Array.isArray(workbook.days)
      ? workbook.days.find(function byDate(day) {
          return /^\d{4}-\d{2}-\d{2}$/.test(String(day && day.date || ""));
        })
      : null;

    if (fallbackDay && fallbackDay.date) {
      return fallbackDay.date;
    }

    return localIsoDate(new Date()) || "2026-03-01";
  }

  function safeSummaryEndDate(inputDate, startDate) {
    const start = /^\d{4}-\d{2}-\d{2}$/.test(String(startDate || ""))
      ? startDate
      : localIsoDate(new Date());

    let end = /^\d{4}-\d{2}-\d{2}$/.test(String(inputDate || ""))
      ? inputDate
      : addDaysIsoDate(start, TIP_DAY_COUNT - 1);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      end = start;
    }

    if (end < start) {
      end = start;
    }

    const maxEnd = addDaysIsoDate(start, TIP_DAY_COUNT - 1);
    if (maxEnd && end > maxEnd) {
      end = maxEnd;
    }

    return end;
  }

  function summaryRangeLength(startDate, endDate) {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return TIP_DAY_COUNT;
    }
    const diffDays = Math.floor((end.getTime() - start.getTime()) / 86400000);
    return Math.min(TIP_DAY_COUNT, Math.max(1, diffDays + 1));
  }

  function ensureTipSummaryEmployee(map, name, orderRef) {
    if (map.has(name)) {
      return map.get(name);
    }

    const next = {
      name: name,
      order: orderRef.value,
      daysWorked: 0,
      kitchenCents: 0,
      busserCents: 0,
      serverCents: 0,
      oopCents: 0,
      totalCents: 0
    };
    map.set(name, next);
    orderRef.value += 1;
    return next;
  }

  function buildTipSummaryModel(workbook, requestedStartDate, requestedEndDate) {
    const normalizedWorkbook = normalizeTipWorkbook(workbook);
    const startDate = safeSummaryStartDate(requestedStartDate, normalizedWorkbook);
    const endDate = safeSummaryEndDate(requestedEndDate, startDate);
    const dayCount = summaryRangeLength(startDate, endDate);
    const dayLookup = new Map();

    normalizedWorkbook.days.forEach(function mapDay(day, index) {
      const normalizedDay = normalizeTipDay(day, index, normalizedWorkbook.pay_period_start);
      if (normalizedDay.date) {
        const existing = dayLookup.get(normalizedDay.date);
        if (!existing || tipDayDataScore(normalizedDay) >= tipDayDataScore(existing)) {
          dayLookup.set(normalizedDay.date, normalizedDay);
        }
      }
    });

    const staffRows = readStaffRows();
    const staffNames = tipNamesFromStaffRows(staffRows).filter(function keepName(name) {
      return Boolean(String(name || "").trim());
    });

    const employeeMap = new Map();
    const orderRef = { value: 0 };
    staffNames.forEach(function seedEmployee(name) {
      ensureTipSummaryEmployee(employeeMap, name, orderRef);
    });

    const totals = {
      poolCents: 0,
      kitchenPoolCents: 0,
      busserPoolCents: 0,
      serverPoolCents: 0,
      oopCents: 0,
      paidCents: 0,
      differenceCents: 0
    };

    const days = [];

    for (let dayOffset = 0; dayOffset < dayCount; dayOffset += 1) {
      const dateIso = addDaysIsoDate(startDate, dayOffset);
      const day = dayLookup.get(dateIso) || normalizeTipDay(emptyTipDay(dayOffset, startDate), dayOffset, startDate);
      const calc = computeTipDay(day);
      const payouts = calc.payouts.map(roundedCents);
      const workedToday = new Set();

      day.rows.forEach(function mapEmployeePayout(row, rowIndex) {
        const name = String(row.name || "").trim();
        if (!name) {
          return;
        }

        const entry = ensureTipSummaryEmployee(employeeMap, name, orderRef);
        const payoutCents = payouts[rowIndex] || 0;
        const role = row.position;

        if (role !== "Off") {
          workedToday.add(name);
        }

        if (role === "Kitchen") {
          entry.kitchenCents += payoutCents;
        } else if (role === "Busser") {
          entry.busserCents += payoutCents;
        } else if (role === "Server") {
          entry.serverCents += payoutCents;
        } else if (role === "OOP") {
          entry.oopCents += payoutCents;
        }

        entry.totalCents += payoutCents;
      });

      workedToday.forEach(function markWorked(name) {
        const entry = employeeMap.get(name);
        if (entry) {
          entry.daysWorked += 1;
        }
      });

      const daySummary = {
        dayNumber: dayOffset + 1,
        date: dateIso,
        poolCents: roundedCents(calc.poolCents),
        kitchenPoolCents: roundedCents(calc.kitchenPoolCents),
        busserPoolCents: roundedCents(calc.busserPoolCents),
        serverPoolCents: roundedCents(calc.serverPoolCents),
        oopCents: roundedCents(calc.oopCents),
        paidCents: roundedCents(calc.paidCents),
        differenceCents: roundedCents(calc.differenceCents)
      };

      totals.poolCents += daySummary.poolCents;
      totals.kitchenPoolCents += daySummary.kitchenPoolCents;
      totals.busserPoolCents += daySummary.busserPoolCents;
      totals.serverPoolCents += daySummary.serverPoolCents;
      totals.oopCents += daySummary.oopCents;
      totals.paidCents += daySummary.paidCents;
      totals.differenceCents += daySummary.differenceCents;

      days.push(daySummary);
    }

    const employees = Array.from(employeeMap.values()).sort(function sortEmployees(a, b) {
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      return a.name.localeCompare(b.name);
    });

    return {
      startDate: startDate,
      endDate: endDate,
      days: days,
      employees: employees,
      totals: totals
    };
  }

  function renderTipSummaryTable(model, dayRowsEl, employeeRowsEl, rangeEl) {
    if (rangeEl) {
      rangeEl.textContent = `${longDateFull(model.startDate)} to ${longDateFull(model.endDate)}`;
    }

    if (dayRowsEl) {
      const rows = model.days.map(function mapDay(day) {
        return `
          <tr>
            <td>${day.dayNumber}</td>
            <td>${longDate(day.date)}</td>
            <td>${centsToMoney(day.poolCents)}</td>
            <td>${centsToMoney(day.kitchenPoolCents)}</td>
            <td>${centsToMoney(day.busserPoolCents)}</td>
            <td>${centsToMoney(day.serverPoolCents)}</td>
            <td>${centsToMoney(day.oopCents)}</td>
            <td>${centsToMoney(day.paidCents)}</td>
            <td>${centsToMoney(day.differenceCents)}</td>
          </tr>
        `;
      }).join("");

      dayRowsEl.innerHTML = `
        ${rows}
        <tr class="tips-summary-total-row">
          <td colspan="2">Totals</td>
          <td>${centsToMoney(model.totals.poolCents)}</td>
          <td>${centsToMoney(model.totals.kitchenPoolCents)}</td>
          <td>${centsToMoney(model.totals.busserPoolCents)}</td>
          <td>${centsToMoney(model.totals.serverPoolCents)}</td>
          <td>${centsToMoney(model.totals.oopCents)}</td>
          <td>${centsToMoney(model.totals.paidCents)}</td>
          <td>${centsToMoney(model.totals.differenceCents)}</td>
        </tr>
      `;
    }

    if (employeeRowsEl) {
      const rows = model.employees.map(function mapEmployee(employee) {
        return `
          <tr>
            <td>${escapedHtml(employee.name)}</td>
            <td>${employee.daysWorked}</td>
            <td>${centsToMoney(employee.kitchenCents)}</td>
            <td>${centsToMoney(employee.busserCents)}</td>
            <td>${centsToMoney(employee.serverCents)}</td>
            <td>${centsToMoney(employee.oopCents)}</td>
            <td>${centsToMoney(employee.totalCents)}</td>
          </tr>
        `;
      }).join("");

      if (!rows) {
        employeeRowsEl.innerHTML = "<tr><td colspan='7'>No employee data for this date range.</td></tr>";
      } else {
        employeeRowsEl.innerHTML = rows;
      }
    }
  }

  function downloadFileBlob(fileName, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function revokeUrl() {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function buildTipSummaryCsv(model) {
    const lines = [];
    lines.push(["Tip Summary", longDate(model.startDate), longDate(model.endDate)].map(csvEscape).join(","));
    lines.push("");
    lines.push(["Daily Totals"].map(csvEscape).join(","));
    lines.push([
      "Day",
      "Date",
      "Tip Pool",
      "Kitchen Pool",
      "Busser Pool",
      "Server Pool",
      "Out Of Pocket",
      "Total Paid",
      "Difference"
    ].map(csvEscape).join(","));

    model.days.forEach(function addDay(day) {
      lines.push([
        day.dayNumber,
        longDate(day.date),
        centsToFixed(day.poolCents),
        centsToFixed(day.kitchenPoolCents),
        centsToFixed(day.busserPoolCents),
        centsToFixed(day.serverPoolCents),
        centsToFixed(day.oopCents),
        centsToFixed(day.paidCents),
        centsToFixed(day.differenceCents)
      ].map(csvEscape).join(","));
    });

    lines.push([
      "Totals",
      "",
      centsToFixed(model.totals.poolCents),
      centsToFixed(model.totals.kitchenPoolCents),
      centsToFixed(model.totals.busserPoolCents),
      centsToFixed(model.totals.serverPoolCents),
      centsToFixed(model.totals.oopCents),
      centsToFixed(model.totals.paidCents),
      centsToFixed(model.totals.differenceCents)
    ].map(csvEscape).join(","));

    lines.push("");
    lines.push(["Employee Totals"].map(csvEscape).join(","));
    lines.push([
      "Name",
      "Days Worked",
      "Kitchen",
      "Busser",
      "Server",
      "Out Of Pocket",
      "Total"
    ].map(csvEscape).join(","));

    model.employees.forEach(function addEmployee(employee) {
      lines.push([
        employee.name,
        employee.daysWorked,
        centsToFixed(employee.kitchenCents),
        centsToFixed(employee.busserCents),
        centsToFixed(employee.serverCents),
        centsToFixed(employee.oopCents),
        centsToFixed(employee.totalCents)
      ].map(csvEscape).join(","));
    });

    return `${lines.join("\n")}\n`;
  }

  function buildTipSummaryExportMatrix(workbook, requestedStartDate, requestedEndDate) {
    const normalizedWorkbook = normalizeTipWorkbook(workbook);
    const startDate = safeSummaryStartDate(requestedStartDate, normalizedWorkbook);
    const endDate = safeSummaryEndDate(requestedEndDate, startDate);
    const dayCount = summaryRangeLength(startDate, endDate);
    const dayLookup = new Map();

    normalizedWorkbook.days.forEach(function mapDay(day, index) {
      const normalizedDay = normalizeTipDay(day, index, normalizedWorkbook.pay_period_start);
      if (!normalizedDay.date) {
        return;
      }
      const existing = dayLookup.get(normalizedDay.date);
      if (!existing || tipDayDataScore(normalizedDay) >= tipDayDataScore(existing)) {
        dayLookup.set(normalizedDay.date, normalizedDay);
      }
    });

    const orderedNames = tipNamesFromStaffRows(readStaffRows()).filter(function keepName(name) {
      return Boolean(String(name || "").trim());
    });
    const knownNames = new Set(orderedNames);

    const days = [];
    for (let dayOffset = 0; dayOffset < dayCount; dayOffset += 1) {
      const date = addDaysIsoDate(startDate, dayOffset);
      const selectedDay = dayLookup.get(date) || normalizeTipDay(emptyTipDay(dayOffset, startDate), dayOffset, startDate);

      selectedDay.rows.forEach(function includeName(row) {
        const name = String(row && row.name || "").trim();
        if (!name || knownNames.has(name)) {
          return;
        }
        knownNames.add(name);
        orderedNames.push(name);
      });

      days.push({
        dayNumber: dayOffset + 1,
        date: date,
        day: selectedDay
      });
    }

    const employeeMap = new Map();
    orderedNames.forEach(function initEmployee(name) {
      employeeMap.set(name, {
        name: name,
        dailyCents: Array.from({ length: dayCount }, function zeroValues() {
          return 0;
        }),
        totalCents: 0
      });
    });

    const dayTotalTipsCents = [];
    const dayPaidTipsCents = [];
    const dayExpectedTipsCents = [];
    const dayDifferenceCents = [];

    days.forEach(function mapDay(dayEntry, dayIndex) {
      const calc = computeTipDay(dayEntry.day);
      const payouts = calc.payouts.map(roundedCents);
      const rowByName = new Map();

      dayEntry.day.rows.forEach(function mapRow(row, rowIndex) {
        const name = String(row && row.name || "").trim();
        if (!name) {
          return;
        }
        const next = (rowByName.get(name) || 0) + (payouts[rowIndex] || 0);
        rowByName.set(name, next);
      });

      let paidForDay = 0;
      employeeMap.forEach(function mapEmployee(employee, name) {
        const value = roundedCents(rowByName.get(name) || 0);
        employee.dailyCents[dayIndex] = value;
        employee.totalCents += value;
        paidForDay += value;
      });

      dayTotalTipsCents.push(roundedCents(calc.poolCents));
      dayPaidTipsCents.push(roundedCents(paidForDay));
      dayExpectedTipsCents.push(roundedCents(calc.expectedCents));
      dayDifferenceCents.push(roundedCents(calc.expectedCents - paidForDay));
    });

    const grandTotalPaidCents = dayPaidTipsCents.reduce(function sum(current, value) {
      return current + value;
    }, 0);
    const grandTotalExpectedCents = dayExpectedTipsCents.reduce(function sum(current, value) {
      return current + value;
    }, 0);
    const grandTotalDayPoolCents = dayTotalTipsCents.reduce(function sum(current, value) {
      return current + value;
    }, 0);
    const grandDifferenceCents = dayDifferenceCents.reduce(function sum(current, value) {
      return current + value;
    }, 0);

    const employees = Array.from(employeeMap.values()).map(function finalizeEmployee(employee) {
      const percentOfTotal = grandTotalPaidCents
        ? ((employee.totalCents / grandTotalPaidCents) * 100)
        : 0;
      return {
        name: employee.name,
        dailyCents: employee.dailyCents,
        totalCents: employee.totalCents,
        percentOfTotal: percentOfTotal
      };
    });

    return {
      startDate: startDate,
      endDate: endDate,
      days: days,
      employees: employees,
      dayTotalTipsCents: dayTotalTipsCents,
      dayPaidTipsCents: dayPaidTipsCents,
      dayExpectedTipsCents: dayExpectedTipsCents,
      dayDifferenceCents: dayDifferenceCents,
      grandTotalDayPoolCents: grandTotalDayPoolCents,
      grandTotalPaidCents: grandTotalPaidCents,
      grandTotalExpectedCents: grandTotalExpectedCents,
      grandDifferenceCents: grandDifferenceCents
    };
  }

  function percentLabel(value) {
    const parsed = Number(value || 0);
    const normalized = Number.isFinite(parsed) ? parsed : 0;
    return `${normalized.toFixed(2)}%`;
  }

  function buildTipSummaryMatrixTableHtml(matrix) {
    const borderColor = "#5f6368";
    const strongBorderColor = "#1f2329";
    const thinBorder = `1px solid ${borderColor}`;
    const thickBorder = `2px solid ${strongBorderColor}`;

    const cellBase = `border:${thinBorder};padding:4px 6px;font-size:11px;line-height:1.25;color:#111;`;
    const headerBase = `${cellBase}text-align:center;background:#e9edf0;font-weight:700;min-width:76px;`;
    const nameHead = `${headerBase}text-align:left;min-width:172px;`;
    const dayHead = `${headerBase}`;
    const dayDateHead = `${cellBase}text-align:center;background:#f6f8fa;font-weight:700;min-width:76px;`;
    const moneyCell = `${cellBase}text-align:right;background:#fff;min-width:76px;font-variant-numeric:tabular-nums;`;
    const percentCell = `${cellBase}text-align:right;background:#fff;min-width:86px;font-variant-numeric:tabular-nums;`;
    const rowName = `${cellBase}text-align:left;font-weight:700;background:#f4f6f8;`;

    const payPeriodNameHead = `${nameHead}border:${thickBorder};`;
    const payPeriodHead = `${dayHead}border:${thickBorder};`;
    const dateNameHead = `${nameHead}background:#f6f8fa;border:${thickBorder};`;
    const dateHeadStrong = `${dayDateHead}border:${thickBorder};`;

    const dayTotalName = `${rowName}background:#eef3ff;`;
    const dayTotalMoney = `${moneyCell}background:#eef3ff;font-weight:700;`;

    const totalsRowName = `${rowName}background:#dbeef9;border:${thickBorder};`;
    const totalsRowMoney = `${moneyCell}background:#dbeef9;font-weight:700;border:${thickBorder};`;
    const totalsRowPercent = `${percentCell}background:#dbeef9;border:${thickBorder};`;

    const expectedRowName = `${rowName}background:#ebe2ff;border:${thickBorder};`;
    const expectedRowMoney = `${moneyCell}background:#ebe2ff;font-weight:700;border:${thickBorder};`;
    const expectedRowPercent = `${percentCell}background:#ebe2ff;border:${thickBorder};`;

    const diffRowName = `${rowName}background:#ddf1e2;border:${thickBorder};`;
    const diffRowMoney = `${moneyCell}background:#ddf1e2;font-weight:700;border:${thickBorder};`;
    const diffRowPercent = `${percentCell}background:#ddf1e2;border:${thickBorder};`;

    const periodCells = matrix.days.map(function periodCell(day) {
      return `<th style="${payPeriodHead}">${day.dayNumber}</th>`;
    }).join("");

    const dateCells = matrix.days.map(function dateCell(day) {
      return `<th style="${dateHeadStrong}">${escapedHtml(shortDate(day.date))}</th>`;
    }).join("");

    const dayTotalCells = matrix.dayTotalTipsCents.map(function totalCell(value) {
      return `<td style="${dayTotalMoney}">${centsToMoney(value)}</td>`;
    }).join("");

    const employeeRows = matrix.employees.map(function employeeRow(employee) {
      const dayCells = employee.dailyCents.map(function amountCell(value) {
        return `<td style="${moneyCell}">${centsToMoney(value)}</td>`;
      }).join("");

      return `
        <tr>
          <th style="${rowName}">${escapedHtml(employee.name)}</th>
          ${dayCells}
          <td style="${moneyCell}font-weight:700;">${centsToMoney(employee.totalCents)}</td>
          <td style="${percentCell}">${percentLabel(employee.percentOfTotal)}</td>
        </tr>
      `;
    }).join("");

    const paidCells = matrix.dayPaidTipsCents.map(function paidCell(value) {
      return `<td style="${totalsRowMoney}">${centsToMoney(value)}</td>`;
    }).join("");

    const expectedCells = matrix.dayExpectedTipsCents.map(function expectedCell(value) {
      return `<td style="${expectedRowMoney}">${centsToMoney(value)}</td>`;
    }).join("");

    const diffCells = matrix.dayDifferenceCents.map(function diffCell(value) {
      return `<td style="${diffRowMoney}">${centsToMoney(value)}</td>`;
    }).join("");

    return `
      <table style="border-collapse:collapse;border-spacing:0;font-family:Arial,sans-serif;">
        <thead>
          <tr>
            <th style="${payPeriodNameHead}">Pay Period #</th>
            ${periodCells}
            <th style="${payPeriodHead}">Total</th>
            <th style="${payPeriodHead}">% of Total Tips</th>
          </tr>
          <tr>
            <th style="${dateNameHead}">Date</th>
            ${dateCells}
            <th style="${dateHeadStrong}"></th>
            <th style="${dateHeadStrong}"></th>
          </tr>
          <tr>
            <th style="${dayTotalName}">Day Total Tips</th>
            ${dayTotalCells}
            <td style="${dayTotalMoney}">${centsToMoney(matrix.grandTotalDayPoolCents)}</td>
            <td style="${percentCell}background:#eef3ff;"></td>
          </tr>
        </thead>
        <tbody>
          ${employeeRows}
          <tr>
            <th style="${totalsRowName}">TOTAL TIPS</th>
            ${paidCells}
            <td style="${totalsRowMoney}">${centsToMoney(matrix.grandTotalPaidCents)}</td>
            <td style="${totalsRowPercent}">${percentLabel(matrix.grandTotalPaidCents ? 100 : 0)}</td>
          </tr>
          <tr>
            <th style="${expectedRowName}">Expected Tips</th>
            ${expectedCells}
            <td style="${expectedRowMoney}">${centsToMoney(matrix.grandTotalExpectedCents)}</td>
            <td style="${expectedRowPercent}"></td>
          </tr>
          <tr>
            <th style="${diffRowName}">Difference</th>
            ${diffCells}
            <td style="${diffRowMoney}">${centsToMoney(matrix.grandDifferenceCents)}</td>
            <td style="${diffRowPercent}"></td>
          </tr>
        </tbody>
      </table>
    `;
  }

  function buildTipSummaryExcelHtml(workbook, startDate, endDate) {
    const matrix = buildTipSummaryExportMatrix(workbook, startDate, endDate);
    return `<!doctype html>
<html lang="en-US">
  <head>
    <meta charset="utf-8" />
  </head>
  <body style="font-family:Arial,sans-serif;margin:14px;color:#111;">
    <div style="font-size:28px;font-weight:700;line-height:1.1;margin:0 0 6px;">Tips Summary</div>
    <div style="font-size:12px;line-height:1.3;margin:0;">
      <strong>Pay Period Start Date:</strong> ${escapedHtml(longDate(matrix.startDate))}
      <span style="padding:0 8px;color:#444;">|</span>
      <strong>Window End:</strong> ${escapedHtml(longDate(matrix.endDate))}
    </div>
    <div style="height:14px;line-height:14px;">&nbsp;</div>
    ${buildTipSummaryMatrixTableHtml(matrix)}
  </body>
</html>`;
  }

  function buildTipSummaryPrintHtml(workbook, startDate, endDate) {
    const matrix = buildTipSummaryExportMatrix(workbook, startDate, endDate);
    return `<!doctype html>
<html lang="en-US">
  <head>
    <meta charset="utf-8" />
    <title>Tips Summary Export</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        margin: 12mm;
        color: #111;
      }
      .title {
        font-size: 22px;
        font-weight: 700;
        margin-bottom: 2px;
      }
      @media print {
        body { margin: 10mm; }
      }
    </style>
  </head>
  <body>
    <div class="title">Tips Summary</div>
    <div style="font-size:12px;line-height:1.3;margin:0;">
      <strong>Pay Period Start Date:</strong> ${escapedHtml(longDate(matrix.startDate))}
      <span style="padding:0 8px;color:#444;">|</span>
      <strong>Window End:</strong> ${escapedHtml(longDate(matrix.endDate))}
    </div>
    <div style="height:12px;line-height:12px;">&nbsp;</div>
    ${buildTipSummaryMatrixTableHtml(matrix)}
  </body>
</html>`;
  }

  function openNativeDatePicker(input) {
    if (!input || typeof input.showPicker !== "function") {
      return;
    }
    try {
      input.showPicker();
    } catch (_error) {
      // no-op for browsers that block programmatic picker calls
    }
  }

  function renderLocalTipsHistory(workbook) {
    const tableBody = GPortal.qs("#tipsRows");
    const summary = GPortal.qs("#tipsTotal");
    const section = GPortal.qs("#tipsHistorySection");
    if (!tableBody || !summary || !section) {
      return;
    }

    const rows = [];
    workbook.days.forEach(function mapDays(day, index) {
      if (!hasTipDayData(day)) {
        return;
      }
      const calc = computeTipDay(day);
      rows.push({
        day: index + 1,
        date: day.date || addDaysIsoDate(workbook.pay_period_start, index),
        netCents: calc.poolCents
      });
    });

    rows.sort(function sortRows(a, b) {
      return a.day > b.day ? -1 : 1;
    });

    tableBody.innerHTML = "";
    if (!rows.length) {
      tableBody.innerHTML = "<tr><td colspan='3'>No saved tip days yet.</td></tr>";
      summary.textContent = "Total in view: -";
      return;
    }

    let totalCents = 0;
    rows.slice(0, 12).forEach(function addHistoryRow(rowData) {
      totalCents += rowData.netCents;
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${rowData.date ? longDate(rowData.date) : `Day ${rowData.day}`}</td>
        <td>${rowData.date ? longDate(rowData.date) : `Day ${rowData.day}`}</td>
        <td>${GPortal.money(rowData.netCents / 100)}</td>
      `;
      tableBody.appendChild(row);
    });

    summary.textContent = `Total in view: ${GPortal.money(totalCents / 100)}`;
  }

  async function renderSupabaseTipsHistory(session) {
    const tableBody = GPortal.qs("#tipsRows");
    const summary = GPortal.qs("#tipsTotal");
    if (!tableBody || !summary) {
      return;
    }

    const sb = GPortal.getSupabase();
    const result = await sb
      .from("tip_statements")
      .select("period_start,period_end,net_tips")
      .eq("employee_id", session.user.id)
      .order("period_end", { ascending: false })
      .limit(12);

    tableBody.innerHTML = "";

    if (result.error || !result.data.length) {
      tableBody.innerHTML = "<tr><td colspan='3'>No tip statements yet.</td></tr>";
      summary.textContent = "Total in view: -";
      return;
    }

    let total = 0;
    result.data.forEach(function addRow(item) {
      total += Number(item.net_tips || 0);
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${GPortal.dateOnly(item.period_start)}</td>
        <td>${GPortal.dateOnly(item.period_end)}</td>
        <td>${GPortal.money(item.net_tips)}</td>
      `;
      tableBody.appendChild(row);
    });

    summary.textContent = `Total in view: ${GPortal.money(total)}`;
  }

  async function loadTips(session, profile) {
    const rosterBody = GPortal.qs("#tipsRosterRows");
    const dayDateInput = GPortal.qs("#tipsDayDate");
    const dayPrevBtn = GPortal.qs("#tipsDayPrev");
    const dayNextBtn = GPortal.qs("#tipsDayNext");
    const squareInput = GPortal.qs("#tipSquareTips");
    const partyInput = GPortal.qs("#tipLargePartyTips");
    const cashDueInput = GPortal.qs("#tipCashDue");
    const cashOnHandInput = GPortal.qs("#tipCashOnHand");
    const poolTotal = GPortal.qs("#tipsPoolTotal");
    const kitchenPool = GPortal.qs("#tipsKitchenPool");
    const busserPool = GPortal.qs("#tipsBusserPool");
    const serverPool = GPortal.qs("#tipsServerPool");
    const oopTotal = GPortal.qs("#tipsOopTotal");
    const paidTotal = GPortal.qs("#tipsPaidTotal");
    const difference = GPortal.qs("#tipsDifference");
    const historySection = GPortal.qs("#tipsHistorySection");
    const tipsSaveBtn = GPortal.qs("#tipsSaveBtn");
    const tipsSavedBadge = GPortal.qs("#tipsSavedBadge");
    const tipsCalendarGrid = GPortal.qs("#tipsCalendarGrid");
    const tipsCalendarMonth = GPortal.qs("#tipsCalendarMonth");
    const tipsCalendarPrev = GPortal.qs("#tipsCalendarPrev");
    const tipsCalendarNext = GPortal.qs("#tipsCalendarNext");
    const managerDayCard = GPortal.qs("#tipsManagerDayCard");
    const managerActions = GPortal.qs("#tipsManagerActions");
    const miniCalendarSection = GPortal.qs("#tipsMiniCalendarSection");
    const inputsSection = GPortal.qs("#tipsInputsSection");
    const poolSection = GPortal.qs("#tipsPoolSection");
    const splitSection = GPortal.qs("#tipsSplitSection");
    const staffRangeCard = GPortal.qs("#tipsStaffRangeCard");
    const staffActions = GPortal.qs("#tipsStaffActions");
    const staffStartDateInput = GPortal.qs("#tipsStaffStartDate");
    const staffEndDateInput = GPortal.qs("#tipsStaffEndDate");
    const staffPdfBtn = GPortal.qs("#tipsStaffPdfBtn");
    const staffStatementsSection = GPortal.qs("#tipsStaffStatementsSection");
    const staffRangeLabel = GPortal.qs("#tipsStaffRangeLabel");
    const staffRowsBody = GPortal.qs("#tipsStaffRows");
    const staffTotal = GPortal.qs("#tipsStaffTotal");

    if (!rosterBody || !dayDateInput || !squareInput || !partyInput || !cashDueInput || !cashOnHandInput || !poolTotal || !kitchenPool || !busserPool || !serverPool || !oopTotal || !paidTotal || !difference) {
      return;
    }

    if (historySection) {
      historySection.hidden = false;
    }

    const canEdit = profile.role === "admin" || profile.role === "manager";
    const canSquareAutoSync = profile.role === "admin" && !session.isTemp && GPortal.hasSupabaseConfig();
    const workbook = readTipWorkbook();
    const staffRows = readStaffRows();
    const visibleRowCount = Math.min(TIP_ROSTER_SIZE, staffRows.length);
    if (syncTipWorkbookRowsFromStaff(workbook, staffRows)) {
      writeTipWorkbook(workbook);
    }

    function normalizeNameKey(value) {
      return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
    }

    function canonicalNameKey(value) {
      return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    function setTipsViewMode(staffMode) {
      const showStaff = Boolean(staffMode);
      document.body.classList.toggle("tips-staff-only-view", showStaff);
      if (managerDayCard) managerDayCard.hidden = showStaff;
      if (managerActions) managerActions.hidden = showStaff;
      if (miniCalendarSection) miniCalendarSection.hidden = showStaff;
      if (inputsSection) inputsSection.hidden = showStaff;
      if (poolSection) poolSection.hidden = showStaff;
      if (splitSection) splitSection.hidden = showStaff;
      if (staffRangeCard) staffRangeCard.hidden = !showStaff;
      if (staffActions) staffActions.hidden = !showStaff;
      if (staffStatementsSection) staffStatementsSection.hidden = !showStaff;
    }

    function resolveCurrentStaffTipName() {
      const profileEmail = String(profile && profile.email || session && session.user && session.user.email || "").trim().toLowerCase();
      if (profileEmail) {
        const emailMatch = staffRows.find(function matchEmail(row) {
          return String(row && row.email || "").trim().toLowerCase() === profileEmail;
        });
        if (emailMatch && emailMatch.name) {
          return emailMatch.name;
        }
      }

      const candidates = [
        String(profile && profile.full_name || "").trim(),
        String(profile && profile.email || "").split("@")[0].trim(),
        String(session && session.user && session.user.email || "").split("@")[0].trim(),
        String(session && session.temp_username || "").trim()
      ].filter(Boolean);
      const candidateKeys = candidates.map(canonicalNameKey).filter(Boolean);

      if (candidateKeys.length) {
        const exact = staffRows.find(function findExact(row) {
          return candidateKeys.includes(canonicalNameKey(row && row.name || ""));
        });
        if (exact && exact.name) {
          return exact.name;
        }
      }

      if (candidates.length) {
        return candidates[0];
      }

      return "Staff";
    }

    function buildLocalStaffTipStatements(staffName) {
      const targetKey = canonicalNameKey(staffName);
      if (!targetKey) {
        return [];
      }

      const normalizedWorkbook = normalizeTipWorkbook(workbook);
      const records = [];

      normalizedWorkbook.days.forEach(function mapDay(day, index) {
        const normalizedDay = normalizeTipDay(day, index, normalizedWorkbook.pay_period_start);
        if (!isIsoDateString(normalizedDay.date)) {
          return;
        }

        const calc = computeTipDay(normalizedDay);
        let payoutCents = 0;
        normalizedDay.rows.forEach(function matchRow(row, rowIndex) {
          if (canonicalNameKey(row && row.name) !== targetKey) {
            return;
          }
          payoutCents += roundedCents(calc.payouts[rowIndex] || 0);
        });

        if (!payoutCents) {
          return;
        }

        records.push({
          period_start: normalizedDay.date,
          period_end: normalizedDay.date,
          net_tips: payoutCents / 100
        });
      });

      return records;
    }

    function normalizeStaffTipStatements(rows) {
      return (Array.isArray(rows) ? rows : [])
        .map(function mapRow(item) {
          const start = String(item && item.period_start || "").trim();
          const endCandidate = String(item && item.period_end || "").trim();
          const end = isIsoDateString(endCandidate) ? endCandidate : start;
          if (!isIsoDateString(start) || !isIsoDateString(end)) {
            return null;
          }
          return {
            period_start: start,
            period_end: end < start ? start : end,
            net_tips: Number(item && item.net_tips || 0)
          };
        })
        .filter(Boolean)
        .sort(function sortByEnd(a, b) {
          const endDiff = String(a.period_end).localeCompare(String(b.period_end));
          if (endDiff !== 0) {
            return endDiff;
          }
          return String(a.period_start).localeCompare(String(b.period_start));
        });
    }

    function buildStaffTipsPrintHtml(displayName, rangeStart, rangeEnd, rows, total) {
      const tableRows = rows.map(function mapRow(item) {
        return `
          <tr>
            <td style="padding:6px 8px;border:1px solid #cfd0d5;">${escapedHtml(GPortal.dateOnly(item.period_start))}</td>
            <td style="padding:6px 8px;border:1px solid #cfd0d5;">${escapedHtml(GPortal.dateOnly(item.period_end))}</td>
            <td style="padding:6px 8px;border:1px solid #cfd0d5;text-align:right;">${escapedHtml(GPortal.money(item.net_tips || 0))}</td>
          </tr>
        `;
      }).join("");

      return `<!doctype html>
<html lang="en-US">
  <head>
    <meta charset="utf-8" />
    <title>Tips Statement</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 14mm; color: #111; }
      h1 { margin: 0 0 6px; font-size: 22px; }
      p { margin: 0 0 8px; font-size: 12px; }
      table { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: 8px; }
      th { background: #f3f4f6; text-align: left; padding: 6px 8px; border: 1px solid #cfd0d5; }
      @media print { body { margin: 10mm; } }
    </style>
  </head>
  <body>
    <h1>${escapedHtml(displayName)} - Tips</h1>
    <p><strong>Range:</strong> ${escapedHtml(longDateFull(rangeStart))} to ${escapedHtml(longDateFull(rangeEnd))}</p>
    <p><strong>Total in view:</strong> ${escapedHtml(GPortal.money(total))}</p>
    <table>
      <thead>
        <tr>
          <th>Start Date</th>
          <th>End Date</th>
          <th style="text-align:right;">Net Tips</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || "<tr><td colspan='3' style='padding:8px;border:1px solid #cfd0d5;'>No tip statements for this range.</td></tr>"}
      </tbody>
    </table>
  </body>
</html>`;
    }

    function openStaffTipsPdf(displayName, rangeStart, rangeEnd, rows, total) {
      const printWindow = window.open("", "_blank", "noopener,noreferrer,width=980,height=760");
      if (!printWindow) {
        return;
      }
      printWindow.document.open();
      printWindow.document.write(buildStaffTipsPrintHtml(displayName, rangeStart, rangeEnd, rows, total));
      printWindow.document.close();
      window.setTimeout(function printStaffTipsWindow() {
        printWindow.focus();
        printWindow.print();
      }, 220);
    }

    async function loadStaffTipsView() {
      setTipsViewMode(true);
      if (!staffStartDateInput || !staffEndDateInput || !staffRowsBody || !staffTotal || !staffRangeLabel) {
        return;
      }

      const staffName = resolveCurrentStaffTipName();
      const displayName = String(profile && profile.full_name || staffName || "Staff").trim();
      let statements = [];

      if (session.isTemp || !GPortal.hasSupabaseConfig()) {
        statements = normalizeStaffTipStatements(buildLocalStaffTipStatements(staffName));
      } else {
        const sb = GPortal.getSupabase();
        const result = await sb
          .from("tip_statements")
          .select("period_start,period_end,net_tips")
          .eq("employee_id", session.user.id)
          .order("period_end", { ascending: true });
        if (result.error) {
          statements = [];
        } else {
          statements = normalizeStaffTipStatements(result.data);
        }
      }

      const todayIso = localIsoDate(new Date());
      let rangeStart = statements.length
        ? statements[0].period_start
        : addDaysIsoDate(todayIso, -(TIP_DAY_COUNT - 1));
      let rangeEnd = statements.length
        ? statements[statements.length - 1].period_end
        : todayIso;
      if (!isIsoDateString(rangeStart)) {
        rangeStart = todayIso;
      }
      if (!isIsoDateString(rangeEnd) || rangeEnd < rangeStart) {
        rangeEnd = rangeStart;
      }

      function renderStaffStatementRows() {
        const rows = statements
          .filter(function inRange(item) {
            return item.period_end >= rangeStart && item.period_start <= rangeEnd;
          })
          .slice()
          .sort(function descByEnd(a, b) {
            const endDiff = String(b.period_end).localeCompare(String(a.period_end));
            if (endDiff !== 0) {
              return endDiff;
            }
            return String(b.period_start).localeCompare(String(a.period_start));
          });

        staffStartDateInput.value = rangeStart;
        staffEndDateInput.value = rangeEnd;
        staffRangeLabel.textContent = `${longDateFull(rangeStart)} to ${longDateFull(rangeEnd)}`;

        if (!rows.length) {
          staffRowsBody.innerHTML = "<tr><td colspan='3'>No tip statements for this range.</td></tr>";
          staffTotal.textContent = "Total in view: -";
          return { rows: rows, total: 0 };
        }

        let total = 0;
        staffRowsBody.innerHTML = rows.map(function mapRow(item) {
          const netTips = Number(item.net_tips || 0);
          total += netTips;
          return `
            <tr>
              <td>${GPortal.dateOnly(item.period_start)}</td>
              <td>${GPortal.dateOnly(item.period_end)}</td>
              <td>${GPortal.money(netTips)}</td>
            </tr>
          `;
        }).join("");
        staffTotal.textContent = `Total in view: ${GPortal.money(total)}`;
        return { rows: rows, total: total };
      }

      function normalizeRangeFromInputs() {
        const nextStart = String(staffStartDateInput.value || "").trim();
        const nextEnd = String(staffEndDateInput.value || "").trim();
        if (isIsoDateString(nextStart)) {
          rangeStart = nextStart;
        }
        if (isIsoDateString(nextEnd)) {
          rangeEnd = nextEnd;
        }
        if (rangeEnd < rangeStart) {
          rangeEnd = rangeStart;
        }
      }

      function bindRangePicker(input, key) {
        input.addEventListener("click", function onInputClick() {
          openNativeDatePicker(input);
        });
        input.addEventListener("dblclick", function onInputDoubleClick() {
          openNativeDatePicker(input);
        });
        input.addEventListener("focus", function onInputFocus() {
          openNativeDatePicker(input);
        });
        input.addEventListener("change", function onInputChange() {
          if (!isIsoDateString(input.value)) {
            return;
          }
          normalizeRangeFromInputs();
          if (key === "start" && rangeEnd < rangeStart) {
            rangeEnd = rangeStart;
            staffEndDateInput.value = rangeEnd;
          }
          renderStaffStatementRows();
        });
      }

      bindRangePicker(staffStartDateInput, "start");
      bindRangePicker(staffEndDateInput, "end");

      staffPdfBtn?.addEventListener("click", function onStaffPdfClick() {
        const rendered = renderStaffStatementRows();
        openStaffTipsPdf(displayName, rangeStart, rangeEnd, rendered.rows, rendered.total);
      });

      renderStaffStatementRows();
    }

    if (!canEdit) {
      await loadStaffTipsView();
      return;
    }

    setTipsViewMode(false);

    function toTipPositionFromStaffRole(roleValue) {
      if (roleValue === "Kitchen" || roleValue === "Server" || roleValue === "Busser") {
        return roleValue;
      }
      return "Off";
    }

    let selectedDayIndex = Number(window.sessionStorage.getItem(TIP_SELECTED_DAY_KEY) || 0);
    if (!Number.isInteger(selectedDayIndex) || selectedDayIndex < 0 || selectedDayIndex >= TIP_DAY_COUNT) {
      selectedDayIndex = 0;
    }

    function currentDay() {
      return workbook.days[selectedDayIndex];
    }

    function syncCurrentDayFromSchedule() {
      const day = currentDay();
      if (!day || !isIsoDateString(day.date)) {
        return false;
      }

      const latestStaffRows = readStaffRows();
      const namesSynced = syncTipWorkbookRowsFromStaff(workbook, latestStaffRows);
      const scheduleBook = readScheduleBook();
      const scheduledNames = Array.isArray(scheduleBook.assignments[day.date]) ? scheduleBook.assignments[day.date] : [];
      const scheduledSet = new Set(scheduledNames.map(normalizeNameKey).filter(Boolean));

      const roleByName = new Map();
      latestStaffRows.forEach(function mapRole(row) {
        const key = normalizeNameKey(row && row.name);
        if (!key || roleByName.has(key)) {
          return;
        }
        roleByName.set(key, toTipPositionFromStaffRole(row && row.position));
      });

      let changed = namesSynced;
      day.rows.forEach(function mapTipRows(row) {
        const key = normalizeNameKey(row && row.name);
        const isScheduled = Boolean(key) && scheduledSet.has(key);
        const mappedRole = isScheduled ? (roleByName.get(key) || "Off") : "Off";
        if (row.position !== mappedRole) {
          row.position = mappedRole;
          changed = true;
        }
      });

      return changed;
    }

    function overrideButtonLabel(amount) {
      const value = normalizedMoney(amount);
      return value > 0 ? GPortal.money(value) : "Set";
    }

    const overridePopover = document.createElement("div");
    overridePopover.className = "tips-override-popover";
    overridePopover.setAttribute("role", "dialog");
    overridePopover.setAttribute("aria-label", "Manual override");
    overridePopover.hidden = true;
    overridePopover.innerHTML = `
      <p class="tips-override-popover__title">Manual Override</p>
      <p class="tips-override-popover__hint">Enter amount. Leave blank to clear.</p>
      <input class="tips-override-popover__input" type="number" inputmode="decimal" step="0.01" />
      <p class="tips-override-popover__error" hidden></p>
      <div class="tips-override-popover__actions">
        <button type="button" data-tip-popover-action="cancel">Cancel</button>
        <button type="button" data-tip-popover-action="ok">OK</button>
      </div>
    `;
    document.body.appendChild(overridePopover);

    const overridePopoverInput = GPortal.qs(".tips-override-popover__input", overridePopover);
    const overridePopoverTitle = GPortal.qs(".tips-override-popover__title", overridePopover);
    const overridePopoverError = GPortal.qs(".tips-override-popover__error", overridePopover);

    let overridePopoverRowIndex = -1;
    let overridePopoverAnchor = null;
    let overridePopoverHideTimer = null;
    let calendarViewYear = 0;
    let calendarViewMonth = 0;
    let squareAutoSyncEnabled = canSquareAutoSync;
    let squareAutoSyncBusy = false;
    const squareAutoSyncedDates = new Set();

    function hasSquareSeedValues(day) {
      return toCents(day.square_tips) !== 0
        || toCents(day.large_party_tips) !== 0
        || toCents(day.cash_on_hand) !== 0;
    }

    async function fetchSquareTipsAutoPayload(syncDateIso) {
      const response = await fetch("/api/integrations/square/sync-day", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ date: syncDateIso })
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch (_ignored) {
        payload = null;
      }

      if (!response.ok || !(payload && payload.ok)) {
        const errorMessage = payload && payload.error
          ? payload.error
          : `Square sync failed (${response.status})`;
        const error = new Error(errorMessage);
        error.status = response.status;
        throw error;
      }

      return payload;
    }

    function refreshWorkbookFromStorage() {
      const latest = readTipWorkbook();
      workbook.pay_period_start = latest.pay_period_start;
      workbook.days = latest.days;
    }

    async function maybeAutoSyncSelectedDay() {
      if (!squareAutoSyncEnabled || squareAutoSyncBusy) {
        return;
      }

      const day = currentDay();
      const isoDate = String(day && day.date || "").trim();
      if (!isIsoDateString(isoDate)) {
        return;
      }

      if (squareAutoSyncedDates.has(isoDate)) {
        return;
      }

      if (hasSavedMarker(day) || hasSquareSeedValues(day)) {
        return;
      }

      squareAutoSyncBusy = true;
      try {
        const payload = await fetchSquareTipsAutoPayload(isoDate);
        const synced = syncSquareDayIntoWorkbook(isoDate, payload);
        squareAutoSyncedDates.add(isoDate);
        selectedDayIndex = synced.dayIndex;
        refreshWorkbookFromStorage();
        renderAmountInputs();
        renderComputed();
      } catch (error) {
        const statusCode = Number(error && error.status || 0);
        const message = String(error && error.message ? error.message : error).toLowerCase();
        if (
          statusCode === 400
          || statusCode === 401
          || statusCode === 403
          || statusCode === 404
          || message.includes("not connected")
          || message.includes("admin role required")
          || message.includes("missing bearer token")
        ) {
          squareAutoSyncEnabled = false;
        }
      } finally {
        squareAutoSyncBusy = false;
      }
    }

    function persistWorkbook() {
      writeTipWorkbook(workbook);
      window.sessionStorage.setItem(TIP_SELECTED_DAY_KEY, String(selectedDayIndex));
      const dateForSummary = currentDay() && currentDay().date;
      if (dateForSummary && /^\d{4}-\d{2}-\d{2}$/.test(dateForSummary)) {
        window.sessionStorage.setItem(TIP_SUMMARY_START_DATE_KEY, dateForSummary);
      }
    }

    function hasSavedMarker(day) {
      return Boolean(day && String(day.saved_at || "").trim());
    }

    function renderSavedMarker() {
      if (!tipsSavedBadge) {
        return;
      }
      tipsSavedBadge.hidden = !hasSavedMarker(currentDay());
    }

    function setCalendarViewToIso(isoDate) {
      const parsed = new Date(`${isoDate}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) {
        return;
      }
      calendarViewYear = parsed.getFullYear();
      calendarViewMonth = parsed.getMonth();
    }

    function renderMiniCalendar() {
      if (!tipsCalendarGrid || !tipsCalendarMonth) {
        return;
      }

      const todayIso = localIsoDate(new Date());
      const selectedIso = currentDay().date || "";
      if (!calendarViewYear || !Number.isInteger(calendarViewMonth)) {
        setCalendarViewToIso(selectedIso || todayIso);
      }

      const monthStart = new Date(calendarViewYear, calendarViewMonth, 1);
      const firstWeekday = monthStart.getDay();
      const daysInMonth = new Date(calendarViewYear, calendarViewMonth + 1, 0).getDate();
      const leadingDays = firstWeekday;
      const trailingDays = (7 - ((leadingDays + daysInMonth) % 7)) % 7;
      const totalCells = leadingDays + daysInMonth + trailingDays;

      tipsCalendarMonth.textContent = monthStart.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric"
      });

      const cells = [];
      for (let index = 0; index < totalCells; index += 1) {
        if (index < leadingDays || index >= (leadingDays + daysInMonth)) {
          cells.push("<span class='tips-mini-calendar__empty'></span>");
          continue;
        }

        const dayNumber = index - leadingDays + 1;
        const dayDate = new Date(calendarViewYear, calendarViewMonth, dayNumber);
        const isoDate = localIsoDate(dayDate);
        const isSelected = selectedIso === isoDate;
        const isToday = todayIso === isoDate;
        const rowIndex = workbook.days.findIndex(function byDate(day) {
          return day.date === isoDate;
        });
        const isSaved = rowIndex >= 0 && hasSavedMarker(workbook.days[rowIndex]);
        const classes = [
          "tips-mini-calendar__day",
          isSelected ? "is-selected" : "",
          isToday ? "is-today" : "",
          isSaved ? "is-saved" : ""
        ].filter(Boolean).join(" ");
        const disabled = canEdit ? "" : " disabled";
        const current = isSelected ? " aria-current='date'" : "";
        const title = isSaved ? " title='Saved'" : "";
        cells.push(`<button class="${classes}" type="button" data-tip-calendar-date="${isoDate}"${disabled}${current}${title}>${dayNumber}</button>`);
      }

      tipsCalendarGrid.innerHTML = cells.join("");
    }

    function clearOverrideError() {
      if (!overridePopoverError) {
        return;
      }
      overridePopoverError.hidden = true;
      overridePopoverError.textContent = "";
    }

    function setOverrideError(message) {
      if (!overridePopoverError) {
        return;
      }
      overridePopoverError.hidden = false;
      overridePopoverError.textContent = message;
    }

    function positionOverridePopover(anchorButton) {
      if (!anchorButton || overridePopover.hidden) {
        return;
      }

      const rect = anchorButton.getBoundingClientRect();
      const popRect = overridePopover.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 10;

      let left = rect.left + window.scrollX + (rect.width / 2) - (popRect.width / 2);
      left = Math.max(window.scrollX + margin, Math.min(left, window.scrollX + viewportWidth - popRect.width - margin));

      let top = rect.bottom + window.scrollY + 8;
      if (rect.bottom + popRect.height + 14 > viewportHeight) {
        top = rect.top + window.scrollY - popRect.height - 8;
      }
      top = Math.max(window.scrollY + margin, top);

      overridePopover.style.left = `${Math.round(left)}px`;
      overridePopover.style.top = `${Math.round(top)}px`;
    }

    function hideOverridePopover(immediate) {
      if (overridePopoverHideTimer) {
        window.clearTimeout(overridePopoverHideTimer);
        overridePopoverHideTimer = null;
      }

      if (immediate) {
        overridePopover.classList.remove("is-open");
        overridePopover.hidden = true;
        overridePopoverRowIndex = -1;
        overridePopoverAnchor = null;
        clearOverrideError();
        return;
      }

      if (overridePopover.hidden) {
        return;
      }

      overridePopover.classList.remove("is-open");
      overridePopoverHideTimer = window.setTimeout(function finishHideOverridePopover() {
        overridePopover.hidden = true;
        overridePopoverHideTimer = null;
      }, 180);

      overridePopoverRowIndex = -1;
      overridePopoverAnchor = null;
      clearOverrideError();
    }

    function openOverridePopover(rowIndex, anchorButton) {
      if (!canEdit) {
        return;
      }
      if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= TIP_ROSTER_SIZE || !anchorButton) {
        return;
      }

      overridePopoverRowIndex = rowIndex;
      overridePopoverAnchor = anchorButton;
      clearOverrideError();

      const currentValue = normalizedMoney(currentDay().rows[rowIndex].override_amount);
      overridePopoverInput.value = currentValue > 0 ? currentValue.toFixed(2) : "";
      if (overridePopoverTitle) {
        const employeeName = currentDay().rows[rowIndex].name || "Employee";
        overridePopoverTitle.textContent = `Manual Override: ${employeeName}`;
      }

      if (overridePopoverHideTimer) {
        window.clearTimeout(overridePopoverHideTimer);
        overridePopoverHideTimer = null;
      }

      overridePopover.hidden = false;
      positionOverridePopover(anchorButton);
      window.requestAnimationFrame(function animateOpenOverridePopover() {
        overridePopover.classList.add("is-open");
      });

      overridePopoverInput.focus();
      overridePopoverInput.select();
    }

    function commitOverridePopover() {
      if (overridePopoverRowIndex < 0 || overridePopoverRowIndex >= TIP_ROSTER_SIZE) {
        hideOverridePopover();
        return;
      }

      const row = currentDay().rows[overridePopoverRowIndex];
      const trimmed = String(overridePopoverInput.value || "").trim();

      if (!trimmed) {
        row.override_amount = 0;
        renderComputed();
        hideOverridePopover();
        return;
      }

      const cleaned = trimmed.replace(/[^0-9.-]/g, "");
      const parsedNumber = Number(cleaned);
      if (!cleaned || Number.isNaN(parsedNumber) || parsedNumber < 0) {
        setOverrideError("Enter a valid positive amount.");
        return;
      }

      row.override_amount = Math.max(0, normalizedMoney(parsedNumber));
      renderComputed();
      hideOverridePopover();
    }

    function clearOverrideFromPopover() {
      if (overridePopoverRowIndex < 0 || overridePopoverRowIndex >= TIP_ROSTER_SIZE) {
        hideOverridePopover();
        return;
      }
      currentDay().rows[overridePopoverRowIndex].override_amount = 0;
      renderComputed();
      hideOverridePopover();
    }

    overridePopover.addEventListener("click", function onOverridePopoverClick(event) {
      const actionTarget = event.target.closest("[data-tip-popover-action]");
      if (!actionTarget) {
        return;
      }

      const action = actionTarget.getAttribute("data-tip-popover-action");
      if (action === "cancel") {
        clearOverrideFromPopover();
        return;
      }
      if (action === "ok") {
        commitOverridePopover();
      }
    });

    overridePopoverInput.addEventListener("keydown", function onOverrideInputKeydown(event) {
      if (event.key === "Enter") {
        event.preventDefault();
        commitOverridePopover();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        clearOverrideFromPopover();
      }
    });

    document.addEventListener("click", function onDocumentOverrideClick(event) {
      if (overridePopover.hidden) {
        return;
      }
      if (overridePopover.contains(event.target)) {
        return;
      }
      const trigger = event.target.closest("button[data-tip-action='override']");
      if (trigger) {
        return;
      }
      hideOverridePopover();
    });

    window.addEventListener("resize", function onWindowResize() {
      if (!overridePopover.hidden) {
        positionOverridePopover(overridePopoverAnchor);
      }
    });

    window.addEventListener("scroll", function onWindowScroll() {
      if (!overridePopover.hidden) {
        positionOverridePopover(overridePopoverAnchor);
      }
    }, true);

    function selectDayForDate(isoDate) {
      const existingIndex = workbook.days.findIndex(function byDate(day) {
        return day.date === isoDate;
      });

      if (existingIndex >= 0) {
        selectedDayIndex = existingIndex;
        setCalendarViewToIso(isoDate);
        return;
      }

      const firstUnusedIndex = workbook.days.findIndex(function byUnused(day) {
        return !hasTipDayData(day);
      });

      if (firstUnusedIndex >= 0) {
        selectedDayIndex = firstUnusedIndex;
        workbook.days[firstUnusedIndex].date = isoDate;
        setCalendarViewToIso(isoDate);
        return;
      }

      currentDay().date = isoDate;
      setCalendarViewToIso(isoDate);
    }

    function renderAmountInputs() {
      const day = currentDay();
      dayDateInput.value = day.date || "";
      squareInput.value = moneyInputValue(day.square_tips);
      partyInput.value = moneyInputValue(day.large_party_tips);
      cashDueInput.value = moneyInputValue(day.cash_due);
      cashOnHandInput.value = moneyInputValue(day.cash_on_hand);
    }

    function renderRoster() {
      hideOverridePopover(true);
      const day = currentDay();
      const disabled = canEdit ? "" : " disabled";
      const rows = day.rows.slice(0, visibleRowCount).map(function mapRows(row, index) {
        const options = TIP_POSITIONS.map(function mapOption(option) {
          const selected = row.position === option ? " selected" : "";
          const label = option === "OOP" ? "Out of Pocket (OOP)" : option;
          const optionStyle = roleOptionInlineStyle(option);
          return `<option value="${option}" style="${optionStyle}"${selected}>${label}</option>`;
        }).join("");

        return `
          <tr data-tip-row="${index}">
            <td><span class="tips-name-cell">${escapedHtml(row.name)}</span></td>
            <td>
              <div class="tips-position-wrap">
                <select class="tips-role-select ${roleThemeClassName(row.position)}" data-role-colored="true" data-tip-field="position" data-tip-row-index="${index}"${disabled}>${options}</select>
              </div>
            </td>
            <td>
              <button class="tips-override-btn" type="button" data-tip-action="override" data-tip-row-index="${index}"${disabled}>${overrideButtonLabel(row.override_amount)}</button>
            </td>
            <td><span class="tips-final-tip" data-tip-payout-index="${index}">$0.00</span></td>
          </tr>
        `;
      });
      if (!rows.length) {
        rosterBody.innerHTML = "<tr><td colspan='4'>Add staff on the Staff page to start tips.</td></tr>";
        return;
      }
      rosterBody.innerHTML = rows.join("");
      GPortal.qsa("select[data-tip-field='position']", rosterBody).forEach(function themeSelect(selectElement) {
        applyRoleSelectTheme(selectElement, selectElement.value);
      });
    }

    function renderComputed() {
      const calc = computeTipDay(currentDay());

      poolTotal.textContent = GPortal.money(calc.poolCents / 100);
      kitchenPool.textContent = GPortal.money(calc.kitchenPoolCents / 100);
      busserPool.textContent = GPortal.money(calc.busserPoolCents / 100);
      serverPool.textContent = GPortal.money(calc.serverPoolCents / 100);
      oopTotal.textContent = GPortal.money(calc.oopCents / 100);
      paidTotal.textContent = GPortal.money(calc.paidCents / 100);
      difference.textContent = GPortal.money(calc.differenceCents / 100);

      const differenceRow = difference.closest(".tips-kpi-line");
      if (differenceRow) {
        differenceRow.classList.toggle("is-alert", calc.differenceCents !== 0);
      }

      calc.payouts.forEach(function updatePayout(value, index) {
        const payoutEl = GPortal.qs(`[data-tip-payout-index="${index}"]`, rosterBody);
        if (payoutEl) {
          payoutEl.textContent = GPortal.money(value / 100);
        }

        const overrideBtnEl = GPortal.qs(`button[data-tip-action='override'][data-tip-row-index="${index}"]`, rosterBody);
        if (overrideBtnEl) {
          overrideBtnEl.textContent = overrideButtonLabel(currentDay().rows[index].override_amount);
        }

        const roleSelect = GPortal.qs(`select[data-tip-field='position'][data-tip-row-index="${index}"]`, rosterBody);
        const roleValue = currentDay().rows[index].position;
        if (roleSelect) {
          if (roleSelect.value !== roleValue) {
            roleSelect.value = roleValue;
          }
          applyRoleSelectTheme(roleSelect, roleValue);
        }
      });

      renderSavedMarker();
      renderMiniCalendar();
      persistWorkbook();
      if (session.isTemp || !GPortal.hasSupabaseConfig()) {
        renderLocalTipsHistory(workbook);
      }
    }

    function switchDay(nextDayIndex) {
      if (!Number.isInteger(nextDayIndex) || nextDayIndex < 0 || nextDayIndex >= TIP_DAY_COUNT) {
        return;
      }
      selectedDayIndex = nextDayIndex;
      setCalendarViewToIso(currentDay().date);
      renderAmountInputs();
      renderRoster();
      renderComputed();
    }

    async function selectAndRenderTipDay(isoDate) {
      if (!canEdit) {
        return;
      }
      if (!isIsoDateString(isoDate)) {
        return;
      }
      selectDayForDate(isoDate);
      syncCurrentDayFromSchedule();
      renderAmountInputs();
      renderRoster();
      renderComputed();
      await maybeAutoSyncSelectedDay();
    }

    async function shiftSelectedTipDay(dayOffset) {
      const currentIso = String(currentDay() && currentDay().date || "").trim();
      const baseIso = isIsoDateString(currentIso) ? currentIso : localIsoDate(new Date());
      const nextIso = addDaysIsoDate(baseIso, dayOffset);
      await selectAndRenderTipDay(nextIso);
    }

    function shiftCalendarMonth(monthOffset) {
      const next = new Date(calendarViewYear, calendarViewMonth + monthOffset, 1);
      if (Number.isNaN(next.getTime())) {
        return;
      }
      calendarViewYear = next.getFullYear();
      calendarViewMonth = next.getMonth();
      renderMiniCalendar();
    }

    function updateAmountField(input, field, options) {
      if (!input) {
        return;
      }

      const settings = options || {};
      const forceNegative = Boolean(settings.forceNegative);

      input.disabled = !canEdit;

      input.addEventListener("input", function onAmountInput() {
        if (!canEdit) {
          return;
        }
        let value = normalizedMoney(input.value);
        if (forceNegative && value > 0) {
          value = -value;
        }
        currentDay()[field] = value;
        renderComputed();
      });

      input.addEventListener("blur", function onAmountBlur() {
        if (!canEdit) {
          return;
        }
        let value = normalizedMoney(input.value);
        if (forceNegative && value > 0) {
          value = -value;
        }
        currentDay()[field] = value;
        input.value = moneyInputValue(value);
        renderComputed();
      });
    }

    rosterBody.addEventListener("click", function onOverrideClick(event) {
      if (!canEdit) {
        return;
      }
      const button = event.target.closest("button[data-tip-action='override']");
      if (!button) {
        return;
      }
      const rowIndex = Number(button.getAttribute("data-tip-row-index"));
      if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= TIP_ROSTER_SIZE) {
        return;
      }
      openOverridePopover(rowIndex, button);
    });

    rosterBody.addEventListener("change", function onRosterChange(event) {
      if (!canEdit) {
        return;
      }
      const target = event.target;
      const field = target.getAttribute("data-tip-field");
      if (field !== "position") {
        return;
      }
      const rowIndex = Number(target.getAttribute("data-tip-row-index"));
      if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= TIP_ROSTER_SIZE) {
        return;
      }
      const selected = TIP_POSITIONS.includes(target.value) ? target.value : "Off";
      currentDay().rows[rowIndex].position = selected;
      applyRoleSelectTheme(target, selected);
      renderComputed();
    });

    function syncFromScheduleAndRender() {
      if (syncCurrentDayFromSchedule()) {
        renderRoster();
        renderComputed();
      }
    }

    dayDateInput.disabled = !canEdit;
    dayDateInput.addEventListener("change", async function onDayDateChange() {
      if (!canEdit) {
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayDateInput.value)) {
        return;
      }
      await selectAndRenderTipDay(dayDateInput.value);
    });

    dayDateInput.addEventListener("click", function onDayDateClick() {
      if (!canEdit) {
        return;
      }
      openNativeDatePicker(dayDateInput);
    });

    dayDateInput.addEventListener("dblclick", function onDayDateDoubleClick() {
      if (!canEdit) {
        return;
      }
      openNativeDatePicker(dayDateInput);
    });

    dayDateInput.addEventListener("focus", function onDayDateFocus() {
      if (!canEdit) {
        return;
      }
      openNativeDatePicker(dayDateInput);
    });

    if (dayPrevBtn) {
      dayPrevBtn.disabled = !canEdit;
      dayPrevBtn.addEventListener("click", async function onTipsDayPrevClick() {
        if (!canEdit) {
          return;
        }
        await shiftSelectedTipDay(-1);
      });
    }

    if (dayNextBtn) {
      dayNextBtn.disabled = !canEdit;
      dayNextBtn.addEventListener("click", async function onTipsDayNextClick() {
        if (!canEdit) {
          return;
        }
        await shiftSelectedTipDay(1);
      });
    }

    if (tipsCalendarGrid) {
      tipsCalendarGrid.addEventListener("click", async function onTipsCalendarDayClick(event) {
        if (!canEdit) {
          return;
        }
        const button = event.target.closest("button[data-tip-calendar-date]");
        if (!button) {
          return;
        }
        const isoDate = String(button.getAttribute("data-tip-calendar-date") || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
          return;
        }
        await selectAndRenderTipDay(isoDate);
      });
    }

    if (tipsCalendarPrev) {
      tipsCalendarPrev.disabled = !canEdit;
      tipsCalendarPrev.addEventListener("click", function onTipsCalendarPrevClick() {
        if (!canEdit) {
          return;
        }
        shiftCalendarMonth(-1);
      });
    }

    if (tipsCalendarNext) {
      tipsCalendarNext.disabled = !canEdit;
      tipsCalendarNext.addEventListener("click", function onTipsCalendarNextClick() {
        if (!canEdit) {
          return;
        }
        shiftCalendarMonth(1);
      });
    }

    if (tipsSaveBtn) {
      tipsSaveBtn.disabled = !canEdit;
      tipsSaveBtn.addEventListener("click", function onTipsSaveClick() {
        if (!canEdit) {
          return;
        }
        currentDay().saved_at = new Date().toISOString();
        persistWorkbook();
        renderSavedMarker();
        renderMiniCalendar();
        if (session.isTemp || !GPortal.hasSupabaseConfig()) {
          renderLocalTipsHistory(workbook);
        }
      });
    }

    updateAmountField(squareInput, "square_tips");
    updateAmountField(partyInput, "large_party_tips");
    updateAmountField(cashDueInput, "cash_due", { forceNegative: true });
    updateAmountField(cashOnHandInput, "cash_on_hand");

    window.addEventListener("gportal:schedule-updated", syncFromScheduleAndRender);
    window.addEventListener("storage", function onTipsStorage(event) {
      if (event.key === SCHEDULE_STORAGE_KEY || event.key === STAFF_ROSTER_STORAGE_KEY) {
        syncFromScheduleAndRender();
      }
    });
    window.addEventListener("focus", syncFromScheduleAndRender);

    syncCurrentDayFromSchedule();
    setCalendarViewToIso(currentDay().date);
    renderAmountInputs();
    renderRoster();
    renderComputed();
    await maybeAutoSyncSelectedDay();

    if (session.isTemp || !GPortal.hasSupabaseConfig()) {
      renderLocalTipsHistory(workbook);
    } else {
      await renderSupabaseTipsHistory(session);
    }
  }

  async function loadTipsSummary(session, profile) {
    const summaryPage = GPortal.qs("#tipsSummaryPage");
    const startDateInput = GPortal.qs("#tipsSummaryStartDate");
    const endDateInput = GPortal.qs("#tipsSummaryEndDate");
    const saveButton = GPortal.qs("#tipsSummarySaveBtn");
    const saveFlash = GPortal.qs("#tipsSummarySaveFlash");
    const rangeLabel = GPortal.qs("#tipsSummaryRange");
    const dayRows = GPortal.qs("#tipsSummaryDayRows");
    const employeeRows = GPortal.qs("#tipsSummaryEmployeeRows");
    const summaryCalendarGrid = GPortal.qs("#tipsSummaryCalendarGrid");
    const summaryCalendarMonth = GPortal.qs("#tipsSummaryCalendarMonth");
    const summaryCalendarPrev = GPortal.qs("#tipsSummaryCalendarPrev");
    const summaryCalendarNext = GPortal.qs("#tipsSummaryCalendarNext");

    if (!summaryPage || !startDateInput || !endDateInput || !saveButton || !dayRows || !employeeRows) {
      return;
    }

    const canViewFullSummary = Boolean(profile && (profile.role === "admin" || profile.role === "manager"));
    if (!canViewFullSummary) {
      summaryPage.innerHTML = `
        <div class="notice">
          Tip Summary is manager-only. Use the Tips page to view your personal tip history.
        </div>
      `;
      return;
    }

    let workbook = readTipWorkbook();

    function refreshWorkbookFromStorage() {
      workbook = readTipWorkbook();
      const staffRows = readStaffRows();
      if (syncTipWorkbookRowsFromStaff(workbook, staffRows)) {
        writeTipWorkbook(workbook);
        workbook = readTipWorkbook();
      }
      return workbook;
    }

    refreshWorkbookFromStorage();

    let startDate = "";
    const selectedDayIndex = Number(window.sessionStorage.getItem(TIP_SELECTED_DAY_KEY) || -1);
    if (Number.isInteger(selectedDayIndex) && selectedDayIndex >= 0 && selectedDayIndex < TIP_DAY_COUNT) {
      const selectedDay = workbook.days[selectedDayIndex];
      startDate = selectedDay && selectedDay.date ? selectedDay.date : "";
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      startDate = window.sessionStorage.getItem(TIP_SUMMARY_START_DATE_KEY) || "";
    }
    startDate = safeSummaryStartDate(startDate, workbook);
    let endDate = window.sessionStorage.getItem(TIP_SUMMARY_END_DATE_KEY) || "";
    endDate = safeSummaryEndDate(endDate, startDate);

    let currentModel = null;
    let saveFadeTimer = null;
    let saveHideTimer = null;
    let summaryCalendarYear = 0;
    let summaryCalendarMonthIndex = 0;
    let calendarTargetField = "start";

    function hasSavedMarker(day) {
      return Boolean(day && String(day.saved_at || "").trim());
    }

    function setSummaryCalendarViewToIso(isoDate) {
      const parsed = new Date(`${isoDate}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) {
        return;
      }
      summaryCalendarYear = parsed.getFullYear();
      summaryCalendarMonthIndex = parsed.getMonth();
    }

    function shiftSummaryCalendarMonth(monthOffset) {
      const next = new Date(summaryCalendarYear, summaryCalendarMonthIndex + monthOffset, 1);
      if (Number.isNaN(next.getTime())) {
        return;
      }
      summaryCalendarYear = next.getFullYear();
      summaryCalendarMonthIndex = next.getMonth();
      renderSummaryMiniCalendar();
    }

    function renderSummaryMiniCalendar() {
      if (!summaryCalendarGrid || !summaryCalendarMonth) {
        return;
      }

      const todayIso = localIsoDate(new Date());
      const rangeStart = safeSummaryStartDate(startDateInput.value || startDate, workbook);
      const rangeEnd = safeSummaryEndDate(endDateInput.value || endDate, rangeStart);

      if (!summaryCalendarYear || !Number.isInteger(summaryCalendarMonthIndex)) {
        setSummaryCalendarViewToIso(rangeStart || todayIso);
      }

      const monthStart = new Date(summaryCalendarYear, summaryCalendarMonthIndex, 1);
      const firstWeekday = monthStart.getDay();
      const daysInMonth = new Date(summaryCalendarYear, summaryCalendarMonthIndex + 1, 0).getDate();
      const leadingDays = firstWeekday;
      const trailingDays = (7 - ((leadingDays + daysInMonth) % 7)) % 7;
      const totalCells = leadingDays + daysInMonth + trailingDays;

      summaryCalendarMonth.textContent = monthStart.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric"
      });

      const cells = [];
      for (let index = 0; index < totalCells; index += 1) {
        if (index < leadingDays || index >= (leadingDays + daysInMonth)) {
          cells.push("<span class='tips-mini-calendar__empty'></span>");
          continue;
        }

        const dayNumber = index - leadingDays + 1;
        const dayDate = new Date(summaryCalendarYear, summaryCalendarMonthIndex, dayNumber);
        const isoDate = localIsoDate(dayDate);
        const isSelected = isoDate === rangeStart || isoDate === rangeEnd;
        const isInRange = isoDate > rangeStart && isoDate < rangeEnd;
        const isToday = todayIso === isoDate;
        const rowIndex = workbook.days.findIndex(function byDate(day) {
          return day.date === isoDate;
        });
        const isSaved = rowIndex >= 0 && hasSavedMarker(workbook.days[rowIndex]);
        const classes = [
          "tips-mini-calendar__day",
          isSelected ? "is-selected" : "",
          isInRange ? "is-in-range" : "",
          isToday ? "is-today" : "",
          isSaved ? "is-saved" : ""
        ].filter(Boolean).join(" ");
        const current = isSelected ? " aria-current='date'" : "";
        const title = isSaved ? " title='Saved day'" : "";
        cells.push(`<button class="${classes}" type="button" data-tip-summary-calendar-date="${isoDate}"${current}${title}>${dayNumber}</button>`);
      }

      summaryCalendarGrid.innerHTML = cells.join("");
    }

    function showSummarySaveFlash(message) {
      if (!saveFlash) {
        return;
      }

      if (saveFadeTimer) {
        window.clearTimeout(saveFadeTimer);
      }
      if (saveHideTimer) {
        window.clearTimeout(saveHideTimer);
      }

      saveFlash.textContent = message || "Saved";
      saveFlash.classList.remove("is-visible", "is-fading");
      void saveFlash.offsetWidth;
      saveFlash.classList.add("is-visible");

      saveFadeTimer = window.setTimeout(function startFade() {
        saveFlash.classList.add("is-fading");
      }, 1500);

      saveHideTimer = window.setTimeout(function hideFlash() {
        saveFlash.classList.remove("is-visible", "is-fading");
      }, 3900);
    }

    function renderSummary() {
      const latestWorkbook = refreshWorkbookFromStorage();
      currentModel = buildTipSummaryModel(
        latestWorkbook,
        startDateInput.value || startDate,
        endDateInput.value || endDate
      );
      startDate = currentModel.startDate;
      endDate = currentModel.endDate;
      startDateInput.value = currentModel.startDate;
      endDateInput.value = currentModel.endDate;
      window.sessionStorage.setItem(TIP_SUMMARY_START_DATE_KEY, currentModel.startDate);
      window.sessionStorage.setItem(TIP_SUMMARY_END_DATE_KEY, currentModel.endDate);
      const matchingDayIndex = latestWorkbook.days.findIndex(function findDay(day) {
        return day.date === currentModel.startDate;
      });
      if (matchingDayIndex >= 0) {
        window.sessionStorage.setItem(TIP_SELECTED_DAY_KEY, String(matchingDayIndex));
      }
      renderTipSummaryTable(currentModel, dayRows, employeeRows, rangeLabel);
      renderSummaryMiniCalendar();
      return currentModel;
    }

    function fileNameBase(model) {
      return `tips-summary-${filenameDatePart(model.startDate)}-to-${filenameDatePart(model.endDate)}`;
    }

    function exportAsCsv(model) {
      const blob = new Blob([buildTipSummaryCsv(model)], { type: "text/csv;charset=utf-8" });
      downloadFileBlob(`${fileNameBase(model)}.csv`, blob);
    }

    function exportAsExcel(model) {
      const blob = new Blob([buildTipSummaryExcelHtml(workbook, model.startDate, model.endDate)], { type: "application/vnd.ms-excel;charset=utf-8" });
      downloadFileBlob(`${fileNameBase(model)}.xls`, blob);
    }

    function exportAsPdf(model) {
      const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1080,height=780");
      if (!printWindow) {
        showSummarySaveFlash("Allow pop-ups to save PDF");
        return false;
      }

      printWindow.document.open();
      printWindow.document.write(buildTipSummaryPrintHtml(workbook, model.startDate, model.endDate));
      printWindow.document.close();
      window.setTimeout(function printSummaryWindow() {
        printWindow.focus();
        printWindow.print();
      }, 220);
      return true;
    }

    function onSaveSummary() {
      const model = renderSummary();
      if (exportAsPdf(model)) {
        showSummarySaveFlash("PDF Ready");
      }
    }

    startDateInput.value = startDate;
    endDateInput.value = endDate;
    startDateInput.addEventListener("change", function onStartDateChange() {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateInput.value)) {
        return;
      }
      endDateInput.value = safeSummaryEndDate(endDateInput.value, startDateInput.value);
      calendarTargetField = "start";
      setSummaryCalendarViewToIso(startDateInput.value);
      renderSummary();
    });
    startDateInput.addEventListener("click", function onStartDateClick() {
      calendarTargetField = "start";
      openNativeDatePicker(startDateInput);
    });
    startDateInput.addEventListener("dblclick", function onStartDateDoubleClick() {
      calendarTargetField = "start";
      openNativeDatePicker(startDateInput);
    });
    startDateInput.addEventListener("focus", function onStartDateFocus() {
      calendarTargetField = "start";
      openNativeDatePicker(startDateInput);
    });
    endDateInput.addEventListener("change", function onEndDateChange() {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(endDateInput.value)) {
        return;
      }
      endDateInput.value = safeSummaryEndDate(endDateInput.value, startDateInput.value || startDate);
      calendarTargetField = "end";
      setSummaryCalendarViewToIso(endDateInput.value);
      renderSummary();
    });
    endDateInput.addEventListener("click", function onEndDateClick() {
      calendarTargetField = "end";
      openNativeDatePicker(endDateInput);
    });
    endDateInput.addEventListener("dblclick", function onEndDateDoubleClick() {
      calendarTargetField = "end";
      openNativeDatePicker(endDateInput);
    });
    endDateInput.addEventListener("focus", function onEndDateFocus() {
      calendarTargetField = "end";
      openNativeDatePicker(endDateInput);
    });

    if (summaryCalendarGrid) {
      summaryCalendarGrid.addEventListener("click", function onSummaryCalendarClick(event) {
        const button = event.target.closest("button[data-tip-summary-calendar-date]");
        if (!button) {
          return;
        }
        const isoDate = String(button.getAttribute("data-tip-summary-calendar-date") || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
          return;
        }
        if (calendarTargetField === "end") {
          endDateInput.value = safeSummaryEndDate(isoDate, startDateInput.value || startDate);
        } else {
          startDateInput.value = isoDate;
          endDateInput.value = safeSummaryEndDate(endDateInput.value, isoDate);
        }
        setSummaryCalendarViewToIso(isoDate);
        renderSummary();
      });
    }

    if (summaryCalendarPrev) {
      summaryCalendarPrev.addEventListener("click", function onSummaryCalendarPrevClick() {
        shiftSummaryCalendarMonth(-1);
      });
    }

    if (summaryCalendarNext) {
      summaryCalendarNext.addEventListener("click", function onSummaryCalendarNextClick() {
        shiftSummaryCalendarMonth(1);
      });
    }

    saveButton.addEventListener("click", onSaveSummary);

    window.addEventListener("gportal:tips-workbook-updated", function onTipsWorkbookUpdated() {
      renderSummary();
    });

    window.addEventListener("storage", function onSummaryStorage(event) {
      if (event.key === TIP_WORKBOOK_STORAGE_KEY || event.key === TIP_WORKBOOK_REV_KEY || event.key === STAFF_ROSTER_STORAGE_KEY) {
        renderSummary();
      }
    });

    window.addEventListener("focus", function onSummaryFocus() {
      renderSummary();
    });

    document.addEventListener("visibilitychange", function onSummaryVisibilityChange() {
      if (document.visibilityState === "visible") {
        renderSummary();
      }
    });

    setSummaryCalendarViewToIso(startDate);
    renderSummary();
  }

  async function loadStaff(session, profile) {
    const tableBody = GPortal.qs("#staffRows");
    const editToggle = GPortal.qs("#staffEditToggle");
    const notice = GPortal.qs("#appSetupNotice");

    if (!tableBody) {
      return;
    }

    const canManage = Boolean(profile && (profile.role === "admin" || profile.role === "manager"));
    if (!canManage) {
      window.location.href = "/app/dashboard.html";
      return;
    }
    let rows = readStaffRows();
    let isEditing = false;
    let dragSourceIndex = -1;
    let addDraft = {
      name: "",
      position: "Server",
      email: "",
      phone: ""
    };

    function slugifyEmailName(value) {
      return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ".")
        .replace(/^\.+|\.+$/g, "")
        .replace(/\.{2,}/g, ".")
        .slice(0, 50);
    }

    function buildFakeEmail(name, index) {
      const base = slugifyEmailName(name) || `employee.${index + 1}`;
      return `${base}@guantonios.test`;
    }

    function buildFakePhone(index) {
      const suffix = String((index + 1) % 10000).padStart(4, "0");
      return normalizeStaffPhone(`209555${suffix}`);
    }

    function sanitizeDirectoryPosition(position) {
      const role = String(position || "").trim();
      return STAFF_DIRECTORY_POSITIONS.includes(role) ? role : "Server";
    }

    function ensureDirectorySeedData() {
      let changed = false;
      rows.forEach(function ensureRow(row, index) {
        const nextRole = sanitizeDirectoryPosition(row.position);
        if (row.position !== nextRole) {
          row.position = nextRole;
          changed = true;
        }

        const normalizedEmail = normalizeStaffEmail(row.email);
        const normalizedPhone = normalizeStaffPhone(row.phone);
        const nextEmail = normalizedEmail || buildFakeEmail(row.name, index);
        const nextPhone = normalizedPhone || buildFakePhone(index);

        if (row.email !== nextEmail) {
          row.email = nextEmail;
          changed = true;
        }
        if (row.phone !== nextPhone) {
          row.phone = nextPhone;
          changed = true;
        }

        const nextUserId = normalizeStaffUserId(row.user_id) || normalizeStaffUserId(String(nextEmail || "").split("@")[0]) || `local-${index + 1}`;
        const nextStatus = normalizeStaffStatus(row.status);
        if (row.user_id !== nextUserId) {
          row.user_id = nextUserId;
          changed = true;
        }
        if (row.status !== nextStatus) {
          row.status = nextStatus;
          changed = true;
        }
      });
      return changed;
    }

    function clearNotice() {
      if (!notice) {
        return;
      }
      notice.hidden = true;
      notice.textContent = "";
      notice.classList.remove("notice--error", "notice--ok");
    }

    function showNotice(message, tone) {
      if (!notice) {
        return;
      }
      GPortal.showNotice(notice, message, tone);
    }

    function saveStaffHubRows() {
      writeStaffRows(rows);
      syncTipWorkbookStorageFromStaff(rows);
    }

    function updateEditToggle() {
      if (!editToggle) {
        return;
      }

      if (!canManage) {
        editToggle.hidden = true;
        return;
      }

      editToggle.hidden = false;
      editToggle.textContent = isEditing ? "Done" : "Edit";
      editToggle.setAttribute("aria-pressed", isEditing ? "true" : "false");
      editToggle.classList.toggle("is-active", isEditing);
    }

    function renderRows() {
      updateEditToggle();
      const showAddRow = Boolean(canManage && isEditing);
      const addOptions = STAFF_DIRECTORY_POSITIONS.map(function mapPositionOption(position) {
        const selected = addDraft.position === position ? " selected" : "";
        return `<option value="${position}" style="${roleOptionInlineStyle(position)}"${selected}>${position}</option>`;
      }).join("");
      const addRoleThemeClass = roleThemeClassName(addDraft.position);
      const addRowHtml = showAddRow
        ? `
          <tr class="staff-row staff-row--adder">
            <td colspan="7">
              <div class="staff-add-form" role="group" aria-label="Add employee">
                <div class="form-row">
                  <label for="staffAddNameInput">Employee Name</label>
                  <input
                    id="staffAddNameInput"
                    class="staff-name-input"
                    type="text"
                    data-staff-add-field="name"
                    maxlength="80"
                    value="${escapedHtml(addDraft.name)}"
                    placeholder="Employee name"
                  />
                </div>

                <div class="form-row">
                  <label for="staffAddPositionSelect">Position</label>
                  <select
                    id="staffAddPositionSelect"
                    class="staff-position-select ${addRoleThemeClass}"
                    data-role-colored="true"
                    data-staff-add-field="position"
                  >${addOptions}</select>
                </div>

                <div class="form-row">
                  <label>Status</label>
                  <span class="status-pill status-pill--ok staff-add-status">Active</span>
                </div>

                <div class="form-row">
                  <label for="staffAddEmailInput">Email</label>
                  <input
                    id="staffAddEmailInput"
                    class="staff-email-input"
                    type="email"
                    data-staff-add-field="email"
                    maxlength="120"
                    value="${escapedHtml(addDraft.email)}"
                    placeholder="Email"
                  />
                </div>

                <div class="form-row">
                  <label for="staffAddPhoneInput">Phone</label>
                  <input
                    id="staffAddPhoneInput"
                    class="staff-phone-input"
                    type="tel"
                    data-staff-add-field="phone"
                    maxlength="24"
                    value="${escapedHtml(addDraft.phone)}"
                    placeholder="Phone"
                  />
                </div>

                <div class="form-row">
                  <label>User ID</label>
                  <span class="small staff-add-userid">Auto</span>
                </div>

                <div class="form-row staff-add-submit-wrap">
                  <span class="staff-add-submit-label" aria-hidden="true">Add</span>
                  <button class="btn btn--primary btn--small staff-add-submit" type="button" data-staff-action="add">Add Employee</button>
                </div>
              </div>
            </td>
          </tr>
        `
        : "";

      const staffRowsHtml = rows.map(function mapRow(row, index) {
        const options = STAFF_DIRECTORY_POSITIONS.map(function mapPosition(position) {
          const selected = row.position === position ? " selected" : "";
          return `<option value="${position}" style="${roleOptionInlineStyle(position)}"${selected}>${position}</option>`;
        }).join("");
        const roleThemeClass = roleThemeClassName(row.position);
        const nameCell = isEditing && canManage
          ? `<input class="staff-name-input" type="text" data-staff-field="name" data-staff-row-index="${index}" maxlength="80" value="${escapedHtml(row.name)}" />`
          : `<span class="staff-name">${escapedHtml(row.name)}</span>`;
        const positionCell = isEditing && canManage
          ? `<select class="staff-position-select ${roleThemeClass}" data-role-colored="true" data-staff-field="position" data-staff-row-index="${index}">${options}</select>`
          : `<span class="staff-position-value ${roleThemeClass}">${escapedHtml(row.position)}</span>`;
        const emailCell = isEditing && canManage
          ? `<input class="staff-email-input" type="email" data-staff-field="email" data-staff-row-index="${index}" maxlength="120" value="${escapedHtml(row.email || "")}" />`
          : `<span class="staff-email">${escapedHtml(row.email || "-")}</span>`;
        const phoneCell = isEditing && canManage
          ? `<input class="staff-phone-input" type="tel" data-staff-field="phone" data-staff-row-index="${index}" maxlength="24" value="${escapedHtml(row.phone || "")}" />`
          : `<span class="staff-phone">${escapedHtml(row.phone || "-")}</span>`;
        const statusTone = String(row.status || "").toLowerCase() === "inactive" ? "status-pill--warn" : "status-pill--ok";
        const statusText = String(row.status || "Active");
        const statusCell = `<span class="status-pill ${statusTone} staff-status">${escapedHtml(statusText)}</span>`;
        const userIdCell = `<code class="staff-user-id">${escapedHtml(row.user_id || `local-${index + 1}`)}</code>`;
        const actionsCell = isEditing && canManage
          ? `<div class="staff-action-row">
               <span class="staff-drag-handle" aria-hidden="true">
                 <span class="staff-drag-handle__bars"></span>
               </span>
               <button class="btn btn--small btn--danger" type="button" data-staff-action="remove" data-staff-row-index="${index}">Remove</button>
             </div>`
          : "<span class='staff-actions-placeholder'></span>";
        const rowClass = isEditing && canManage ? " class='staff-row is-draggable'" : " class='staff-row'";
        const rowDrag = isEditing && canManage ? " draggable='true'" : "";

        return `
          <tr data-staff-row="${index}"${rowClass}${rowDrag}>
            <td>
              ${nameCell}
            </td>
            <td>
              ${positionCell}
            </td>
            <td>
              ${statusCell}
            </td>
            <td>
              ${emailCell}
            </td>
            <td>
              ${phoneCell}
            </td>
            <td>
              ${userIdCell}
            </td>
            <td class="staff-actions">
              ${actionsCell}
            </td>
          </tr>
        `;
      }).join("");

      const emptyRowHtml = !rows.length
        ? `<tr><td colspan="7">${showAddRow ? "Use this row to add your first employee." : "No staff yet. Click Edit to add your first employee."}</td></tr>`
        : "";

      tableBody.innerHTML = `${addRowHtml}${staffRowsHtml}${emptyRowHtml}`;

      GPortal.qsa("select[data-staff-field='position']", tableBody).forEach(function themeSelect(selectElement) {
        applyRoleSelectTheme(selectElement, selectElement.value);
      });
      const addPositionSelect = GPortal.qs("select[data-staff-add-field='position']", tableBody);
      if (addPositionSelect) {
        applyRoleSelectTheme(addPositionSelect, addPositionSelect.value);
      }
    }

    if (ensureDirectorySeedData()) {
      saveStaffHubRows();
    }
    renderRows();

    function addStaffFromDraft() {
      const nextName = String(addDraft.name || "").trim().slice(0, 80);
      const nextPosition = STAFF_DIRECTORY_POSITIONS.includes(addDraft.position) ? addDraft.position : "Server";
      const typedEmail = normalizeStaffEmail(addDraft.email);
      const typedPhone = normalizeStaffPhone(addDraft.phone);
      const nextEmail = typedEmail || buildFakeEmail(nextName, rows.length);
      const nextPhone = typedPhone || buildFakePhone(rows.length);

      if (!nextName) {
        showNotice("Enter an employee name before adding.", "error");
        GPortal.qs("input[data-staff-add-field='name']", tableBody)?.focus();
        return false;
      }

      rows.push(emptyStaffRow(nextName, nextPosition, nextEmail, nextPhone, "", "Active", rows.length));
      addDraft = {
        name: "",
        position: "Server",
        email: "",
        phone: ""
      };
      saveStaffHubRows();
      clearNotice();
      renderRows();
      GPortal.qs("input[data-staff-add-field='name']", tableBody)?.focus();
      return true;
    }

    tableBody.addEventListener("change", function onStaffChange(event) {
      if (!canManage || !isEditing) {
        return;
      }

      const target = event.target;
      const addField = target.getAttribute("data-staff-add-field");
      if (addField === "position") {
        addDraft.position = STAFF_DIRECTORY_POSITIONS.includes(target.value) ? target.value : "Server";
        applyRoleSelectTheme(target, addDraft.position);
        return;
      }
      if (addField === "name") {
        addDraft.name = String(target.value || "").trim().slice(0, 80);
        target.value = addDraft.name;
        return;
      }
      if (addField === "email") {
        addDraft.email = normalizeStaffEmail(target.value);
        target.value = addDraft.email;
        return;
      }
      if (addField === "phone") {
        addDraft.phone = normalizeStaffPhone(target.value);
        target.value = addDraft.phone;
        return;
      }

      const field = target.getAttribute("data-staff-field");
      if (field !== "position" && field !== "name" && field !== "email" && field !== "phone") {
        return;
      }

      const rowIndex = Number(target.getAttribute("data-staff-row-index"));
      if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rows.length) {
        return;
      }

      if (field === "position") {
        rows[rowIndex].position = STAFF_DIRECTORY_POSITIONS.includes(target.value) ? target.value : "Server";
        applyRoleSelectTheme(target, rows[rowIndex].position);
      } else if (field === "name") {
        rows[rowIndex].name = String(target.value || "").trim().slice(0, 80);
      } else if (field === "email") {
        rows[rowIndex].email = normalizeStaffEmail(target.value);
      } else if (field === "phone") {
        rows[rowIndex].phone = normalizeStaffPhone(target.value);
        target.value = rows[rowIndex].phone;
      }
      saveStaffHubRows();
      clearNotice();
      renderRows();
    });

    tableBody.addEventListener("input", function onStaffInput(event) {
      if (!canManage || !isEditing) {
        return;
      }
      const target = event.target;
      if (target && target.getAttribute("data-staff-add-field") === "name") {
        addDraft.name = String(target.value || "").trim().slice(0, 80);
        target.value = addDraft.name;
        return;
      }
      if (target && target.getAttribute("data-staff-add-field") === "email") {
        addDraft.email = normalizeStaffEmail(target.value);
        target.value = addDraft.email;
        return;
      }
      if (target && target.getAttribute("data-staff-add-field") === "phone") {
        addDraft.phone = normalizeStaffPhone(target.value);
        target.value = addDraft.phone;
        return;
      }
      if (!target || target.getAttribute("data-staff-field") !== "phone") {
        return;
      }
      target.value = normalizeStaffPhone(target.value);
    });

    tableBody.addEventListener("click", function onStaffClick(event) {
      if (!canManage || !isEditing) {
        return;
      }
      const actionButton = event.target.closest("button[data-staff-action]");
      if (!actionButton) {
        return;
      }

      const action = actionButton.getAttribute("data-staff-action");
      if (action === "add") {
        addStaffFromDraft();
        return;
      }
      const rowIndex = Number(actionButton.getAttribute("data-staff-row-index"));
      if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rows.length) {
        return;
      }

      if (action === "remove") {
        rows.splice(rowIndex, 1);
        saveStaffHubRows();
        clearNotice();
        renderRows();
      }
    });

    tableBody.addEventListener("keydown", function onStaffAddKeydown(event) {
      if (!canManage || !isEditing || event.key !== "Enter") {
        return;
      }
      const target = event.target;
      if (!target || !target.getAttribute("data-staff-add-field")) {
        return;
      }
      event.preventDefault();
      addStaffFromDraft();
    });

    tableBody.addEventListener("dragstart", function onStaffDragStart(event) {
      if (!canManage || !isEditing) {
        return;
      }

      const row = event.target.closest("tr[data-staff-row]");
      if (!row) {
        return;
      }

      if (event.target.closest("select,button,input")) {
        event.preventDefault();
        return;
      }

      const rowIndex = Number(row.getAttribute("data-staff-row"));
      if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rows.length) {
        event.preventDefault();
        return;
      }

      dragSourceIndex = rowIndex;
      row.classList.add("is-dragging");

      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(rowIndex));
      }
    });

    tableBody.addEventListener("dragover", function onStaffDragOver(event) {
      if (!canManage || !isEditing) {
        return;
      }

      const targetRow = event.target.closest("tr[data-staff-row]");
      if (!targetRow) {
        return;
      }

      event.preventDefault();
      tableBody.querySelectorAll("tr[data-staff-row].is-drop-target").forEach(function clearDropClass(row) {
        row.classList.remove("is-drop-target");
      });

      const targetIndex = Number(targetRow.getAttribute("data-staff-row"));
      if (Number.isInteger(targetIndex) && targetIndex !== dragSourceIndex) {
        targetRow.classList.add("is-drop-target");
      }
    });

    tableBody.addEventListener("dragleave", function onStaffDragLeave(event) {
      const targetRow = event.target.closest("tr[data-staff-row].is-drop-target");
      if (targetRow) {
        targetRow.classList.remove("is-drop-target");
      }
    });

    tableBody.addEventListener("drop", function onStaffDrop(event) {
      if (!canManage || !isEditing) {
        return;
      }

      const targetRow = event.target.closest("tr[data-staff-row]");
      if (!targetRow) {
        return;
      }

      event.preventDefault();
      const targetIndex = Number(targetRow.getAttribute("data-staff-row"));
      if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= rows.length) {
        return;
      }
      if (!Number.isInteger(dragSourceIndex) || dragSourceIndex < 0 || dragSourceIndex >= rows.length) {
        return;
      }
      if (targetIndex === dragSourceIndex) {
        return;
      }

      const moved = rows.splice(dragSourceIndex, 1)[0];
      rows.splice(targetIndex, 0, moved);
      saveStaffHubRows();
      clearNotice();
      renderRows();
    });

    tableBody.addEventListener("dragend", function onStaffDragEnd() {
      dragSourceIndex = -1;
      tableBody.querySelectorAll("tr[data-staff-row].is-dragging,tr[data-staff-row].is-drop-target").forEach(function clearClasses(row) {
        row.classList.remove("is-dragging", "is-drop-target");
      });
    });

    if (editToggle) {
      editToggle.addEventListener("click", function onToggleEdit() {
        if (!canManage) {
          return;
        }
        isEditing = !isEditing;
        clearNotice();
        renderRows();
      });
    }
  }

  async function loadTraining(session) {
    const list = GPortal.qs("#trainingList");
    if (!list) {
      return;
    }

    const sb = GPortal.getSupabase();
    const result = await sb
      .from("training_assignments")
      .select("id,title,status,due_at")
      .eq("employee_id", session.user.id)
      .order("due_at", { ascending: true });

    list.innerHTML = "";

    if (result.error || !result.data.length) {
      list.innerHTML = "<div class='notice'>No training assigned yet.</div>";
      return;
    }

    result.data.forEach(function addCard(assignment) {
      const card = document.createElement("section");
      card.className = "card";
      card.innerHTML = `
        <h3>${assignment.title}</h3>
        <p class="small">Status: ${assignment.status}</p>
        <p class="small">Due: ${GPortal.dateOnly(assignment.due_at)}</p>
        <button class="btn btn--primary" type="button">Mark Complete</button>
        <div class="notice" hidden></div>
      `;

      const button = GPortal.qs("button", card);
      const notice = GPortal.qs(".notice", card);
      button.addEventListener("click", async function onComplete() {
        button.disabled = true;
        GPortal.showNotice(notice, "Saving completion...", "ok");

        const update = await sb
          .from("training_assignments")
          .update({ status: "COMPLETED", completed_at: new Date().toISOString() })
          .eq("id", assignment.id)
          .eq("employee_id", session.user.id);

        if (update.error) {
          button.disabled = false;
          GPortal.showNotice(notice, `Could not update: ${update.error.message}`, "error");
          return;
        }

        button.textContent = "Completed";
        GPortal.showNotice(notice, "Training marked complete.", "ok");
      });

      list.appendChild(card);
    });
  }

  async function loadMenus(session, profile) {
    const uploadTriggerBtn = GPortal.qs("#menuUploadTriggerBtn");
    const specialTriggerBtn = GPortal.qs("#menuSpecialTriggerBtn");
    const uploadStatus = GPortal.qs("#menuUploadStatus");
    const fileViewer = GPortal.qs("#menuFileViewer");
    const notesInput = GPortal.qs("#menuNotesInput");
    const notesSaveBtn = GPortal.qs("#menuNotesSaveBtn");
    const notesMeta = GPortal.qs("#menuNotesMeta");
    const notesStatus = GPortal.qs("#menuNotesStatus");
    const specialsList = GPortal.qs("#menuSpecialsList");
    const specialStatus = GPortal.qs("#menuSpecialStatus");
    const beverageCurrentInput = GPortal.qs("#menuBeverageCurrentInput");
    const beverageNotesInput = GPortal.qs("#menuBeverageNotesInput");
    const beverageSaveBtn = GPortal.qs("#menuBeverageSaveBtn");
    const beverageMeta = GPortal.qs("#menuBeverageMeta");
    const beverageStatus = GPortal.qs("#menuBeverageStatus");

    const menuUploadModal = GPortal.qs("#menuUploadModal");
    const menuUploadDateRow = GPortal.qs("#menuUploadDateRow");
    const menuUploadDateInput = GPortal.qs("#menuUploadDateInput");
    const menuUploadFileInput = GPortal.qs("#menuUploadFileInput");
    const menuUploadFilePreviewBadge = GPortal.qs("#menuUploadFilePreviewBadge");
    const menuUploadFilePreviewThumb = GPortal.qs("#menuUploadFilePreviewThumb");
    const menuUploadFilePreviewName = GPortal.qs("#menuUploadFilePreviewName");
    const menuUploadModalCancelBtn = GPortal.qs("#menuUploadModalCancelBtn");
    const menuUploadModalSaveBtn = GPortal.qs("#menuUploadModalSaveBtn");

    const menuSpecialModal = GPortal.qs("#menuSpecialModal");
    const menuSpecialNameInput = GPortal.qs("#menuSpecialNameInput");
    const menuSpecialFileInput = GPortal.qs("#menuSpecialFileInput");
    const menuSpecialNotesInput = GPortal.qs("#menuSpecialNotesInput");
    const menuSpecialFilePreviewBadge = GPortal.qs("#menuSpecialFilePreviewBadge");
    const menuSpecialFilePreviewThumb = GPortal.qs("#menuSpecialFilePreviewThumb");
    const menuSpecialFilePreviewName = GPortal.qs("#menuSpecialFilePreviewName");
    const menuSpecialModalStatus = GPortal.qs("#menuSpecialModalStatus");
    const menuSpecialModalCancelBtn = GPortal.qs("#menuSpecialModalCancelBtn");
    const menuSpecialModalSaveBtn = GPortal.qs("#menuSpecialModalSaveBtn");

    if (
      !uploadTriggerBtn ||
      !specialTriggerBtn ||
      !uploadStatus ||
      !fileViewer ||
      !notesInput ||
      !notesSaveBtn ||
      !notesMeta ||
      !notesStatus ||
      !specialsList ||
      !specialStatus ||
      !beverageCurrentInput ||
      !beverageNotesInput ||
      !beverageSaveBtn ||
      !beverageMeta ||
      !beverageStatus ||
      !menuUploadModal ||
      !menuUploadDateRow ||
      !menuUploadDateInput ||
      !menuUploadFileInput ||
      !menuUploadFilePreviewBadge ||
      !menuUploadFilePreviewThumb ||
      !menuUploadFilePreviewName ||
      !menuUploadModalCancelBtn ||
      !menuUploadModalSaveBtn ||
      !menuSpecialModal ||
      !menuSpecialNameInput ||
      !menuSpecialFileInput ||
      !menuSpecialNotesInput ||
      !menuSpecialFilePreviewBadge ||
      !menuSpecialFilePreviewThumb ||
      !menuSpecialFilePreviewName ||
      !menuSpecialModalStatus ||
      !menuSpecialModalCancelBtn ||
      !menuSpecialModalSaveBtn
    ) {
      return;
    }

    const canManageMenus = Boolean(profile && (profile.role === "admin" || profile.role === "manager"));
    const allowedMenuExtensions = [".pdf", ".odt", ".doc", ".docx", ".png", ".jpg", ".jpeg", ".webp"];
    const allowedSpecialExtensions = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];
    const allowedMenuMimeTypes = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.oasis.opendocument.text",
      "image/png",
      "image/jpeg",
      "image/webp"
    ]);
    const allowedSpecialMimeTypes = new Set([
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp"
    ]);
    let menuState = readMenuHubState();
    let menuUploadPreviewObjectUrl = "";
    let specialPreviewObjectUrl = "";

    function menuActorLabel() {
      return String(profile && profile.full_name || (session && session.user && session.user.email) || "Admin").trim().slice(0, 120);
    }

    function isAllowedFile(file, extensions, mimeTypes) {
      if (!file) {
        return false;
      }
      const lowerName = String(file.name || "").trim().toLowerCase();
      const lowerType = String(file.type || "").trim().toLowerCase();
      const matchesExtension = extensions.some(function matches(ext) {
        return lowerName.endsWith(ext);
      });
      const matchesType = mimeTypes.has(lowerType);
      return matchesExtension || matchesType;
    }

    function openMenuModal(modal) {
      if (!canManageMenus) {
        return;
      }
      modal.hidden = false;
      document.body.classList.add("menu-modal-open");
    }

    function closeMenuModal(modal) {
      modal.hidden = true;
      if (menuUploadModal.hidden && menuSpecialModal.hidden) {
        document.body.classList.remove("menu-modal-open");
      }
    }

    function closeAllMenuModals() {
      resetMenuUploadFilePreview();
      resetSpecialFilePreview();
      clearSpecialModalNotice();
      closeMenuModal(menuUploadModal);
      closeMenuModal(menuSpecialModal);
    }

    function uploadFileBadgeText(file) {
      const name = String(file && file.name || "").trim().toLowerCase();
      const type = String(file && file.type || "").trim().toLowerCase();
      if (type === "application/pdf" || name.endsWith(".pdf")) {
        return "PDF";
      }
      if (name.includes(".")) {
        const ext = name.split(".").pop() || "";
        return ext ? ext.slice(0, 4).toUpperCase() : "FILE";
      }
      return "FILE";
    }

    function resetMenuUploadFilePreview() {
      if (menuUploadPreviewObjectUrl) {
        URL.revokeObjectURL(menuUploadPreviewObjectUrl);
        menuUploadPreviewObjectUrl = "";
      }
      menuUploadFilePreviewThumb.hidden = true;
      menuUploadFilePreviewThumb.removeAttribute("src");
      menuUploadFilePreviewBadge.hidden = false;
      menuUploadFilePreviewBadge.textContent = "FILE";
      menuUploadFilePreviewName.textContent = "No file selected.";
    }

    function renderMenuUploadFilePreview() {
      const file = menuUploadFileInput.files && menuUploadFileInput.files[0] ? menuUploadFileInput.files[0] : null;
      if (!file) {
        resetMenuUploadFilePreview();
        return;
      }

      if (menuUploadPreviewObjectUrl) {
        URL.revokeObjectURL(menuUploadPreviewObjectUrl);
        menuUploadPreviewObjectUrl = "";
      }

      menuUploadFilePreviewName.textContent = String(file.name || "Selected file");
      const lowerType = String(file.type || "").trim().toLowerCase();
      if (lowerType.startsWith("image/")) {
        menuUploadPreviewObjectUrl = URL.createObjectURL(file);
        menuUploadFilePreviewThumb.src = menuUploadPreviewObjectUrl;
        menuUploadFilePreviewThumb.hidden = false;
        menuUploadFilePreviewBadge.hidden = true;
        return;
      }

      menuUploadFilePreviewThumb.hidden = true;
      menuUploadFilePreviewThumb.removeAttribute("src");
      menuUploadFilePreviewBadge.hidden = false;
      menuUploadFilePreviewBadge.textContent = uploadFileBadgeText(file);
    }

    function clearSpecialModalNotice() {
      menuSpecialModalStatus.hidden = true;
      menuSpecialModalStatus.textContent = "";
      menuSpecialModalStatus.classList.remove("notice--ok", "notice--error");
    }

    function showSpecialModalNotice(message, tone) {
      GPortal.showNotice(menuSpecialModalStatus, message, tone);
    }

    function specialFileBadgeText(file) {
      const name = String(file && file.name || "").trim().toLowerCase();
      const type = String(file && file.type || "").trim().toLowerCase();
      if (type === "application/pdf" || name.endsWith(".pdf")) {
        return "PDF";
      }
      if (name.includes(".")) {
        const ext = name.split(".").pop() || "";
        return ext ? ext.slice(0, 4).toUpperCase() : "FILE";
      }
      return "FILE";
    }

    function resetSpecialFilePreview() {
      if (specialPreviewObjectUrl) {
        URL.revokeObjectURL(specialPreviewObjectUrl);
        specialPreviewObjectUrl = "";
      }
      menuSpecialFilePreviewThumb.hidden = true;
      menuSpecialFilePreviewThumb.removeAttribute("src");
      menuSpecialFilePreviewBadge.hidden = false;
      menuSpecialFilePreviewBadge.textContent = "FILE";
      menuSpecialFilePreviewName.textContent = "No file selected.";
    }

    function renderSpecialFilePreview() {
      const file = menuSpecialFileInput.files && menuSpecialFileInput.files[0] ? menuSpecialFileInput.files[0] : null;
      if (!file) {
        resetSpecialFilePreview();
        return;
      }

      if (specialPreviewObjectUrl) {
        URL.revokeObjectURL(specialPreviewObjectUrl);
        specialPreviewObjectUrl = "";
      }

      menuSpecialFilePreviewName.textContent = String(file.name || "Selected file");
      const lowerType = String(file.type || "").trim().toLowerCase();
      if (lowerType.startsWith("image/")) {
        specialPreviewObjectUrl = URL.createObjectURL(file);
        menuSpecialFilePreviewThumb.src = specialPreviewObjectUrl;
        menuSpecialFilePreviewThumb.hidden = false;
        menuSpecialFilePreviewBadge.hidden = true;
        return;
      }

      menuSpecialFilePreviewThumb.hidden = true;
      menuSpecialFilePreviewThumb.removeAttribute("src");
      menuSpecialFilePreviewBadge.hidden = false;
      menuSpecialFilePreviewBadge.textContent = specialFileBadgeText(file);
    }

    function updateNotesMeta() {
      if (!menuState.notes_updated_at) {
        notesMeta.textContent = "No notes saved yet.";
        return;
      }
      const who = menuState.notes_updated_by ? ` by ${menuState.notes_updated_by}` : "";
      notesMeta.textContent = `Saved ${GPortal.dateTime(menuState.notes_updated_at)}${who}`;
    }

    function updateBeverageMeta() {
      if (!menuState.beverage_updated_at) {
        beverageMeta.textContent = "No updates saved yet.";
        return;
      }
      const who = menuState.beverage_updated_by ? ` by ${menuState.beverage_updated_by}` : "";
      beverageMeta.textContent = `Saved ${GPortal.dateTime(menuState.beverage_updated_at)}${who}`;
    }

    function renderMenuFile() {
      const file = menuState.file;
      if (!file) {
        fileViewer.innerHTML = "<div class='notice'>No menu file uploaded yet.</div>";
        return;
      }

      if (/^data:image\//i.test(file.data_url)) {
        fileViewer.innerHTML = `<img class="menu-file-preview menu-file-preview--full" src="${file.data_url}" alt="Current menu file" />`;
        return;
      }

      if (/^data:application\/pdf;base64,/i.test(file.data_url)) {
        fileViewer.innerHTML = `<iframe class="menu-file-preview-frame" src="${file.data_url}" title="Current menu PDF preview"></iframe>`;
        return;
      }

      fileViewer.innerHTML = "<div class='notice'>Preview unavailable for this file type.</div>";
    }

    function renderSpecialsList() {
      const specials = Array.isArray(menuState.specials) ? menuState.specials : [];
      if (!specials.length) {
        specialsList.innerHTML = "<div class='notice'>No specials posted yet.</div>";
        return;
      }

      const sorted = specials.slice().sort(function sortSpecials(a, b) {
        return String(b.created_at || "").localeCompare(String(a.created_at || ""));
      });

      specialsList.innerHTML = sorted.map(function mapSpecial(item) {
        const safeName = escapedHtml(item.name || "Special");
        const safeNotes = escapedHtml(item.notes || "");
        const imageMarkup = /^data:image\//i.test(String(item.file_data_url || ""))
          ? `<img class="menu-special-item__image" src="${item.file_data_url}" alt="${safeName}" />`
          : "";
        const pdfMarkup = /^data:application\/pdf;base64,/i.test(String(item.file_data_url || ""))
          ? "<p class='small'>PDF attached.</p>"
          : "";
        return `
          <article class="menu-special-item">
            <div class="menu-special-item__head">
              <h4>${safeName}</h4>
              ${canManageMenus ? `<button class="btn btn--small" type="button" data-menu-special-action="remove" data-menu-special-id="${escapedHtml(item.id)}">Remove</button>` : ""}
            </div>
            ${imageMarkup}
            ${pdfMarkup}
            ${safeNotes ? `<p class="small">${safeNotes}</p>` : ""}
          </article>
        `;
      }).join("");
    }

    function renderAll() {
      uploadTriggerBtn.hidden = !canManageMenus;
      specialTriggerBtn.hidden = !canManageMenus;
      notesSaveBtn.hidden = !canManageMenus;
      notesInput.readOnly = !canManageMenus;
      notesInput.value = menuState.notes || "";
      beverageSaveBtn.hidden = !canManageMenus;
      beverageCurrentInput.readOnly = !canManageMenus;
      beverageNotesInput.readOnly = !canManageMenus;
      beverageCurrentInput.value = menuState.beverage_current || "";
      beverageNotesInput.value = menuState.beverage_notes || "";
      updateNotesMeta();
      updateBeverageMeta();
      renderMenuFile();
      renderSpecialsList();
    }

    async function saveMenuFileFromModal() {
      if (!canManageMenus) {
        GPortal.showNotice(uploadStatus, "Manager/admin access required to upload menu files.", "error");
        return;
      }

      const selectedDate = String(menuUploadDateInput.value || "").trim();
      const file = menuUploadFileInput.files && menuUploadFileInput.files[0] ? menuUploadFileInput.files[0] : null;

      if (!isIsoDateString(selectedDate)) {
        GPortal.showNotice(uploadStatus, "Select the menu date.", "error");
        return;
      }
      if (!file) {
        GPortal.showNotice(uploadStatus, "Choose a menu file.", "error");
        return;
      }
      if (!isAllowedFile(file, allowedMenuExtensions, allowedMenuMimeTypes)) {
        GPortal.showNotice(uploadStatus, "Allowed files: PDF, ODF, DOC, DOCX, PNG, JPG, WEBP.", "error");
        return;
      }
      if (file.size > MENU_UPLOAD_MAX_BYTES) {
        GPortal.showNotice(uploadStatus, "File is too large. Use a file up to 2.5MB.", "error");
        return;
      }

      let dataUrl = "";
      try {
        dataUrl = await readFileAsDataUrl(file);
      } catch (_error) {
        GPortal.showNotice(uploadStatus, "Could not read that file.", "error");
        return;
      }
      if (!menuFileIsSafeDataUrl(dataUrl)) {
        GPortal.showNotice(uploadStatus, "That file type is not supported.", "error");
        return;
      }

      try {
        menuState.file = {
          name: String(file.name || "menu-file").trim().slice(0, 180),
          type: String(file.type || "").trim().slice(0, 120),
          size: Math.max(0, Math.floor(Number(file.size || 0))),
          date_for: selectedDate,
          uploaded_at: new Date().toISOString(),
          uploaded_by: menuActorLabel(),
          data_url: dataUrl
        };
        menuState = writeMenuHubState(menuState);
        menuUploadFileInput.value = "";
        menuUploadDateInput.value = "";
        resetMenuUploadFilePreview();
        closeMenuModal(menuUploadModal);
        renderAll();
        GPortal.showNotice(uploadStatus, "Menu file uploaded.", "ok");
      } catch (_error) {
        GPortal.showNotice(uploadStatus, "Upload could not be saved. The file may be too large for browser storage.", "error");
      }
    }

    async function saveSpecialFromModal() {
      if (!canManageMenus) {
        showSpecialModalNotice("Manager/admin access required.", "error");
        return;
      }

      const specialName = String(menuSpecialNameInput.value || "").trim().slice(0, 140);
      const specialNotes = String(menuSpecialNotesInput.value || "").slice(0, 3000);
      const specialFile = menuSpecialFileInput.files && menuSpecialFileInput.files[0] ? menuSpecialFileInput.files[0] : null;
      const originalSaveLabel = menuSpecialModalSaveBtn.textContent;

      menuSpecialModalSaveBtn.disabled = true;
      menuSpecialModalSaveBtn.textContent = "Saving...";
      clearSpecialModalNotice();

      if (!specialName) {
        showSpecialModalNotice("Enter the special name.", "error");
        menuSpecialNameInput.focus();
        menuSpecialModalSaveBtn.disabled = false;
        menuSpecialModalSaveBtn.textContent = originalSaveLabel;
        return;
      }

      if (specialFile && !isAllowedFile(specialFile, allowedSpecialExtensions, allowedSpecialMimeTypes)) {
        showSpecialModalNotice("Special file must be PDF or image.", "error");
        menuSpecialModalSaveBtn.disabled = false;
        menuSpecialModalSaveBtn.textContent = originalSaveLabel;
        return;
      }
      if (specialFile && specialFile.size > MENU_UPLOAD_MAX_BYTES) {
        showSpecialModalNotice("Special file is too large. Use up to 2.5MB.", "error");
        menuSpecialModalSaveBtn.disabled = false;
        menuSpecialModalSaveBtn.textContent = originalSaveLabel;
        return;
      }

      let specialDataUrl = "";
      if (specialFile) {
        try {
          specialDataUrl = await readFileAsDataUrl(specialFile);
        } catch (_error) {
          showSpecialModalNotice("Could not read special file.", "error");
          menuSpecialModalSaveBtn.disabled = false;
          menuSpecialModalSaveBtn.textContent = originalSaveLabel;
          return;
        }
        if (!menuFileIsSafeDataUrl(specialDataUrl)) {
          showSpecialModalNotice("Special file type is not supported.", "error");
          menuSpecialModalSaveBtn.disabled = false;
          menuSpecialModalSaveBtn.textContent = originalSaveLabel;
          return;
        }
      }

      try {
        const nextSpecial = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: specialName,
          notes: specialNotes,
          file_name: specialFile ? String(specialFile.name || "").trim().slice(0, 180) : "",
          file_type: specialFile ? String(specialFile.type || "").trim().slice(0, 120) : "",
          file_size: specialFile ? Math.max(0, Math.floor(Number(specialFile.size || 0))) : 0,
          file_data_url: specialDataUrl,
          created_at: new Date().toISOString(),
          created_by: menuActorLabel()
        };
        const currentSpecials = Array.isArray(menuState.specials) ? menuState.specials.slice() : [];
        menuState.specials = [nextSpecial].concat(currentSpecials).slice(0, 30);
        menuState = writeMenuHubState(menuState);

        menuSpecialNameInput.value = "";
        menuSpecialNotesInput.value = "";
        menuSpecialFileInput.value = "";
        resetSpecialFilePreview();
        clearSpecialModalNotice();
        closeMenuModal(menuSpecialModal);
        renderAll();
        GPortal.showNotice(specialStatus, "Special posted to dashboard.", "ok");
      } catch (_error) {
        showSpecialModalNotice("Could not save special. Try a smaller file.", "error");
      } finally {
        menuSpecialModalSaveBtn.disabled = false;
        menuSpecialModalSaveBtn.textContent = originalSaveLabel;
      }
    }

    specialsList.addEventListener("click", function onSpecialsClick(event) {
      const button = event.target.closest("button[data-menu-special-action]");
      if (!button || !canManageMenus) {
        return;
      }
      const action = String(button.getAttribute("data-menu-special-action") || "").trim();
      const specialId = String(button.getAttribute("data-menu-special-id") || "").trim();
      if (action !== "remove" || !specialId) {
        return;
      }
      const currentSpecials = Array.isArray(menuState.specials) ? menuState.specials : [];
      menuState.specials = currentSpecials.filter(function keepSpecial(item) {
        return String(item && item.id || "") !== specialId;
      });
      menuState = writeMenuHubState(menuState);
      renderAll();
      GPortal.showNotice(specialStatus, "Special removed.", "ok");
    });

    uploadTriggerBtn.addEventListener("click", function onUploadTriggerClick() {
      if (!canManageMenus) {
        return;
      }
      menuUploadDateInput.value = localIsoDate(new Date());
      menuUploadFileInput.value = "";
      resetMenuUploadFilePreview();
      openMenuModal(menuUploadModal);
      openNativeDatePicker(menuUploadDateInput);
    });

    specialTriggerBtn.addEventListener("click", function onSpecialTriggerClick() {
      if (!canManageMenus) {
        return;
      }
      menuSpecialNameInput.value = "";
      menuSpecialFileInput.value = "";
      menuSpecialNotesInput.value = "";
      resetSpecialFilePreview();
      clearSpecialModalNotice();
      openMenuModal(menuSpecialModal);
    });

    menuUploadModalCancelBtn.addEventListener("click", function onMenuUploadCancel() {
      resetMenuUploadFilePreview();
      closeMenuModal(menuUploadModal);
    });
    menuUploadModalSaveBtn.addEventListener("click", function onMenuUploadSave() {
      void saveMenuFileFromModal();
    });

    menuSpecialModalCancelBtn.addEventListener("click", function onSpecialCancel() {
      resetSpecialFilePreview();
      clearSpecialModalNotice();
      closeMenuModal(menuSpecialModal);
    });
    menuSpecialModalSaveBtn.addEventListener("click", function onSpecialSave() {
      void saveSpecialFromModal();
    });

    menuUploadModal.addEventListener("click", function onMenuUploadBackdrop(event) {
      if (event.target === menuUploadModal) {
        resetMenuUploadFilePreview();
        closeMenuModal(menuUploadModal);
      }
    });
    menuSpecialModal.addEventListener("click", function onMenuSpecialBackdrop(event) {
      if (event.target === menuSpecialModal) {
        resetSpecialFilePreview();
        clearSpecialModalNotice();
        closeMenuModal(menuSpecialModal);
      }
    });

    menuSpecialFileInput.addEventListener("change", function onSpecialFileChange() {
      renderSpecialFilePreview();
    });

    menuUploadDateRow.addEventListener("click", function onMenuUploadDateRowClick() {
      openNativeDatePicker(menuUploadDateInput);
    });
    menuUploadDateInput.addEventListener("focus", function onMenuUploadDateFocus() {
      openNativeDatePicker(menuUploadDateInput);
    });
    menuUploadDateInput.addEventListener("click", function onMenuUploadDateClick() {
      openNativeDatePicker(menuUploadDateInput);
    });
    menuUploadFileInput.addEventListener("change", function onMenuUploadFileChange() {
      renderMenuUploadFilePreview();
    });

    document.addEventListener("keydown", function onMenuModalEscape(event) {
      if (event.key === "Escape" && (!menuUploadModal.hidden || !menuSpecialModal.hidden)) {
        closeAllMenuModals();
      }
    });

    notesSaveBtn.addEventListener("click", function onMenuNotesSave() {
      if (!canManageMenus) {
        return;
      }

      try {
        menuState.notes = String(notesInput.value || "").slice(0, 8000);
        menuState.notes_updated_at = new Date().toISOString();
        menuState.notes_updated_by = menuActorLabel();
        menuState = writeMenuHubState(menuState);
        renderAll();
        GPortal.showNotice(notesStatus, "Menu notes saved.", "ok");
      } catch (_error) {
        GPortal.showNotice(notesStatus, "Could not save notes. Try shortening the notes text.", "error");
      }
    });

    beverageSaveBtn.addEventListener("click", function onBeverageSave() {
      if (!canManageMenus) {
        return;
      }

      try {
        menuState.beverage_current = String(beverageCurrentInput.value || "").slice(0, 10000);
        menuState.beverage_notes = String(beverageNotesInput.value || "").slice(0, 10000);
        menuState.beverage_updated_at = new Date().toISOString();
        menuState.beverage_updated_by = menuActorLabel();
        menuState = writeMenuHubState(menuState);
        renderAll();
        GPortal.showNotice(beverageStatus, "Beer + Wine section saved.", "ok");
      } catch (_error) {
        GPortal.showNotice(beverageStatus, "Could not save Beer + Wine details.", "error");
      }
    });

    window.addEventListener("storage", function onMenuStorage(event) {
      if (event.key !== MENU_HUB_STORAGE_KEY) {
        return;
      }
      menuState = readMenuHubState();
      renderAll();
    });

    window.addEventListener("gportal:menu-hub-updated", function onMenuStateUpdated() {
      menuState = readMenuHubState();
      renderAll();
    });

    renderAll();
  }

  async function loadSops(session, profile) {
    const list = GPortal.qs("#sopList");
    if (!list) {
      return;
    }

    const sb = GPortal.getSupabase();
    const uploadSection = GPortal.qs("#sopUploadSection");
    const uploadForm = GPortal.qs("#sopUploadForm");
    const uploadStatus = GPortal.qs("#sopUploadStatus");
    const canUpload = profile.role === "manager" || profile.role === "admin";

    if (uploadSection) {
      uploadSection.hidden = !canUpload;
    }

    async function refreshSops() {
      const result = await sb
        .from("sops")
        .select("id,title,description,visibility,file_url,storage_path,original_name,created_at")
        .order("created_at", { ascending: false })
        .limit(80);

      list.innerHTML = "";

      if (result.error || !result.data.length) {
        list.innerHTML = "<div class='notice'>No SOPs uploaded yet.</div>";
        return;
      }

      result.data.forEach(function addItem(sop) {
        const card = document.createElement("section");
        card.className = "card";
        const fileLabel = sop.original_name || sop.storage_path || sop.file_url || "SOP file";
        card.innerHTML = `
          <h3>${sop.title}</h3>
          <p class="small">${sop.description || "No description"}</p>
          <p class="small">Visibility: ${sop.visibility} • Added ${GPortal.dateOnly(sop.created_at)}</p>
          <p class="small">File: ${fileLabel}</p>
          <button class="btn btn--frame" type="button" data-open-sop-id="${sop.id}">Open Document</button>
        `;
        list.appendChild(card);
      });
    }

    list.addEventListener("click", async function onOpenSop(event) {
      const button = event.target.closest("button[data-open-sop-id]");
      if (!button) {
        return;
      }

      const sopId = Number(button.getAttribute("data-open-sop-id"));
      if (!Number.isInteger(sopId) || sopId <= 0) {
        return;
      }

      const originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = "Opening...";

      try {
        const response = await fetch("/api/sops/signed-download", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ sopId })
        });

        const payload = await response.json().catch(function parseError() {
          return null;
        });

        if (!response.ok || !payload || !payload.signedUrl) {
          const message = payload && payload.error ? payload.error : "Could not open SOP";
          alert(message);
          return;
        }

        const opened = window.open(payload.signedUrl, "_blank", "noopener");
        if (!opened) {
          window.location.href = payload.signedUrl;
        }
      } finally {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    });

    uploadForm?.addEventListener("submit", async function onUploadSubmit(event) {
      event.preventDefault();

      if (!canUpload) {
        GPortal.showNotice(uploadStatus, "Manager or admin role required to upload SOPs.", "error");
        return;
      }

      const title = String(GPortal.qs("#sopTitle").value || "").trim();
      const description = String(GPortal.qs("#sopDescription").value || "").trim();
      const visibility = String(GPortal.qs("#sopVisibility").value || "all").trim();
      const fileInput = GPortal.qs("#sopFile");
      const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

      if (!title || !file) {
        GPortal.showNotice(uploadStatus, "Title and file are required.", "error");
        return;
      }

      GPortal.showNotice(uploadStatus, "Preparing secure upload...", "ok");

      const signResponse = await fetch("/api/sops/signed-upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "application/octet-stream"
        })
      });

      const signPayload = await signResponse.json().catch(function parseError() {
        return null;
      });

      if (!signResponse.ok || !signPayload || !signPayload.token || !signPayload.path || !signPayload.bucket) {
        const message = signPayload && signPayload.error ? signPayload.error : "Could not get signed upload URL";
        GPortal.showNotice(uploadStatus, message, "error");
        return;
      }

      GPortal.showNotice(uploadStatus, "Uploading file...", "ok");

      const upload = await sb.storage
        .from(signPayload.bucket)
        .uploadToSignedUrl(signPayload.path, signPayload.token, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
          cacheControl: "3600"
        });

      if (upload.error) {
        GPortal.showNotice(uploadStatus, `Upload failed: ${upload.error.message}`, "error");
        return;
      }

      const insert = await sb
        .from("sops")
        .insert({
          title,
          description: description || null,
          visibility,
          uploaded_by: session.user.id,
          storage_path: signPayload.path,
          file_url: signPayload.path,
          original_name: file.name,
          mime_type: file.type || null,
          file_size: file.size
        });

      if (insert.error) {
        GPortal.showNotice(uploadStatus, `Metadata save failed: ${insert.error.message}`, "error");
        return;
      }

      uploadForm.reset();
      GPortal.showNotice(uploadStatus, "SOP uploaded successfully.", "ok");
      await refreshSops();
    });

    await refreshSops();
  }

  async function loadChecklists(session) {
    const list = GPortal.qs("#checklistList");
    if (!list) {
      return;
    }

    const sb = GPortal.getSupabase();
    const result = await sb
      .from("checklist_submissions")
      .select("title,submitted_at,status")
      .eq("employee_id", session.user.id)
      .order("submitted_at", { ascending: false })
      .limit(20);

    list.innerHTML = "";

    if (result.error || !result.data.length) {
      list.innerHTML = "<div class='notice'>No checklist submissions yet.</div>";
      return;
    }

    result.data.forEach(function addChecklist(item) {
      const card = document.createElement("section");
      card.className = "card";
      card.innerHTML = `
        <h3>${item.title}</h3>
        <p class="small">Submitted: ${GPortal.dateTime(item.submitted_at)}</p>
        <span class="status-pill status-pill--ok">${item.status || "Submitted"}</span>
      `;
      list.appendChild(card);
    });
  }

  async function loadRequests(session) {
    const form = GPortal.qs("#requestForm");
    const status = GPortal.qs("#requestStatus");
    const rows = GPortal.qs("#requestRows");
    if (!form || !rows) {
      return;
    }

    const sb = GPortal.getSupabase();

    async function refresh() {
      const result = await sb
        .from("requests")
        .select("id,created_at,type,status,message")
        .eq("employee_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(30);

      rows.innerHTML = "";
      if (result.error || !result.data.length) {
        rows.innerHTML = "<tr><td colspan='4'>No requests yet.</td></tr>";
        return;
      }

      result.data.forEach(function addRow(item) {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${GPortal.dateOnly(item.created_at)}</td>
          <td>${item.type}</td>
          <td>${item.status}</td>
          <td>${item.message || "-"}</td>
        `;
        rows.appendChild(row);
      });
    }

    form.addEventListener("submit", async function onSubmit(event) {
      event.preventDefault();
      const type = GPortal.qs("#requestType").value;
      const message = GPortal.qs("#requestMessage").value.trim();

      if (!type || !message) {
        GPortal.showNotice(status, "Request type and message are required.", "error");
        return;
      }

      const result = await sb.from("requests").insert({
        employee_id: session.user.id,
        type: type,
        message: message,
        status: "PENDING"
      });

      if (result.error) {
        GPortal.showNotice(status, `Request failed: ${result.error.message}`, "error");
        return;
      }

      form.reset();
      GPortal.showNotice(status, "Request submitted.", "ok");
      await refresh();
    });

    await refresh();
  }

  async function loadManager(session, profile) {
    const section = GPortal.qs("#managerPage");
    if (!section) {
      return;
    }

    if (profile.role !== "manager" && profile.role !== "admin") {
      section.innerHTML = "<div class='notice notice--error'>Manager access required.</div>";
      return;
    }

    const sb = GPortal.getSupabase();

    const requestRows = GPortal.qs("#managerRequestRows");
    const requestStatus = GPortal.qs("#managerRequestStatus");

    async function refreshRequests() {
      const result = await sb
        .from("requests")
        .select("id,created_at,type,status,message,employee_id")
        .order("created_at", { ascending: false })
        .limit(75);

      requestRows.innerHTML = "";
      if (result.error || !result.data.length) {
        requestRows.innerHTML = "<tr><td colspan='6'>No team requests.</td></tr>";
        return;
      }

      result.data.forEach(function addRow(item) {
        const actions = item.status === "PENDING"
          ? `<button class="btn btn--small" type="button" data-request-id="${item.id}" data-next-status="APPROVED">Approve</button>
             <button class="btn btn--small btn--danger" type="button" data-request-id="${item.id}" data-next-status="DENIED">Deny</button>`
          : "<span class='small'>Closed</span>";

        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${GPortal.dateOnly(item.created_at)}</td>
          <td><code>${item.employee_id}</code></td>
          <td>${item.type}</td>
          <td>${item.status}</td>
          <td>${item.message || "-"}</td>
          <td>${actions}</td>
        `;
        requestRows.appendChild(row);
      });
    }

    requestRows.addEventListener("click", async function onRequestAction(event) {
      const button = event.target.closest("button[data-request-id]");
      if (!button) {
        return;
      }

      const requestId = button.getAttribute("data-request-id");
      const nextStatus = button.getAttribute("data-next-status");
      if (!requestId || !nextStatus) {
        return;
      }

      button.disabled = true;
      const originalLabel = button.textContent;
      button.textContent = "Saving...";

      const update = await sb
        .from("requests")
        .update({
          status: nextStatus,
          reviewed_by: session.user.id,
          reviewed_at: new Date().toISOString()
        })
        .eq("id", requestId)
        .eq("status", "PENDING");

      if (update.error) {
        button.disabled = false;
        button.textContent = originalLabel;
        GPortal.showNotice(requestStatus, `Update failed: ${update.error.message}`, "error");
        return;
      }

      GPortal.showNotice(requestStatus, `Request ${requestId} marked ${nextStatus}.`, "ok");
      await refreshRequests();
    });

    const announcementForm = GPortal.qs("#announcementForm");
    const announcementTitle = GPortal.qs("#announcementTitle");
    const announcementBody = GPortal.qs("#announcementBody");
    const announcementStatus = GPortal.qs("#announcementStatus");
    const announcementRows = GPortal.qs("#managerAnnouncementRows");

    async function refreshAnnouncements() {
      const result = await sb
        .from("announcements")
        .select("id,title,body,created_at")
        .order("created_at", { ascending: false })
        .limit(20);

      announcementRows.innerHTML = "";
      if (result.error || !result.data.length) {
        announcementRows.innerHTML = "<tr><td colspan='3'>No announcements yet.</td></tr>";
        return;
      }

      result.data.forEach(function addAnnouncement(item) {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${GPortal.dateOnly(item.created_at)}</td>
          <td>${item.title}</td>
          <td>${item.body}</td>
        `;
        announcementRows.appendChild(row);
      });
    }

    announcementForm?.addEventListener("submit", async function onAnnouncementSubmit(event) {
      event.preventDefault();

      const title = (announcementTitle.value || "").trim();
      const body = (announcementBody.value || "").trim();

      if (!title || !body) {
        GPortal.showNotice(announcementStatus, "Title and message are required.", "error");
        return;
      }

      const create = await sb.from("announcements").insert({
        title,
        body,
        published_by: session.user.id
      });

      if (create.error) {
        GPortal.showNotice(announcementStatus, `Publish failed: ${create.error.message}`, "error");
        return;
      }

      announcementForm.reset();
      GPortal.showNotice(announcementStatus, "Announcement published.", "ok");
      await refreshAnnouncements();
    });

    const shiftForm = GPortal.qs("#shiftForm");
    const shiftStatus = GPortal.qs("#shiftStatus");
    const shiftId = GPortal.qs("#shiftId");
    const shiftEmployee = GPortal.qs("#shiftEmployee");
    const shiftStation = GPortal.qs("#shiftStation");
    const shiftStart = GPortal.qs("#shiftStart");
    const shiftEnd = GPortal.qs("#shiftEnd");
    const shiftSubmitBtn = GPortal.qs("#shiftSubmitBtn");
    const shiftCancelBtn = GPortal.qs("#shiftCancelBtn");
    const managerShiftRows = GPortal.qs("#managerShiftRows");

    const employeeMap = new Map();
    const shiftMap = new Map();

    function resetShiftForm() {
      if (!shiftForm) {
        return;
      }

      shiftForm.reset();
      shiftId.value = "";
      shiftSubmitBtn.textContent = "Create Shift";
      shiftCancelBtn.hidden = true;
    }

    async function refreshEmployees() {
      if (!shiftEmployee) {
        return;
      }

      const result = await sb
        .from("profiles")
        .select("id,full_name,station,active")
        .eq("active", true)
        .order("full_name", { ascending: true });

      shiftEmployee.innerHTML = "<option value=''>Select employee</option>";
      employeeMap.clear();

      if (result.error || !result.data.length) {
        return;
      }

      result.data.forEach(function addOption(profileRow) {
        employeeMap.set(profileRow.id, profileRow);
        const option = document.createElement("option");
        option.value = profileRow.id;
        option.textContent = profileRow.full_name || profileRow.id;
        shiftEmployee.appendChild(option);
      });
    }

    async function refreshShifts() {
      if (!managerShiftRows) {
        return;
      }

      const result = await sb
        .from("shifts")
        .select("id,employee_id,start_at,end_at,station")
        .gte("end_at", new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString())
        .order("start_at", { ascending: true })
        .limit(120);

      managerShiftRows.innerHTML = "";
      shiftMap.clear();

      if (result.error || !result.data.length) {
        managerShiftRows.innerHTML = "<tr><td colspan='5'>No shifts scheduled.</td></tr>";
        return;
      }

      result.data.forEach(function addShiftRow(shift) {
        shiftMap.set(String(shift.id), shift);

        const employee = employeeMap.get(shift.employee_id);
        const employeeLabel = employee ? (employee.full_name || employee.id) : shift.employee_id;

        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${GPortal.dateTime(shift.start_at)}</td>
          <td>${GPortal.dateTime(shift.end_at)}</td>
          <td>${employeeLabel}</td>
          <td>${shift.station || "-"}</td>
          <td>
            <button class="btn btn--small" type="button" data-shift-action="edit" data-shift-id="${shift.id}">Edit</button>
            <button class="btn btn--small btn--danger" type="button" data-shift-action="delete" data-shift-id="${shift.id}">Delete</button>
          </td>
        `;
        managerShiftRows.appendChild(row);
      });
    }

    managerShiftRows?.addEventListener("click", async function onShiftTableClick(event) {
      const button = event.target.closest("button[data-shift-action][data-shift-id]");
      if (!button) {
        return;
      }

      const action = button.getAttribute("data-shift-action");
      const id = button.getAttribute("data-shift-id");
      const shift = shiftMap.get(String(id));

      if (!shift) {
        return;
      }

      if (action === "edit") {
        shiftId.value = String(shift.id);
        shiftEmployee.value = shift.employee_id;
        shiftStation.value = shift.station || "";
        shiftStart.value = toLocalDatetimeInput(shift.start_at);
        shiftEnd.value = toLocalDatetimeInput(shift.end_at);
        shiftSubmitBtn.textContent = "Update Shift";
        shiftCancelBtn.hidden = false;
        window.scrollTo({ top: shiftForm.offsetTop - 100, behavior: "smooth" });
        return;
      }

      if (action === "delete") {
        const ok = window.confirm("Delete this shift?");
        if (!ok) {
          return;
        }

        const remove = await sb.from("shifts").delete().eq("id", shift.id);
        if (remove.error) {
          GPortal.showNotice(shiftStatus, `Delete failed: ${remove.error.message}`, "error");
          return;
        }

        GPortal.showNotice(shiftStatus, "Shift deleted.", "ok");
        await refreshShifts();
      }
    });

    shiftCancelBtn?.addEventListener("click", function onShiftCancel() {
      resetShiftForm();
    });

    shiftForm?.addEventListener("submit", async function onShiftSubmit(event) {
      event.preventDefault();

      const employeeId = (shiftEmployee.value || "").trim();
      const station = (shiftStation.value || "").trim();
      const startLocal = (shiftStart.value || "").trim();
      const endLocal = (shiftEnd.value || "").trim();
      const editingId = (shiftId.value || "").trim();

      if (!employeeId || !station || !startLocal || !endLocal) {
        GPortal.showNotice(shiftStatus, "Employee, station, start, and end are required.", "error");
        return;
      }

      const startAt = new Date(startLocal);
      const endAt = new Date(endLocal);

      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        GPortal.showNotice(shiftStatus, "Invalid start or end date/time.", "error");
        return;
      }

      if (endAt <= startAt) {
        GPortal.showNotice(shiftStatus, "Shift end must be after shift start.", "error");
        return;
      }

      const payload = {
        employee_id: employeeId,
        station,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString()
      };

      const result = editingId
        ? await sb.from("shifts").update(payload).eq("id", editingId)
        : await sb.from("shifts").insert(payload);

      if (result.error) {
        GPortal.showNotice(shiftStatus, `Shift save failed: ${result.error.message}`, "error");
        return;
      }

      GPortal.showNotice(shiftStatus, editingId ? "Shift updated." : "Shift created.", "ok");
      resetShiftForm();
      await refreshShifts();
    });

    await Promise.all([refreshEmployees(), refreshAnnouncements(), refreshRequests()]);
    await refreshShifts();
  }

  async function loadAdmin(session, profile) {
    const section = GPortal.qs("#adminPage");
    if (!section) {
      return;
    }

    if (profile.role !== "admin") {
      section.innerHTML = "<div class='notice notice--error'>Admin access required.</div>";
      return;
    }

    const hasRemoteProfiles = !session.isTemp && GPortal.hasSupabaseConfig();
    const sb = hasRemoteProfiles ? GPortal.getSupabase() : null;
    const tbody = GPortal.qs("#adminUserRows");
    const squareStatusPill = GPortal.qs("#squareStatusPill");
    const squareConnectForm = GPortal.qs("#squareConnectForm");
    const squareConnectBtn = GPortal.qs("#squareConnectBtn");
    const squareDisconnectBtn = GPortal.qs("#squareDisconnectBtn");
    const squareLocationId = GPortal.qs("#squareLocationId");
    const squareLocationName = GPortal.qs("#squareLocationName");
    const squareSyncDate = GPortal.qs("#squareSyncDate");
    const squareSyncBtn = GPortal.qs("#squareSyncBtn");
    const squareLastSyncMeta = GPortal.qs("#squareLastSyncMeta");
    const squareSyncStatus = GPortal.qs("#squareSyncStatus");
    const useSquareOAuth = !session.isTemp && GPortal.hasSupabaseConfig();

    let squareState = readSquareIntegrationState();

    function normalizeRemoteSquareState(payload) {
      const raw = payload && typeof payload === "object" ? payload : {};
      return normalizeSquareIntegrationState({
        connected: Boolean(raw.connected),
        location_id: String(raw.location_id || "").trim(),
        location_name: String(raw.location_name || "").trim(),
        connected_at: String(raw.connected_at || "").trim(),
        last_sync_at: String(raw.last_sync_at || "").trim(),
        last_sync_date: String(raw.last_sync_date || "").trim(),
        last_square_tips: normalizedMoney(raw.last_sync_tip_amount),
        source: String(raw.source || (raw.connected ? "oauth" : "none")).trim()
      });
    }

    async function refreshProfiles() {
      if (!sb) {
        const localRows = readStaffRows();
        tbody.innerHTML = "";
        if (!localRows.length) {
          tbody.innerHTML = "<tr><td colspan='4'>No staff profiles found.</td></tr>";
          return;
        }

        localRows.forEach(function addLocalRow(user, index) {
          const row = document.createElement("tr");
          row.innerHTML = `
            <td>${user.name || "-"}</td>
            <td>employee</td>
            <td>Active</td>
            <td><code>local-${index + 1}</code></td>
          `;
          tbody.appendChild(row);
        });
        return;
      }

      const users = await sb.from("profiles").select("id,full_name,role,active").order("full_name", { ascending: true });

      tbody.innerHTML = "";
      if (users.error || !users.data.length) {
        tbody.innerHTML = "<tr><td colspan='4'>No staff profiles found.</td></tr>";
        return;
      }

      users.data.forEach(function addRow(user) {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${user.full_name || "-"}</td>
          <td>${user.role}</td>
          <td>${user.active ? "Active" : "Inactive"}</td>
          <td><code>${user.id}</code></td>
        `;
        tbody.appendChild(row);
      });
    }

    async function fetchSquareStatusFromApi() {
      const response = await fetch("/api/integrations/square/status", {
        method: "GET",
        headers: {
          authorization: `Bearer ${session.access_token}`
        }
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch (_ignored) {
        payload = null;
      }

      if (!response.ok || !(payload && payload.ok)) {
        if (response.status === 404) {
          throw new Error("Square status API is not available on this server yet. Run with Cloudflare Pages Functions or deploy.");
        }
        const errorMessage = payload && payload.error ? payload.error : `Square status failed (${response.status})`;
        throw new Error(errorMessage);
      }

      return payload;
    }

    async function refreshSquareStateFromApi() {
      const payload = await fetchSquareStatusFromApi();
      squareState = {
        ...normalizeRemoteSquareState(payload),
        source: String(payload.source || (payload.connected ? "oauth" : "none")).trim()
      };
      renderSquareState();
      return squareState;
    }

    function setSquareStatus(message, tone) {
      if (!squareSyncStatus) {
        return;
      }
      if (!message) {
        squareSyncStatus.hidden = true;
        squareSyncStatus.textContent = "";
        squareSyncStatus.classList.remove("notice--error", "notice--ok");
        return;
      }
      GPortal.showNotice(squareSyncStatus, message, tone || "ok");
    }

    function renderSquareState() {
      const connected = Boolean(squareState.connected);
      const source = String(squareState.source || (connected ? "oauth" : "none")).trim();
      const canDisconnect = connected && (!useSquareOAuth || source === "oauth");
      if (squareStatusPill) {
        squareStatusPill.textContent = connected ? "Connected" : "Disconnected";
        squareStatusPill.classList.toggle("status-pill--ok", connected);
        squareStatusPill.classList.toggle("status-pill--warn", !connected);
      }

      if (squareConnectBtn) {
        squareConnectBtn.textContent = connected ? "Reconnect Square" : "Connect Square";
      }
      if (squareDisconnectBtn) {
        squareDisconnectBtn.disabled = !canDisconnect;
      }
      if (squareSyncBtn) {
        squareSyncBtn.disabled = !connected;
      }

      if (squareLocationId) {
        squareLocationId.value = squareState.location_id || "";
      }
      if (squareLocationName) {
        squareLocationName.value = squareState.location_name || "";
      }

      if (squareLastSyncMeta) {
        if (connected && source === "env") {
          squareLastSyncMeta.textContent = "Connected via environment token (legacy mode).";
          return;
        }
        if (!squareState.last_sync_at || !squareState.last_sync_date) {
          squareLastSyncMeta.textContent = "No sync yet.";
        } else {
          squareLastSyncMeta.textContent = `Last sync: ${longDateFull(squareState.last_sync_date)} • ${GPortal.money(squareState.last_square_tips)}`;
        }
      }
    }

    async function fetchSquareTipsFromApi(syncDateIso, locationId, locationName) {
      const response = await fetch("/api/integrations/square/sync-day", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          date: syncDateIso,
          locationId: locationId || undefined,
          locationName: locationName || undefined
        })
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch (_ignored) {
        payload = null;
      }

      if (!response.ok || !(payload && payload.ok)) {
        if (response.status === 404) {
          throw new Error("Square sync API is not available on this server yet. Run with Cloudflare Pages Functions or deploy.");
        }
        const errorMessage = payload && payload.error ? payload.error : `Square sync failed (${response.status})`;
        throw new Error(errorMessage);
      }

      return payload;
    }

    squareConnectForm?.addEventListener("submit", async function onSquareConnectSubmit(event) {
      event.preventDefault();

      const nextLocationId = String(squareLocationId && squareLocationId.value || "").trim().slice(0, 80);
      const nextLocationName = String(squareLocationName && squareLocationName.value || "").trim().slice(0, 80);

      if (useSquareOAuth) {
        if (squareConnectBtn) {
          squareConnectBtn.disabled = true;
        }
        setSquareStatus("Opening Square connect...", "ok");

        try {
          const response = await fetch("/api/integrations/square/connect", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
              locationId: nextLocationId || undefined,
              locationName: nextLocationName || undefined
            })
          });

          let payload = null;
          try {
            payload = await response.json();
          } catch (_ignored) {
            payload = null;
          }

          if (!response.ok || !(payload && payload.ok && payload.auth_url)) {
            const errorMessage = payload && payload.error ? payload.error : `Square connect failed (${response.status})`;
            throw new Error(errorMessage);
          }

          window.location.href = payload.auth_url;
          return;
        } catch (error) {
          setSquareStatus(String(error && error.message ? error.message : error), "error");
        } finally {
          if (squareConnectBtn) {
            squareConnectBtn.disabled = false;
          }
        }
        return;
      }

      squareState = writeSquareIntegrationState({
        ...squareState,
        connected: true,
        location_id: nextLocationId,
        location_name: nextLocationName,
        source: "local",
        connected_at: squareState.connected_at || new Date().toISOString()
      });

      renderSquareState();
      setSquareStatus("Square marked connected. Use Sync to pull daily tips.", "ok");
    });

    squareDisconnectBtn?.addEventListener("click", async function onSquareDisconnectClick() {
      if (useSquareOAuth) {
        if (squareDisconnectBtn) {
          squareDisconnectBtn.disabled = true;
        }
        setSquareStatus("Disconnecting Square...", "ok");

        try {
          const response = await fetch("/api/integrations/square/disconnect", {
            method: "POST",
            headers: {
              authorization: `Bearer ${session.access_token}`
            }
          });

          let payload = null;
          try {
            payload = await response.json();
          } catch (_ignored) {
            payload = null;
          }

          if (!response.ok || !(payload && payload.ok)) {
            const errorMessage = payload && payload.error ? payload.error : `Square disconnect failed (${response.status})`;
            throw new Error(errorMessage);
          }

          await refreshSquareStateFromApi();
          setSquareStatus(payload.warning || "Square disconnected.", payload.warning ? "error" : "ok");
        } catch (error) {
          setSquareStatus(String(error && error.message ? error.message : error), "error");
          renderSquareState();
        }
        return;
      }

      squareState = writeSquareIntegrationState({
        ...squareState,
        connected: false
      });
      renderSquareState();
      setSquareStatus("Square disconnected.", "ok");
    });

    squareSyncBtn?.addEventListener("click", async function onSquareSyncClick() {
      if (!squareState.connected) {
        setSquareStatus("Connect Square first.", "error");
        return;
      }

      const syncDateIso = String(squareSyncDate && squareSyncDate.value || "").trim();
      if (!isIsoDateString(syncDateIso)) {
        setSquareStatus("Pick a valid sync date.", "error");
        return;
      }

      const syncLocationId = String(squareLocationId && squareLocationId.value || "").trim().slice(0, 80)
        || String(squareState.location_id || "").trim();
      const syncLocationName = String(squareLocationName && squareLocationName.value || "").trim().slice(0, 80)
        || String(squareState.location_name || "").trim();

      if (squareSyncBtn) {
        squareSyncBtn.disabled = true;
      }
      setSquareStatus("Syncing Square tips...", "ok");

      try {
        const syncPayload = await fetchSquareTipsFromApi(syncDateIso, syncLocationId, syncLocationName);
        const squareTipsAmount = normalizedMoney(syncPayload.square_tips);
        const synced = syncSquareDayIntoWorkbook(syncDateIso, syncPayload);

        if (useSquareOAuth) {
          await refreshSquareStateFromApi();
        } else {
          squareState = writeSquareIntegrationState({
            ...squareState,
            last_sync_at: new Date().toISOString(),
            last_sync_date: syncDateIso,
            last_square_tips: squareTipsAmount
          });
        }

        renderSquareState();
        const appliedSummary = synced.appliedFields.length
          ? ` Updated: ${synced.appliedFields.join(", ")}.`
          : "";
        const warningSummary = syncPayload.warning
          ? ` ${String(syncPayload.warning).trim()}`
          : "";
        setSquareStatus(
          `Synced ${GPortal.money(squareTipsAmount)} to Tips Day ${synced.dayIndex + 1} (${shortDate(syncDateIso)}).${appliedSummary}${warningSummary}`,
          "ok"
        );
      } catch (error) {
        setSquareStatus(String(error && error.message ? error.message : error), "error");
      } finally {
        if (squareSyncBtn) {
          squareSyncBtn.disabled = !squareState.connected;
        }
      }
    });

    await refreshProfiles();

    if (squareSyncDate) {
      squareSyncDate.value = localIsoDate(new Date()) || "";
    }
    renderSquareState();

    const adminParams = new URLSearchParams(window.location.search || "");
    const connectedParam = adminParams.get("square_connected");
    const errorParam = adminParams.get("square_error");
    if (connectedParam === "1") {
      setSquareStatus("Square connected successfully.", "ok");
      adminParams.delete("square_connected");
    }
    if (errorParam) {
      setSquareStatus(`Square connect failed: ${errorParam}`, "error");
      adminParams.delete("square_error");
    }
    if (connectedParam === "1" || errorParam) {
      const nextQuery = adminParams.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    }

    if (useSquareOAuth) {
      try {
        await refreshSquareStateFromApi();
      } catch (error) {
        setSquareStatus(String(error && error.message ? error.message : error), "error");
      }
    } else if (session.isTemp) {
      setSquareStatus("Preview mode: Square OAuth connect requires a real Supabase admin login.", "ok");
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise(function resolveFile(resolve, reject) {
      const reader = new FileReader();
      reader.onload = function onLoad() {
        resolve(String(reader.result || ""));
      };
      reader.onerror = function onError() {
        reject(new Error("Could not read file."));
      };
      reader.readAsDataURL(file);
    });
  }

  function getProfileInitial(profile, email) {
    const name = String(profile && profile.full_name ? profile.full_name : "").trim();
    const source = name || String(email || "").trim();
    if (!source) {
      return "S";
    }
    return source.charAt(0).toUpperCase();
  }

  function normalizeAvatarUrl(rawValue) {
    const value = String(rawValue || "").trim();
    if (!value || value === "null" || value === "undefined") {
      return "";
    }
    if (/^data:image\//i.test(value)) {
      return value;
    }
    return "";
  }

  function setProfileAvatarPreview(avatarUrl, initial) {
    const preview = GPortal.qs("#profileAvatarPreview");
    const previewImg = GPortal.qs("#profileAvatarPreviewImg");
    const previewInitial = GPortal.qs("#profileAvatarPreviewInitial");
    if (!preview || !previewImg || !previewInitial) {
      return;
    }

    previewInitial.textContent = initial;

    if (avatarUrl) {
      previewImg.hidden = true;
      previewInitial.hidden = false;
      previewImg.onerror = function onPreviewError() {
        previewImg.hidden = true;
        previewImg.removeAttribute("src");
        previewInitial.hidden = false;
      };
      previewImg.onload = function onPreviewLoad() {
        previewImg.hidden = false;
        previewInitial.hidden = true;
      };
      previewImg.src = avatarUrl;
    } else {
      previewImg.hidden = true;
      previewImg.removeAttribute("src");
      previewInitial.hidden = false;
    }
  }

  async function lookupUsZip(zipCode) {
    const cleanZip = String(zipCode || "").replace(/\D+/g, "").slice(0, 5);
    if (cleanZip.length !== 5) {
      return null;
    }

    try {
      const response = await fetch(`https://api.zippopotam.us/us/${cleanZip}`, {
        method: "GET",
        headers: { accept: "application/json" }
      });
      if (!response.ok) {
        return null;
      }
      const payload = await response.json();
      const place = payload && Array.isArray(payload.places) ? payload.places[0] : null;
      if (!place) {
        return null;
      }

      return {
        city: String(place["place name"] || "").trim(),
        state: String(place["state abbreviation"] || place.state || "").trim().toUpperCase().slice(0, 2)
      };
    } catch (_error) {
      return null;
    }
  }

  async function loadProfile(session, profile) {
    const form = GPortal.qs("#profileForm");
    if (!form) {
      return;
    }

    const status = GPortal.qs("#profileStatus");
    const savedFlash = GPortal.qs("#profileSavedFlash");
    const fullNameInput = GPortal.qs("#profileFullName");
    const emailInput = GPortal.qs("#profileEmail");
    const phoneInput = GPortal.qs("#profilePhone");
    const streetAddressInput = GPortal.qs("#profileStreetAddress");
    const cityInput = GPortal.qs("#profileCity");
    const stateInput = GPortal.qs("#profileState");
    const zipInput = GPortal.qs("#profileZip");
    const photoInput = GPortal.qs("#profilePhoto");
    const profileScheduleList = GPortal.qs("#profileScheduleList");
    const cropModal = GPortal.qs("#avatarCropModal");
    const cropStage = GPortal.qs("#avatarCropStage");
    const cropImage = GPortal.qs("#avatarCropImage");
    const cropZoom = GPortal.qs("#avatarCropZoom");
    const cropCancel = GPortal.qs("#avatarCropCancel");
    const cropApply = GPortal.qs("#avatarCropApply");

    let emailValue = String(profile.email || (session.user && session.user.email) || "").trim();
    let avatarUrl = normalizeAvatarUrl(profile.avatar_url);
    let zipLookupTimer = null;
    let zipLookupRequestId = 0;
    let flashFadeTimer = null;
    let flashHideTimer = null;
    let cropPointerId = null;
    let cropResolve = null;
    const cropState = {
      sourceImage: null,
      naturalWidth: 0,
      naturalHeight: 0,
      baseScale: 1,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      dragging: false,
      dragStartX: 0,
      dragStartY: 0,
      dragOffsetX: 0,
      dragOffsetY: 0
    };

    function hideStatusNotice() {
      if (!status) {
        return;
      }
      status.hidden = true;
      status.textContent = "";
      status.classList.remove("notice--ok", "notice--error");
    }

    function showSavedFlash() {
      if (!savedFlash) {
        return;
      }

      if (flashFadeTimer) {
        window.clearTimeout(flashFadeTimer);
      }
      if (flashHideTimer) {
        window.clearTimeout(flashHideTimer);
      }

      savedFlash.classList.remove("is-visible", "is-fading");
      // Restart transition state for repeated saves.
      void savedFlash.offsetWidth;
      savedFlash.classList.add("is-visible");

      flashFadeTimer = window.setTimeout(function startFade() {
        savedFlash.classList.add("is-fading");
      }, 1200);

      flashHideTimer = window.setTimeout(function hideFlash() {
        savedFlash.classList.remove("is-visible", "is-fading");
      }, 3900);
    }

    function getCropStageSize() {
      if (!cropStage) {
        return 320;
      }
      return Math.max(200, cropStage.clientWidth || 320);
    }

    function renderCropStage() {
      if (!cropStage || !cropImage || !cropState.sourceImage) {
        return;
      }

      const stageSize = getCropStageSize();
      const scale = cropState.baseScale * cropState.zoom;
      const x = stageSize / 2 + cropState.offsetX;
      const y = stageSize / 2 + cropState.offsetY;

      cropImage.style.left = `${x}px`;
      cropImage.style.top = `${y}px`;
      cropImage.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }

    function openCropModal() {
      if (!cropModal) {
        return;
      }
      cropModal.hidden = false;
      document.body.classList.add("avatar-crop-open");
    }

    function closeCropModal() {
      if (!cropModal) {
        return;
      }
      cropModal.hidden = true;
      document.body.classList.remove("avatar-crop-open");
      cropState.dragging = false;
      cropStage?.classList.remove("is-dragging");
      if (cropPointerId !== null && cropStage?.hasPointerCapture?.(cropPointerId)) {
        cropStage.releasePointerCapture(cropPointerId);
      }
      cropPointerId = null;
    }

    function finalizeCrop(result) {
      closeCropModal();
      const resolver = cropResolve;
      cropResolve = null;
      if (typeof resolver === "function") {
        resolver(result);
      }
    }

    function buildCroppedAvatarDataUrl() {
      if (!cropState.sourceImage || !cropStage) {
        return "";
      }

      const stageSize = getCropStageSize();
      const scale = cropState.baseScale * cropState.zoom;
      if (!scale) {
        return "";
      }

      const centerX = stageSize / 2 + cropState.offsetX;
      const centerY = stageSize / 2 + cropState.offsetY;
      const sourceSize = stageSize / scale;
      const sx = cropState.naturalWidth / 2 - centerX / scale;
      const sy = cropState.naturalHeight / 2 - centerY / scale;

      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return "";
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(cropState.sourceImage, sx, sy, sourceSize, sourceSize, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      return canvas.toDataURL("image/png");
    }

    function seedCropStateFromImage(imageEl) {
      if (!cropStage || !cropImage) {
        return;
      }

      const stageSize = getCropStageSize();
      cropState.sourceImage = imageEl;
      cropState.naturalWidth = imageEl.naturalWidth || imageEl.width;
      cropState.naturalHeight = imageEl.naturalHeight || imageEl.height;
      cropState.baseScale = Math.min(stageSize / cropState.naturalWidth, stageSize / cropState.naturalHeight);
      cropState.zoom = 1;
      cropState.offsetX = 0;
      cropState.offsetY = 0;
      cropState.dragging = false;
      cropImage.src = imageEl.src;
      if (cropZoom) {
        cropZoom.value = "1";
      }
      renderCropStage();
    }

    function openCropEditor(dataUrl) {
      if (!cropModal || !cropStage || !cropImage || !cropZoom || !cropCancel || !cropApply) {
        return Promise.resolve(dataUrl);
      }

      return new Promise(function waitForCrop(resolve) {
        cropResolve = resolve;
        const imageEl = new Image();
        imageEl.onload = function onCropImageLoad() {
          seedCropStateFromImage(imageEl);
          openCropModal();
        };
        imageEl.onerror = function onCropImageError() {
          cropResolve = null;
          resolve(null);
          GPortal.showNotice(status, "Could not open that image for editing.", "error");
        };
        imageEl.src = dataUrl;
      });
    }

    if (cropStage && !cropStage.dataset.bound) {
      cropStage.addEventListener("pointerdown", function onCropPointerDown(event) {
        if (!cropState.sourceImage) {
          return;
        }
        cropState.dragging = true;
        cropPointerId = event.pointerId;
        cropState.dragStartX = event.clientX;
        cropState.dragStartY = event.clientY;
        cropState.dragOffsetX = cropState.offsetX;
        cropState.dragOffsetY = cropState.offsetY;
        cropStage.classList.add("is-dragging");
        if (cropStage.setPointerCapture) {
          cropStage.setPointerCapture(cropPointerId);
        }
        event.preventDefault();
      });

      cropStage.addEventListener("pointermove", function onCropPointerMove(event) {
        if (!cropState.dragging) {
          return;
        }
        const dx = event.clientX - cropState.dragStartX;
        const dy = event.clientY - cropState.dragStartY;
        cropState.offsetX = cropState.dragOffsetX + dx;
        cropState.offsetY = cropState.dragOffsetY + dy;
        renderCropStage();
      });

      function stopCropDrag() {
        cropState.dragging = false;
        cropStage.classList.remove("is-dragging");
      }

      cropStage.addEventListener("pointerup", stopCropDrag);
      cropStage.addEventListener("pointercancel", stopCropDrag);
      cropStage.addEventListener("lostpointercapture", stopCropDrag);

      cropZoom?.addEventListener("input", function onCropZoomInput() {
        cropState.zoom = Number(cropZoom.value || "1");
        renderCropStage();
      });

      cropCancel?.addEventListener("click", function onCropCancelClick() {
        photoInput.value = "";
        finalizeCrop(null);
      });

      cropApply?.addEventListener("click", function onCropApplyClick() {
        const nextAvatar = buildCroppedAvatarDataUrl();
        if (!nextAvatar) {
          GPortal.showNotice(status, "Could not crop that image. Try another photo.", "error");
          return;
        }
        photoInput.value = "";
        finalizeCrop(nextAvatar);
      });

      cropModal?.addEventListener("click", function onCropBackdropClick(event) {
        if (event.target === cropModal) {
          photoInput.value = "";
          finalizeCrop(null);
        }
      });

      document.addEventListener("keydown", function onCropEscape(event) {
        if (event.key === "Escape" && cropModal && !cropModal.hidden) {
          photoInput.value = "";
          finalizeCrop(null);
        }
      });

      window.addEventListener("resize", function onCropResize() {
        if (cropModal && !cropModal.hidden && cropState.sourceImage) {
          const ratio = cropState.zoom;
          const currentImage = cropState.sourceImage;
          seedCropStateFromImage(currentImage);
          cropState.zoom = ratio;
          if (cropZoom) {
            cropZoom.value = String(ratio);
          }
          renderCropStage();
        }
      });

      cropStage.dataset.bound = "1";
    }

    fullNameInput.value = profile.full_name || "";
    emailInput.value = emailValue;
    phoneInput.value = GPortal.formatPhoneUS(profile.phone || "");
    streetAddressInput.value = profile.street_address || profile.address || "";
    cityInput.value = profile.city || "";
    stateInput.value = String(profile.state || "").toUpperCase().slice(0, 2);
    zipInput.value = String(profile.zip_code || "").replace(/\D+/g, "").slice(0, 5);
    setProfileAvatarPreview(avatarUrl, getProfileInitial(profile, emailValue));

    function normalizeNameKey(value) {
      return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    function findStaffName(rawName) {
      const rows = readStaffRows();
      const target = normalizeNameKey(rawName);
      const targetFirst = target ? String(target.split(/[^a-z0-9]+/)[0] || target) : "";
      const targetEmail = String(emailInput.value || profile.email || "").trim().toLowerCase();

      if (targetEmail) {
        const emailMatch = rows.find(function matchByEmail(row) {
          return String(row && row.email || "").trim().toLowerCase() === targetEmail;
        });
        if (emailMatch && emailMatch.name) {
          return emailMatch.name;
        }
      }

      if (!target) {
        return "";
      }

      const exact = rows.find(function matchExact(row) {
        return normalizeNameKey(row && row.name || "") === target;
      });
      if (exact) {
        return exact.name;
      }

      const fuzzy = rows.find(function matchFuzzy(row) {
        const rowKey = normalizeNameKey(row && row.name || "");
        const rowFirst = String(rowKey.split(/[^a-z0-9]+/)[0] || rowKey);
        return (
          (targetFirst && rowFirst === targetFirst) ||
          (target.length >= 3 && rowKey.includes(target)) ||
          (rowKey.length >= 3 && target.includes(rowKey))
        );
      });
      return fuzzy ? fuzzy.name : "";
    }

    function renderProfileSchedule() {
      if (!profileScheduleList) {
        return;
      }

      const emailFallback = String(emailInput.value || profile.email || "").split("@")[0];
      const candidateName = String(fullNameInput.value || profile.full_name || emailFallback || "").trim();
      const matchedName = findStaffName(candidateName);
      if (!matchedName) {
        profileScheduleList.innerHTML = "<li class='small'>No scheduled days yet.</li>";
        return;
      }

      const scheduleBook = readScheduleBook();
      const todayIso = localIsoDate(new Date());
      const upcomingDates = Object.keys(scheduleBook.assignments)
        .filter(function filterDate(dateIso) {
          const names = scheduleBook.assignments[dateIso];
          return Array.isArray(names) && names.includes(matchedName) && dateIso >= todayIso;
        })
        .sort();

      if (!upcomingDates.length) {
        profileScheduleList.innerHTML = "<li class='small'>No scheduled days yet.</li>";
        return;
      }

      profileScheduleList.innerHTML = upcomingDates.map(function mapDate(dateIso) {
        const detail = scheduleShiftDetailFor(scheduleBook, dateIso, matchedName);
        return `<li>${longDateFull(dateIso)} • ${scheduleShiftRangeLabel(detail)}</li>`;
      }).join("");
    }

    renderProfileSchedule();
    fullNameInput?.addEventListener("input", renderProfileSchedule);
    window.addEventListener("gportal:schedule-updated", renderProfileSchedule);
    window.addEventListener("storage", function onProfileScheduleStorage(event) {
      if (event.key === SCHEDULE_STORAGE_KEY || event.key === STAFF_ROSTER_STORAGE_KEY) {
        renderProfileSchedule();
      }
    });

    phoneInput?.addEventListener("input", function onPhoneInput() {
      phoneInput.value = GPortal.formatPhoneUS(phoneInput.value);
    });

    async function tryZipLookup() {
      const zip = String(zipInput.value || "").replace(/\D+/g, "").slice(0, 5);
      if (zip.length !== 5) {
        return;
      }

      const currentRequestId = ++zipLookupRequestId;
      const resolved = await lookupUsZip(zip);
      if (currentRequestId !== zipLookupRequestId) {
        return;
      }
      if (!resolved) {
        return;
      }

      if (resolved.city) {
        cityInput.value = resolved.city;
      }
      if (resolved.state) {
        stateInput.value = resolved.state;
      }
    }

    zipInput?.addEventListener("input", function onZipInput() {
      zipInput.value = String(zipInput.value || "").replace(/\D+/g, "").slice(0, 5);
      if (zipInput.value.length !== 5) {
        return;
      }

      if (zipLookupTimer) {
        window.clearTimeout(zipLookupTimer);
      }
      zipLookupTimer = window.setTimeout(function runZipLookup() {
        void tryZipLookup();
      }, 250);
    });

    zipInput?.addEventListener("change", function onZipChange() {
      if (zipLookupTimer) {
        window.clearTimeout(zipLookupTimer);
      }
      void tryZipLookup();
    });

    zipInput?.addEventListener("blur", function onZipBlur() {
      if (zipLookupTimer) {
        window.clearTimeout(zipLookupTimer);
      }
      void tryZipLookup();
    });

    photoInput?.addEventListener("change", async function onProfilePhotoChange() {
      const file = photoInput.files && photoInput.files[0];
      if (!file) {
        return;
      }

      if (!file.type || !file.type.startsWith("image/")) {
        GPortal.showNotice(status, "Please choose an image file.", "error");
        return;
      }

      if (file.size > 2 * 1024 * 1024) {
        GPortal.showNotice(status, "Photo is too large. Use an image up to 2MB.", "error");
        return;
      }

      try {
        const selectedDataUrl = await readFileAsDataUrl(file);
        const croppedDataUrl = await openCropEditor(selectedDataUrl);
        if (!croppedDataUrl) {
          return;
        }
        avatarUrl = croppedDataUrl;
      } catch (_error) {
        GPortal.showNotice(status, "Could not process that image.", "error");
        return;
      }

      const nextName = (fullNameInput.value || "").trim() || profile.full_name;
      setProfileAvatarPreview(avatarUrl, getProfileInitial({ full_name: nextName }, emailInput.value));
      GPortal.showNotice(status, "Photo ready. Click Save Profile to apply.", "ok");
    });

    form.addEventListener("submit", async function onProfileSubmit(event) {
      event.preventDefault();
      hideStatusNotice();

      const nextFullName = (fullNameInput.value || "").trim();
      const nextEmail = (emailInput.value || "").trim();
      const nextPhone = GPortal.formatPhoneUS(phoneInput.value || "");
      const nextStreetAddress = (streetAddressInput.value || "").trim();
      const nextCity = (cityInput.value || "").trim();
      const nextState = String(stateInput.value || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
      const nextZip = String(zipInput.value || "").replace(/\D+/g, "").slice(0, 5);

      phoneInput.value = nextPhone;
      stateInput.value = nextState;
      zipInput.value = nextZip;

      if (!nextEmail) {
        GPortal.showNotice(status, "Email is required.", "error");
        return;
      }

      if (session.isTemp) {
        const saved = GPortal.saveTempProfile({
          id: profile.id,
          role: profile.role || "employee",
          full_name: nextFullName,
          email: nextEmail,
          phone: nextPhone,
          street_address: nextStreetAddress,
          city: nextCity,
          state: nextState,
          zip_code: nextZip,
          address: nextStreetAddress,
          avatar_url: avatarUrl
        });

        profile.full_name = saved.full_name;
        profile.email = saved.email;
        profile.phone = saved.phone;
        profile.street_address = saved.street_address;
        profile.city = saved.city;
        profile.state = saved.state;
        profile.zip_code = saved.zip_code;
        profile.address = saved.address;
        profile.avatar_url = saved.avatar_url;

        if (typeof GPortal.renderHeaderProfile === "function") {
          GPortal.renderHeaderProfile(session, profile);
        }

        setProfileAvatarPreview(profile.avatar_url, getProfileInitial(profile, profile.email));
        showSavedFlash();
        return;
      }

      const sb = GPortal.getSupabase();
      const emailChanged = nextEmail !== String((session.user && session.user.email) || "").trim();

      if (emailChanged) {
        const updateEmail = await sb.auth.updateUser({ email: nextEmail });
        if (updateEmail.error) {
          GPortal.showNotice(status, `Email update failed: ${updateEmail.error.message}`, "error");
          return;
        }
      }

      const profileUpdate = await sb
        .from("profiles")
        .update({
          full_name: nextFullName || null,
          phone: nextPhone || null,
          street_address: nextStreetAddress || null,
          city: nextCity || null,
          state: nextState || null,
          zip_code: nextZip || null,
          address: nextStreetAddress || null,
          avatar_url: avatarUrl || null
        })
        .eq("id", session.user.id);

      if (profileUpdate.error) {
        GPortal.showNotice(status, `Profile save failed: ${profileUpdate.error.message}`, "error");
        return;
      }

      profile.full_name = nextFullName;
      profile.phone = nextPhone;
      profile.street_address = nextStreetAddress;
      profile.city = nextCity;
      profile.state = nextState;
      profile.zip_code = nextZip;
      profile.address = nextStreetAddress;
      profile.avatar_url = avatarUrl;
      profile.email = nextEmail;

      if (typeof GPortal.renderHeaderProfile === "function") {
        GPortal.renderHeaderProfile(session, profile);
      }

      setProfileAvatarPreview(profile.avatar_url, getProfileInitial(profile, profile.email));
      showSavedFlash();
      if (emailChanged) {
        GPortal.showNotice(status, "Profile saved. Check your email to confirm the new address.", "ok");
      }
    });
  }

  async function loadTemporaryPreview(page, profile, session) {
    if (page === "admin") {
      window.location.href = "/app/staff.html";
      return;
    }

    if (page === "manager" && profile.role !== "manager" && profile.role !== "admin") {
      const main = GPortal.qs("#managerPage .app-main");
      if (main) {
        main.innerHTML = `
          <h1>Manager</h1>
          <div class="notice notice--error">Manager access required.</div>
        `;
      }
      return;
    }

    if (page === "profile") {
      await loadProfile(session, profile);
      return;
    }

    if (page === "staff") {
      await loadStaff(session, profile);
      return;
    }

    if (page === "dashboard") {
      const nextShift = GPortal.qs("#nextShift");
      const tipsSummary = GPortal.qs("#tipsSummary");
      const trainingDue = GPortal.qs("#trainingDue");
      const announcements = GPortal.qs("#announcements");
      const specials = GPortal.qs("#dashboardSpecials");
      if (nextShift) {
        nextShift.innerHTML = `
          <section class="dashboard-next-shift dashboard-next-shift--server">
            <p class="dashboard-next-shift__title">Next Shift - Server</p>
            <p class="dashboard-next-shift__date">Friday, March 6, 2026</p>
            <p class="dashboard-next-shift__time">4:00 PM to 9:00 PM</p>
          </section>
        `;
      }
      if (tipsSummary) tipsSummary.textContent = "Latest payout: $412.00 (preview)";
      if (trainingDue) trainingDue.textContent = "[Preview] Food Safety Refresher (ASSIGNED)";
      if (announcements) {
        announcements.innerHTML = `
          <ul class="dashboard-announcement-list">
            <li>[Preview] Manager update: Please complete side work before clock-out.</li>
          </ul>
        `;
      }
      if (specials) {
        const menuState = readMenuHubState();
        const list = Array.isArray(menuState.specials) ? menuState.specials : [];
        if (!list.length) {
          specials.innerHTML = "<p class='small'>No specials posted.</p>";
        } else {
          specials.innerHTML = list.slice(0, 8).map(function renderSpecial(item) {
            const safeName = escapedHtml(item.name || "Special");
            const safeNotes = escapedHtml(item.notes || "");
            const imageMarkup = /^data:image\//i.test(String(item.file_data_url || ""))
              ? `<img class="dashboard-special-image" src="${item.file_data_url}" alt="${safeName}" />`
              : "";
            return `
              <article class="dashboard-special-item">
                ${imageMarkup}
                <div class="dashboard-special-item__body">
                  <h4>${safeName}</h4>
                  ${safeNotes ? `<p class="small">${safeNotes}</p>` : ""}
                </div>
              </article>
            `;
          }).join("");
        }
      }
      return;
    }

    if (page === "schedule") {
      await loadSchedule(session, profile);
      return;
    }

    if (page === "tips") {
      await loadTips(session, profile);
      return;
    }

    if (page === "tips-summary") {
      await loadTipsSummary(session, profile);
      return;
    }

    if (page === "training") {
      const list = GPortal.qs("#trainingList");
      if (list) {
        list.innerHTML = `
          <section class="card">
            <h3>[Preview] Food Safety Refresher</h3>
            <p class="small">Status: ASSIGNED</p>
            <p class="small">Due: Mar 12, 2026</p>
          </section>
        `;
      }
      return;
    }

    if (page === "sops") {
      const uploadSection = GPortal.qs("#sopUploadSection");
      const list = GPortal.qs("#sopList");
      if (uploadSection) {
        uploadSection.hidden = !(profile.role === "manager" || profile.role === "admin");
      }
      if (list) {
        list.innerHTML = `
          <section class="card">
            <h3>[Preview] Opening Checklist SOP</h3>
            <p class="small">Visibility: all</p>
            <p class="small">Connect Supabase storage to upload and open live SOP files.</p>
          </section>
        `;
      }
      return;
    }

    if (page === "checklists") {
      const list = GPortal.qs("#checklistList");
      if (list) {
        list.innerHTML = `
          <section class="card">
            <h3>[Preview] Closing Checklist</h3>
            <p class="small">Submitted: Today, 9:52 PM</p>
            <span class="status-pill status-pill--ok">Submitted</span>
          </section>
        `;
      }
      return;
    }

    if (page === "requests") {
      const rows = GPortal.qs("#requestRows");
      if (rows) {
        rows.innerHTML = "<tr><td colspan='4'>Connect Supabase to submit and track requests.</td></tr>";
      }
      return;
    }

    if (page === "manager") {
      const announcementRows = GPortal.qs("#managerAnnouncementRows");
      const requestRows = GPortal.qs("#managerRequestRows");
      const shiftRows = GPortal.qs("#managerShiftRows");

      if (announcementRows) {
        announcementRows.innerHTML = "<tr><td colspan='3'>Announcements require a Supabase connection.</td></tr>";
      }
      if (requestRows) {
        requestRows.innerHTML = "<tr><td colspan='6'>Request approvals require a Supabase connection.</td></tr>";
      }
      if (shiftRows) {
        shiftRows.innerHTML = "<tr><td colspan='5'>Shift planner requires a Supabase connection.</td></tr>";
      }
      return;
    }

  }

  GPortal.loadPageData = async function loadPageData(session, profile) {
    const page = document.body.getAttribute("data-page") || GPortal.pathPage();

    if (!session) {
      return;
    }

    if (page === "admin") {
      window.location.href = "/app/staff.html";
      return;
    }

    setPortalSyncContext(session, profile);
    await hydratePortalSyncState(session);
    renderPortalDataModeNotice(session, profile);

    if (page === "menus") {
      await loadMenus(session, profile);
      if (session.isTemp) {
        return;
      }
    }

    if (session.isTemp) {
      await loadTemporaryPreview(page, profile, session);
      return;
    }

    if (page === "dashboard") {
      await loadDashboard(session, profile);
    }
    if (page === "staff") {
      await loadStaff(session, profile);
    }
    if (page === "schedule") {
      await loadSchedule(session, profile);
    }
    if (page === "tips") {
      await loadTips(session, profile);
    }
    if (page === "tips-summary") {
      await loadTipsSummary(session, profile);
    }
    if (page === "training") {
      await loadTraining(session);
    }
    if (page === "sops") {
      await loadSops(session, profile);
    }
    if (page === "checklists") {
      await loadChecklists(session);
    }
    if (page === "requests") {
      await loadRequests(session);
    }
    if (page === "profile") {
      await loadProfile(session, profile);
    }
    if (page === "manager") {
      await loadManager(session, profile);
    }
  };
})();
