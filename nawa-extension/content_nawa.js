/**
 * content_nawa.js — injecté sur nawa-studio.vercel.app
 * Récupère la session Supabase via l'API extension/auth (cookies SSR)
 * et l'envoie au background pour authentifier l'extension.
 */

(function () {
  // Appel à l'endpoint dédié — le navigateur envoie les cookies automatiquement
  fetch("https://nawa-studio.vercel.app/api/extension/auth", {
    credentials: "include",   // envoie les cookies de session
    cache:       "no-store",
  })
    .then(res => res.json())
    .then(data => {
      if (!data.authenticated || !data.access_token || !data.user_id) {
        console.log("[Nawa] Pas de session active sur nawa-studio.vercel.app")
        return
      }

      console.log("[Nawa] Session récupérée pour user:", data.user_id.slice(0, 8) + "…")

      chrome.runtime.sendMessage({
        type:        "SET_AUTH",
        accessToken: data.access_token,
        userId:      data.user_id,
      })
    })
    .catch(err => {
      console.warn("[Nawa] Erreur récupération session:", err)
    })
})()
