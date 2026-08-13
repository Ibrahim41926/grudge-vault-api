function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function renderWelcomeEmail(params: {
  dashboardUrl: string
  userName: string
}): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Bienvenue sur GrudgeVault</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0d0d14; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width: 560px; margin: 0 auto; padding: 40px 20px; }
    .card { background: #161620; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 40px; }
    .logo-icon { font-size: 48px; text-align: center; display: block; margin-bottom: 16px; }
    h1 { color: #f1f0f7; font-size: 26px; font-weight: 700; text-align: center; margin: 0 0 8px; }
    .gradient-text { background: linear-gradient(135deg, #c084fc, #f472b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .subtitle { color: #6b6b8a; font-size: 15px; text-align: center; margin: 0 0 32px; line-height: 1.6; }
    .feature { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
    .feature-icon { font-size: 20px; flex-shrink: 0; margin-top: 2px; }
    .feature-title { color: #e8e6f0; font-size: 14px; font-weight: 600; margin: 0 0 2px; }
    .feature-desc { color: #6b6b8a; font-size: 13px; margin: 0; }
    .divider { border: none; border-top: 1px solid rgba(255,255,255,0.07); margin: 28px 0; }
    .quote { color: #c4b5fd; font-size: 16px; font-style: italic; text-align: center; margin: 0 0 28px; }
    .cta-button { display: block; background: linear-gradient(135deg, #8b5cf6, #ec4899); color: #fff !important; text-decoration: none; padding: 16px 28px; border-radius: 12px; font-weight: 600; font-size: 15px; text-align: center; }
    .footer { text-align: center; margin-top: 28px; color: #44445a; font-size: 12px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <span class="logo-icon">🗡️</span>
      <h1>Bienvenue, <span class="gradient-text">${escapeHtml(params.userName)}</span>.</h1>
      <p class="subtitle">
        Votre coffre emotionnel est pret.<br/>
        Les archives n'oublient jamais. Et maintenant, vous non plus.
      </p>

      <hr class="divider" />

      <div class="feature">
        <span class="feature-icon">📁</span>
        <div>
          <p class="feature-title">Archivez vos rancunes</p>
          <p class="feature-desc">Nom, categorie, niveau de gravité et description complete.</p>
        </div>
      </div>
      <div class="feature">
        <span class="feature-icon">📸</span>
        <div>
          <p class="feature-title">Uploadez vos preuves</p>
          <p class="feature-desc">Screenshots, audios, PDFs. Privés et sécurisés.</p>
        </div>
      </div>
      <div class="feature">
        <span class="feature-icon">🔔</span>
        <div>
          <p class="feature-title">Programmez des rappels</p>
          <p class="feature-desc">Quotidiens, hebdomadaires, mensuels. Pour ne jamais oublier.</p>
        </div>
      </div>

      <hr class="divider" />

      <p class="quote">"Certains tournent la page. D'autres gardent les preuves."</p>

      <a href="${params.dashboardUrl}" class="cta-button">Ouvrir mes archives</a>
    </div>

    <div class="footer">
      <p>GrudgeVault - 100% privé, 0 profil public</p>
      <p style="margin-top:4px">Vos données vous appartiennent. Toujours.</p>
    </div>
  </div>
</body>
</html>`
}
