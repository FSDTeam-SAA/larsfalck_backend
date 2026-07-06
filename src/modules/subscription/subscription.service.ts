import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { Plan, PlanDocument } from '../plan/schemas/plan.schema';
import { StripeService } from '../../infrastructure/stripe/stripe.service';
import { SubscriptionProducerService } from '../../infrastructure/queue/subscription-producer.service';
import { OrganizationService } from '../organization/organization.service';


@Injectable()
export class SubscriptionService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Plan.name) private readonly planModel: Model<PlanDocument>,
    private readonly stripeService: StripeService,
    private readonly subscriptionProducer: SubscriptionProducerService,
    private readonly configService: ConfigService,
    private readonly orgService: OrganizationService,
  ) {}

  // ─── Create Stripe Checkout session ──────────────────────────────────────

  async createCheckout(userId: string, planId: string) {
    const [user, plan] = await Promise.all([
      this.userModel.findById(userId),
      this.planModel.findById(planId),
    ]);

    if (!user) throw new HttpException('User not found',   HttpStatus.NOT_FOUND);
    if (!plan) throw new HttpException('Plan not found',   HttpStatus.NOT_FOUND);
    if (plan.status !== 'active')
      throw new HttpException('Plan is not available',     HttpStatus.BAD_REQUEST);
    if (!plan.stripePriceId)
      throw new HttpException('Plan not configured in Stripe yet', HttpStatus.BAD_REQUEST);

    const frontendUrl = this.configService.get<string>('app.frontendUrl', 'http://localhost:3000');

    const session = await this.stripeService.createCheckoutSession({
      priceId:    plan.stripePriceId,
      userId:     user._id.toString(),
      userEmail:  user.email,
      planId:     plan._id.toString(),
      mode:       'subscription',
      successUrl: `${frontendUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl:  `${frontendUrl}/subscription/cancel`,
    });

    return {
      message: 'Checkout session created',
      data: { checkoutUrl: session.url, sessionId: session.id },
    };
  }

  // ─── Stripe Webhook handler ───────────────────────────────────────────────

  async handleWebhook(payload: Buffer, signature: string) {
    const webhookSecret = this.configService.get<string>('stripe.webhookSecret')!;

    let event: any;
    try {
      event = this.stripeService.constructWebhookEvent(payload, signature, webhookSecret);
    } catch (err: any) {
      throw new HttpException(`Webhook signature invalid: ${err.message}`, HttpStatus.BAD_REQUEST);
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.onSubscriptionCancelled(event.data.object);
        break;
      default:
        break;
    }

    return { received: true };
  }


private async onCheckoutCompleted(session: any) {
  const { userId, planId, type, businessName, seats, orgId } = session.metadata;

  const [user, plan] = await Promise.all([
    this.userModel.findById(userId),
    this.planModel.findById(planId),
  ]);

  if (!user || !plan) return;

  const stripeSubscription = await this.stripeService.getSubscription(session.subscription);

  const periodStart = stripeSubscription.current_period_start
    ?? stripeSubscription.items?.data?.[0]?.current_period_start;
  const periodEnd   = stripeSubscription.current_period_end
    ?? stripeSubscription.items?.data?.[0]?.current_period_end;

  const startDate = periodStart ? new Date(periodStart * 1000) : new Date();
  const endDate   = periodEnd
    ? new Date(periodEnd * 1000)
    : new Date(Date.now() + (plan.billingCycle === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000);

  // ─── New org subscription ─────────────────────────────────────────────────
  if (type === 'organization') {
    await this.orgService.activateOrgSubscription({
      userId,
      planId,
      businessName,
      seats:                Number(seats),
      startDate:            startDate.toISOString(),
      endDate:              endDate.toISOString(),
      stripeCustomerId:     session.customer,
      stripeSubscriptionId: session.subscription,
      userEmail:            user.email,
      userName:             user.name,
    });
    return;
  }

  // ─── Org upgrade (plan or seats) ──────────────────────────────────────────
  if (type === 'organization_upgrade') {
    await this.orgService.handleOrgUpgrade({
      orgId,
      userId,
      planId,
      seats:                Number(seats),
      startDate:            startDate.toISOString(),
      endDate:              endDate.toISOString(),
      stripeCustomerId:     session.customer,
      stripeSubscriptionId: session.subscription,
      userEmail:            user.email,
      userName:             user.name,
    });
    return;
  }

  // ─── Individual subscription ──────────────────────────────────────────────
  await this.subscriptionProducer.addActivationJob({
    userId,
    planId,
    planName:             plan.name,
    billingCycle:         plan.billingCycle,
    startDate:            startDate.toISOString(),
    endDate:              endDate.toISOString(),
    stripeCustomerId:     session.customer,
    stripeSubscriptionId: session.subscription,
    userEmail:            user.email,
    userName:             user.name,
  });
}


  private async onSubscriptionCancelled(subscription: any) {
    await this.userModel.findOneAndUpdate(
      { 'subscription.stripeSubscriptionId': subscription.id },
      {
        hasActiveSubscription: false,
        'subscription.status': 'cancelled',
      },
    );
  }

  // ─── Cancel subscription ─────────────────────────────────────────────────

  async cancelSubscription(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    if (user.subscription?.status !== 'active')
      throw new HttpException('No active subscription to cancel', HttpStatus.BAD_REQUEST);

    await this.stripeService.cancelSubscription(user.subscription.stripeSubscriptionId);

    await this.userModel.findByIdAndUpdate(userId, {
      hasActiveSubscription: false,
      'subscription.status': 'cancelled',
    });

    return { message: 'Subscription cancelled successfully', data: null };
  }

  // ─── Get current user subscription status ────────────────────────────────

  async getMySubscription(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .populate('subscription.planId', 'name price billingCycle features')
      .select('name email subscription trialEndsAt hasActiveSubscription');

    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const now          = new Date();
    const trialExpired = user.trialEndsAt ? now > user.trialEndsAt : true;

    return {
      message: 'Subscription fetched',
      data: {
        subscription:         user.subscription,
        trialEndsAt:          user.trialEndsAt,
        trialExpired,
        hasActiveSubscription: user.hasActiveSubscription,
      },
    };
  }

  // ─── Schedule the daily expiry check (call on app startup) ───────────────

  async scheduleDailyCheck() {
    await this.subscriptionProducer.scheduleExpiryCheck();
  }
}