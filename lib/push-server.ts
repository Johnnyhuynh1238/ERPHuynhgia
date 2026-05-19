import webPush from "web-push";
import { prisma } from "@/lib/prisma";

let configured = false;

function configure() {
  if (configured) return;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys missing");
  }
  webPush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
  badgeCount?: number;
};

export async function sendPushToUser(userId: string, payload: PushPayload) {
  configure();
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (!subs.length) return { sent: 0, removed: 0 };

  let sent = 0;
  let removed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          JSON.stringify(payload),
        );
        sent += 1;
        await prisma.pushSubscription
          .update({ where: { id: s.id }, data: { lastSeen: new Date() } })
          .catch(() => {});
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
          removed += 1;
        } else {
          console.error("[push] send failed:", status, (err as { body?: string })?.body || err);
        }
      }
    }),
  );
  return { sent, removed };
}

export async function sendPushToProjectCustomer(projectId: string, payload: PushPayload) {
  try {
    configure();
  } catch (err) {
    console.error("[push] configure failed:", err);
    return { sent: 0, removed: 0 };
  }

  const subs = await prisma.customerPushSubscription.findMany({ where: { projectId } });
  if (!subs.length) return { sent: 0, removed: 0 };

  let sent = 0;
  let removed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          JSON.stringify(payload),
        );
        sent += 1;
        await prisma.customerPushSubscription
          .update({ where: { id: s.id }, data: { lastSeen: new Date() } })
          .catch(() => {});
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await prisma.customerPushSubscription.delete({ where: { id: s.id } }).catch(() => {});
          removed += 1;
        } else {
          console.error("[push] customer send failed:", status, (err as { body?: string })?.body || err);
        }
      }
    }),
  );
  return { sent, removed };
}
