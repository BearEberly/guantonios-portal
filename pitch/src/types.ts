export type SeatingSection = 'indoor' | 'outdoor';

export interface AvailabilitySlot {
  slotId: string;
  date: string;
  time: string;
  displayTime: string;
  partySize: number;
  seating: Array<{ section: SeatingSection; label: string }>;
  exact: boolean;
  startsAt: string;
  endsAt: string;
}

export interface HoldResult {
  ok: boolean;
  holdId?: string;
  holdToken?: string;
  expiresAt?: string;
  tableCode?: string;
  section?: SeatingSection;
  startsAt?: string;
  endsAt?: string;
  recovered?: boolean;
  error?: string;
}

export interface ReservationSummary {
  reference: string;
  status: string;
  partySize: number;
  section: SeatingSection;
  startsAt: string;
  endsAt: string;
  guestLabel?: string;
  guestProfileId?: string;
  guestTags?: string[];
  guestPreferences?: string[];
  visitCount?: number;
  privateNotePreview?: string;
  demoDisclaimer?: string;
}

export interface BookingResult {
  ok: boolean;
  reference?: string;
  manageToken?: string;
  reservation?: ReservationSummary;
  status?: string;
  partySize?: number;
  section?: SeatingSection;
  startsAt?: string;
  endsAt?: string;
  message?: string;
  error?: string;
  recovered?: boolean;
}

export interface GuestVisit {
  reference: string;
  status: string;
  partySize: number;
  section: SeatingSection;
  startsAt: string;
  tableCode?: string | null;
}

export interface GuestProfile {
  id: string;
  guestLabel: string;
  contact?: string;
  tags: string[];
  preferences: string[];
  privateNote: string;
  visitCount: number;
  upcomingCount: number;
  lastVisitAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  visits: GuestVisit[];
}

export interface WaitlistEntry {
  id: string;
  status: 'waiting' | 'notified' | 'seated' | 'cancelled' | string;
  partySize: number;
  section?: SeatingSection | null;
  requestedDate: string;
  requestedTime: string;
  startsAt: string;
  endsAt: string;
  quotedWaitMinutes: number;
  guestLabel: string;
  contact?: string;
  note?: string;
  createdAt: string;
  updatedAt?: string;
  notifiedAt?: string | null;
  seatedAt?: string | null;
  cancelledAt?: string | null;
  reference?: string | null;
  tableCode?: string | null;
}

export interface OperatorState {
  ok: boolean;
  bookings: Array<ReservationSummary & { tableCode?: string; createdAt?: string }>;
  holds: Array<{ id: string; partySize: number; section: SeatingSection; startsAt: string; expiresAt: string; status: string }>;
  waitlist: WaitlistEntry[];
  profiles: GuestProfile[];
  notifications: Array<{ eventType: string; status: string; adapter: string; preview: Record<string, unknown>; createdAt: string }>;
  error?: string;
}
