import { google } from "googleapis";

const LOGIN_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

function getOAuthClient(redirectUri?: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri || process.env.GOOGLE_LOGIN_REDIRECT_URI!,
  );
}

export const googleService = {
  getLoginUrl(redirectUrl: string) {
    const redirectUri = `${process.env.BASE_URL}/auth/google/login/callback`;
    const client = getOAuthClient(redirectUri);
    return client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: LOGIN_SCOPES,
      state: JSON.stringify({ redirectUrl }),
    });
  },

  async handleLoginCallback(code: string) {
    const redirectUri = `${process.env.BASE_URL}/auth/google/login/callback`;
    const client = getOAuthClient(redirectUri);
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ auth: client, version: "v2" });
    const { data } = await oauth2.userinfo.get();

    if (!data.email || !data.id)
      throw new Error("Failed to fetch Google user info");

    return {
      email: data.email,
      name: data.name || "",
      picture: data.picture || "",
      googleId: data.id,
      tokens,
    };
  },
};
