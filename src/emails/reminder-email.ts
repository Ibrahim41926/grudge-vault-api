function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function renderReminderEmail(params: {
  dashboardUrl: string
  grudgeTitle: string
  incidentDate: string
  message: string
  traitorName: string
  userName: string
}): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Rappel GrudgeVault</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0d0d14; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width: 560px; margin: 0 auto; padding: 40px 20px; }
    .card { background: #161620; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 40px; }
    .logo-icon { font-size: 44px; text-align: center; display: block; margin-bottom: 16px; }
    h1 { color: #f1f0f7; font-size: 22px; font-weight: 700; margin: 0 0 8px; line-height: 1.3; text-align: center; }
    .subtitle { color: #6b6b8a; font-size: 14px; margin: 0 0 28px; text-align: center; }
    .divider { border: none; border-top: 1px solid rgba(255,255,255,0.07); margin: 28px 0; }
    .info-block { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    .info-label { color: #6b6b8a; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
    .info-value { color: #e8e6f0; font-size: 15px; font-weight: 500; }
    .traitor-name { color: #f472b6; font-size: 20px; font-weight: 700; }
    .message-block { background: rgba(139,92,246,0.08); border-left: 3px solid #8b5cf6; border-radius: 0 8px 8px 0; padding: 16px 20px; margin: 20px 0; }
    .message-text { color: #c4b5fd; font-size: 14px; font-style: italic; line-height: 1.6; margin: 0; }
    .cta-button { display: block; width: fit-content; background: linear-gradient(135deg, #8b5cf6, #ec4899); color: #fff !important; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 600; font-size: 14px; margin: 28px auto 0; text-align: center; }
    .footer { text-align: center; margin-top: 32px; }
    .footer p { color: #44445a; font-size: 12px; margin: 4px 0; }
    .footer a { color: #6b6b8a; text-decoration: none; }
    .severity-bar { height: 4px; background: linear-gradient(90deg, #22c55e, #f59e0b, #ef4444); border-radius: 2px; margin: 16px 0 0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <span class="logo-icon">🗡️</span>
      <h1>Les archives ont un message pour vous, ${escapeHtml(params.userName)}.</h1>
      <p class="subtitle">Vous aviez demander à ne pas oublier ceci.</p>

      <hr class="divider" />

      <div class="info-block">
        <div class="info-label">Sujet de la rancune</div>
        <div class="info-value">${escapeHtml(params.grudgeTitle)}</div>
        <div class="severity-bar"></div>
      </div>

      <div class="info-block">
        <div class="info-label">La personne concernee</div>
        <div class="traitor-name">${escapeHtml(params.traitorName)}</div>
        <div class="info-label" style="margin-top:8px">Date de l incident</div>
        <div class="info-value">${escapeHtml(params.incidentDate)}</div>
      </div>

      <div class="message-block">
        <p class="message-text">"${escapeHtml(params.message)}"</p>
      </div>

      <a href="${params.dashboardUrl}" class="cta-button">Ouvrir les archives</a>

      <hr class="divider" />

      <p style="color:#44445a;font-size:12px;text-align:center;margin:0">
        Le pardon reste optionnel. Vos archives, elles, sont eternelles.
      </p>
    </div>

    <div class="footer">
      <p>GrudgeVault - Archives Emotionnelles Privées</p>
      <p>Vos données vous appartiennent. Toujours.</p>
      <p style="margin-top:8px">
        <a href="${params.dashboardUrl}/settings">Ajuster vos rappels</a>
      </p>
    </div>
  </div>
</body>
</html>`
}
