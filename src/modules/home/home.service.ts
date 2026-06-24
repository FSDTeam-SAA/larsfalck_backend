import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { HomepageCache, HomepageCacheDocument } from './schemas/homepage-cache.schema';
import { Song, SongDocument } from '../song/schemas/song.schema';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { HomeProducerService } from '../../infrastructure/queue/home-producer.service';

@Injectable()
export class HomeService {
  constructor(
    @InjectModel(HomepageCache.name) private readonly cacheModel:  Model<HomepageCacheDocument>,
    @InjectModel(Song.name)          private readonly songModel:   Model<SongDocument>,
    @InjectModel(User.name)          private readonly userModel:   Model<UserDocument>,
    private readonly homeProducer: HomeProducerService,
  ) {}

  // ─── GET /home/sections — all sections in one call ───────────────────────

  async getSections(userId?: string) {
    const [popularSongs, popularArtists, popularAlbums, recommended] =
      await Promise.all([
        this.getPopularSongs(),
        this.getPopularArtists(),
        this.getPopularAlbums(),
        userId ? this.getRecommended(userId) : Promise.resolve([]),
      ]);

    return {
      message: 'Homepage sections fetched successfully',
      data: {
        popularSongs,
        popularArtists,
        popularAlbums,
        recommended,
      },
    };
  }

  // ─── Popular Songs — from cache ───────────────────────────────────────────

  async getPopularSongs(limit = 20) {
    const cache = await this.cacheModel
      .findOne({ section: 'popular_songs' })
      .lean();
    return (cache?.items ?? []).slice(0, limit);
  }

  // ─── Popular Artists — from cache ─────────────────────────────────────────

  async getPopularArtists(limit = 10) {
    const cache = await this.cacheModel
      .findOne({ section: 'popular_artists' })
      .lean();
    return (cache?.items ?? []).slice(0, limit);
  }

  // ─── Popular Albums — from cache ──────────────────────────────────────────

  async getPopularAlbums(limit = 10) {
    const cache = await this.cacheModel
      .findOne({ section: 'popular_albums' })
      .lean();
    return (cache?.items ?? []).slice(0, limit);
  }

  // ─── Recommended For You — computed live ─────────────────────────────────

  async getRecommended(userId: string, limit = 20): Promise<any[]> {
    const user = await this.userModel
      .findById(userId)
      .select('preferredGenres favoriteSongs favoriteAlbums')
      .lean();

    if (!user) return [];

    const preferredGenreIds = (user.preferredGenres ?? []).map((g: any) => g.toString());
    const favoriteSongIds   = (user.favoriteSongs   ?? []).map((s: any) => s.toString());

    // if user has no preferences yet → return popular songs as fallback
    if (!preferredGenreIds.length && !favoriteSongIds.length) {
      return this.getPopularSongs(limit);
    }

    const favSongs = await this.songModel
      .find({ _id: { $in: favoriteSongIds } })
      .select('artists')
      .lean();

    const favoriteArtistIds = [
      ...new Set(favSongs.flatMap((s) => s.artists.map((a: any) => a.toString()))),
    ];

    const ago30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const candidates = await this.songModel
      .find({ status: 'active', _id: { $nin: favoriteSongIds } })
      .populate('artists', 'name image')
      .populate('genres',  'name')
      .populate('albums',  'name coverImage')
      .select('-__v -audioKey -coverImageKey')
      .lean();

    const scored = candidates.map((song) => {
      const songGenreIds  = song.genres.map((g: any)  => g._id?.toString() ?? g.toString());
      const songArtistIds = song.artists.map((a: any) => a._id?.toString() ?? a.toString());
      const isNew         = new Date((song as any).createdAt) >= ago30d;

      const genreMatch  = songGenreIds.some((g: string)  => preferredGenreIds.includes(g))  ? 1 : 0;
      const artistMatch = songArtistIds.some((a: string) => favoriteArtistIds.includes(a))  ? 1 : 0;
      const popularity  = Math.min((song.playCount ?? 0) / 10000, 1);
      const freshness   = isNew ? 1 : 0;

      const score =
        genreMatch  * 0.4 +
        artistMatch * 0.3 +
        popularity  * 0.2 +
        freshness   * 0.1;

      return { ...song, recommendationScore: Math.round(score * 100) / 100 };
    });

    const results = scored
      .sort((a, b) => b.recommendationScore - a.recommendationScore)
      .slice(0, limit);

    // if scores are all zero → fallback to popular
    const hasResults = results.some((r) => r.recommendationScore > 0);
    if (!hasResults) return this.getPopularSongs(limit);

    return results;
  }

  // ─── Admin: trigger recompute manually ───────────────────────────────────

  async triggerRecompute() {
    await this.homeProducer.triggerNow();
    return { message: 'Trending recompute triggered', data: null };
  }

  // ─── Cache info — when was last computed ─────────────────────────────────

  async getCacheInfo() {
    const caches = await this.cacheModel
      .find()
      .select('section computedAt')
      .lean();

    return {
      message: 'Cache info fetched',
      data:    caches,
    };
  }
}