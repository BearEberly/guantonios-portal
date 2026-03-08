#!/usr/bin/env node

/**
 * Demo seed script for Guantonio's Portal.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-demo.mjs
 */

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
const SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const DEMO_PASSWORD = String(process.env.DEMO_PASSWORD || "DemoPass!2026");
const DEMO_DOMAIN = String(process.env.DEMO_EMAIL_DOMAIN || "demo.guantonios.local").trim();
const DRY_RUN = String(process.env.DRY_RUN || "").toLowerCase() === "true";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const DEMO_STAFF = [
  { fullName: "Ariana West", role: "admin", station: "Owner" },
  { fullName: "Marcus Hale", role: "manager", station: "Front of House" },
  { fullName: "Nina Carver", role: "manager", station: "Back of House" },
  { fullName: "Dylan Ortiz", role: "employee", station: "Server" },
  { fullName: "Jules Bennett", role: "employee", station: "Host" },
  { fullName: "Cora Miles", role: "employee", station: "Bartender" },
  { fullName: "Liam Pratt", role: "employee", station: "Line Cook" },
  { fullName: "Sofia Lane", role: "employee", station: "Prep" },
  { fullName: "Evan Brooks", role: "employee", station: "Dish" },
  { fullName: "Maya Quinn", role: "employee", station: "Server" },
  { fullName: "Noah Reed", role: "employee", station: "Runner" },
  { fullName: "Talia Ross", role: "employee", station: "Cashier" }
].map(function withEmail(person) {
  const email = toEmail(person.fullName, DEMO_DOMAIN);
  return { ...person, email };
});

async function main() {
  console.log("Seeding demo data...");
  console.log(`Supabase project: ${SUPABASE_URL}`);
  console.log(`Dry run: ${DRY_RUN ? "yes" : "no"}`);

  const existingUsers = await listUsers();
  const usersByEmail = new Map();
  existingUsers.forEach(function mapUser(user) {
    const email = String(user.email || "").toLowerCase();
    if (email) {
      usersByEmail.set(email, user);
    }
  });

  const seededUsers = [];

  for (const person of DEMO_STAFF) {
    const existing = usersByEmail.get(person.email.toLowerCase());
    if (existing) {
      seededUsers.push({ ...person, id: existing.id, reused: true });
      continue;
    }

    if (DRY_RUN) {
      seededUsers.push({ ...person, id: `dryrun-${person.email}`, reused: false });
      continue;
    }

    const created = await createAuthUser(person);
    seededUsers.push({ ...person, id: created.id, reused: false });
  }

  console.log(`Users ready: ${seededUsers.length}`);

  if (DRY_RUN) {
    printAccounts(seededUsers);
    console.log("Dry run complete.");
    return;
  }

  await upsertProfiles(seededUsers);
  await seedAnnouncements(seededUsers);
  await seedShifts(seededUsers);
  await seedTraining(seededUsers);
  await seedRequests(seededUsers);
  await seedTipsIfMissing(seededUsers);

  printAccounts(seededUsers);

  console.log("Seed complete.");
  console.log(`Demo password for new users: ${DEMO_PASSWORD}`);
}

function toEmail(fullName, domain) {
  return fullName
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, "")
    .trim()
    .replace(/\s+/g, ".") + `@${domain}`;
}

