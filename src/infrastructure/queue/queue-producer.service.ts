import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SONG_QUEUE, SONG_UPLOAD_JOB } from './queue.constants';
import { SongUploadJobData } from './song.processor';


@Injectable()
export class QueueProducerService {
  private readonly logger = new Logger(QueueProducerService.name);

  constructor(
    @InjectQueue(SONG_QUEUE) private readonly songQueue: Queue,
  ) {}

  async addSongUploadJob(data: SongUploadJobData) {
    const job = await this.songQueue.add(SONG_UPLOAD_JOB, data, {
      attempts:    3,                         // retry 3 times on failure
      backoff:     { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 100 },       // keep last 100 completed jobs
      removeOnFail:     { count: 50  },       // keep last 50 failed jobs
    });

    this.logger.log(`Job queued: ${data.originalName} [Job ${job.id}]`);
    return job;
  }

  async getJobStatus(jobId: string) {
    const job = await this.songQueue.getJob(jobId);
    if (!job) return null;

    const state    = await job.getState();
    const progress = job.progress;
    const result   = job.returnvalue;
    const reason   = job.failedReason;

    return { jobId, state, progress, result, failedReason: reason };
  }

  async getQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.songQueue.getWaitingCount(),
      this.songQueue.getActiveCount(),
      this.songQueue.getCompletedCount(),
      this.songQueue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }
}