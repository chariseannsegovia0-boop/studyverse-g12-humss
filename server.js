const express = require('express');
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const STORE = path.join(ROOT, 'push-data.json');
const VAPID_FILE = path.join(ROOT, 'vapid.json');

app.use(express.json({ limit: '1mb' }));

// =========================
// CORS
// =========================

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type'
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.static(ROOT));

// =========================
// FILE STORAGE
// =========================

function loadJson(file, fallback) {
  try {
    return JSON.parse(
      fs.readFileSync(file, 'utf8')
    );
  } catch (e) {
    return fallback;
  }
}

function saveJson(file, value) {
  fs.writeFileSync(
    file,
    JSON.stringify(value, null, 2)
  );
}

// =========================
// VAPID
// =========================

let vapid = loadJson(VAPID_FILE, null);

if (!vapid) {
  vapid = webpush.generateVAPIDKeys();
  saveJson(VAPID_FILE, vapid);
}

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT ||
    'mailto:studyverse@example.com',
  vapid.publicKey,
  vapid.privateKey
);

// =========================
// DATA
// =========================

let store = loadJson(STORE, {
  subscriptions: [],
  tasks: []
});

// =========================
// HEALTH CHECK
// =========================

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'STUDYVERSE notifications',
    time: new Date().toISOString()
  });
});

// =========================
// VAPID PUBLIC KEY
// =========================

app.get('/api/vapid-public-key', (req, res) => {
  res
    .type('text')
    .send(vapid.publicKey);
});

// =========================
// SAVE PUSH SUBSCRIPTION
// =========================

app.post('/api/subscribe', (req, res) => {
  const sub = req.body;

  if (!sub || !sub.endpoint) {
    return res.status(400).json({
      error: 'Invalid subscription'
    });
  }

  store.subscriptions =
    store.subscriptions.filter(
      x => x.endpoint !== sub.endpoint
    );

  store.subscriptions.push(sub);

  saveJson(STORE, store);

  console.log(
    'Push subscription saved.'
  );

  res.json({
    ok: true,
    subscriptions:
      store.subscriptions.length
  });
});

// =========================
// SYNC TASKS
// =========================

app.post('/api/sync-tasks', (req, res) => {
  const tasks = Array.isArray(req.body.tasks)
    ? req.body.tasks
    : [];

  store.tasks = tasks.map(t => ({
    id: t.id,
    name: t.name,
    due: t.due,
    rem: Number(t.rem) || 0,
    done: !!t.done,
    reminded: !!t.reminded
  }));

  saveJson(STORE, store);

  console.log(
    `Tasks synced: ${store.tasks.length}`
  );

  res.json({
    ok: true,
    tasks: store.tasks
  });
});

// =========================
// SEND PUSH NOTIFICATION
// =========================

async function sendReminder(task) {
  const payload = JSON.stringify({
    title: 'STUDYVERSE Reminder ⏰',
    body:
      `${task.name} is due ` +
      `${task.rem ? 'soon' : 'now'}.`,
    tag: `studyverse-${task.id}`,
    taskId: task.id,
    url: '/'
  });

  const dead = [];

  for (const sub of store.subscriptions) {
    try {
      await webpush.sendNotification(
        sub,
        payload
      );

      console.log(
        `Push sent: ${task.name}`
      );

    } catch (e) {
      console.error(
        'Push error:',
        e.statusCode || e.message
      );

      if (
        e.statusCode === 404 ||
        e.statusCode === 410
      ) {
        dead.push(sub.endpoint);
      }
    }
  }

  if (dead.length) {
    store.subscriptions =
      store.subscriptions.filter(
        s => !dead.includes(s.endpoint)
      );

    saveJson(STORE, store);
  }
}

// =========================
// CHECK DUE TASKS
// =========================

async function checkTasks() {
  const now = Date.now();
  let changed = false;

  for (const task of store.tasks) {

    const dueTime =
      new Date(task.due).getTime() -
      Number(task.rem || 0) * 60000;

    if (
      !task.done &&
      !task.reminded &&
      Number.isFinite(dueTime) &&
      dueTime <= now
    ) {

      console.log(
        `Sending reminder: ${task.name}`
      );

      await sendReminder(task);

      task.reminded = true;
      changed = true;
    }
  }

  if (changed) {
    saveJson(STORE, store);
  }

  return {
    checkedAt:
      new Date().toISOString(),
    tasksChecked:
      store.tasks.length
  };
}

// =========================
// EXTERNAL SCHEDULER ENDPOINT
// =========================
//
// This endpoint can be called by an
// external cron/scheduler service.
// It wakes Render and checks reminders.
//

app.get('/api/check-reminders', async (req, res) => {
  try {

    console.log(
      'External reminder check triggered.'
    );

    const result =
      await checkTasks();

    res.json({
      ok: true,
      ...result
    });

  } catch (e) {

    console.error(
      'Reminder check failed:',
      e
    );

    res.status(500).json({
      ok: false,
      error: 'Reminder check failed'
    });
  }
});

// =========================
// INTERNAL CHECK
// =========================
//
// Still checks every 15 seconds while
// the Render service is awake.
//

setInterval(() => {
  checkTasks()
    .catch(console.error);
}, 15000);

checkTasks()
  .catch(console.error);

// =========================
// SERVE STUDYVERSE
// =========================

app.use((req, res) => {

  if (
    req.method === 'GET' &&
    !req.path.startsWith('/api/')
  ) {
    return res.sendFile(
      path.join(ROOT, 'index.html')
    );
  }

  res.status(404).json({
    error: 'Not found'
  });
});

// =========================
// START SERVER
// =========================

app.listen(PORT, () => {
  console.log(
    `STUDYVERSE server running on port ${PORT}`
  );
});
