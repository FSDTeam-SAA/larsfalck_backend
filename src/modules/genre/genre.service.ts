import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Genre, GenreDocument } from './schemas/genre.schema';
import { CreateGenreDto, UpdateGenreDto, GetGenresQueryDto } from './dto/genre.dto';
import { createFilter, createMeta, createPaginationInfo } from '../../common/utils/pagination.util';
import { Song, SongDocument } from '../song/schemas/song.schema';


@Injectable()
export class GenreService {
  constructor(
    @InjectModel(Genre.name) private readonly genreModel: Model<GenreDocument>,
    @InjectModel(Song.name)  private readonly songModel:  Model<SongDocument>,
  ) {}

  async create(dto: CreateGenreDto) {
    const existing = await this.genreModel.findOne({
      name: { $regex: `^${dto.name}$`, $options: 'i' },
    });
    if (existing) throw new HttpException('Genre already exists', HttpStatus.CONFLICT);

    const genre = await this.genreModel.create(dto);
    return { message: 'Genre created successfully', data: genre };
  }

  async findAll(query: GetGenresQueryDto) {
    const page  = Number(query.page  || 1);
    const limit = Number(query.limit || 10);
    const filter = createFilter(query.search, query.date);

    if (query.status) filter.status = query.status;

    const total  = await this.genreModel.countDocuments(filter);
    const genres = await this.genreModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-__v');

    // attach song count to each genre
    const genresWithCount = await Promise.all(
      genres.map(async (genre) => {
        const songCount = await this.songModel.countDocuments({
          genres: genre._id,
        });
        return { ...genre.toObject(), songCount };
      }),
    );

    return {
      message: 'Genres fetched successfully',
      meta:    createMeta(page, limit, total),
      data:    { genres: genresWithCount, paginationInfo: createPaginationInfo(page, limit, total) },
    };
  }

  async findOne(id: string) {
    const genre = await this.genreModel.findById(id).select('-__v');
    if (!genre) throw new HttpException('Genre not found', HttpStatus.NOT_FOUND);
    return { message: 'Genre fetched successfully', data: genre };
  }

  async update(id: string, dto: UpdateGenreDto) {
    if (dto.name) {
      const existing = await this.genreModel.findOne({
        name: { $regex: `^${dto.name}$`, $options: 'i' },
        _id:  { $ne: id },
      });
      if (existing) throw new HttpException('Genre name already taken', HttpStatus.CONFLICT);
    }

    const updated = await this.genreModel
      .findByIdAndUpdate(id, dto, { new: true, runValidators: true })
      .select('-__v');
    if (!updated) throw new HttpException('Genre not found', HttpStatus.NOT_FOUND);

    return { message: 'Genre updated successfully', data: updated };
  }

  async remove(id: string) {
    const deleted = await this.genreModel.findByIdAndDelete(id);
    if (!deleted) throw new HttpException('Genre not found', HttpStatus.NOT_FOUND);
    return { message: 'Genre deleted successfully', data: null };
  }
}