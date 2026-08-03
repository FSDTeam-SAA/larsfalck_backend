import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Playlist, PlaylistDocument } from './schemas/playlist.schema';
import { Song, SongDocument } from '../song/schemas/song.schema';
import {
  CreatePlaylistDto, UpdatePlaylistDto,
  AddRemoveSongsDto, GetPlaylistsQueryDto,
} from './dto/playlist.dto';
import { S3Service } from '../../infrastructure/s3/s3.service';
import { createFilter, createMeta, createPaginationInfo } from '../../common/utils/pagination.util';
import { User, UserDocument } from '../auth/schemas/user.schema';


const PLAYLIST_POPULATE = [
  { path: 'owner', select: 'name email profileImage' },
  {
    path: 'songs',
    select: 'name audioFile coverImage duration artists genres tags',
    populate: [
      { path: 'artists', select: 'name' },
      { path: 'genres',  select: 'name' },
    ],
  },
];


@Injectable()
export class PlaylistService {
  constructor(
    @InjectModel(Playlist.name) private readonly playlistModel: Model<PlaylistDocument>,
    @InjectModel(Song.name)     private readonly songModel:     Model<SongDocument>,
     @InjectModel(User.name)     private readonly userModel:     Model<UserDocument>,
    private readonly s3Service: S3Service,
  ) {}

  // ─── resolve cover: use uploaded file OR first song cover ────────────────

  private async resolveCover(
    songs: string[],
    files: { [fieldname: string]: Express.Multer.File[] },
  ): Promise<{ coverImage: string; coverImageKey: string; hasCustomCover: boolean }> {
    const coverFile = files['coverImage']?.[0];

    if (coverFile) {
      const uploaded = await this.s3Service.upload(coverFile.path, 'playlists');
      return { coverImage: uploaded.url, coverImageKey: uploaded.key, hasCustomCover: true };
    }

    // fall back to first song's cover image
    if (songs?.length) {
      const firstSong = await this.songModel.findById(songs[0]).select('coverImage');
      if (firstSong?.coverImage) {
        return { coverImage: firstSong.coverImage, coverImageKey: '', hasCustomCover: false };
      }
    }

    return { coverImage: '', coverImageKey: '', hasCustomCover: false };
  }

  // ─── Admin: create public playlist ───────────────────────────────────────

  async adminCreate(
    userId: string,
    dto: CreatePlaylistDto,
    files: { [fieldname: string]: Express.Multer.File[] },
  ) {
    const cover = await this.resolveCover(dto.songs ?? [], files);

    const playlist = await this.playlistModel.create({
      name:        dto.name,
      description: dto.description ?? '',
      owner:       userId,
      ownerType:   'admin',
      songs:       dto.songs ?? [],
      status:      dto.status ?? 'active',
      ...cover,
    });

    return {
      message: 'Playlist created successfully',
      data:    await playlist.populate(PLAYLIST_POPULATE),
    };
  }

  // ─── User: create personal playlist ─────────────────────────────────────

  async userCreate(
    userId: string,
    dto: CreatePlaylistDto,
    files: { [fieldname: string]: Express.Multer.File[] },
  ) {
    const cover = await this.resolveCover(dto.songs ?? [], files);

    const playlist = await this.playlistModel.create({
      name:        dto.name,
      description: dto.description ?? '',
      owner:       userId,
      ownerType:   'user',
      songs:       dto.songs ?? [],
      status:      'active',
      ...cover,
    });

    return {
      message: 'Playlist created successfully',
      data:    await playlist.populate(PLAYLIST_POPULATE),
    };
  }

  // ─── Admin: get all playlists (both admin + user) ────────────────────────

