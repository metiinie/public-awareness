export type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';
export type ReportStatus = 'PENDING' | 'VERIFIED' | 'SOLVED' | 'ARCHIVED' | 'REJECTED';
export type MediaType = 'IMAGE' | 'VIDEO';
export type ReactionType = 'REAL' | 'FAKE';

export interface User {
    id: number;
    email: string;
    fullName: string;
    role: UserRole;
    trustScore: number;
    createdAt: string;
    updatedAt: string;
}

export interface Category {
    id: number;
    name: string;
    icon?: string;
}

export interface City {
    id: number;
    name: string;
}

export interface Area {
    id: number;
    name: string;
    cityId: number;
}

export interface Media {
    id: number;
    reportId: number;
    url: string;
    type: MediaType;
}

export interface Report {
    id: number;
    title: string;
    description: string;
    status: ReportStatus;
    reporterId: number;
    categoryId: number;
    cityId: number;
    areaId: number;
    trustScore: number;
    createdAt: string;
    autoArchiveAt?: string;

    // Joined fields
    reporter?: Partial<User>;
    category?: Category;
    city?: City;
    area?: Area;
    media?: Media[];
}

export interface CreateReportDto {
    title: string;
    description: string;
    categoryId: number;
    cityId: number;
    areaId: number;
    mediaUrls: string[];
}

export interface FilterReportDto {
    categoryId?: number;
    cityId?: number;
    areaId?: number;
    status?: ReportStatus;
}