async function authRequest(method, path, body, query) {
  const queryString = query ? `?${new URLSearchParams(query).toString()}` : "";
  const response = await fetch(`${SUPABASE_URL}/auth/v1${path}${queryString}`, {
    method,
    headers: {
      "content-type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await response.json().catch(function parseError() {
    return null;
  });

  if (!response.ok) {
    const message = extractError(payload) || `Auth request failed (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

async function restRequest(method, table, options) {
  const queryString = options && options.query
    ? `?${new URLSearchParams(options.query).toString()}`
    : "";

  const headers = {
    "content-type": "application/json",
    apikey: SERVICE_ROLE_KEY,
    authorization: `Bearer ${SERVICE_ROLE_KEY}`
  };

  if (options && options.prefer) {
    headers.prefer = options.prefer;
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${queryString}`, {
    method,
    headers,
    body: options && options.body ? JSON.stringify(options.body) : undefined
  });

  if (response.status === 204) {
    return null;
  }

  const payload = await response.json().catch(function parseError() {
    return null;
  });

  if (!response.ok) {
    const message = extractError(payload) || `REST request failed (${response.status}) on ${table}`;
    throw new Error(message);
  }

  return payload;
}

function extractError(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  return payload.msg || payload.message || payload.error_description || payload.error || "";
}

async function listUsers() {
  const payload = await authRequest("GET", "/admin/users", null, {
    page: "1",
    per_page: "200"
  });

  return Array.isArray(payload.users) ? payload.users : [];
}

async function createAuthUser(person) {
  const payload = await authRequest("POST", "/admin/users", {
    email: person.email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: person.fullName,
      seed_demo: true
    }
  });

  if (!payload || !payload.user || !payload.user.id) {
    throw new Error(`Could not create auth user for ${person.email}`);
  }

  return payload.user;
}

async function upsertProfiles(users) {
  const rows = users.map(function toProfile(user) {
    return {
      id: user.id,
      full_name: user.fullName,
      role: user.role,
      station: user.station,
      active: true
    };
  });

  await restRequest("POST", "profiles", {
    body: rows,
    prefer: "resolution=merge-duplicates,return=minimal"
  });

  console.log(`Upserted profiles: ${rows.length}`);
}

async function seedAnnouncements(users) {
  const admin = users.find(function findAdmin(user) {
    return user.role === "admin";
  });

  if (!admin) {
    return;
  }

  await restRequest("DELETE", "announcements", {
    query: {
      title: "like.[DEMO]*"
    }
  });

  const rows = [
    {
      title: "[DEMO] Line Check Timing Update",
      body: "[seed-demo] Please complete line checks by 3:30 PM before dinner prep.",
      published_by: admin.id
    },
    {
      title: "[DEMO] Sunday Team Meal",
      body: "[seed-demo] Team meal starts at 4:15 PM. Clock in 10 minutes early.",
      published_by: admin.id
    },
    {
      title: "[DEMO] Uniform Reminder",
      body: "[seed-demo] Black shirt, dark jeans, non-slip shoes required for all shifts.",
      published_by: admin.id
    }
  ];

  await restRequest("POST", "announcements", {
    body: rows,
    prefer: "return=minimal"
  });

  console.log(`Seeded announcements: ${rows.length}`);
}

function buildShiftDate(dayOffset, hour, minute) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function seedShifts(users) {
  const employeeUsers = users.filter(function filterStaff(user) {
    return user.role === "employee" || user.role === "manager";
  });

  if (!employeeUsers.length) {
    return;
  }

  const ids = employeeUsers.map(function toId(user) {
    return user.id;
  });

  await restRequest("DELETE", "shifts", {
    query: {
      employee_id: `in.(${ids.join(",")})`,
      station: "like.[DEMO]*"
    }
  });

  const rows = [];
  const windows = [
    { dayOffset: 1, startHour: 10, duration: 6 },
    { dayOffset: 2, startHour: 11, duration: 6 },
    { dayOffset: 3, startHour: 15, duration: 5 },
    { dayOffset: 5, startHour: 10, duration: 6 },
    { dayOffset: 6, startHour: 16, duration: 5 }
  ];

  employeeUsers.forEach(function addEmployeeShifts(user, userIndex) {
    windows.forEach(function addWindow(window) {
      const start = buildShiftDate(window.dayOffset, window.startHour + (userIndex % 2), 0);
      const end = new Date(start);
      end.setHours(end.getHours() + window.duration);

      rows.push({
        employee_id: user.id,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        station: `[DEMO] ${user.station}`
      });
    });
  });

  await restRequest("POST", "shifts", {
    body: rows,
    prefer: "return=minimal"
  });

  console.log(`Seeded shifts: ${rows.length}`);
}