  async adminFindAll(query: GetPlaylistsQueryDto) {
    const page   = Number(query.page  || 1);
    const limit  = Number(query.limit || 10);
    const filter = createFilter(query.search, query.date);

    if (query.status) filter.status = query.status;

    const total     = await this.playlistModel.countDocuments(filter);
    const playlists = await this.playlistModel
      .find(filter)
      .populate('owner', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-__v');

    return {
      message: 'Playlists fetched successfully',
      meta:    createMeta(page, limit, total),
      data:    { playlists, paginationInfo: createPaginationInfo(page, limit, total) },
    };
  }

  // ─── Public: get admin playlists only (website listing) ─────────────────

  async findPublic(query: GetPlaylistsQueryDto) {
    const page   = Number(query.page  || 1);
    const limit  = Number(query.limit || 10);
    const filter = createFilter(query.search, query.date);

    filter.ownerType = 'admin';
    filter.status    = 'active';

    const total     = await this.playlistModel.countDocuments(filter);
    const playlists = await this.playlistModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-__v -coverImageKey');

    return {
      message: 'Playlists fetched successfully',
      meta:    createMeta(page, limit, total),
      data:    { playlists, paginationInfo: createPaginationInfo(page, limit, total) },
    };
  }

  // ─── User: get own playlists only ────────────────────────────────────────

  async userFindAll(userId: string, query: GetPlaylistsQueryDto) {
    const page   = Number(query.page  || 1);
    const limit  = Number(query.limit || 10);
    const filter = createFilter(query.search, query.date);

    filter.owner     = new Types.ObjectId(userId);
    filter.ownerType = 'user';

    if (query.status) filter.status = query.status;

    const total     = await this.playlistModel.countDocuments(filter);
    const playlists = await this.playlistModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-__v -coverImageKey');

    return {
      message: 'Your playlists fetched successfully',
      meta:    createMeta(page, limit, total),
      data:    { playlists, paginationInfo: createPaginationInfo(page, limit, total) },
    };
  }

  // ─── Get single — admin sees any, user sees own or public admin ──────────

async findOne(id: string, userId: string, isAdmin: boolean) {
  const playlist = await this.playlistModel
    .findById(id)
    .select('-__v -coverImageKey')
    .lean() as any;  

  if (!playlist) throw new HttpException('Playlist not found', HttpStatus.NOT_FOUND);

  if (!isAdmin) {
    const isOwner  = playlist.owner.toString() === userId;
    const isPublic = playlist.ownerType === 'admin' && playlist.status === 'active';
    if (!isOwner && !isPublic)
      throw new HttpException('Playlist not found', HttpStatus.NOT_FOUND);
  }

  

  // populate owner
  const owner = await this.userModel
    .findById(playlist.owner)
    .select('name email profileImage')
    .lean();

  // populate songs
  const rawSongs = await this.songModel
    .find({ _id: { $in: playlist.songs } })
    .populate('artists', 'name image')
    .populate('genres',  'name')
    .select('name audioFile coverImage duration artists genres tags playCount')
    .lean();

  // apply songOrder if exists
  let orderedSongs = rawSongs;
  if (playlist.songOrder?.length) {
    const orderMap = new Map<string, number>(
      playlist.songOrder.map((sid: any, index: number) => [sid.toString(), index]),
    );
    orderedSongs = [...rawSongs].sort((a: any, b: any) => {
      const aIdx = orderMap.has(a._id.toString()) ? orderMap.get(a._id.toString())! : 999;
      const bIdx = orderMap.has(b._id.toString()) ? orderMap.get(b._id.toString())! : 999;
      return aIdx - bIdx;
    });
  }

  


  return {
    message: 'Playlist fetched successfully',
    data:    { ...playlist, owner, songs: orderedSongs },
  };
}

  // ─── Update — admin updates any, user updates own only ──────────────────

  async update(
    id: string,
    userId: string,
    isAdmin: boolean,
    dto: UpdatePlaylistDto,
    files: { [fieldname: string]: Express.Multer.File[] },
  ) {
    const playlist = await this.playlistModel.findById(id);
    if (!playlist) throw new HttpException('Playlist not found', HttpStatus.NOT_FOUND);

    if (!isAdmin && playlist.owner.toString() !== userId)
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);

    let coverImage    = playlist.coverImage;
    let coverImageKey = playlist.coverImageKey;
    let hasCustomCover = playlist.hasCustomCover;

    const coverFile = files['coverImage']?.[0];
    if (coverFile) {
      // delete old custom cover from S3 only if it was previously uploaded
      if (playlist.hasCustomCover && playlist.coverImageKey)
        await this.s3Service.delete(playlist.coverImageKey);

      const uploaded = await this.s3Service.upload(coverFile.path, 'playlists');
      coverImage     = uploaded.url;
      coverImageKey  = uploaded.key;
      hasCustomCover = true;

    } else if (dto.songs?.length && !playlist.hasCustomCover) {
      // songs changed and no custom cover — re-resolve from first song
      const firstSong = await this.songModel.findById(dto.songs[0]).select('coverImage');
      if (firstSong?.coverImage) coverImage = firstSong.coverImage;
    }

    const updated = await this.playlistModel
      .findByIdAndUpdate(
        id,
        { ...dto, coverImage, coverImageKey, hasCustomCover },
        { new: true, runValidators: true },
      )
      .populate(PLAYLIST_POPULATE)
      .select('-__v -coverImageKey');

    return { message: 'Playlist updated successfully', data: updated };
  }

