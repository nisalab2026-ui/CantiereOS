import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";

export default async function Home() {
  redirect((await getVerifiedSession()) ? "/app" : "/accedi");
}
