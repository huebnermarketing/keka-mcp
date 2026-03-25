/**
 * TypeScript interfaces for Keka API responses and shared types.
 */
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
export declare enum ResponseFormat {
    MARKDOWN = "markdown",
    JSON = "json"
}
export interface KekaEmployee {
    id: string;
    employeeNumber: string;
    displayName: string;
    firstName: string;
    lastName: string;
    email: string;
    workEmail?: string;
    department?: {
        id: string;
        name: string;
    };
    jobTitle?: {
        id: string;
        name: string;
    };
    employmentStatus?: string;
    dateOfJoining?: string;
    dateOfBirth?: string;
    gender?: string;
    mobileNumber?: string;
    reportingManager?: {
        id: string;
        displayName: string;
        email: string;
    };
    location?: {
        id: string;
        name: string;
    };
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
export interface KekaLeaveType {
    id: string;
    name: string;
    code?: string;
    isPaid?: boolean;
}
export interface KekaLeaveRequest {
    id: string;
    employeeId: string;
    employeeName?: string;
    leaveType?: {
        id: string;
        name: string;
    };
    fromDate: string;
    toDate: string;
    numberOfDays: number;
    reason?: string;
    status?: string;
    requestedOn?: string;
    approvedBy?: string;
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
export interface KekaAttendanceRecord {
    employeeId: string;
    employeeName?: string;
    date: string;
    clockIn?: string;
    clockOut?: string;
    totalHours?: number;
    status?: string;
    shift?: string;
    isHoliday?: boolean;
    isWeekOff?: boolean;
}
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
export interface KekaExpense {
    id: string;
    employeeId: string;
    title?: string;
    amount: number;
    currency?: string;
    category?: string;
    date?: string;
    status?: string;
    description?: string;
}
export interface KekaExpenseClaim {
    id: string;
    employeeId: string;
    employeeName?: string;
    title?: string;
    totalAmount?: number;
    currency?: string;
    status?: string;
    submittedOn?: string;
    approvedBy?: string;
}
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
    name: string;
    email?: string;
    phone?: string;
    currentStage?: string;
    appliedDate?: string;
    source?: string;
    status?: string;
}
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
//# sourceMappingURL=types.d.ts.map