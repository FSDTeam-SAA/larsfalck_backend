import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Song, SongDocument } from './schemas/song.schema';
import {
  CreateSongDto,
  UpdateSongDto,
  GetSongsQueryDto,
  BulkUploadSongDto,
} from './dto/song.dto';
import { S3Service } from '../../infrastructure/s3/s3.service';
import { createFilter, createMeta, createPaginationInfo } from '../../common/utils/pagination.util';
import { extractAudioDuration } from '../../common/utils/audio.util';

// populate config reused across queries
const SONG_POPULATE = [
  { path: 'artists', select: 'name image' },
  { path: 'albums',  select: 'name coverImage' },
  { path: 'genres',  select: 'name' },
  { path: 'tags',    select: 'name' },
];


@Injectable()
export class SongService {
  private readonly logger = new Logger(SongService.name);

  constructor(
    @InjectModel(Song.name) private readonly songModel: Model<SongDocument>,
    private readonly s3Service: S3Service,
  ) {}

  // ─── Single Create ────────────────────────────────────────────────────────

  async create(
    dto: CreateSongDto,
    files: { [fieldname: string]: Express.Multer.File[] },
  ) {
    const audioFile = files['audioFile']?.[0];
    if (!audioFile) throw new HttpException('Audio file is required', HttpStatus.BAD_REQUEST);

    const [audio, cover, duration] = await Promise.all([
    this.s3Service.upload(audioFile.path, 'songs/audio'),
    files['coverImage']?.[0]
        ? this.s3Service.upload(files['coverImage'][0].path, 'songs/covers')
        : Promise.resolve(null),
    extractAudioDuration(audioFile.path),   // ← auto extracted before upload
    ]);

    const song = await this.songModel.create({
    ...dto,
    audioFile:     audio.url,
    audioKey:      audio.key,
    coverImage:    cover?.url ?? '',
    coverImageKey: cover?.key ?? '',
    duration,                               // ← replaces dto.duration
    });

    return {
      message: 'Song created successfully',
      data:    await song.populate(SONG_POPULATE),
    };
  }

  // ─── Bulk Create ──────────────────────────────────────────────────────────

