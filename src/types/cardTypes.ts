export interface CardLink {
  type: string; // "linkedin", "twitter", "github", "instagram", "website", "custom"
  url: string;
  label: string;
  icon?: string;
}

export interface CardContactFields {
  phone?: string;
  email?: string;
  location?: string;
  website?: string;
}

export interface CardTheme {
  primaryColor?: string;
  backgroundColor?: string;
  fontFamily?: string;
  layout?: "classic" | "modern" | "minimal";
  darkMode?: boolean;
}

export interface CreateCardDTO {
  slug?: string;
  displayName: string;
  title?: string;
  bio?: string;
  avatarUrl?: string;
  coverUrl?: string;
  links?: CardLink[];
  contactFields?: CardContactFields;
  theme?: CardTheme;
  isDefault?: boolean;
}

export interface UpdateCardDTO {
  slug?: string;
  displayName?: string;
  title?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  links?: CardLink[];
  contactFields?: CardContactFields;
  theme?: CardTheme;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface SubmitContactDTO {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  note?: string;
}

export interface CardViewEvent {
  ipHash?: string;
  userAgent?: string;
  referrer?: string;
  country?: string;
  city?: string;
  clickedLink?: string;
}

export interface CardAnalytics {
  totalViews: number;
  uniqueViews: number;
  totalContacts: number;
  conversionRate: number;
  linkClicks: { link: string; count: number }[];
  viewsByDay: { date: string; count: number }[];
  topCountries: { country: string; count: number }[];
}
