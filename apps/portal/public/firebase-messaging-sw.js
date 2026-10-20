/* Push notifications service worker.
 *
 * Plain JavaScript on purpose: a service worker is not bundled, and it needs no
 * Firebase SDK to show a data message — FCM delivers it as an ordinary web push.
 * The API sends data-only messages ({ title, body, kind, entityType, entityId }),
 * so the notification is drawn here and looks the same in the background as in
 * the foreground.
 *
 * `?base=` is the school's path prefix in path-tenant mode ("/beacon"), or empty
 * in subdomain mode. The page puts it on the registration URL because a service
 * worker cannot read the portal's environment.
 */
const BASE = new URL(self.location.href).searchParams.get('base') || '';

const ROUTES = {
  student: (id) => `/students/${id}`,
  staff: (id) => `/staff/${id}`,
  assessment: (id) => `/marks/${id}`,
  request: (id) => `/requests/${id}`,
  timetable: (id) => `/timetables/${id}`,
  voucher: (id) => `/parent/vouchers?open=${id}`,
  expense: () => '/finance/expenses',
  holiday: () => '/academics/holidays',
};

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_error) {
    return;
  }
  const data = payload.data || {};
  if (!data.title) {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body || '',
      icon: '/icon.png',
      tag: data.entityId ? `${data.entityType}:${data.entityId}` : undefined,
      data,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const route = ROUTES[data.entityType];
  const path = BASE + (route && data.entityId ? route(data.entityId) : '/');
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('focus' in client) {
          client.navigate(path);
          return client.focus();
        }
      }
      return self.clients.openWindow(path);
    }),
  );
});
