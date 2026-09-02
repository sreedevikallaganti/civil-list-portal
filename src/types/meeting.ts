export interface Meeting {
  id: string;

  officer_type: string;
  officer_name: string;
  officer_id: string;
  designation: string;

  meeting_date: string;
  meeting_time: string;

  agenda?: string;
  scheduled?: boolean;
  attendees?: string;

  created?: string;
  updated?: string;
}

export interface MeetingStats {
  totalMeetings: number;
  iasCount: number;
  ipsCount: number;
  otherCount: number;
  todayMeetings: number;
  upcomingMeetings: number;
}

export interface FilterOptions {
  type?: string;
  search?: string;
  sortBy?: "date" | "name" | "type";
  sortOrder?: "asc" | "desc";
}