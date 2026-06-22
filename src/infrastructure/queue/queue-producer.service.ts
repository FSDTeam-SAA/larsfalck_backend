import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PLAY_COUNT_SYNC_JOB, SONG_QUEUE, SONG_UPLOAD_JOB } from './queue.constants';
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
      removeOnComplete: { age: 3600 },       // keep last 1 hour
      removeOnFail:     { age: 86400 },      // keep last 24 hours
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

  async schedulePlayCountSync() {
    await this.songQueue.add(
      PLAY_COUNT_SYNC_JOB,
      {},
      {
        repeat:           { every: 5 * 60 * 1000 },  // every 5 minutes
        removeOnComplete: true,
        removeOnFail:     { age: 3600 },
      },
    );
    this.logger.log('Play count sync scheduled every 5 minutes');
  }
}