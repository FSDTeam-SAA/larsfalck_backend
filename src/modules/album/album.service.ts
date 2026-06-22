import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Album, AlbumDocument } from './schemas/album.schema';
import { CreateAlbumDto, UpdateAlbumDto, GetAlbumsQueryDto } from './dto/album.dto';
import { S3Service } from '../../infrastructure/s3/s3.service';
import { createFilter, createMeta, createPaginationInfo } from '../../common/utils/pagination.util';
import { Song, SongDocument } from '../song/schemas/song.schema';


@Injectable()
export class AlbumService {
  constructor(
    @InjectModel(Album.name) private readonly albumModel: Model<AlbumDocument>,
    @InjectModel(Song.name)  private readonly songModel:  Model<SongDocument>,
    private readonly s3Service: S3Service,
  ) {}

  async create(
    dto: CreateAlbumDto,
    files: { [fieldname: string]: Express.Multer.File[] },
  ) {
    const coverFile = files['coverImage']?.[0];

    let coverImage    = '';
    let coverImageKey = '';

    if (coverFile) {
      const uploaded = await this.s3Service.upload(coverFile.path, 'albums');
      coverImage    = uploaded.url;
      coverImageKey = uploaded.key;
    }

    const album = await this.albumModel.create({
      ...dto,
      coverImage,
      coverImageKey,
    });

    return {
      message: 'Album created successfully',
      data:    await album.populate('artists', 'name image'),
    };
  }

  async findAll(query: GetAlbumsQueryDto) {
    const page  = Number(query.page  || 1);
    const limit = Number(query.limit || 10);
    const filter = createFilter(query.search, query.date);

    if (query.status) filter.status  = query.status;
    if (query.artist) filter.artists = query.artist;

    const total  = await this.albumModel.countDocuments(filter);
    const albums = await this.albumModel
      .find(filter)
      .populate('artists', 'name image')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-__v');

    const albumsWithCount = await Promise.all(
      albums.map(async (album) => {
        const songCount = await this.songModel.countDocuments({
          albums: album._id,
        });
        return { ...album.toObject(), songCount };
      }),
    );

    return {
      message: 'Albums fetched successfully',
      meta:    createMeta(page, limit, total),
      data:    { albums: albumsWithCount, paginationInfo: createPaginationInfo(page, limit, total) },
    };
  }

async findOne(id: string) {
  const album = await this.albumModel
    .findById(id)
    .populate('artists', 'name image description status')
    .select('-__v');

  if (!album) throw new HttpException('Album not found', HttpStatus.NOT_FOUND);

  const songs = await this.songModel
    .find({ albums: album._id, status: 'active' })
    .populate('artists', 'name image description status')
    .populate('genres',  'name')
    .populate('tags',    'name')
    .select('-__v')
    .sort({ createdAt: -1 });

  // collect all unique artists across all songs + album artists
  const artistMap = new Map<string, any>();

  // add album-level artists first
  (album.artists as any[]).forEach((artist) => {
    artistMap.set(artist._id.toString(), artist);
  });

  // add song-level artists
  songs.forEach((song) => {
    (song.artists as any[]).forEach((artist) => {
      artistMap.set(artist._id.toString(), artist);
    });
  });

  const uniqueArtists = Array.from(artistMap.values());

  return {
    message: 'Album fetched successfully',
    data: {
      album,
      songs,
      songCount:     songs.length,
      artists:       uniqueArtists,
      artistCount:   uniqueArtists.length,
    },
  };
}

  async update(
    id: string,
    dto: UpdateAlbumDto,
    files: { [fieldname: string]: Express.Multer.File[] },
  ) {
    const album = await this.albumModel.findById(id);
    if (!album) throw new HttpException('Album not found', HttpStatus.NOT_FOUND);

    const coverFile = files['coverImage']?.[0];
    let coverImage    = album.coverImage;
    let coverImageKey = album.coverImageKey;

    if (coverFile) {
      if (album.coverImageKey) await this.s3Service.delete(album.coverImageKey);
      const uploaded = await this.s3Service.upload(coverFile.path, 'albums');
      coverImage    = uploaded.url;
      coverImageKey = uploaded.key;
    }

    const updated = await this.albumModel
      .findByIdAndUpdate(
        id,
        { ...dto, coverImage, coverImageKey },
        { new: true, runValidators: true },
      )
      .populate('artists', 'name image')
      .select('-__v');

    return { message: 'Album updated successfully', data: updated };
  }

  async remove(id: string) {
    const album = await this.albumModel.findByIdAndDelete(id);
    if (!album) throw new HttpException('Album not found', HttpStatus.NOT_FOUND);

    if (album.coverImageKey) await this.s3Service.delete(album.coverImageKey);

    return { message: 'Album deleted successfully', data: null };
  }

  async updateCoverImage(id: string, files: { [fieldname: string]: Express.Multer.File[] }) {
    const album = await this.albumModel.findById(id);
    if (!album) throw new HttpException('Album not found', HttpStatus.NOT_FOUND);

    const coverFile = files['coverImage']?.[0];
    if (!coverFile) throw new HttpException('Cover image is required', HttpStatus.BAD_REQUEST);

    if (album.coverImageKey) await this.s3Service.delete(album.coverImageKey);

    const uploaded = await this.s3Service.upload(coverFile.path, 'albums');

    const updated = await this.albumModel
      .findByIdAndUpdate(
        id,
        { coverImage: uploaded.url, coverImageKey: uploaded.key },
        { new: true },
      )
      .populate('artists', 'name image')
      .select('-__v');

    return { message: 'Cover image updated successfully', data: updated };
  }
}