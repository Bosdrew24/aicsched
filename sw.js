self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "Class Schedule Alert";
  const options = {
    body: data.body || "You have an upcoming class.",
    icon: "logo.jpg",
    badge: "logo.jpg"
  };
  event.waitUntil(self.registration.showNotification(title, options));
});