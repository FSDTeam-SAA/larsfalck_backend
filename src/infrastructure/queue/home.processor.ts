import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Job } from 'bullmq';
import { HOME_QUEUE, TRENDING_COMPUTE_JOB } from './queue.constants';
import { Song, SongDocument } from '../../modules/song/schemas/song.schema';
import { SongStat, SongStatDocument } from '../../modules/home/schemas/song-stat.schema';
import { HomepageCache, HomepageCacheDocument } from '../../modules/home/schemas/homepage-cache.schema';

@Processor(HOME_QUEUE, { concurrency: 1 })
export class HomeProcessor extends WorkerHost {
  private readonly logger = new Logger(HomeProcessor.name);

  constructor(
    @InjectModel(Song.name)          private readonly songModel:          Model<SongDocument>,
    @InjectModel(SongStat.name)      private readonly songStatModel:      Model<SongStatDocument>,
    @InjectModel(HomepageCache.name) private readonly homepageCacheModel: Model<HomepageCacheDocument>,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    switch (job.name) {
      case TRENDING_COMPUTE_JOB:
        return this.computeTrending();
      default:
        this.logger.warn(`Unknown job: ${job.name}`);
    }
  }

  // ─── Main compute — runs every 2 hours ───────────────────────────────────

  private async computeTrending() {
    this.logger.log('Starting trending computation...');

    await Promise.all([
      this.computePopularSongs(),
      this.computePopularArtists(),
      this.computePopularAlbums(),
    ]);

    this.logger.log('Trending computation complete');
    return { success: true, computedAt: new Date() };
  }

  // ─── Popular Songs ────────────────────────────────────────────────────────

  private async computePopularSongs() {
    const now     = new Date();
    const ago24h  = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const ago7d   = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
    const ago30d  = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const songs = await this.songModel
      .find({ status: 'active' })
      .select('_id playCount')
      .lean();

    // count playlist adds per song
    const playlistStats = await this.songModel.aggregate([
      {
        $lookup: {
          from:         'playlists',
          localField:   '_id',
          foreignField: 'songs',
          as:           'playlists',
        },
      },
      {
        $project: {
          playlistAdds: { $size: '$playlists' },
        },
      },
    ]);

    const playlistMap = new Map(
      playlistStats.map((p) => [p._id.toString(), p.playlistAdds]),
    );

    // count favorite adds per song
    const favoriteStats = await this.songModel.aggregate([
      {
        $lookup: {
          from:         'users',
          localField:   '_id',
          foreignField: 'favoriteSongs',
          as:           'favoritedBy',
        },
      },
      {
        $project: {
          favoriteCount: { $size: '$favoritedBy' },
        },
      },
    ]);

    const favoriteMap = new Map(
      favoriteStats.map((f) => [f._id.toString(), f.favoriteCount]),
    );

    // compute trending score for each song
    const bulkOps = songs.map((song) => {
      const id           = song._id.toString();
      const plays30d     = song.playCount ?? 0;
      const plays7d      = Math.round(plays30d * 0.6);  // estimate — real data needs play_events collection
      const plays24h     = Math.round(plays30d * 0.15);
      const favoriteCount = favoriteMap.get(id) ?? 0;
      const playlistAdds  = playlistMap.get(id)  ?? 0;

      const trendingScore =
        plays24h      * 1.0  +
        plays7d       * 0.5  +
        plays30d      * 0.2  +
        favoriteCount * 0.1  +
        playlistAdds  * 0.1;

      return {
        updateOne: {
          filter: { songId: song._id },
          update: {
            $set: {
              songId:        song._id,
              plays24h,
              plays7d,
              plays30d,
              favoriteCount,
              playlistAdds,
              trendingScore: Math.round(trendingScore),
              lastComputedAt: new Date(),
            },
          },
          upsert: true,
        },
      };
    });

    if (bulkOps.length) await this.songStatModel.bulkWrite(bulkOps);

    // get top 20 songs by trending score
    const topStats = await this.songStatModel
      .find()
      .sort({ trendingScore: -1 })
      .limit(20)
      .lean();

    const topSongIds = topStats.map((s) => s.songId);

    const topSongs = await this.songModel
      .find({ _id: { $in: topSongIds }, status: 'active' })
      .populate('artists', 'name image')
      .populate('genres',  'name')
      .populate('albums',  'name coverImage')
      .select('-__v -audioKey -coverImageKey')
      .lean();

    // attach trending score to each song
    const scoreMap = new Map(topStats.map((s) => [s.songId.toString(), s.trendingScore]));
    const songsWithScore = topSongs
      .map((s) => ({ ...s, trendingScore: scoreMap.get(s._id.toString()) ?? 0 }))
      .sort((a, b) => b.trendingScore - a.trendingScore);

    await this.homepageCacheModel.findOneAndUpdate(
      { section: 'popular_songs' },
      { section: 'popular_songs', items: songsWithScore, computedAt: new Date() },
      { upsert: true, new: true },
    );

    this.logger.log(`Popular songs computed: ${songsWithScore.length} songs`);
  }

