import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Song, SongDocument }         from '../song/schemas/song.schema';
import { Artist, ArtistDocument }     from '../artist/schemas/artist.schema';
import { Album, AlbumDocument }       from '../album/schemas/album.schema';
import { Playlist, PlaylistDocument } from '../playlist/schemas/playlist.schema';

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(Song.name)     private readonly songModel:     Model<SongDocument>,
    @InjectModel(Artist.name)   private readonly artistModel:   Model<ArtistDocument>,
    @InjectModel(Album.name)    private readonly albumModel:    Model<AlbumDocument>,
    @InjectModel(Playlist.name) private readonly playlistModel: Model<PlaylistDocument>,
  ) {}

async globalSearch(q: string, limit = 5) {
  if (!q?.trim()) {
    return {
      message: 'Search query is required',
      data:    { songs: [], artists: [], albums: [], playlists: [], tags: [] },
    };
  }

  const regex = { $regex: q.trim(), $options: 'i' };

  // find matching tag IDs first
  const tagDocs = await this.songModel.db
    .collection('tags')
    .find({ name: regex })
    .project({ _id: 1, name: 1 })
    .toArray();

  const tagIds = tagDocs.map((t) => t._id);

  const songFilter = {
    status: 'active',
    $or: [
      { name: regex },
      ...(tagIds.length ? [{ tags: { $in: tagIds } }] : []),
    ],
  };

  const [songs, artists, albums, playlists] = await Promise.all([

    // Songs — by name OR tag
    this.songModel
      .find(songFilter)
      .populate('artists', 'name image')
      .populate('genres',  'name')
      .populate('tags',    'name')        // ← added tags populate
      .populate('albums',  'name coverImage')
      .select('name coverImage duration playCount artists genres albums tags')
      .sort({ playCount: -1 })
      .limit(limit)
      .lean(),

    // Artists — by name
    this.artistModel
      .find({ name: regex, status: 'active' })
      .select('name image description')
      .limit(limit)
      .lean(),

    // Albums — by name
    this.albumModel
      .find({ name: regex, status: 'active' })
      .populate('artists', 'name image')
      .select('name coverImage releaseDate artists')
      .limit(limit)
      .lean(),

    // Playlists — admin only
    this.playlistModel
      .find({ name: regex, ownerType: 'admin', status: 'active' })
      .select('name coverImage songs')
      .limit(limit)
      .lean(),
  ]);

  return {
    message: 'Search results fetched successfully',
    data: {
      query: q,
      songs,
      artists,
      albums,
      playlists,
      matchedTags: tagDocs.map((t) => t.name),  // ← shows which tags matched
      counts: {
        songs:     songs.length,
        artists:   artists.length,
        albums:    albums.length,
        playlists: playlists.length,
        total:     songs.length + artists.length + albums.length + playlists.length,
      },
    },
  };
}

  // ─── Search each type separately ─────────────────────────────────────────

  async searchSongs(q: string, page = 1, limit = 10) {
    const regex = { $regex: q.trim(), $options: 'i' };
    const skip  = (page - 1) * limit;

    const [total, songs] = await Promise.all([
      this.songModel.countDocuments({ name: regex, status: 'active' }),
      this.songModel
        .find({ name: regex, status: 'active' })
        .populate('artists', 'name image')
        .populate('genres',  'name')
        .populate('albums',  'name coverImage')
        .select('name coverImage duration playCount artists genres albums')
        .sort({ playCount: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return { message: 'Songs found', data: { songs, total, page, limit } };
  }

  async searchArtists(q: string, page = 1, limit = 10) {
    const regex = { $regex: q.trim(), $options: 'i' };
    const skip  = (page - 1) * limit;

    const [total, artists] = await Promise.all([
      this.artistModel.countDocuments({ name: regex, status: 'active' }),
      this.artistModel
        .find({ name: regex, status: 'active' })
        .select('name image description')
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return { message: 'Artists found', data: { artists, total, page, limit } };
  }

  async searchAlbums(q: string, page = 1, limit = 10) {
    const regex = { $regex: q.trim(), $options: 'i' };
    const skip  = (page - 1) * limit;

    const [total, albums] = await Promise.all([
      this.albumModel.countDocuments({ name: regex, status: 'active' }),
      this.albumModel
        .find({ name: regex, status: 'active' })
        .populate('artists', 'name image')
        .select('name coverImage releaseDate artists')
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return { message: 'Albums found', data: { albums, total, page, limit } };
  }

  async searchPlaylists(q: string, page = 1, limit = 10) {
    const regex = { $regex: q.trim(), $options: 'i' };
    const skip  = (page - 1) * limit;

    const [total, playlists] = await Promise.all([
      this.playlistModel.countDocuments({ name: regex, ownerType: 'admin', status: 'active' }),
      this.playlistModel
        .find({ name: regex, ownerType: 'admin', status: 'active' })
        .select('name coverImage songs')
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return { message: 'Playlists found', data: { playlists, total, page, limit } };
  }

  async searchByTags(tags: string[], page = 1, limit = 10) {
  if (!tags?.length) {
    return { message: 'At least one tag is required', data: { songs: [], total: 0, page, limit } };
  }

  const skip = (page - 1) * limit;

  // find tag IDs matching the provided tag names
  const tagDocs = await this.songModel.db
    .collection('tags')
    .find({ name: { $in: tags.map((t) => new RegExp(`^${t.trim()}$`, 'i')) } })
    .project({ _id: 1, name: 1 })
    .toArray();

  if (!tagDocs.length) {
    return { message: 'No tags found', data: { songs: [], total: 0, page, limit } };
  }

  const tagIds = tagDocs.map((t) => t._id);

  // find songs that have ALL provided tags (strict) or ANY tag (flexible)
  // using ANY — more results, better UX
  const filter = {
    status: 'active',
    tags:   { $in: tagIds },
  };

  const [total, songs] = await Promise.all([
    this.songModel.countDocuments(filter),
    this.songModel
      .find(filter)
      .populate('artists', 'name image')
      .populate('genres',  'name')
      .populate('tags',    'name')
      .populate('albums',  'name coverImage')
      .select('name coverImage duration playCount artists genres albums tags')
      .sort({ playCount: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return {
    message: 'Songs fetched by tags successfully',
    data: {
      matchedTags: tagDocs.map((t) => t.name),
      songs,
      total,
      page,
      limit,
    },
  };
}

}