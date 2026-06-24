import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { RoleType } from '../../common/enums/role.enum';
import { createFilter, createPaginationInfo, createMeta } from '../../common/utils/pagination.util';
import { GetUsersQueryDto, UpdateUserDto, AdminUpdateUserDto } from './dto/user.dto';
import { CloudinaryService } from '../../infrastructure/cloudinary/cloudinary.service';
import { USER_LIST_FIELDS } from '../../core/constants';


const SELECT_FIELDS = USER_LIST_FIELDS;


@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}


  // ─── Admin ──────────
  async getAllUsers(query: GetUsersQueryDto) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 10);
    
    const filter: any = createFilter(query.search, query.date);
    filter.role = RoleType.USER;

    // search by name or email
    if (query.search) {
      filter.$or = [
        { name:  { $regex: query.search, $options: 'i' } },
        { email: { $regex: query.search, $options: 'i' } },
      ];
      delete filter.name;  // remove the default name filter createFilter added
    }

    const total = await this.userModel.countDocuments(filter);
    const users = await this.userModel
      .find(filter)
      .populate('subscription.planId', 'name price billingCycle')
      .select('-password -refreshToken -__v')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      message: 'Users fetched successfully',
      meta: createMeta(page, limit, total),
      data: { users, paginationInfo: createPaginationInfo(page, limit, total) },
    };
  }

  async getAllAdmins(query: GetUsersQueryDto) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 10);
    const filter = { ...createFilter(query.search, query.date), role: RoleType.ADMIN };

    const total = await this.userModel.countDocuments(filter);
    const admins = await this.userModel
      .find(filter)
      .select(SELECT_FIELDS)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      message: 'Admins fetched successfully',
      meta: createMeta(page, limit, total),
      data: { admins, paginationInfo: createPaginationInfo(page, limit, total) },
    };
  }


  // ─── User Profile ────────────

  async getUserById(userId: string | Types.ObjectId) {
    const user = await this.userModel.findById(userId).select(SELECT_FIELDS);
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    return { message: 'User profile fetched successfully', data: user };
  }


  async updateUser(userId: string | Types.ObjectId, dto: UpdateUserDto) {
    const updated = await this.userModel
      .findByIdAndUpdate(userId, dto, { new: true, runValidators: true })
      .select(SELECT_FIELDS);
    if (!updated) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    return { message: 'User profile updated successfully', data: updated };
  }


  async deleteUser(userId: string | Types.ObjectId) {
    const deleted = await this.userModel.findByIdAndDelete(userId);
    if (!deleted) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    return { message: 'Your account has been deleted', data: null };
  }


  // ─── Single Avatar ──────────────

  async createAvatar(userId: string, files: { [fieldname: string]: Express.Multer.File[] }) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const profileImage = files['profileImage']?.[0];
    if (!profileImage) throw new HttpException('Profile image is required', HttpStatus.BAD_REQUEST);

    const result = await this.cloudinaryService.upload(
      profileImage.path,
      `${user._id}-${Date.now()}`,
      'user-profile',
    );

    const updated = await this.userModel
      .findByIdAndUpdate(userId, { profileImage: result.url }, { new: true })
      .select(SELECT_FIELDS);

    return { message: 'Avatar uploaded successfully', data: updated };
  }


  async updateAvatar(userId: string, files: { [fieldname: string]: Express.Multer.File[] }) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const profileImage = files['profileImage']?.[0];
    if (!profileImage) throw new HttpException('Profile image is required', HttpStatus.BAD_REQUEST);

    if (user.profileImage) await this.cloudinaryService.delete(user.profileImage);

    const result = await this.cloudinaryService.upload(
      profileImage.path,
      `${user._id}-${Date.now()}`,
      'user-profile',
    );

    const updated = await this.userModel
      .findByIdAndUpdate(userId, { profileImage: result.url }, { new: true })
      .select(SELECT_FIELDS);

    return { message: 'Avatar updated successfully', data: updated };
  }


  async deleteAvatar(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    if (!user.profileImage) throw new HttpException('No profile image to delete', HttpStatus.BAD_REQUEST);

    await this.cloudinaryService.delete(user.profileImage);
    const updated = await this.userModel
      .findByIdAndUpdate(userId, { profileImage: '' }, { new: true })
      .select(SELECT_FIELDS);

    return { message: 'Avatar deleted successfully', data: updated };
  }


  // ─── Multiple Avatar ───────────────

  async createMultipleAvatars(userId: string, files: { [fieldname: string]: Express.Multer.File[] }) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const images = files['multiProfileImage'];
    if (!images?.length) throw new HttpException('Profile images are required', HttpStatus.BAD_REQUEST);

    const urls = await Promise.all(
      images.map((img, i) =>
        this.cloudinaryService
          .upload(img.path, `${user._id}-${Date.now()}-${i}`, 'user-profile')
          .then((r) => r.url),
      ),
    );

    const updated = await this.userModel
      .findByIdAndUpdate(userId, { multiProfileImage: urls }, { new: true })
      .select(SELECT_FIELDS);

    return { message: 'Multiple avatars uploaded successfully', data: updated };
  }


  async updateMultipleAvatars(userId: string, files: { [fieldname: string]: Express.Multer.File[] }) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const images = files['multiProfileImage'];
    if (!images?.length) throw new HttpException('Profile images are required', HttpStatus.BAD_REQUEST);

    if (user.multiProfileImage?.length) {
      await Promise.all(user.multiProfileImage.map((url) => this.cloudinaryService.delete(url)));
    }

    const urls = await Promise.all(
      images.map((img, i) =>
        this.cloudinaryService
          .upload(img.path, `${user._id}-${Date.now()}-${i}`, 'user-profile')
          .then((r) => r.url),
      ),
    );

    const updated = await this.userModel
      .findByIdAndUpdate(userId, { multiProfileImage: urls }, { new: true })
      .select(SELECT_FIELDS);

    return { message: 'Multiple avatars updated successfully', data: updated };
  }


  async deleteMultipleAvatars(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    if (!user.multiProfileImage?.length) {
      throw new HttpException('No profile images to delete', HttpStatus.BAD_REQUEST);
    }

    await Promise.all(user.multiProfileImage.map((url) => this.cloudinaryService.delete(url)));
    const updated = await this.userModel
      .findByIdAndUpdate(userId, { multiProfileImage: [] }, { new: true })
      .select(SELECT_FIELDS);

    return { message: 'Multiple avatars deleted successfully', data: updated };
  }


  // ─── PDF ─────────────────────

  async createPDF(userId: string, files: { [fieldname: string]: Express.Multer.File[] }) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const pdfFile = files['userPDF']?.[0];
    if (!pdfFile) throw new HttpException('PDF file is required', HttpStatus.BAD_REQUEST);

    const result = await this.cloudinaryService.upload(
      pdfFile.path,
      `${user._id}-${Date.now()}`,
      'user-pdf',
    );

    const updated = await this.userModel
      .findByIdAndUpdate(userId, { pdfFile: result.url }, { new: true })
      .select(SELECT_FIELDS);

    return { message: 'PDF uploaded successfully', data: updated };
  }


  async updatePDF(userId: string, files: { [fieldname: string]: Express.Multer.File[] }) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const pdfFile = files['userPDF']?.[0];
    if (!pdfFile) throw new HttpException('PDF file is required', HttpStatus.BAD_REQUEST);

    if (user.pdfFile) await this.cloudinaryService.delete(user.pdfFile);

    const result = await this.cloudinaryService.upload(
      pdfFile.path,
      `${user._id}-${Date.now()}`,
      'user-pdf',
    );

    const updated = await this.userModel
      .findByIdAndUpdate(userId, { pdfFile: result.url }, { new: true })
      .select(SELECT_FIELDS);

    return { message: 'PDF updated successfully', data: updated };
  }


  async deletePDF(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    if (!user.pdfFile) throw new HttpException('No PDF file to delete', HttpStatus.BAD_REQUEST);

    await this.cloudinaryService.delete(user.pdfFile);
    const updated = await this.userModel
      .findByIdAndUpdate(userId, { pdfFile: null }, { new: true })
      .select(SELECT_FIELDS);

    return { message: 'PDF deleted successfully', data: updated };
  }


  async getRecentlyPlayed(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .populate({
        path:     'recentlyPlayed.song',
        select:   'name audioFile coverImage duration artists genres tags playCount',
        populate: [
          { path: 'artists', select: 'name image' },
          { path: 'genres',  select: 'name'       },
          { path: 'tags',    select: 'name'        },
        ],
      })
      .select('recentlyPlayed')
      .lean();

    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    // filter out any nulls (deleted songs)
    const songs = (user.recentlyPlayed ?? [])
      .filter((r: any) => r.song !== null)
      .map((r: any) => ({
        ...r.song,
        playedAt: r.playedAt,
      }));

    return {
      message: 'Recently played songs fetched successfully',
      data:    { songs, count: songs.length },
    };
  }

  // ─── Admin CRUD ───────────────

  async adminGetUserById(id: string) {
    const user = await this.userModel
      .findById(id)
      .populate('subscription.planId', 'name price billingCycle')
      .select('-password -refreshToken -__v');
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    return { message: 'User fetched successfully', data: user };
  }


  async adminUpdateUser(id: string, dto: AdminUpdateUserDto) {
    const updated = await this.userModel
      .findByIdAndUpdate(id, dto, { new: true, runValidators: true })
      .select(SELECT_FIELDS);
    if (!updated) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    return { message: 'User updated successfully', data: updated };
  }


  async adminDeleteUser(id: string) {
    const deleted = await this.userModel.findByIdAndDelete(id);
    if (!deleted) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    return { message: 'User deleted successfully', data: null };
  }

  // ─── Favorite Songs ───────────────────────────────────────────────────────

