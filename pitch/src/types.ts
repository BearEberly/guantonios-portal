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

export interface OperatorState {
  ok: boolean;
  bookings: Array<ReservationSummary & { tableCode?: string; createdAt?: string }>;
  holds: Array<{ id: string; partySize: number; section: SeatingSection; startsAt: string; expiresAt: string; status: string }>;
  notifications: Array<{ eventType: string; status: string; adapter: string; preview: Record<string, unknown>; createdAt: string }>;
  error?: string;
}
