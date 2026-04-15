import { redirect } from "next/navigation"

// Redirect to the login page with signup tab pre-selected
export default function SignupPage() {
  redirect("/login?mode=signup")
}
