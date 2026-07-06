import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Organization, OrganizationDocument } from './schemas/organization.schema';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { Plan, PlanDocument } from '../plan/schemas/plan.schema';
import { StripeService } from '../../infrastructure/stripe/stripe.service';
import { ConfigService } from '@nestjs/config';
import { createMeta, createPaginationInfo } from '../../common/utils/pagination.util';
import * as crypto from 'crypto';
import { EmailService } from '../../infrastructure/email/email.service';

@Injectable()
export class OrganizationService {
    constructor(
    @InjectModel(Organization.name) private readonly orgModel:    Model<OrganizationDocument>,
    @InjectModel(User.name)         private readonly userModel:   Model<UserDocument>,
    @InjectModel(Plan.name)         private readonly planModel:   Model<PlanDocument>,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
    private readonly emailService:  EmailService,
    ) {}

  // ─── Generate unique org code ─────────────────────────────────────────────

  private generateOrgCode(): string {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  // ─── Owner buys org subscription ─────────────────────────────────────────

  async createOrgCheckout(userId: string, dto: {
    planId:       string;
    businessName: string;
    seats:        number;
  }) {
    const [user, plan] = await Promise.all([
      this.userModel.findById(userId),
      this.planModel.findById(dto.planId),
    ]);

    if (!user) throw new HttpException('User not found',   HttpStatus.NOT_FOUND);
    if (!plan) throw new HttpException('Plan not found',   HttpStatus.NOT_FOUND);
    if (plan.planType !== 'organization')
      throw new HttpException('This plan is not an organization plan', HttpStatus.BAD_REQUEST);
    if (plan.status !== 'active')
      throw new HttpException('Plan is not available',     HttpStatus.BAD_REQUEST);
    if (!plan.stripePriceId)
      throw new HttpException('Plan not configured in Stripe', HttpStatus.BAD_REQUEST);
    if (dto.seats < 1)
      throw new HttpException('Minimum 1 seat required',   HttpStatus.BAD_REQUEST);

    const frontendUrl = this.configService.get<string>('app.frontendUrl', 'http://localhost:3000');

    // total price = pricePerSeat * seats
    // we pass quantity = seats to Stripe so it multiplies automatically
    const session = await this.stripeService.createCheckoutSession({
      priceId:    plan.stripePriceId,
      userId:     user._id.toString(),
      userEmail:  user.email,
      planId:     plan._id.toString(),
      mode:       'subscription',
      successUrl: `${frontendUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl:  `${frontendUrl}/pricing`,
      quantity:   dto.seats,
      metadata: {
        userId:       user._id.toString(),
        planId:       plan._id.toString(),
        businessName: dto.businessName,
        seats:        String(dto.seats),
        type:         'organization',
      },
    });

    return {
      message: 'Organization checkout session created',
      data:    { checkoutUrl: session.url, sessionId: session.id },
    };
  }

  // ─── Called after Stripe webhook — activate org subscription ─────────────

    async activateOrgSubscription(data: {
    userId:               string;
    planId:               string;
    businessName:         string;
    seats:                number;
    startDate:            string;
    endDate:              string;
    stripeCustomerId:     string;
    stripeSubscriptionId: string;
    userEmail:            string;
    userName:             string;
    }) {
    // generate unique org code
    let orgCode = this.generateOrgCode();
    let exists  = await this.orgModel.findOne({ orgCode });
    while (exists) {
        orgCode = this.generateOrgCode();
        exists  = await this.orgModel.findOne({ orgCode });
    }

    const plan = await this.planModel.findById(data.planId).select('name billingCycle');

    // create organization
    const org = await this.orgModel.create({
        name:     data.businessName,
        ownerId:  new Types.ObjectId(data.userId),   // ← cast to ObjectId
        orgCode,
        maxSeats:  data.seats,
        usedSeats: 1,
        subscription: {
        planId:               data.planId,
        startDate:            new Date(data.startDate),
        endDate:              new Date(data.endDate),
        stripeCustomerId:     data.stripeCustomerId,
        stripeSubscriptionId: data.stripeSubscriptionId,
        status:               'active',
        },
    });

    // update owner — subscription + org info
    await this.userModel.findByIdAndUpdate(data.userId, {
        orgId:                 org._id,
        orgRole:               'owner',
        hasActiveSubscription: true,
        'subscription.planId':               data.planId,
        'subscription.startDate':            new Date(data.startDate),
        'subscription.endDate':              new Date(data.endDate),
        'subscription.stripeCustomerId':     data.stripeCustomerId,
        'subscription.stripeSubscriptionId': data.stripeSubscriptionId,
        'subscription.status':               'active',
    });

    // send org activation email
    await this.emailService.sendEmail({
        to:      data.userEmail,
        subject: 'Organization Subscription Activated 🎵',
        html:    this.orgActivationTemplate({
        userName:     data.userName,
        businessName: data.businessName,
        orgCode,
        seats:        data.seats,
        planName:     plan?.name ?? 'Organization Plan',
        billingCycle: plan?.billingCycle ?? 'monthly',
        startDate:    data.startDate,
        endDate:      data.endDate,
        }),
    });

    return org;
    }

  // ─── Worker joins org via code ────────────────────────────────────────────

  async joinOrganization(dto: {
    orgCode:          string;
    name:             string;
    email:            string;
    password:         string;
    preferredGenres?: string[];
  }) {
    const org = await this.orgModel.findOne({ orgCode: dto.orgCode.toUpperCase() });
    if (!org)
      throw new HttpException('Invalid organization code', HttpStatus.NOT_FOUND);

    if (org.status !== 'active')
      throw new HttpException('This organization is not active', HttpStatus.BAD_REQUEST);

    if (org.subscription.status !== 'active')
      throw new HttpException(
        'Organization subscription has expired. Contact your admin.',
        HttpStatus.FORBIDDEN,
      );

    if (org.usedSeats >= org.maxSeats)
      throw new HttpException(
        `No seats available. This organization has used all ${org.maxSeats} seat(s).`,
        HttpStatus.FORBIDDEN,
      );

    const existing = await this.userModel.findOne({ email: dto.email });
    if (existing)
      throw new HttpException('Email already registered', HttpStatus.CONFLICT);

    // create worker account
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const worker = await this.userModel.create({
      name:             dto.name,
      email:            dto.email,
      password:         dto.password,
      orgId:            org._id,
      orgRole:          'worker',
      preferredGenres:  dto.preferredGenres ?? [],
      hasActiveSubscription: true,   // inherits from org
      trialEndsAt,
      subscription: {
        planId:    org.subscription.planId,
        startDate: org.subscription.startDate,
        endDate:   org.subscription.endDate,
        status:    'active',
      },
    });

    // increment used seats
    await this.orgModel.findByIdAndUpdate(org._id, {
      $inc: { usedSeats: 1 },
    });


    // send welcome email to worker
    await this.emailService.sendEmail({
    to:      dto.email,
    subject: `Welcome to ${org.name} 🎵`,
    html:    this.workerWelcomeTemplate({
        workerName:   dto.name,
        businessName: org.name,
        endDate:      org.subscription.endDate.toISOString(),
    }),
    });


    return {
      message: 'Successfully joined organization',
      data: {
        _id:     worker._id,
        name:    worker.name,
        email:   worker.email,
        orgId:   org._id,
        orgName: org.name,
        orgRole: 'worker',
      },
    };
  }

  // ─── Get org info (owner only) ────────────────────────────────────────────

    async getMyOrg(userId: string) {
    const org = await this.orgModel
        .findOne({ ownerId: new Types.ObjectId(userId) }) 
        .populate('subscription.planId', 'name price billingCycle')
        .lean();

    if (!org) throw new HttpException('No organization found', HttpStatus.NOT_FOUND);

    const workers = await this.userModel
        .find({ orgId: org._id, orgRole: 'worker' })
        .select('name email createdAt hasActiveSubscription')
        .lean();

    return {
        message: 'Organization fetched successfully',
        data: {
        org,
        workers,
        seatInfo: {
            maxSeats:       org.maxSeats,
            usedSeats:      org.usedSeats,
            availableSeats: org.maxSeats - org.usedSeats,
        },
        },
    };
    }

  // ─── Admin: get all organizations ────────────────────────────────────────

  async getAllOrgs(query: { page?: string; limit?: string; search?: string }): Promise<any> {
    const page  = Number(query.page  || 1);
    const limit = Number(query.limit || 10);
    const filter: any = {};

    if (query.search) {
      filter.$or = [
        { name:    { $regex: query.search, $options: 'i' } },
        { orgCode: { $regex: query.search, $options: 'i' } },
      ];
    }

    const total = await this.orgModel.countDocuments(filter);
    const orgs  = await this.orgModel
        .find(filter)
        .populate('ownerId',             'name email profileImage createdAt')
        .populate('subscription.planId', 'name price billingCycle planType')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

    // attach workers to each org
    const orgsWithWorkers = await Promise.all(
        orgs.map(async (org) => {
        const workers = await this.userModel
            .find({ orgId: org._id, orgRole: 'worker' })
            .select('name email profileImage createdAt hasActiveSubscription subscription')
            .populate('subscription.planId', 'name billingCycle')
            .lean();

        return {
            ...org,
            workers,
            seatInfo: {
            maxSeats:       org.maxSeats,
            usedSeats:      org.usedSeats,
            availableSeats: org.maxSeats - org.usedSeats,
            },
            workerCount: workers.length,
        };
        }),
    );

    return {
      message: 'Organizations fetched successfully',
      meta:    createMeta(page, limit, total),
      data:    { orgs: orgsWithWorkers, paginationInfo: createPaginationInfo(page, limit, total) },
    };
  }

  // ─── Remove worker from org (owner can do this) ───────────────────────────

  async removeWorker(ownerId: string, workerId: string) {
    const org = await this.orgModel.findOne({ ownerId });
    if (!org) throw new HttpException('Organization not found', HttpStatus.NOT_FOUND);

    const worker = await this.userModel.findOne({ _id: workerId, orgId: org._id });
    if (!worker) throw new HttpException('Worker not found in your organization', HttpStatus.NOT_FOUND);

    await this.userModel.findByIdAndUpdate(workerId, {
      orgId:                 null,
      orgRole:               null,
      hasActiveSubscription: false,
      'subscription.status': 'cancelled',
    });

    await this.orgModel.findByIdAndUpdate(org._id, {
      $inc: { usedSeats: -1 },
    });

    return { message: 'Worker removed from organization', data: null };
  }


async createUpgradeCheckout(userId: string, dto: {
  planId?: string;
  seats?:  number;
}) {
  const org = await this.orgModel
    .findOne({ ownerId: new Types.ObjectId(userId) })
    .lean();   // ← remove populate, use lean

  if (!org) throw new HttpException('Organization not found', HttpStatus.NOT_FOUND);
  if (org.subscription.status !== 'active')
    throw new HttpException('Organization subscription is not active', HttpStatus.BAD_REQUEST);
  if (!dto.planId && !dto.seats)
    throw new HttpException('Provide planId or seats to upgrade', HttpStatus.BAD_REQUEST);

  // determine target plan — use existing planId if no new one provided
  const targetPlanId = dto.planId ?? org.subscription.planId.toString();  // ← now safe, lean returns plain string
  const targetPlan   = await this.planModel.findById(targetPlanId);

  if (!targetPlan) throw new HttpException('Plan not found', HttpStatus.NOT_FOUND);
  if (targetPlan.planType !== 'organization')
    throw new HttpException('Must upgrade to an organization plan', HttpStatus.BAD_REQUEST);
  if (!targetPlan.stripePriceId)
    throw new HttpException('Plan not configured in Stripe', HttpStatus.BAD_REQUEST);

  const targetSeats = dto.seats ?? org.maxSeats;
  if (dto.seats && dto.seats <= org.maxSeats)
    throw new HttpException(
      `New seat count must be greater than current (${org.maxSeats})`,
      HttpStatus.BAD_REQUEST,
    );

  const user = await this.userModel.findById(userId).select('email name');
  if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

  const frontendUrl = this.configService.get<string>('app.frontendUrl', 'http://localhost:3000');

  const session = await this.stripeService.createCheckoutSession({
    priceId:    targetPlan.stripePriceId,
    userId:     userId.toString(),
    userEmail:  user.email,
    planId:     targetPlanId.toString(),
    mode:       'subscription',
    successUrl: `${frontendUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl:  `${frontendUrl}/organization/upgrade`,
    quantity:   targetSeats,
    metadata: {
      userId:       userId.toString(),
      planId:       targetPlanId.toString(),
      businessName: org.name,
      seats:        String(targetSeats),
      type:         'organization_upgrade',
      orgId:        org._id.toString(),
    },
  });

  return {
    message: 'Upgrade checkout session created',
    data:    { checkoutUrl: session.url, sessionId: session.id },
  };
}


async handleOrgUpgrade(data: {
  orgId:                string;
  userId:               string;
  planId:               string;
  seats:                number;
  startDate:            string;
  endDate:              string;
  stripeCustomerId:     string;
  stripeSubscriptionId: string;
  userEmail:            string;
  userName:             string;
}) {
  const plan = await this.planModel.findById(data.planId).select('name billingCycle');

  // update organization
  const updatedOrg = await this.orgModel.findByIdAndUpdate(
    data.orgId,
    {
      maxSeats:                            data.seats,
      'subscription.planId':               new Types.ObjectId(data.planId),
      'subscription.startDate':            new Date(data.startDate),
      'subscription.endDate':              new Date(data.endDate),
      'subscription.stripeCustomerId':     data.stripeCustomerId,
      'subscription.stripeSubscriptionId': data.stripeSubscriptionId,
      'subscription.status':               'active',
    },
    { new: true },
  );

  if (!updatedOrg) return;

  // update all workers — cast orgId to ObjectId so query matches
  const workerResult = await this.userModel.updateMany(
    {
      orgId:   new Types.ObjectId(data.orgId),   // ← cast to ObjectId
      orgRole: 'worker',
    },
    {
      'subscription.planId':   new Types.ObjectId(data.planId),  // ← cast to ObjectId
      'subscription.startDate': new Date(data.startDate),
      'subscription.endDate':   new Date(data.endDate),
      'subscription.status':    'active',
      hasActiveSubscription:    true,
    },
  );

  // update owner subscription
  await this.userModel.findByIdAndUpdate(data.userId, {
    'subscription.planId':               new Types.ObjectId(data.planId),  // ← cast to ObjectId
    'subscription.startDate':            new Date(data.startDate),
    'subscription.endDate':              new Date(data.endDate),
    'subscription.stripeCustomerId':     data.stripeCustomerId,
    'subscription.stripeSubscriptionId': data.stripeSubscriptionId,
    'subscription.status':               'active',
    hasActiveSubscription:               true,
  });

  // send upgrade confirmation email
  await this.emailService.sendEmail({
    to:      data.userEmail,
    subject: 'Organization Upgraded Successfully 🚀',
    html:    this.orgUpgradeTemplate({
      userName:     data.userName,
      businessName: updatedOrg.name,
      planName:     plan?.name ?? 'Organization Plan',
      newSeats:     data.seats,
      endDate:      data.endDate,
    }),
  });

  return { workersUpdated: workerResult.modifiedCount };
}


  private orgActivationTemplate(data: {
  userName:     string;
  businessName: string;
  orgCode:      string;
  seats:        number;
  planName:     string;
  billingCycle: string;
  startDate:    string;
  endDate:      string;
}): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <style>
    body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0}
    .container{max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden}
    .header{background:#16a34a;padding:24px;text-align:center}
    .header h1{color:#fff;margin:0;font-size:24px}
    .body{padding:32px}
    .code-box{background:#f0fdf4;border:2px dashed #16a34a;border-radius:8px;padding:16px;text-align:center;margin:20px 0}
    .code{font-size:32px;font-weight:bold;color:#16a34a;letter-spacing:6px}
    .detail{margin:8px 0;font-size:15px;color:#374151}
    .footer{text-align:center;padding:16px;font-size:12px;color:#9ca3af}
  </style></head>
  <body><div class="container">
    <div class="header"><h1>🏢 Organization Activated!</h1></div>
    <div class="body">
      <p>Hi <strong>${data.userName}</strong>,</p>
      <p>Your organization <strong>${data.businessName}</strong> subscription is now active!</p>
      <p>Share this code with your team members so they can join:</p>
      <div class="code-box">
        <div class="code">${data.orgCode}</div>
        <p style="color:#6b7280;margin:8px 0 0">Organization Code</p>
      </div>
      <p class="detail">📋 Plan: <strong>${data.planName} (${data.billingCycle})</strong></p>
      <p class="detail">👥 Seats: <strong>${data.seats}</strong></p>
      <p class="detail">📅 Start: <strong>${new Date(data.startDate).toDateString()}</strong></p>
      <p class="detail">📅 End:   <strong>${new Date(data.endDate).toDateString()}</strong></p>
      <p>Workers join at: <strong>${process.env.FRONTEND_URL}/join</strong></p>
    </div>
    <div class="footer">© ${new Date().getFullYear()} LarsFalck. All rights reserved.</div>
  </div></body></html>`;
}

private workerWelcomeTemplate(data: {
    workerName:   string;
    businessName: string;
    endDate:      string;
    }): string {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <style>
        body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0}
        .container{max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden}
        .header{background:#2563eb;padding:24px;text-align:center}
        .header h1{color:#fff;margin:0;font-size:24px}
        .body{padding:32px}
        .footer{text-align:center;padding:16px;font-size:12px;color:#9ca3af}
    </style></head>
    <body><div class="container">
        <div class="header"><h1>🎵 Welcome to ${data.businessName}!</h1></div>
        <div class="body">
        <p>Hi <strong>${data.workerName}</strong>,</p>
        <p>You have successfully joined <strong>${data.businessName}</strong> on LarsFalck.</p>
        <p>Your account is active and you have full access to all premium features.</p>
        <p>Your access is valid until: <strong>${new Date(data.endDate).toDateString()}</strong></p>
        <p>Start exploring music now!</p>
        </div>
        <div class="footer">© ${new Date().getFullYear()} LarsFalck. All rights reserved.</div>
    </div></body></html>`;
    }

  private orgUpgradeTemplate(data: {
  userName:     string;
  businessName: string;
  planName:     string;
  newSeats:     number;
  endDate:      string;
}): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <style>
    body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0}
    .container{max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden}
    .header{background:#7c3aed;padding:24px;text-align:center}
    .header h1{color:#fff;margin:0;font-size:24px}
    .body{padding:32px}
    .detail{margin:8px 0;font-size:15px;color:#374151}
    .footer{text-align:center;padding:16px;font-size:12px;color:#9ca3af}
  </style></head>
  <body><div class="container">
    <div class="header"><h1>🚀 Organization Upgraded!</h1></div>
    <div class="body">
      <p>Hi <strong>${data.userName}</strong>,</p>
      <p>Your organization <strong>${data.businessName}</strong> has been upgraded successfully.</p>
      <p class="detail">📋 Plan:  <strong>${data.planName}</strong></p>
      <p class="detail">👥 Total Seats: <strong>${data.newSeats}</strong></p>
      <p class="detail">📅 Valid Until: <strong>${new Date(data.endDate).toDateString()}</strong></p>
      <p>All existing members have been automatically upgraded.</p>
    </div>
    <div class="footer">© ${new Date().getFullYear()} LarsFalck. All rights reserved.</div>
  </div></body></html>`;
}

}