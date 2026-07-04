import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Organization, OrganizationDocument } from './schemas/organization.schema';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { Plan, PlanDocument } from '../plan/schemas/plan.schema';
import { StripeService } from '../../infrastructure/stripe/stripe.service';
import { ConfigService } from '@nestjs/config';
import { createMeta, createPaginationInfo } from '../../common/utils/pagination.util';
import * as crypto from 'crypto';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectModel(Organization.name) private readonly orgModel:  Model<OrganizationDocument>,
    @InjectModel(User.name)         private readonly userModel: Model<UserDocument>,
    @InjectModel(Plan.name)         private readonly planModel: Model<PlanDocument>,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Generate unique org code ─────────────────────────────────────────────

  private generateOrgCode(): string {
    return crypto.randomBytes(4).toString('hex').toUpperCase();  // e.g. "A3F9C2D1"
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
  }) {
    // generate unique org code
    let orgCode = this.generateOrgCode();
    let exists  = await this.orgModel.findOne({ orgCode });
    while (exists) {
      orgCode = this.generateOrgCode();
      exists  = await this.orgModel.findOne({ orgCode });
    }

    // create organization
    const org = await this.orgModel.create({
      name:     data.businessName,
      ownerId:  data.userId,
      orgCode,
      maxSeats: data.seats,
      usedSeats: 1,   // owner counts as 1 seat
      subscription: {
        planId:               data.planId,
        startDate:            new Date(data.startDate),
        endDate:              new Date(data.endDate),
        stripeCustomerId:     data.stripeCustomerId,
        stripeSubscriptionId: data.stripeSubscriptionId,
        status:               'active',
      },
    });

    // update owner user
    await this.userModel.findByIdAndUpdate(data.userId, {
      orgId:                 org._id,
      orgRole:               'owner',
      hasActiveSubscription: true,
      'subscription.status': 'active',
      'subscription.planId': data.planId,
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
      .findOne({ ownerId: userId })
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

  async getAllOrgs(query: { page?: string; limit?: string; search?: string }) {
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
      .populate('ownerId',             'name email')
      .populate('subscription.planId', 'name price billingCycle')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return {
      message: 'Organizations fetched successfully',
      meta:    createMeta(page, limit, total),
      data:    { orgs, paginationInfo: createPaginationInfo(page, limit, total) },
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
}