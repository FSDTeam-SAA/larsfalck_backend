import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Artist, ArtistDocument } from './schemas/artist.schema';
import { CreateArtistDto, UpdateArtistDto, GetArtistsQueryDto } from './dto/artist.dto';
import { S3Service } from '../../infrastructure/s3/s3.service';
import { createFilter, createMeta, createPaginationInfo } from '../../common/utils/pagination.util';
import { Song, SongDocument } from '../song/schemas/song.schema';


@Injectable()
export class ArtistService {
  constructor(
    @InjectModel(Artist.name) private readonly artistModel: Model<ArtistDocument>,
    @InjectModel(Song.name)   private readonly songModel:   Model<SongDocument>,
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
        const songCount = await this.songModel.countDocuments({
          artists: artist._id,
        });
        return { ...artist.toObject(), songCount };
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
}