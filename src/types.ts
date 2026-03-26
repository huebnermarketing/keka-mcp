/**
 * TypeScript interfaces for Keka API responses and shared types.
 */

// ---------------------------------------------------------------------------
// Shared / Pagination
// ---------------------------------------------------------------------------

export interface KekaPaginatedResponse<T> {
  succeeded: boolean;
  message: string;
  errors: string[];
  data: T[];
  pageNumber: number;
  pageSize: number;
  totalPages: number;
  totalRecords: number;
  nextPage: string | null;
  previousPage: string | null;
}

export interface KekaSimpleResponse<T> {
  succeeded: boolean;
  message: string;
  errors: string[];
  data: T;
}

export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

// ---------------------------------------------------------------------------
// HRIS
// ---------------------------------------------------------------------------

export interface KekaEmployee {
  id: string;
  employeeNumber: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string;
  workEmail?: string;
  department?: { id: string; name: string };
  jobTitle?: { id: string; name: string };
  employmentStatus?: string;
  dateOfJoining?: string;
  dateOfBirth?: string;
  gender?: string;
  mobileNumber?: string;
  reportingManager?: { id: string; displayName: string; email: string };
  location?: { id: string; name: string };
  isInProbation?: boolean;
  isInNoticePeriod?: boolean;
}

export interface KekaDepartment {
  id: string;
  name: string;
  parentId?: string;
  parentName?: string;
  leaderId?: string;
  leaderName?: string;
}

export interface KekaJobTitle {
  id: string;
  name: string;
}

export interface KekaGroup {
  id: string;
  name: string;
  type?: string;
}

// ---------------------------------------------------------------------------
// Leave
// ---------------------------------------------------------------------------

export interface KekaLeaveType {
  id: string;
  name: string;
  code?: string;
  isPaid?: boolean;
}

export interface KekaLeaveRequest {
  id: string;
  employeeIdentifier: string;
  employeeNumber?: string;
  leaveTypeId?: string;
  fromDate: string;
  toDate: string;
  fromSession?: number;  // 0 = first half, 1 = second half
  toSession?: number;
  note?: string;
  status?: number;       // numeric status code from API
  requestedOn?: string;
}

export interface KekaLeaveBalance {
  employeeId: string;
  employeeName?: string;
  leaveTypeId: string;
  leaveTypeName?: string;
  openingBalance: number;
  earned: number;
  taken: number;
  pending: number;
  closing: number;
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export interface KekaAttendancePunch {
  timestamp: string;       // ISO 8601 UTC, e.g. "2026-03-23T05:43:57Z"
  punchStatus: number;     // 0 = in, 1 = out
  premiseName?: string;    // may have a leading space — always trim before display
}

export interface KekaAttendanceRecord {
  employeeNumber: string;                     // e.g. "RIQ168"
  attendanceDate: string;                     // ISO 8601 UTC date, e.g. "2026-03-23T00:00:00Z"
  totalGrossHours?: number;                   // decimal hours, e.g. 10.4 → "10h 24m"
  totalEffectiveOvertimeDuration?: number;    // decimal hours; 0 means no OT
  firstInOfTheDay?: KekaAttendancePunch | null;
  lastOutOfTheDay?: KekaAttendancePunch | null;
}

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

export interface KekaPayGroup {
  id: string;
  name: string;
  description?: string;
}

export interface KekaPayBand {
  id: string;
  name: string;
  minAmount?: number;
  maxAmount?: number;
  currency?: string;
}

export interface KekaSalary {
  employeeId: string;
  employeeName?: string;
  employeeNumber?: string;
  payGroupId?: string;
  payGroupName?: string;
  ctc?: number;
  currency?: string;
  effectiveDate?: string;
}

// ---------------------------------------------------------------------------
// Recruitment (Hire)
// ---------------------------------------------------------------------------

export interface KekaJob {
  id: string;
  title: string;
  department?: string;
  location?: string;
  status?: string;
  openings?: number;
  postedDate?: string;
  closingDate?: string;
  hiringManagerId?: string;
  hiringManagerName?: string;
}

export interface KekaCandidate {
  id: string;
  firstName: string;
  lastName?: string;
  middleName?: string;
  gender?: number;
  email?: string;
  mobilePhone?: { countryCode?: string; number?: string };
  educationDetails?: unknown[];
  experienceDetails?: unknown[];
  skills?: unknown[];
}

// ---------------------------------------------------------------------------
// PSA
// ---------------------------------------------------------------------------

export interface KekaPsaClient {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  status?: string;
  createdOn?: string;
}

export interface KekaPsaProject {
  id: string;
  name: string;
  clientId?: string;
  clientName?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  currency?: string;
  projectManagerId?: string;
  projectManagerName?: string;
}
