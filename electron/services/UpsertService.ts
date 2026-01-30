import Database from 'better-sqlite3';
import { Job } from '../../src/shared/types/Job';
import { JobRepository } from '../repositories/JobRepository';

export class UpsertService {
    private jobRepo: JobRepository;

    constructor(private db: Database.Database) {
        this.jobRepo = new JobRepository(db);
    }

    /**
     * Safe Upsert: 既存の求人と比較して更新の必要性を判定
     * @returns true if new job, false if updated existing job
     */
    upsert(job: Job): boolean {
        const existing = this.jobRepo.getById(job.id);

        if (!existing) {
            // 新規求人
            this.jobRepo.insert(job);
            return true;
        }

        // 既存求人の更新判定
        const needsUpdate = this.checkNeedsUpdate(existing, job);

        if (needsUpdate) {
            this.jobRepo.update(job);
        } else {
            // 更新不要でもlast_checked_atは更新
            this.jobRepo.updateLastChecked(job.id, new Date().toISOString());
        }

        return false;
    }

    /**
     * 重要フィールドの変更をチェック
     */
    private checkNeedsUpdate(existing: Job, newJob: Job): boolean {
        return (
            existing.title !== newJob.title ||
            existing.salaryMin !== newJob.salaryMin ||
            existing.salaryMax !== newJob.salaryMax ||
            existing.salaryText !== newJob.salaryText ||
            existing.description !== newJob.description ||
            existing.dateExpires !== newJob.dateExpires ||
            existing.isActive !== newJob.isActive ||
            existing.employmentType !== newJob.employmentType ||
            existing.locationSummary !== newJob.locationSummary
        );
    }

    /**
     * バッチUpsert: 複数の求人を一括処理
     */
    batchUpsert(jobs: Job[]): { newCount: number; updatedCount: number } {
        let newCount = 0;
        let updatedCount = 0;

        // トランザクション開始
        const transaction = this.db.transaction(() => {
            for (const job of jobs) {
                const isNew = this.upsert(job);
                if (isNew) {
                    newCount++;
                } else {
                    updatedCount++;
                }
            }
        });

        transaction();

        return { newCount, updatedCount };
    }
}
