export interface OrganizationPgFlowResponse {
  id: string;
  name: string;
  allowPaymentFlow: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateOrganizationPgFlowRequest {
  allowPaymentFlow?: boolean;
}

export interface UpdateOrganizationPgFlowResponse {
  success: boolean;
  message: string;
  settings: OrganizationPgFlowResponse;
}