async toggleFavoriteSong(userId: string, songId: string) {
  const user = await this.userModel.findById(userId);
  if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

  const songObjectId  = new Types.ObjectId(songId);
  const alreadyFaved  = user.favoriteSongs
    .map((id) => id.toString())
    .includes(songId);

  const update = alreadyFaved
    ? { $pull: { favoriteSongs: songObjectId } }
    : { $addToSet: { favoriteSongs: songObjectId } };

  await this.userModel.findByIdAndUpdate(userId, update);

  return {
    message:    alreadyFaved ? 'Song removed from favorites' : 'Song added to favorites',
    data:       { isFavorite: !alreadyFaved },
  };
}

async getFavoriteSongs(userId: string) {
  const user = await this.userModel
    .findById(userId)
    .populate({
      path:     'favoriteSongs',
      select:   'name audioFile coverImage duration artists genres tags',
      populate: [
        { path: 'artists', select: 'name image' },
        { path: 'genres',  select: 'name'       },
        { path: 'tags',    select: 'name'        },
      ],
    })
    .select('favoriteSongs');

  if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

  return {
    message: 'Favorite songs fetched successfully',
    data:    { songs: user.favoriteSongs, count: user.favoriteSongs.length },
  };
}

// ─── Favorite Albums ──────────────────────────────────────────────────────

