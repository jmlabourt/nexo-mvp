import { redirect } from "next/navigation";

export default function Page() {
  redirect("/stock?tab=sobrantes");
}