  // ─── Popular Artists ──────────────────────────────────────────────────────

  private async computePopularArtists() {
    // aggregate artist scores from song stats
    const artistScores = await this.songStatModel.aggregate([
      {
        $lookup: {
          from:         'songs',
          localField:   'songId',
          foreignField: '_id',
          as:           'song',
        },
      },
      { $unwind: '$song' },
      { $match: { 'song.status': 'active' } },
      { $unwind: '$song.artists' },
      {
        $group: {
          _id:          '$song.artists',
          totalScore:   { $sum: '$trendingScore' },
          totalPlays:   { $sum: '$plays30d' },
          songCount:    { $sum: 1 },
        },
      },
      { $sort: { totalScore: -1 } },
      { $limit: 20 },
    ]);

    const artistIds = artistScores.map((a) => a._id);

    const artists = await this.songModel.db
      .collection('artists')
      .find({ _id: { $in: artistIds }, status: 'active' })
      .project({ name: 1, image: 1, description: 1 })
      .toArray();

    const artistMap = new Map(artists.map((a) => [a._id.toString(), a]));

    const topArtists = artistScores
      .map((a) => {
        const artistData = artistMap.get(a._id.toString()) as any;
        if (!artistData) return null;
        return {
          _id:        artistData._id,
          name:       artistData.name,
          image:      artistData.image,
          description: artistData.description,
          totalScore: a.totalScore,
          totalPlays: a.totalPlays,
          songCount:  a.songCount,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);

    await this.homepageCacheModel.findOneAndUpdate(
      { section: 'popular_artists' },
      { section: 'popular_artists', items: topArtists, computedAt: new Date() },
      { upsert: true, new: true },
    );

    this.logger.log(`Popular artists computed: ${topArtists.length} artists`);
  }

  // ─── Popular Albums ───────────────────────────────────────────────────────

  private async computePopularAlbums() {
    // aggregate album scores from song stats
    const albumScores = await this.songStatModel.aggregate([
      {
        $lookup: {
          from:         'songs',
          localField:   'songId',
          foreignField: '_id',
          as:           'song',
        },
      },
      { $unwind: '$song' },
      { $match: { 'song.status': 'active' } },
      { $unwind: '$song.albums' },
      {
        $group: {
          _id:        '$song.albums',
          albumScore: { $sum: '$trendingScore' },
          songCount:  { $sum: 1 },
          totalPlays: { $sum: '$plays30d' },
        },
      },
      { $sort: { albumScore: -1 } },
      { $limit: 20 },
    ]);

    // add favorite album boost
    const favoriteBoosts = await this.songModel.db
      .collection('users')
      .aggregate([
        { $unwind: '$favoriteAlbums' },
        { $group: { _id: '$favoriteAlbums', count: { $sum: 1 } } },
      ])
      .toArray();

    const favoriteMap = new Map(
      favoriteBoosts.map((f) => [f._id.toString(), f.count]),
    );

    const albumIds = albumScores.map((a) => a._id);

    const albums = await this.songModel.db
      .collection('albums')
      .find({ _id: { $in: albumIds }, status: 'active' })
      .project({ name: 1, coverImage: 1, releaseDate: 1, artists: 1 })
      .toArray();

    const albumMap = new Map(albums.map((a) => [a._id.toString(), a]));

    const topAlbums = albumScores
      .map((a) => {
        const albumData = albumMap.get(a._id.toString()) as any;
        if (!albumData) return null;
        const favBoost   = (favoriteMap.get(a._id.toString()) ?? 0) * 0.2;
        const finalScore = a.albumScore + favBoost;
        return {
          _id:         albumData._id,
          name:        albumData.name,
          coverImage:  albumData.coverImage,
          releaseDate: albumData.releaseDate,
          artists:     albumData.artists,
          albumScore:  Math.round(finalScore),
          songCount:   a.songCount,
          totalPlays:  a.totalPlays,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null)
      .sort((a, b) => b.albumScore - a.albumScore);

    await this.homepageCacheModel.findOneAndUpdate(
      { section: 'popular_albums' },
      { section: 'popular_albums', items: topAlbums, computedAt: new Date() },
      { upsert: true, new: true },
    );

    this.logger.log(`Popular albums computed: ${topAlbums.length} albums`);
  }
}