  // ─── Add songs ────────────────────────────────────────────────────────────

  async addSongs(id: string, userId: string, isAdmin: boolean, dto: AddRemoveSongsDto) {
    const playlist = await this.playlistModel.findById(id);
    if (!playlist) throw new HttpException('Playlist not found', HttpStatus.NOT_FOUND);

    if (!isAdmin && playlist.owner.toString() !== userId)
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);

    const newSongs = dto.songs.filter(
      (s) => !playlist.songs.map((p) => p.toString()).includes(s),
    );

    playlist.songs.push(...newSongs.map((s) => new Types.ObjectId(s)));

    // auto-assign cover from first song if no custom cover and no cover yet
    if (!playlist.hasCustomCover && !playlist.coverImage && playlist.songs.length) {
      const firstSong = await this.songModel
        .findById(playlist.songs[0])
        .select('coverImage');
      if (firstSong?.coverImage) playlist.coverImage = firstSong.coverImage;
    }

    await playlist.save();

    return {
      message: `${newSongs.length} song(s) added to playlist`,
      data:    await playlist.populate(PLAYLIST_POPULATE),
    };
  }

  // ─── Remove songs ─────────────────────────────────────────────────────────

  async removeSongs(id: string, userId: string, isAdmin: boolean, dto: AddRemoveSongsDto) {
    const playlist = await this.playlistModel.findById(id);
    if (!playlist) throw new HttpException('Playlist not found', HttpStatus.NOT_FOUND);

    if (!isAdmin && playlist.owner.toString() !== userId)
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);

    playlist.songs = playlist.songs.filter(
      (s) => !dto.songs.includes(s.toString()),
    ) as Types.ObjectId[];

    // re-resolve cover from new first song if no custom cover
    if (!playlist.hasCustomCover) {
      if (playlist.songs.length) {
        const firstSong = await this.songModel
          .findById(playlist.songs[0])
          .select('coverImage');
        playlist.coverImage = firstSong?.coverImage ?? '';
      } else {
        playlist.coverImage = '';
      }
    }

    await playlist.save();

    return {
      message: 'Song(s) removed from playlist',
      data:    await playlist.populate(PLAYLIST_POPULATE),
    };
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

async remove(id: string, userId: string, isAdmin: boolean) {
    const playlist = await this.playlistModel.findById(id);
    if (!playlist) throw new HttpException('Playlist not found', HttpStatus.NOT_FOUND);

    if (!isAdmin && playlist.owner.toString() !== userId)
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);

    const songIds = [...playlist.songs];

    // fetch songs first so we still have their S3 keys after deleting them
    const songs = songIds.length
      ? await this.songModel.find({ _id: { $in: songIds } }).select('audioKey coverImageKey')
      : [];

    await playlist.deleteOne();

    if (songIds.length) {
      await this.songModel.deleteMany({ _id: { $in: songIds } });
    }

    // clean up S3: playlist's own custom cover + every deleted song's audio/cover
    const s3Deletes: Promise<any>[] = [];

    if (playlist.hasCustomCover && playlist.coverImageKey)
      s3Deletes.push(this.s3Service.delete(playlist.coverImageKey));

    for (const song of songs) {
      if (song.audioKey)      s3Deletes.push(this.s3Service.delete(song.audioKey));
      if (song.coverImageKey) s3Deletes.push(this.s3Service.delete(song.coverImageKey));
    }

    await Promise.allSettled(s3Deletes);

    return {
      message: `Playlist and ${songIds.length} song(s) deleted successfully`,
      data:    null,
    };
  }


  async reorderSongs(
  id:      string,
  userId:  string,
  isAdmin: boolean,
  songIds: string[],
) {
  const playlist = await this.playlistModel.findById(id);
  if (!playlist) throw new HttpException('Playlist not found', HttpStatus.NOT_FOUND);

  if (!isAdmin && playlist.owner.toString() !== userId)
    throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);

  // validate all IDs belong to this playlist
  const playlistSongIds = playlist.songs.map((s) => s.toString());
  const invalid = songIds.filter((sid) => !playlistSongIds.includes(sid));

  if (invalid.length)
    throw new HttpException(
      `These song IDs don't belong to this playlist: ${invalid.join(', ')}`,
      HttpStatus.BAD_REQUEST,
    );

  await this.playlistModel.findByIdAndUpdate(id, {
    songOrder: songIds.map((sid) => new Types.ObjectId(sid)),
  });

  return { message: 'Playlist songs reordered successfully', data: null };
}
}