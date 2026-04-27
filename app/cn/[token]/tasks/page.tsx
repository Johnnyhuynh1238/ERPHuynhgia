import { notFound, redirect } from "next/navigation";

export default async function CustomerTasksIndexPage({ params }: { params: { token: string } }) {
  if (!params.token) notFound();
  redirect(`/cn/${params.token}/timeline`);
}
