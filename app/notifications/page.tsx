import { NotificationsPageClient } from "./_components/notifications-page-client";

export const dynamic = "force-dynamic";

export default function NotificationsPage() {
  return (
    <NotificationsPageClient apiBase="/api/notifications" />
  );
}
