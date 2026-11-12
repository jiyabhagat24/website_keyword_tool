/** Ask once, from a click, so a later finish can show a browser notification. */
export async function askNotificationPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "default") return;
  try {
    await Notification.requestPermission();
  } catch {
    // The browser refused to ask; the page still shows the result.
  }
}

export function notifyUser(title: string, body: string) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    const note = new Notification(title, { body });
    note.onclick = () => {
      window.focus();
      note.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker.
  }
}
