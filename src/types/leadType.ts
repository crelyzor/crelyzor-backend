export interface CreateLeadInput {
  name: string;
  email: string;
  contact: string;
  city: string;
  profile: "IEC_COUNSELOR" | "STUDENT" | "PARENT" | "OTHERS";
}

export interface ContactUsInput {
  name: string;
  email: string;
  companyName?: string;
  message: string;
}
