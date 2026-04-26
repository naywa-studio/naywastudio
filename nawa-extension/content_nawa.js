/**
 * content_nawa.js — s'injecte sur nawa-studio.vercel.app
 * Récupère automatiquement la session Supabase et l'envoie au background.
 * L'utilisateur n'a rien à faire : l'extension se connecte toute seule.
 */

(function () {
  // Supabase stocke la session dans localStorage avec la clé "sb-{projectRef}-auth-token"
  const sessionKey = Object.keys(localStorage).find(
    k => k.startsWith("sb-") && k.endsWith("-auth-token")
  )
  if (!sessionKey) return

  try {
    const raw = localStorage.getItem(sessionKey)
    if (!raw) return
    const session = JSON.parse(raw)
    const accessToken = session?.access_token
    const userId = session?.user?.id

    if (!accessToken || !userId) return

    chrome.runtime.sendMessage({
      type:        "SET_AUTH",
      accessToken: accessToken,
      userId:      userId,
    })
  } catch {
    // Silencieux — pas de session valide
  }
})()
