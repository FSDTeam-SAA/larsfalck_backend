import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job } from 'bullmq';
import Redis from 'ioredis';
import { SONG_QUEUE, SONG_UPLOAD_JOB, PLAY_COUNT_SYNC_JOB } from './queue.constants';
import { Song, SongDocument } from '../../modules/song/schemas/song.schema';
import { S3Service } from '../s3/s3.service';
import { extractAudioDuration } from '../../common/utils/audio.util';
import * as fs from 'fs';

export interface SongUploadJobData {
  filePath:       string;
  originalName:   string;
  artists:        string[];
  albums:         string[];
  genres:         string[];
  tags:           string[];
  sharedCoverUrl: string;
  sharedCoverKey: string;
  status:         string;
}

@Processor(SONG_QUEUE, { concurrency: 5 })
export class SongProcessor extends WorkerHost {
  private readonly logger = new Logger(SongProcessor.name);

  constructor(
    @InjectModel(Song.name) private readonly songModel: Model<SongDocument>,
    private readonly s3Service: S3Service,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    switch (job.name) {
      case SONG_UPLOAD_JOB:
        return this.handleSongUpload(job);
      case PLAY_COUNT_SYNC_JOB:
        return this.handlePlayCountSync();
      default:
        this.logger.warn(`Unknown job: ${job.name}`);
    }
  }

  // ─── Song Upload ──────────────────────────────────────────────────────────

  private async handleSongUpload(job: Job<SongUploadJobData>): Promise<any> {
    const {
      filePath, originalName, artists, albums,
      genres, tags, sharedCoverUrl, sharedCoverKey, status,
    } = job.data;

    this.logger.log(`Processing song: ${originalName} [Job ${job.id}]`);

    try {
      await job.updateProgress(10);
      const duration = await extractAudioDuration(filePath);

      await job.updateProgress(30);
      const audio = await this.s3Service.upload(filePath, 'songs/audio');

      await job.updateProgress(80);
      const name = originalName.replace(/\.[^.]+$/, '');

      const song = await this.songModel.create({
        name,
        artists,
        albums,
        genres,
        tags,
        audioFile:     audio.url,
        audioKey:      audio.key,
        coverImage:    sharedCoverUrl,
        coverImageKey: sharedCoverKey,
        duration,
        status,
      });

      await job.updateProgress(100);
      this.logger.log(`Done: ${originalName} [Job ${job.id}]`);

      return { songId: song._id.toString(), name };

    } catch (error) {
      this.logger.error(`Failed: ${originalName} [Job ${job.id}]`, error);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
      throw error;
    }
  }

  // ─── Play Count Sync ──────────────────────────────────────────────────────
  // Runs every 5 mins — reads all play:* keys from Redis, writes to MongoDB

  private async handlePlayCountSync(): Promise<any> {
    const keys = await this.redis.keys('play:*');

    if (!keys.length) {
      this.logger.log('Play count sync: nothing to sync');
      return { synced: 0 };
    }

    // get and delete all keys atomically
    const pipeline = this.redis.pipeline();
    keys.forEach((key) => pipeline.getdel(key));
    const results = await pipeline.exec();

    // build MongoDB bulk write operations
    const bulkOps = keys.map((key, i) => {
      const songId = key.replace('play:', '');
      const count  = parseInt((results?.[i]?.[1] as string) ?? '0', 10);
      return {
        updateOne: {
          filter: { _id: songId },
          update: { $inc: { playCount: count } },
        },
      };
    });

    if (bulkOps.length) {
      await this.songModel.bulkWrite(bulkOps);
      this.logger.log(`Play count sync: ${bulkOps.length} songs updated`);
    }

    return { synced: bulkOps.length };
  }
}