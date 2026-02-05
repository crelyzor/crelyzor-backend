export interface CreateConfigTokenResponse {
  token: string;
  organizationId: string;
  isNew: boolean;
}

export interface DecodeConfigTokenResponse {
  companyName: string;
  brandColor: string | null;
  companyLogo: string | null;
}

export interface ConfigTokenData {
  token: string;
  organizationId: string;
  createdAt: Date;
}