  async bulkCreate(
    dto: BulkUploadSongDto,
    audioFiles: Express.Multer.File[],
    coverFile?: Express.Multer.File,     // ← optional shared cover
  ) {
    if (!audioFiles?.length)
      throw new HttpException('At least one audio file is required', HttpStatus.BAD_REQUEST);

    // upload shared cover once if provided
    let sharedCoverUrl = '';
    let sharedCoverKey = '';

    if (coverFile) {
      const uploaded = await this.s3Service.upload(coverFile.path, 'songs/covers');
      sharedCoverUrl = uploaded.url;
      sharedCoverKey = uploaded.key;
    }

    const uploadResults = await Promise.all(
      audioFiles.map(async (f) => {
        const [uploaded, duration] = await Promise.all([
          this.s3Service.upload(f.path, 'songs/audio'),
          extractAudioDuration(f.path),
        ]);
        return { uploaded, duration };
      }),
    );

    const docs = uploadResults.map(({ uploaded, duration }, i) => ({
      name:          audioFiles[i].originalname.replace(/\.[^.]+$/, ''),
      artists:       dto.artists  ?? [],
      albums:        dto.albums   ?? [],
      genres:        dto.genres   ?? [],
      tags:          dto.tags     ?? [],
      audioFile:     uploaded.url,
      audioKey:      uploaded.key,
      coverImage:    sharedCoverUrl,
      coverImageKey: sharedCoverKey,
      duration,
      status:        dto.status ?? 'active',
    }));

    const songs = await this.songModel.insertMany(docs);

    return {
      message: `${songs.length} song(s) uploaded successfully`,
      data:    { count: songs.length, songs },
    };
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  async findAll(query: GetSongsQueryDto) {
    const page  = Number(query.page  || 1);
    const limit = Number(query.limit || 10);
    const filter = createFilter(query.search, query.date);

    if (query.status) filter.status  = query.status;
    if (query.artist) filter.artists = query.artist;
    if (query.album)  filter.albums  = query.album;
    if (query.genre)  filter.genres  = query.genre;
    if (query.tag)    filter.tags    = query.tag;

    const total = await this.songModel.countDocuments(filter);
    const songs = await this.songModel
      .find(filter)
      .populate(SONG_POPULATE)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-__v');

    return {
      message: 'Songs fetched successfully',
      meta:    createMeta(page, limit, total),
      data:    { songs, paginationInfo: createPaginationInfo(page, limit, total) },
    };
  }

  async findOne(id: string) {
    const song = await this.songModel
      .findById(id)
      .populate(SONG_POPULATE)
      .select('-__v');
    if (!song) throw new HttpException('Song not found', HttpStatus.NOT_FOUND);
    return { message: 'Song fetched successfully', data: song };
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(
    id: string,
    dto: UpdateSongDto,
    files: { [fieldname: string]: Express.Multer.File[] },
  ) {
    const song = await this.songModel.findById(id);
    if (!song) throw new HttpException('Song not found', HttpStatus.NOT_FOUND);

    let coverImage    = song.coverImage;
    let coverImageKey = song.coverImageKey;

    const coverFile = files['coverImage']?.[0];
    if (coverFile) {
      if (song.coverImageKey) await this.s3Service.delete(song.coverImageKey);
      const uploaded = await this.s3Service.upload(coverFile.path, 'songs/covers');
      coverImage    = uploaded.url;
      coverImageKey = uploaded.key;
    }

    const updated = await this.songModel
      .findByIdAndUpdate(
        id,
        { ...dto, coverImage, coverImageKey },
        { new: true, runValidators: true },
      )
      .populate(SONG_POPULATE)
      .select('-__v');

    return { message: 'Song updated successfully', data: updated };
  }

  async updateAudioFile(
    id: string,
    files: { [fieldname: string]: Express.Multer.File[] },
  ) {
    const song = await this.songModel.findById(id);
    if (!song) throw new HttpException('Song not found', HttpStatus.NOT_FOUND);

    const audioFile = files['audioFile']?.[0];
    if (!audioFile) throw new HttpException('Audio file is required', HttpStatus.BAD_REQUEST);

    // delete old audio from S3
    if (song.audioKey) await this.s3Service.delete(song.audioKey);

    const uploaded = await this.s3Service.upload(audioFile.path, 'songs/audio');

    const updated = await this.songModel
      .findByIdAndUpdate(
        id,
        { audioFile: uploaded.url, audioKey: uploaded.key },
        { new: true },
      )
      .populate(SONG_POPULATE)
      .select('-__v');

    return { message: 'Audio file updated successfully', data: updated };
  }

  async updateCoverImage(
    id: string,
    files: { [fieldname: string]: Express.Multer.File[] },
  ) {
    const song = await this.songModel.findById(id);
    if (!song) throw new HttpException('Song not found', HttpStatus.NOT_FOUND);

    const coverFile = files['coverImage']?.[0];
    if (!coverFile) throw new HttpException('Cover image is required', HttpStatus.BAD_REQUEST);

    if (song.coverImageKey) await this.s3Service.delete(song.coverImageKey);

    const uploaded = await this.s3Service.upload(coverFile.path, 'songs/covers');

    const updated = await this.songModel
      .findByIdAndUpdate(
        id,
        { coverImage: uploaded.url, coverImageKey: uploaded.key },
        { new: true },
      )
      .populate(SONG_POPULATE)
      .select('-__v');

    return { message: 'Cover image updated successfully', data: updated };
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async remove(id: string) {
    const song = await this.songModel.findByIdAndDelete(id);
    if (!song) throw new HttpException('Song not found', HttpStatus.NOT_FOUND);

    // clean up S3 assets
    await Promise.allSettled([
      song.audioKey      ? this.s3Service.delete(song.audioKey)      : Promise.resolve(),
      song.coverImageKey ? this.s3Service.delete(song.coverImageKey) : Promise.resolve(),
    ]);

    return { message: 'Song deleted successfully', data: null };
  }
}