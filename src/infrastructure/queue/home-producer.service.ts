import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { HOME_QUEUE, TRENDING_COMPUTE_JOB } from './queue.constants';

@Injectable()
export class HomeProducerService {
  private readonly logger = new Logger(HomeProducerService.name);

  constructor(
    @InjectQueue(HOME_QUEUE) private readonly homeQueue: Queue,
  ) {}

  async scheduleTrendingCompute() {
    await this.homeQueue.add(
      TRENDING_COMPUTE_JOB,
      {},
      {
        repeat:           { every: 2 * 60 * 60 * 1000 },  // every 2 hours
        removeOnComplete: true,
        removeOnFail:     { age: 86400 },
      },
    );
    this.logger.log('Trending compute scheduled every 2 hours');
  }

  async triggerNow() {
    return this.homeQueue.add(
      TRENDING_COMPUTE_JOB,
      {},
      { removeOnComplete: true },
    );
  }
}