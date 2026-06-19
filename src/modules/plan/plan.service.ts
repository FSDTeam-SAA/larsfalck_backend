import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Plan, PlanDocument } from './schemas/plan.schema';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { CreatePlanDto, UpdatePlanDto, GetPlansQueryDto } from './dto/plan.dto';
import { StripeService } from '../../infrastructure/stripe/stripe.service';
import { createFilter, createMeta, createPaginationInfo } from '../../common/utils/pagination.util';

@Injectable()
export class PlanService {
  constructor(
    @InjectModel(Plan.name) private readonly planModel: Model<PlanDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly stripeService: StripeService,
  ) {}

  async create(dto: CreatePlanDto) {
    const existing = await this.planModel.findOne({
      name:         { $regex: `^${dto.name}$`, $options: 'i' },
      billingCycle: dto.billingCycle,
    });
    if (existing) throw new HttpException('Plan already exists', HttpStatus.CONFLICT);

    // auto-create product + price in Stripe
    const stripePriceId = await this.stripeService.createProductWithPrice({
      name:         dto.name,
      amount:       dto.price,
      billingCycle: dto.billingCycle,
    });

    const plan = await this.planModel.create({ ...dto, stripePriceId });
    return { message: 'Plan created successfully', data: plan };
  }

    async findAll(query: GetPlansQueryDto) {
    const page   = Number(query.page  || 1);
    const limit  = Number(query.limit || 10);
    const filter = createFilter(query.search, query.date);

    if (query.status)       filter.status      = query.status;
    if (query.billingCycle) filter.billingCycle = query.billingCycle;

    const total = await this.planModel.countDocuments(filter);
    const plans = await this.planModel
        .find(filter)
        .sort({ price: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-__v -stripePriceId');

    // attach activeUsers count to each plan
    const plansWithStats = await Promise.all(
        plans.map(async (plan) => {
        const activeUsers = await this.userModel.countDocuments({
            'subscription.planId': plan._id,
            'subscription.status': 'active',
        });
        return { ...plan.toObject(), activeUsers };
        }),
    );

    // overall overview stats
    const cycleBreakdown = await this.userModel.aggregate([
        { $match: { 'subscription.status': 'active', 'subscription.planId': { $ne: null } } },
        {
        $lookup: {
            from:         'plans',
            localField:   'subscription.planId',
            foreignField: '_id',
            as:           'plan',
        },
        },
        { $unwind: '$plan' },
        { $group: { _id: '$plan.billingCycle', count: { $sum: 1 } } },
    ]);

    const monthly = cycleBreakdown.find((c) => c._id === 'monthly')?.count ?? 0;
    const yearly  = cycleBreakdown.find((c) => c._id === 'yearly')?.count  ?? 0;

    const [totalTrial, totalExpired, totalCancelled] = await Promise.all([
        this.userModel.countDocuments({ 'subscription.status': 'trial'     }),
        this.userModel.countDocuments({ 'subscription.status': 'expired'   }),
        this.userModel.countDocuments({ 'subscription.status': 'cancelled' }),
    ]);

    return {
        message: 'Plans fetched successfully',
        meta:    createMeta(page, limit, total),
        data: {
        plans: plansWithStats,
        paginationInfo: createPaginationInfo(page, limit, total),
        overview: {
            totalMonthlyActive: monthly,
            totalYearlyActive:  yearly,
            totalTrial,
            totalExpired,
            totalCancelled,
        },
        },
    };
    }

  async findOne(id: string) {
    const plan = await this.planModel.findById(id).select('-__v -stripePriceId');
    if (!plan) throw new HttpException('Plan not found', HttpStatus.NOT_FOUND);
    return { message: 'Plan fetched successfully', data: plan };
  }

  async update(id: string, dto: UpdatePlanDto) {
    const plan = await this.planModel.findById(id);
    if (!plan) throw new HttpException('Plan not found', HttpStatus.NOT_FOUND);

    let stripePriceId = plan.stripePriceId;

    // if price or billingCycle changed → update Stripe price automatically
    const priceChanged =
      (dto.price !== undefined && dto.price !== plan.price) ||
      (dto.billingCycle !== undefined && dto.billingCycle !== plan.billingCycle);

    if (priceChanged) {
      stripePriceId = await this.stripeService.updatePrice({
        oldPriceId:   plan.stripePriceId,
        productName:  dto.name ?? plan.name,
        amount:       dto.price ?? plan.price,
        billingCycle: dto.billingCycle ?? plan.billingCycle,
      });
    }

    const updated = await this.planModel
      .findByIdAndUpdate(
        id,
        { ...dto, stripePriceId },
        { new: true, runValidators: true },
      )
      .select('-__v -stripePriceId');

    return { message: 'Plan updated successfully', data: updated };
  }

  async remove(id: string) {
    const activeUsers = await this.userModel.countDocuments({
      'subscription.planId': id,
      'subscription.status': 'active',
    });
    if (activeUsers > 0)
      throw new HttpException(
        `Cannot delete — ${activeUsers} active subscriber(s) on this plan`,
        HttpStatus.CONFLICT,
      );

    const deleted = await this.planModel.findByIdAndDelete(id);
    if (!deleted) throw new HttpException('Plan not found', HttpStatus.NOT_FOUND);
    return { message: 'Plan deleted successfully', data: null };
  }

  async getStats() {
    const plans = await this.planModel.find({ status: 'active' }).select('-stripePriceId -__v');

    const planStats = await Promise.all(
      plans.map(async (plan) => {
        const activeUsers = await this.userModel.countDocuments({
          'subscription.planId': plan._id,
          'subscription.status': 'active',
        });
        return {
          _id:          plan._id,
          name:         plan.name,
          billingCycle: plan.billingCycle,
          price:        plan.price,
          activeUsers,
        };
      }),
    );

    const cycleBreakdown = await this.userModel.aggregate([
      { $match: { 'subscription.status': 'active', 'subscription.planId': { $ne: null } } },
      {
        $lookup: {
          from:         'plans',
          localField:   'subscription.planId',
          foreignField: '_id',
          as:           'plan',
        },
      },
      { $unwind: '$plan' },
      { $group: { _id: '$plan.billingCycle', count: { $sum: 1 } } },
    ]);

    const monthly = cycleBreakdown.find((c) => c._id === 'monthly')?.count ?? 0;
    const yearly  = cycleBreakdown.find((c) => c._id === 'yearly')?.count  ?? 0;

    const [totalTrial, totalExpired, totalCancelled] = await Promise.all([
      this.userModel.countDocuments({ 'subscription.status': 'trial' }),
      this.userModel.countDocuments({ 'subscription.status': 'expired' }),
      this.userModel.countDocuments({ 'subscription.status': 'cancelled' }),
    ]);

    return {
      message: 'Subscription stats fetched successfully',
      data: {
        planStats,
        overview: {
          totalMonthlyActive: monthly,
          totalYearlyActive:  yearly,
          totalTrial,
          totalExpired,
          totalCancelled,
        },
      },
    };
  }
}