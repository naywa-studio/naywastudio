import { redirect } from "next/navigation"

// Legacy route — redirect to the new workspace
export default function EspaceClientRedirect() {
  redirect("/workspace")
}
