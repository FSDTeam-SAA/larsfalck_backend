import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  DeleteObjectCommand,
  ObjectCannedACL,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import * as fs   from 'fs';
import * as path from 'path';


@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger(S3Service.name);
  private client: S3Client;
  private bucket: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.client = new S3Client({
      region: this.configService.get<string>('s3.region'),
      credentials: {
        accessKeyId:     this.configService.get<string>('s3.accessKeyId')!,
        secretAccessKey: this.configService.get<string>('s3.secretAccessKey')!,
      },
    });
    this.bucket = this.configService.get<string>('s3.bucketName')!;
  }

  /**
   * Upload a local temp file to S3.
   * @param filePath   absolute path on disk (from multer diskStorage)
   * @param folder     S3 "folder" prefix  e.g. 'artists', 'albums'
   * @returns          public URL and S3 key
   */
  async upload(
    filePath: string,
    folder:   string,
  ): Promise<{ url: string; key: string }> {
    const ext        = path.extname(filePath);
    const key        = `${folder}/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const fileStream = fs.createReadStream(filePath);

    const upload = new Upload({
      client: this.client,
      params: {
        Bucket:      this.bucket,
        Key:         key,
        Body:        fileStream,
        ContentType: this.resolveContentType(ext),
        ACL:         'public-read' as ObjectCannedACL,
      },
    });

    await upload.done();

    // clean up temp file
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
      this.logger.warn(`Failed to delete temp file: ${filePath}`, err);
    }

    const url = `https://${this.bucket}.s3.${this.configService.get<string>('s3.region')}.amazonaws.com/${key}`;
    return { url, key };
  }

  /**
   * Delete an object from S3 by its key.
   * Accepts either a full URL or just the key.
   */
  async delete(urlOrKey: string): Promise<void> {
    if (!urlOrKey) return;

    let key = urlOrKey;
    if (urlOrKey.startsWith('http')) {
      // extract key from URL: https://bucket.s3.region.amazonaws.com/KEY
      const match = urlOrKey.match(/amazonaws\.com\/(.+)$/);
      if (match) key = match[1];
    }

    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      this.logger.warn(`Failed to delete from S3: ${key}`, err);
    }
  }

  private resolveContentType(ext: string): string {
    const map: Record<string, string> = {
      '.jpg':  'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png':  'image/png',
      '.webp': 'image/webp',
      '.gif':  'image/gif',
      '.mp3':  'audio/mpeg',
      '.mp4':  'video/mp4',
      '.pdf':  'application/pdf',
    };
    return map[ext.toLowerCase()] ?? 'application/octet-stream';
  }
}