async function seedTraining(users) {
  const employeeUsers = users.filter(function filterStaff(user) {
    return user.role !== "admin";
  });

  if (!employeeUsers.length) {
    return;
  }

  const ids = employeeUsers.map(function toId(user) {
    return user.id;
  });

  await restRequest("DELETE", "training_assignments", {
    query: {
      employee_id: `in.(${ids.join(",")})`,
      title: "like.[DEMO]*"
    }
  });

  const dueSoon = new Date(Date.now() + (3 * 24 * 60 * 60 * 1000)).toISOString();
  const dueLater = new Date(Date.now() + (8 * 24 * 60 * 60 * 1000)).toISOString();

  const rows = [];
  employeeUsers.forEach(function addTraining(user) {
    rows.push({
      employee_id: user.id,
      title: "[DEMO] Food Safety Refresher",
      status: "ASSIGNED",
      due_at: dueSoon
    });

    rows.push({
      employee_id: user.id,
      title: "[DEMO] Guest Recovery Steps",
      status: "IN_PROGRESS",
      due_at: dueLater
    });
  });

  await restRequest("POST", "training_assignments", {
    body: rows,
    prefer: "return=minimal"
  });

  console.log(`Seeded training assignments: ${rows.length}`);
}

async function seedRequests(users) {
  const employeeUsers = users.filter(function filterStaff(user) {
    return user.role === "employee";
  });

  if (!employeeUsers.length) {
    return;
  }

  const ids = employeeUsers.map(function toId(user) {
    return user.id;
  });

  await restRequest("DELETE", "requests", {
    query: {
      employee_id: `in.(${ids.join(",")})`,
      type: "in.(DEMO_TIME_OFF,DEMO_SHIFT_SWAP,DEMO_PAYROLL)"
    }
  });

  const rows = [
    {
      employee_id: employeeUsers[0].id,
      type: "DEMO_TIME_OFF",
      message: "[seed-demo] Need next Friday evening off for family event.",
      status: "PENDING"
    },
    {
      employee_id: employeeUsers[1].id,
      type: "DEMO_SHIFT_SWAP",
      message: "[seed-demo] Can swap Saturday lunch shift with Dylan.",
      status: "APPROVED"
    },
    {
      employee_id: employeeUsers[2].id,
      type: "DEMO_PAYROLL",
      message: "[seed-demo] Clarification requested for tip pool distribution.",
      status: "DENIED"
    }
  ];

  await restRequest("POST", "requests", {
    body: rows,
    prefer: "return=minimal"
  });

  console.log(`Seeded requests: ${rows.length}`);
}

async function seedTipsIfMissing(users) {
  const employeeUsers = users.filter(function filterStaff(user) {
    return user.role === "employee";
  });

  let inserted = 0;

  for (let index = 0; index < employeeUsers.length; index += 1) {
    const user = employeeUsers[index];
    const existing = await restRequest("GET", "tip_statements", {
      query: {
        employee_id: `eq.${user.id}`,
        select: "id",
        limit: "1"
      }
    });

    if (Array.isArray(existing) && existing.length) {
      continue;
    }

    const rows = [];
    for (let week = 3; week >= 1; week -= 1) {
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() - (7 * (week - 1)));
      periodEnd.setHours(0, 0, 0, 0);

      const periodStart = new Date(periodEnd);
      periodStart.setDate(periodEnd.getDate() - 6);

      rows.push({
        employee_id: user.id,
        period_start: periodStart.toISOString().slice(0, 10),
        period_end: periodEnd.toISOString().slice(0, 10),
        net_tips: Number((280 + (index * 24) + (week * 12)).toFixed(2))
      });
    }

    await restRequest("POST", "tip_statements", {
      body: rows,
      prefer: "return=minimal"
    });
    inserted += rows.length;
  }

  console.log(`Seeded tip statements: ${inserted}`);
}

function printAccounts(users) {
  console.log("\nDemo accounts:");
  users.forEach(function printUser(user) {
    const marker = user.reused ? "existing" : "new";
    console.log(`- ${user.email} (${user.role}, ${marker})`);
  });
}

main().catch(function onError(error) {
  console.error("Seed failed:", error.message || error);
  process.exit(1);
});
