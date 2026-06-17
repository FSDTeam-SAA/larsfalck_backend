import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job } from 'bullmq';
import { SONG_QUEUE, SONG_UPLOAD_JOB } from './queue.constants';
import { Song, SongDocument } from '../../modules/song/schemas/song.schema';
import { S3Service } from '../s3/s3.service';
import { extractAudioDuration } from '../../common/utils/audio.util';
import * as fs from 'fs';

export interface SongUploadJobData {
  filePath:      string;
  originalName:  string;
  artists:       string[];
  albums:        string[];
  genres:        string[];
  tags:          string[];
  sharedCoverUrl:  string;
  sharedCoverKey:  string;
  status:        string;
}

@Processor(SONG_QUEUE, {
  concurrency: 5,   // process 5 songs simultaneously
})

export class SongProcessor extends WorkerHost {
  private readonly logger = new Logger(SongProcessor.name);

  constructor(
    @InjectModel(Song.name) private readonly songModel: Model<SongDocument>,
    private readonly s3Service: S3Service,
  ) {
    super();
  }

  async process(job: Job<SongUploadJobData>): Promise<any> {
    const { filePath, originalName, artists, albums, genres, tags,
            sharedCoverUrl, sharedCoverKey, status } = job.data;

    this.logger.log(`Processing song: ${originalName} [Job ${job.id}]`);

    try {
      // Step 1 — extract duration (file still on disk)
      await job.updateProgress(10);
      const duration = await extractAudioDuration(filePath);

      // Step 2 — upload audio to S3
      await job.updateProgress(30);
      const audio = await this.s3Service.upload(filePath, 'songs/audio');

      // Step 3 — save to DB
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

      // clean up temp file if S3 upload failed
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }

      throw error;   // BullMQ will retry based on job options
    }
  }
}