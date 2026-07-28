import { redirect } from "next/navigation";

export default function MenuRoute() {
  redirect("/nutrition?panel=menu");
}
