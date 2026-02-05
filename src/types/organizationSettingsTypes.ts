export interface UpdateMeetingPreferenceRequest {
  meetingPreference: "GOOGLE" | "ZOOM";
}

export interface UpdateMeetingPreferenceResponse {
  success: boolean;
  message: string;
  data: {
    meetingPreference: "GOOGLE" | "ZOOM";
  };
}

export interface GetMeetingPreferenceResponse {
  success: boolean;
  data: {
    meetingPreference: "GOOGLE" | "ZOOM" | null;
  };
}
