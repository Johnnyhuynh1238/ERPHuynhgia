import { NotificationsPageClient } from "@/app/notifications/_components/notifications-page-client";

export const dynamic = "force-dynamic";

export default function CustomerNotificationsPage({ params }: { params: { token: string } }) {
  return <NotificationsPageClient apiBase={`/api/customer/${params.token}/notifications`} />;
}
