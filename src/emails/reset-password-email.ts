function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function renderResetPasswordEmail(params: {
  resetUrl: string
  userName: string
}): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Reinitialisez votre mot de passe - GrudgeVault</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0d0d14; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width: 560px; margin: 0 auto; padding: 40px 20px; }
    .card { background: #161620; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 40px; }
    .logo-icon { font-size: 44px; text-align: center; display: block; margin-bottom: 16px; }
    h1 { color: #f1f0f7; font-size: 24px; font-weight: 700; margin: 0 0 12px; text-align: center; }
    p { color: #b3b1c2; font-size: 14px; line-height: 1.7; margin: 0 0 16px; text-align: center; }
    .cta-button { display: block; width: fit-content; background: linear-gradient(135deg, #8b5cf6, #ec4899); color: #fff !important; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 600; font-size: 14px; margin: 28px auto 16px; text-align: center; }
    .link-box { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 16px; word-break: break-word; text-align: left; }
    .link-box a { color: #c084fc; text-decoration: none; font-size: 12px; }
    .footer { text-align: center; margin-top: 24px; color: #44445a; font-size: 12px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <span class="logo-icon">🔑</span>
      <h1>Reinitialisation du mot de passe, ${escapeHtml(params.userName)}.</h1>
      <p>Vous avez demander à reinitialiser le mot de passe de votre compte GrudgeVault.</p>
      <p>Ce lien est valable 1 heure. Si vous n'etes pas à l'origine de cette demande, ignorez simplement cet email : votre mot de passe actuel reste inchange.</p>

      <a href="${params.resetUrl}" class="cta-button">Choisir un nouveau mot de passe</a>

      <div class="link-box">
        <a href="${params.resetUrl}">${escapeHtml(params.resetUrl)}</a>
      </div>
    </div>

    <div class="footer">
      <p>GrudgeVault</p>
    </div>
  </div>
</body>
</html>`
}
