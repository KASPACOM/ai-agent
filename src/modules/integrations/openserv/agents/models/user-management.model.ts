// User Management interfaces
export interface AdItemResponse {
  id: string;
  type: string;
  content: string;
  location: string;
}

export interface NotificationsResponse {
  id: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface ContactInfoResponse {
  email?: string;
  x_url?: string;
  username?: string;
}

export interface UserReferral {
  id: string;
  referredBy: string;
  createdAt: string;
}

export interface VerifiedUser {
  address: string;
  signature: string;
  message: string;
}

export type AdType = 'banner' | 'sidebar' | 'popup';
