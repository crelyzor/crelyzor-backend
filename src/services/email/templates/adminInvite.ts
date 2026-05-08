export function adminInviteTemplate({
  invitedByName,
  acceptUrl,
}: {
  invitedByName: string;
  acceptUrl: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'DM Sans',system-ui,sans-serif;color:#fafafa;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#171717;border:1px solid #262626;border-radius:16px;padding:40px;">
          <tr>
            <td>
              <p style="margin:0 0 8px;font-size:11px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#737373;">
                Crelyzor Admin
              </p>
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#fafafa;line-height:1.2;">
                You've been invited
              </h1>
              <p style="margin:0 0 32px;font-size:14px;color:#a3a3a3;line-height:1.6;">
                ${invitedByName} has invited you to join the Crelyzor Admin portal.
                Click the button below to set your password and get access.
              </p>
              <a href="${acceptUrl}" style="display:inline-block;background:#fafafa;color:#171717;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">
                Accept Invite
              </a>
              <p style="margin:32px 0 0;font-size:12px;color:#525252;line-height:1.6;">
                This invite expires in 48 hours. If you weren't expecting this, you can ignore this email.
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#404040;">
                Or copy this link: <span style="color:#737373;">${acceptUrl}</span>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
