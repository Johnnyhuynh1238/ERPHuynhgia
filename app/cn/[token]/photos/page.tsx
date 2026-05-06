import { redirect } from "next/navigation";

export default function CustomerPhotosPage({ params }: { params: { token: string } }) {
  redirect(`/cn/${params.token}/journal?view=photos`);
}
