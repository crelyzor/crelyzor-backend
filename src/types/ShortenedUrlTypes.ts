export interface CreateShortenedUrlData {
  originalUrl: string;
  userId?: string;
  orgId?: string;
}

export interface ShortenedUrlResponse {
  id: string;
  originalUrl: string;
  shortCode: string;
  shortUrl: string;
  clickCount: number;
  createdAt: Date;
}