async toggleFavoriteAlbum(userId: string, albumId: string) {
  const user = await this.userModel.findById(userId);
  if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

  const albumObjectId  = new Types.ObjectId(albumId);
  const alreadyFaved   = user.favoriteAlbums
    .map((id) => id.toString())
    .includes(albumId);

  const update = alreadyFaved
    ? { $pull:     { favoriteAlbums: albumObjectId } }
    : { $addToSet: { favoriteAlbums: albumObjectId } };

  await this.userModel.findByIdAndUpdate(userId, update);

  return {
    message: alreadyFaved ? 'Album removed from favorites' : 'Album added to favorites',
    data:    { isFavorite: !alreadyFaved },
  };
}

async getFavoriteAlbums(userId: string) {
  const user = await this.userModel
    .findById(userId)
    .populate({
      path:     'favoriteAlbums',
      select:   'name coverImage releaseDate artists',
      populate: { path: 'artists', select: 'name image' },
    })
    .select('favoriteAlbums');

  if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

  return {
    message: 'Favorite albums fetched successfully',
    data:    { albums: user.favoriteAlbums, count: user.favoriteAlbums.length },
  };
}

// ─── Check favorite status (for frontend heart icon) ─────────────────────

async getFavoriteStatus(userId: string, songIds: string[], albumIds: string[]) {
  const user = await this.userModel
    .findById(userId)
    .select('favoriteSongs favoriteAlbums');

  if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

  const favSongSet  = new Set(user.favoriteSongs.map((id) => id.toString()));
  const favAlbumSet = new Set(user.favoriteAlbums.map((id) => id.toString()));

  return {
    message: 'Favorite status fetched',
    data: {
      songs:  Object.fromEntries(songIds.map((id)  => [id, favSongSet.has(id)])),
      albums: Object.fromEntries(albumIds.map((id) => [id, favAlbumSet.has(id)])),
    },
    };
  }
}


