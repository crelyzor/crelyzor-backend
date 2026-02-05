export interface CreateOrganizationDTO {
  name: string;
  description?: string;
  organizationDetails?: Record<string, any>;
  orgLogoUrl?: string;
}
