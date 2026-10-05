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

// Allow GitHub Pages to connect to Render
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.static(ROOT));

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function saveJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

// Generate VAPID keys if they don't exist yet
let vapid = loadJson(VAPID_FILE, null);

if (!vapid) {
  vapid = webpush.generateVAPIDKeys();
  saveJson(VAPID_FILE, vapid);
}

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:studyverse@example.com',
  vapid.publicKey,
  vapid.privateKey
);

// Load saved data
let store = loadJson(STORE, {
  subscriptions: [],
  tasks: []
});

// Get public VAPID key
app.get('/api/vapid-public-key', (req, res) => {
  res.type('text').send(vapid.publicKey);
});

// Save browser push subscription
app.post('/api/subscribe', (req, res) => {
  const sub = req.body;

  if (!sub || !sub.endpoint) {
    return res.status(400).json({
      error: 'Invalid subscription'
    });
  }

  store.subscriptions = store.subscriptions.filter(
    x => x.endpoint !== sub.endpoint
  );

  store.subscriptions.push(sub);

  saveJson(STORE, store);

  res.json({
    ok: true
  });
});

// Sync tasks from STUDYVERSE
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

  res.json({
    ok: true,
    tasks: store.tasks
  });
});

// Send push notification
async function sendReminder(task) {
  const payload = JSON.stringify({
    title: 'STUDYVERSE Reminder ⏰',
    body: `${task.name} is due ${task.rem ? 'soon' : 'now'}.`,
    tag: `studyverse-${task.id}`,
    taskId: task.id,
    url: '/'
  });

  const dead = [];

  for (const sub of store.subscriptions) {
    try {
      await webpush.sendNotification(sub, payload);
    } catch (e) {
      console.error('Push error:', e.statusCode || e.message);

      if (e.statusCode === 404 || e.statusCode === 410) {
        dead.push(sub.endpoint);
      }
    }
  }

  if (dead.length) {
    store.subscriptions = store.subscriptions.filter(
      s => !dead.includes(s.endpoint)
    );

    saveJson(STORE, store);
  }
}

// Check tasks every 15 seconds
async function checkTasks() {
  const now = Date.now();
  let changed = false;

  for (const task of store.tasks) {
    const dueTime =
      new Date(task.due).getTime() -
      (task.rem * 60000);

    if (
      !task.done &&
      !task.reminded &&
      Number.isFinite(dueTime) &&
      dueTime <= now
    ) {
      console.log('Sending reminder:', task.name);

      await sendReminder(task);

      task.reminded = true;
      changed = true;
    }
  }

  if (changed) {
    saveJson(STORE, store);
  }
}

setInterval(() => {
  checkTasks().catch(console.error);
}, 15000);

checkTasks().catch(console.error);

// Serve STUDYVERSE
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

app.listen(PORT, () => {
  console.log(
    `STUDYVERSE server running on port ${PORT}`
  );
});
