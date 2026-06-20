import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { Song, SongDocument } from '../song/schemas/song.schema';
import { Plan, PlanDocument } from '../plan/schemas/plan.schema';
import { createMeta, createPaginationInfo } from '../../common/utils/pagination.util';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Song.name) private readonly songModel: Model<SongDocument>,
    @InjectModel(Plan.name) private readonly planModel: Model<PlanDocument>,
  ) {}

  // ─── API 1: Dashboard Overview ────────────────────────────────────────────

  async getDashboard() {
    const [
      totalUsers,
      activeSubscriptions,
      trialUsers,
      totalSongs,
      plans,
    ] = await Promise.all([
      this.userModel.countDocuments({ role: 'USER' }),
      this.userModel.countDocuments({ 'subscription.status': 'active' }),
      this.userModel.countDocuments({ 'subscription.status': 'trial' }),
      this.songModel.countDocuments({ status: 'active' }),
      this.planModel.find({ status: 'active' }).select('name price billingCycle'),
    ]);

    // total revenue — sum of all active subscriptions × plan price
    const revenueData = await this.userModel.aggregate([
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
      { $group: { _id: null, totalRevenue: { $sum: '$plan.price' } } },
    ]);

    const totalRevenue = revenueData[0]?.totalRevenue ?? 0;

    // subscription type breakdown
    const subscriptionBreakdown = await this.userModel.aggregate([
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
      {
        $group: {
          _id:   '$plan._id',
          name:  { $first: '$plan.name' },
          cycle: { $first: '$plan.billingCycle' },
          count: { $sum: 1 },
        },
      },
    ]);

    const totalActive = subscriptionBreakdown.reduce((sum, p) => sum + p.count, 0);

    const breakdown = subscriptionBreakdown.map((p) => ({
      planId:       p._id,
      name:         p.name,
      billingCycle: p.cycle,
      count:        p.count,
      percentage:   totalActive > 0
        ? Number(((p.count / totalActive) * 100).toFixed(1))
        : 0,
    }));

    return {
      message: 'Dashboard fetched successfully',
      data: {
        overview: {
          totalUsers,
          activeSubscriptions,
          trialUsers,
          totalSongs,
          totalRevenue: Number(totalRevenue.toFixed(2)),
        },
        subscriptionBreakdown: breakdown,
      },
    };
  }

  // ─── API 2: Revenue Chart ─────────────────────────────────────────────────

  async getRevenueChart(year?: number) {
    const targetYear = year || new Date().getFullYear();

    const start = new Date(`${targetYear}-01-01T00:00:00.000Z`);
    const end   = new Date(`${targetYear}-12-31T23:59:59.999Z`);

    const revenueByMonth = await this.userModel.aggregate([
      {
        $match: {
          'subscription.status':    'active',
          'subscription.startDate': { $gte: start, $lte: end },
          'subscription.planId':    { $ne: null },
        },
      },
      {
        $lookup: {
          from:         'plans',
          localField:   'subscription.planId',
          foreignField: '_id',
          as:           'plan',
        },
      },
      { $unwind: '$plan' },
      {
        $group: {
          _id:          { $month: '$subscription.startDate' },
          revenue:      { $sum: '$plan.price' },
          subscribers:  { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];

    // fill all 12 months even if no data
    const chart = months.map((month, i) => {
      const found = revenueByMonth.find((r) => r._id === i + 1);
      return {
        month,
        revenue:     Number((found?.revenue ?? 0).toFixed(2)),
        subscribers: found?.subscribers ?? 0,
      };
    });

    const totalYearRevenue = chart.reduce((sum, m) => sum + m.revenue, 0);

    return {
      message: 'Revenue chart fetched successfully',
      data: {
        year,
        totalYearRevenue: Number(totalYearRevenue.toFixed(2)),
        chart,
      },
    };
  }

  // ─── API 3: Recent Activity ───────────────────────────────────────────────

  async getActivity(query: {
    page?:   string;
    limit?:  string;
    search?: string;
    filter?: string;   // 'user' | 'song' | undefined = both
    date?:   string;
  }) {
    const page   = Number(query.page  || 1);
    const limit  = Number(query.limit || 10);
    const search = query.search ?? '';
    const filter = query.filter;   // 'user' | 'song' | undefined

    const searchRegex = search ? new RegExp(search, 'i') : null;

    let recentUsers: any[] = [];
    let recentSongs: any[] = [];

    // fetch users if filter is 'user' or no filter
    if (!filter || filter === 'user') {
      const userQuery: any = { role: 'USER' };
      if (searchRegex) userQuery.$or = [
        { name:  searchRegex },
        { email: searchRegex },
      ];
      if (query.date) userQuery.createdAt = {
        $gte: new Date(query.date),
        $lte: new Date(new Date(query.date).setHours(23, 59, 59, 999)),
      };

      recentUsers = await this.userModel
        .find(userQuery)
        .select('name email profileImage createdAt hasActiveSubscription subscription')
        .populate('subscription.planId', 'name billingCycle')
        .sort({ createdAt: -1 })
        .limit(filter === 'user' ? limit : Math.ceil(limit / 2));

      recentUsers = recentUsers.map((u) => ({
        type:      'user',
        _id:       u._id,
        name:      u.name,
        email:     u.email,
        image:     u.profileImage,
        createdAt: u.createdAt,
        meta: {
          hasActiveSubscription: u.hasActiveSubscription,
          subscriptionStatus:    u.subscription?.status ?? 'trial',
          planName:              (u.subscription?.planId as any)?.name ?? null,
        },
      }));
    }

    // fetch songs if filter is 'song' or no filter
    if (!filter || filter === 'song') {
      const songQuery: any = { status: 'active' };
      if (searchRegex) songQuery.name = searchRegex;
      if (query.date) songQuery.createdAt = {
        $gte: new Date(query.date),
        $lte: new Date(new Date(query.date).setHours(23, 59, 59, 999)),
      };

      recentSongs = await this.songModel
        .find(songQuery)
        .select('name coverImage duration createdAt artists albums genres')
        .populate('artists', 'name')
        .populate('albums',  'name')
        .populate('genres',  'name')
        .sort({ createdAt: -1 })
        .limit(filter === 'song' ? limit : Math.floor(limit / 2));

      recentSongs = recentSongs.map((s) => ({
        type:      'song',
        _id:       s._id,
        name:      s.name,
        image:     s.coverImage,
        createdAt: s.createdAt,
        meta: {
          duration: s.duration,
          artists:  (s.artists as any[]).map((a) => a.name),
          albums:   (s.albums  as any[]).map((a) => a.name),
          genres:   (s.genres  as any[]).map((g) => g.name),
        },
      }));
    }

    // merge and sort by createdAt
    const combined = [...recentUsers, ...recentSongs]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice((page - 1) * limit, page * limit);

    const total = combined.length;

    return {
      message: 'Activity fetched successfully',
      meta:    createMeta(page, limit, total),
      data: {
        activity:       combined,
        paginationInfo: createPaginationInfo(page, limit, total),
      },
    };
  }
}