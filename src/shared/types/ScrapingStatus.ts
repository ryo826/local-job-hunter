// shared/types/ScrapingStatus.ts
export interface ScrapingStatus {
    site: 'doda' | 'rikunabi' | 'mynavi';
    status: 'idle' | 'running' | 'success' | 'error';
    progress: number;                // 0-100
    totalJobs: number;
    newJobs: number;
    updatedJobs: number;
    errors: number;
    lastRun?: Date;
    message?: string;
}
