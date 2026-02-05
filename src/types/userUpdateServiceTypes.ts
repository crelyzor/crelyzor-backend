export interface UserProfileResponse {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  countryCode: string | null;
  phoneNumber: string | null;
  country: string | null;
  state: string | null;
  updatedAt: Date;
}
