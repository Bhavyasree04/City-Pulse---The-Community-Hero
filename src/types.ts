export type UserRole = 'citizen' | 'volunteer' | 'authority';

export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;
  phone?: string;
  // Location info (specifically for Volunteers and Authorities)
  country?: string;
  state?: string;
  district?: string;
  area?: string;
  createdAt: string;
}

export type ComplaintStatus = 
  | 'Reported' 
  | 'Volunteer Verification In Progress' 
  | 'Authority Verified' 
  | 'Repair In Progress' 
  | 'Work Done - Volunteer Confirmed'
  | 'Resolved'
  | 'Rejected';

export interface LocationCoordinates {
  lat: number;
  lng: number;
}

export interface Complaint {
  id: string; // COMP-YYYY-XXXXXX
  issueType: string;
  customIssueType?: string;
  description: string;
  severity: 'Low' | 'Medium' | 'Critical';
  userSeverity: 'Low' | 'Medium' | 'Critical'; // citizen can manually override
  aiSeverity: 'Low' | 'Medium' | 'Critical';
  aiSummary?: string;
  recommendedDepartment?: string;
  images: string[]; // URLs or base64 data strings
  coordinates: LocationCoordinates;
  address: string;
  landmark: string;
  citizenName: string;
  citizenEmail: string;
  citizenUid: string;
  createdAt: string; // ISO string
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  status: ComplaintStatus;
  
  // Volunteer section
  assignedVolunteerId?: string;
  assignedVolunteerName?: string;
  volunteerVerificationDate?: string;
  volunteerNotes?: string;
  volunteerImages?: string[];
  isGenuine?: boolean;

  // Authority section
  authorityNotes?: string;
  authorityApprovalDate?: string;
  rejectionReason?: string;
  assignedDepartment?: string;
  assignedWorkers?: string;
  assignedWorkersPhone?: string;
  expectedCompletionDate?: string;
  repairStatusUpdates?: {
    date: string;
    note: string;
    status: string;
  }[];
  completionNotes?: string;
  completionImages?: string[];
  resolvedAt?: string;
  likesCount?: number;
  likedBy?: string[];
}

export interface FeedbackSubmission {
  id: string;
  type: 'Feedback' | 'Suggestion' | 'Appreciation';
  content: string;
  citizenName: string;
  citizenEmail: string;
  createdAt: string;
}
