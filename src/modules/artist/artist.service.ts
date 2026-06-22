import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Artist, ArtistDocument } from './schemas/artist.schema';
import { CreateArtistDto, UpdateArtistDto, GetArtistsQueryDto } from './dto/artist.dto';
import { S3Service } from '../../infrastructure/s3/s3.service';
import { createFilter, createMeta, createPaginationInfo } from '../../common/utils/pagination.util';
import { Song, SongDocument } from '../song/schemas/song.schema';
import { Album, AlbumDocument } from '../album/schemas/album.schema';


@Injectable()
export class ArtistService {
  constructor(
    @InjectModel(Artist.name) private readonly artistModel: Model<ArtistDocument>,
    @InjectModel(Song.name)   private readonly songModel:   Model<SongDocument>,
    @InjectModel(Album.name)  private readonly albumModel:  Model<AlbumDocument>,
    private readonly s3Service: S3Service,
  ) {}

  async create(
    dto: CreateArtistDto,
    files: { [fieldname: string]: Express.Multer.File[] },
  ) {
    const imageFile = files['image']?.[0];

    let image    = '';
    let imageKey = '';

    if (imageFile) {
      const uploaded = await this.s3Service.upload(imageFile.path, 'artists');
      image    = uploaded.url;
      imageKey = uploaded.key;
    }

    const artist = await this.artistModel.create({ ...dto, image, imageKey });
    return { message: 'Artist created successfully', data: artist };
  }

  async findAll(query: GetArtistsQueryDto) {
    const page  = Number(query.page  || 1);
    const limit = Number(query.limit || 10);
    const filter = createFilter(query.search, query.date);

    if (query.status) filter.status = query.status;

    const total   = await this.artistModel.countDocuments(filter);
    const artists = await this.artistModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-__v');

    const artistsWithCount = await Promise.all(
      artists.map(async (artist) => {
        const [songCount, albumCount] = await Promise.all([
          this.songModel.countDocuments({ artists: artist._id }),
          this.albumModel.countDocuments({ artists: artist._id }),
        ]);
        return { ...artist.toObject(), songCount, albumCount };
      }),
    );

    return {
      message: 'Artists fetched successfully',
      meta:    createMeta(page, limit, total),
      data:    { artists: artistsWithCount, paginationInfo: createPaginationInfo(page, limit, total) },
    };
  }

  async findOne(id: string) {
    const artist = await this.artistModel.findById(id).select('-__v');
    if (!artist) throw new HttpException('Artist not found', HttpStatus.NOT_FOUND);
    return { message: 'Artist fetched successfully', data: artist };
  }

  async update(
    id: string,
    dto: UpdateArtistDto,
    files: { [fieldname: string]: Express.Multer.File[] },
  ) {
    const artist = await this.artistModel.findById(id);
    if (!artist) throw new HttpException('Artist not found', HttpStatus.NOT_FOUND);

    const imageFile = files['image']?.[0];
    let image    = artist.image;
    let imageKey = artist.imageKey;

    if (imageFile) {
      if (artist.imageKey) await this.s3Service.delete(artist.imageKey);
      const uploaded = await this.s3Service.upload(imageFile.path, 'artists');
      image    = uploaded.url;
      imageKey = uploaded.key;
    }

    const updated = await this.artistModel
      .findByIdAndUpdate(id, { ...dto, image, imageKey }, { new: true, runValidators: true })
      .select('-__v');

    return { message: 'Artist updated successfully', data: updated };
  }

  async remove(id: string) {
    const artist = await this.artistModel.findByIdAndDelete(id);
    if (!artist) throw new HttpException('Artist not found', HttpStatus.NOT_FOUND);

    if (artist.imageKey) await this.s3Service.delete(artist.imageKey);

    return { message: 'Artist deleted successfully', data: null };
  }

  async updateImage(id: string, files: { [fieldname: string]: Express.Multer.File[] }) {
    const artist = await this.artistModel.findById(id);
    if (!artist) throw new HttpException('Artist not found', HttpStatus.NOT_FOUND);

    const imageFile = files['image']?.[0];
    if (!imageFile) throw new HttpException('Image is required', HttpStatus.BAD_REQUEST);

    if (artist.imageKey) await this.s3Service.delete(artist.imageKey);

    const uploaded = await this.s3Service.upload(imageFile.path, 'artists');

    const updated = await this.artistModel
      .findByIdAndUpdate(id, { image: uploaded.url, imageKey: uploaded.key }, { new: true })
      .select('-__v');

    return { message: 'Artist image updated successfully', data: updated };
  }

  async getProfile(id: string) {
  const artist = await this.artistModel.findById(id).select('-__v');
  if (!artist) throw new HttpException('Artist not found', HttpStatus.NOT_FOUND);

  const [albums, allSongs] = await Promise.all([
    // all albums this artist is involved in
    this.albumModel
      .find({ artists: artist._id, status: 'active' })
      .populate('artists', 'name image')
      .select('-__v')
      .sort({ releaseDate: -1 }),

    // all songs by this artist
    this.songModel
      .find({ artists: artist._id, status: 'active' })
      .populate('artists', 'name image')
      .populate('genres',  'name')
      .populate('tags',    'name')
      .select('-__v')
      .sort({ playCount: -1 }),
  ]);

  // popular songs — top 5 by playCount
  const popularSongs = allSongs.slice(0, 5);

  // singles — songs not in any album
  const singles = allSongs.filter((song) => !song.albums?.length);

  // // album songs — songs that belong to at least one album
  // const albumSongs = allSongs.filter((song) => song.albums?.length > 0);

  return {
    message: 'Artist profile fetched successfully',
    data: {
      artist,
      stats: {
        totalSongs:   allSongs.length,
        totalAlbums:  albums.length,
        totalSingles: singles.length,
        totalPlays:   allSongs.reduce((sum, s) => sum + (s.playCount ?? 0), 0),
      },
      popularSongs,
      albums,
      singles,
      //albumSongs,
    },
  };
}
}