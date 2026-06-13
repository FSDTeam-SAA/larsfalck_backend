import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tag, TagDocument } from './schemas/tag.schema';
import { CreateTagDto, UpdateTagDto, GetTagsQueryDto } from './dto/tag.dto';
import { createFilter, createMeta, createPaginationInfo } from '../../common/utils/pagination.util';


@Injectable()
export class TagService {
  constructor(
    @InjectModel(Tag.name) private readonly tagModel: Model<TagDocument>,
  ) {}

  async create(dto: CreateTagDto) {
    const existing = await this.tagModel.findOne({
      name: { $regex: `^${dto.name}$`, $options: 'i' },
    });
    if (existing) throw new HttpException('Tag already exists', HttpStatus.CONFLICT);

    const tag = await this.tagModel.create(dto);
    return { message: 'Tag created successfully', data: tag };
  }

  async createBulk(names: string[]) {
    const results: any[] = [];
    const skipped: string[] = [];

    for (const name of names) {
      const existing = await this.tagModel.findOne({
        name: { $regex: `^${name.trim()}$`, $options: 'i' },
      });
      if (existing) { skipped.push(name); continue; }
      const tag = await this.tagModel.create({ name: name.trim() });
      results.push(tag);
    }

    return {
      message: `${results.length} tag(s) created, ${skipped.length} skipped (already exist)`,
      data: { created: results, skipped },
    };
  }

  async findAll(query: GetTagsQueryDto) {
    const page  = Number(query.page  || 1);
    const limit = Number(query.limit || 10);
    const filter = createFilter(query.search, query.date);

    if (query.status) filter.status = query.status;

    const total = await this.tagModel.countDocuments(filter);
    const tags  = await this.tagModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-__v');

    return {
      message: 'Tags fetched successfully',
      meta:    createMeta(page, limit, total),
      data:    { tags, paginationInfo: createPaginationInfo(page, limit, total) },
    };
  }

  async findOne(id: string) {
    const tag = await this.tagModel.findById(id).select('-__v');
    if (!tag) throw new HttpException('Tag not found', HttpStatus.NOT_FOUND);
    return { message: 'Tag fetched successfully', data: tag };
  }

  async update(id: string, dto: UpdateTagDto) {
    if (dto.name) {
      const existing = await this.tagModel.findOne({
        name: { $regex: `^${dto.name}$`, $options: 'i' },
        _id:  { $ne: id },
      });
      if (existing) throw new HttpException('Tag name already taken', HttpStatus.CONFLICT);
    }

    const updated = await this.tagModel
      .findByIdAndUpdate(id, dto, { new: true, runValidators: true })
      .select('-__v');
    if (!updated) throw new HttpException('Tag not found', HttpStatus.NOT_FOUND);

    return { message: 'Tag updated successfully', data: updated };
  }

  async remove(id: string) {
    const deleted = await this.tagModel.findByIdAndDelete(id);
    if (!deleted) throw new HttpException('Tag not found', HttpStatus.NOT_FOUND);
    return { message: 'Tag deleted successfully', data: null };
  }
}