import { google } from "googleapis";
import { AppError } from "../utils/errors/AppError";

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

    let tokens: import("googleapis").Auth.Credentials;
    try {
      const result = await client.getToken(code);
      tokens = result.tokens;
    } catch (err) {
      throw new AppError("Failed to exchange Google OAuth code", 502);
    }

    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ auth: client, version: "v2" });
    let data: Record<string, string | null | undefined>;
    try {
      const result = await oauth2.userinfo.get();
      data = result.data as Record<string, string | null | undefined>;
    } catch (err) {
      throw new AppError("Failed to fetch Google user info", 502);
    }

    if (!data.email || !data.id)
      throw new AppError("Google user info missing required fields", 502);

    return {
      email: data.email,
      name: data.name || "",
      picture: data.picture || "",
      googleId: data.id,
      tokens,
    };
  },
};
