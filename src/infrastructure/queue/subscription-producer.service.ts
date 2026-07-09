import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SUBSCRIPTION_QUEUE,
  SUBSCRIPTION_ACTIVATED,
  SUBSCRIPTION_REMINDER,
  SUBSCRIPTION_EXPIRED,
} from './queue.constants';
import { SubscriptionActivatedData } from './subscription.processor';
import { User, UserDocument } from '../../modules/auth/schemas/user.schema';

@Injectable()
export class SubscriptionProducerService {
  private readonly logger = new Logger(SubscriptionProducerService.name);

  constructor(
    @InjectQueue(SUBSCRIPTION_QUEUE) private readonly subscriptionQueue: Queue,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async addActivationJob(data: SubscriptionActivatedData) {
    return this.subscriptionQueue.add(SUBSCRIPTION_ACTIVATED, data, {
      attempts:         3,
      backoff:          { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 5 * 60 },
      removeOnFail:     { age: 60 * 60 },
    });
  }

  // ─── Daily scheduler: runs once a day, checks expiring subscriptions ─────

  async scheduleExpiryCheck() {
    await this.subscriptionQueue.add(
      'daily-expiry-check',
      {},
      {
        repeat:           { pattern: '0 9 * * *' },  // every day at 9am
        removeOnComplete: true,
        removeOnFail:     { age: 86400 },
      },
    );
    this.logger.log('Daily expiry check scheduled at 9am');
  }

  // ─── Called by the scheduler job inside processor ─────────────────────────

  async runExpiryCheck() {
    const now       = new Date();
    const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // find users whose subscription ends within 3 days
    const expiringUsers = await this.userModel
      .find({
        'subscription.status':  'active',
        'subscription.endDate': { $gte: now, $lte: threeDays },
      })
      .populate('subscription.planId', 'name')
      .select('name email subscription');

    for (const user of expiringUsers) {
      const endDate  = new Date(user.subscription.endDate);
      const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const plan     = user.subscription.planId as any;

      await this.subscriptionQueue.add(
        SUBSCRIPTION_REMINDER,
        {
          userId:    user._id.toString(),
          userEmail: user.email,
          userName:  user.name,
          planName:  plan?.name ?? 'Premium',
          endDate:   endDate.toISOString(),
          daysLeft,
        },
        { attempts: 2, removeOnComplete: true },
      );
    }

    // find users whose subscription already expired — mark them
    const expiredUsers = await this.userModel.find({
      'subscription.status':  'active',
      'subscription.endDate': { $lt: now },
    });

    for (const user of expiredUsers) {
      await this.subscriptionQueue.add(
        SUBSCRIPTION_EXPIRED,
        { userId: user._id.toString() },
        { attempts: 3, removeOnComplete: true },
      );
    }

    this.logger.log(
      `Expiry check: ${expiringUsers.length} reminders, ${expiredUsers.length} expired`,
    );
  }
}