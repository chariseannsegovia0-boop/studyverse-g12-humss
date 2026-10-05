STUDYVERSE G12 HUMSS Prototype — Notifications

WHAT CHANGED
- Added proper Service Worker push-notification handling.
- Added notification permission + push subscription flow.
- Added a small Node.js backend scheduler so scheduled reminders can be delivered even when the website/PWA is closed.
- Existing planner, calendar, rewards, reflections, moods, progress, and recommendations are preserved.

IMPORTANT
A purely static website cannot reliably wake itself up and create a scheduled notification after the browser/app has been fully closed. The included server.js is therefore required for true closed-app scheduled push notifications.

RUN LOCALLY
1. Install Node.js 18+.
2. Open a terminal in this STUDYVERSE folder.
3. Run: npm install
4. Run: npm start
5. Open: http://localhost:3000
6. Click "Enable device notifications" and allow notifications.
7. Add a task and choose its reminder time.

DEPLOYMENT
For notifications while the app is closed on a real device, host the Node server on a public HTTPS domain. Keep the generated vapid.json and push-data.json on persistent storage. HTTPS is required for normal browser Push API use outside localhost.

The server automatically generates VAPID keys on first start. You may set VAPID_SUBJECT as an environment variable (recommended for production), e.g. mailto:admin@example.com.
