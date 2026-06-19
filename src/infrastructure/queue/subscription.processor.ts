import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Model } from 'mongoose';
import { Job, Queue } from 'bullmq';
import {
  SUBSCRIPTION_QUEUE, SUBSCRIPTION_ACTIVATED,
  SUBSCRIPTION_REMINDER, SUBSCRIPTION_EXPIRED,
} from './queue.constants';
import { User, UserDocument } from '../../modules/auth/schemas/user.schema';
import { EmailService } from '../email/email.service';

export interface SubscriptionActivatedData {
  userId:               string;
  planId:               string;
  planName:             string;
  billingCycle:         string;
  startDate:            string;
  endDate:              string;
  stripeCustomerId:     string;
  stripeSubscriptionId: string;
  userEmail:            string;
  userName:             string;
}

export interface SubscriptionReminderData {
  userId:    string;
  userEmail: string;
  userName:  string;
  planName:  string;
  endDate:   string;
  daysLeft:  number;
}

@Processor(SUBSCRIPTION_QUEUE, { concurrency: 3 })
export class SubscriptionProcessor extends WorkerHost {
  private readonly logger = new Logger(SubscriptionProcessor.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectQueue(SUBSCRIPTION_QUEUE) private readonly queue: Queue,
    private readonly emailService: EmailService,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    this.logger.log(`Processing: ${job.name} [${job.id}]`);

    switch (job.name) {
      case SUBSCRIPTION_ACTIVATED:    return this.handleActivated(job.data);
      case SUBSCRIPTION_REMINDER:     return this.handleReminder(job.data);
      case SUBSCRIPTION_EXPIRED:      return this.handleExpired(job.data);
      case 'daily-expiry-check':      return this.runExpiryCheck();
      default: this.logger.warn(`Unknown job: ${job.name}`);
    }
  }

  private async handleActivated(data: SubscriptionActivatedData) {
    await this.userModel.findByIdAndUpdate(data.userId, {
      hasActiveSubscription:               true,
      'subscription.planId':               data.planId,
      'subscription.startDate':            new Date(data.startDate),
      'subscription.endDate':              new Date(data.endDate),
      'subscription.stripeCustomerId':     data.stripeCustomerId,
      'subscription.stripeSubscriptionId': data.stripeSubscriptionId,
      'subscription.status':               'active',
    });

    await this.emailService.sendEmail({
      to:      data.userEmail,
      subject: 'Subscription Activated 🎵',
      html:    this.activationTemplate(data),
    });

    this.logger.log(`Activated: ${data.userId}`);
    return { success: true };
  }

  private async handleReminder(data: SubscriptionReminderData) {
    await this.emailService.sendEmail({
      to:      data.userEmail,
      subject: `Your subscription expires in ${data.daysLeft} day(s) ⚠️`,
      html:    this.reminderTemplate(data),
    });
    this.logger.log(`Reminder sent: ${data.userEmail}`);
    return { success: true };
  }

  private async handleExpired(data: { userId: string }) {
    await this.userModel.findByIdAndUpdate(data.userId, {
      hasActiveSubscription: false,
      'subscription.status': 'expired',
    });
    this.logger.log(`Expired: ${data.userId}`);
    return { success: true };
  }

  private async runExpiryCheck() {
    const now       = new Date();
    const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const expiringUsers = await this.userModel
      .find({
        'subscription.status':  'active',
        'subscription.endDate': { $gte: now, $lte: threeDays },
      })
      .populate('subscription.planId', 'name')
      .select('name email subscription');

    for (const user of expiringUsers) {
      const endDate  = new Date(user.subscription.endDate);
      const daysLeft = Math.ceil(
        (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      const plan = user.subscription.planId as any;

      await this.queue.add(SUBSCRIPTION_REMINDER, {
        userId:    user._id.toString(),
        userEmail: user.email,
        userName:  user.name,
        planName:  plan?.name ?? 'Premium',
        endDate:   endDate.toISOString(),
        daysLeft,
      }, { attempts: 2, removeOnComplete: true });
    }

    const expiredUsers = await this.userModel.find({
      'subscription.status':  'active',
      'subscription.endDate': { $lt: now },
    });

    for (const user of expiredUsers) {
      await this.queue.add(SUBSCRIPTION_EXPIRED,
        { userId: user._id.toString() },
        { attempts: 3, removeOnComplete: true },
      );
    }

    this.logger.log(
      `Expiry check done: ${expiringUsers.length} reminders, ${expiredUsers.length} expired`,
    );
    return { success: true };
  }

  private activationTemplate(data: SubscriptionActivatedData): string {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <style>
      body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0}
      .container{max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden}
      .header{background:#16a34a;padding:24px;text-align:center}
      .header h1{color:#fff;margin:0;font-size:24px}
      .body{padding:32px}.badge{display:inline-block;background:#dcfce7;color:#16a34a;padding:8px 20px;border-radius:20px;font-weight:bold}
      .detail{margin:8px 0;font-size:15px;color:#374151}
      .footer{text-align:center;padding:16px;font-size:12px;color:#9ca3af}
    </style></head>
    <body><div class="container">
      <div class="header"><h1>🎵 Subscription Activated!</h1></div>
      <div class="body">
        <p>Hi <strong>${data.userName}</strong>,</p>
        <p>Your subscription is now active. Enjoy unlimited access!</p>
        <div class="badge">${data.planName} — ${data.billingCycle}</div><br/><br/>
        <p class="detail">📅 Start: <strong>${new Date(data.startDate).toDateString()}</strong></p>
        <p class="detail">📅 End:   <strong>${new Date(data.endDate).toDateString()}</strong></p>
        <p>You now have access to: <strong>Favorites, Saved Albums, and Playlists</strong></p>
      </div>
      <div class="footer">© ${new Date().getFullYear()} LarsFalck. All rights reserved.</div>
    </div></body></html>`;
  }

  private reminderTemplate(data: SubscriptionReminderData): string {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <style>
      body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0}
      .container{max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden}
      .header{background:#f59e0b;padding:24px;text-align:center}
      .header h1{color:#fff;margin:0;font-size:24px}
      .body{padding:32px}
      .btn{display:inline-block;background:#16a34a;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:bold;margin-top:16px}
      .footer{text-align:center;padding:16px;font-size:12px;color:#9ca3af}
    </style></head>
    <body><div class="container">
      <div class="header"><h1>⚠️ Subscription Expiring Soon</h1></div>
      <div class="body">
        <p>Hi <strong>${data.userName}</strong>,</p>
        <p>Your <strong>${data.planName}</strong> expires in <strong>${data.daysLeft} day(s)</strong> on <strong>${new Date(data.endDate).toDateString()}</strong>.</p>
        <p>Renew now to keep your access.</p>
        <a href="${process.env.FRONTEND_URL}/pricing" class="btn">Renew Subscription</a>
      </div>
      <div class="footer">© ${new Date().getFullYear()} LarsFalck. All rights reserved.</div>
    </div></body></html>`;
  }
}