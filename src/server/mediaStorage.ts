import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export type DetectedMediaType = {
  category: 'PHOTO' | 'VIDEO';
  mimeType: string;
  extension: string;
  fileType: string;
};

const PHOTO_LIMIT_BYTES =
  Math.max(1, Number(process.env.MAX_PHOTO_SIZE_MB) || 15) * 1024 * 1024;
const VIDEO_LIMIT_BYTES =
  Math.max(1, Number(process.env.MAX_VIDEO_SIZE_MB) || 100) * 1024 * 1024;

export const MAX_PHOTOS_PER_SUBMISSION = Math.max(
  1,
  Number(process.env.MAX_PHOTOS_PER_SUBMISSION) || 12
);
export const MAX_VIDEOS_PER_SUBMISSION = Math.max(
  1,
  Number(process.env.MAX_VIDEOS_PER_SUBMISSION) || 3
);

// In-memory HMAC secret for short-lived signed internal media stream URLs
const MEDIA_SIGN_SECRET =
  process.env.MEDIA_SIGN_SECRET || crypto.randomBytes(32).toString('hex');

export function resolveStorageDirectory(): string {
  const configured = process.env.MEDIA_STORAGE_DIR?.trim();
  const target = configured
    ? path.resolve(configured)
    : path.resolve(process.cwd(), 'storage', 'media');

  if (
    process.env.STORAGE_REQUIRE_DURABLE === 'true' &&
    (target === '/tmp' || target.startsWith('/tmp' + path.sep))
  ) {
    throw new Error(
      'MEDIA_STORAGE_DIR cannot point to /tmp when durable storage is required.'
    );
  }

  fs.mkdirSync(target, { recursive: true });
  return target;
}

/**
 * Inspects file magic bytes instead of trusting client-supplied MIME types or extensions.
 */
export async function detectMagicFileType(
  filePath: string
): Promise<DetectedMediaType | null> {
  const fh = await fs.promises.open(filePath, 'r');
  try {
    const header = Buffer.alloc(64);
    const { bytesRead } = await fh.read(header, 0, 64, 0);
    if (bytesRead < 8) return null;

    // JPEG: FF D8 FF
    if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
      return {
        category: 'PHOTO',
        mimeType: 'image/jpeg',
        extension: '.jpg',
        fileType: 'JPEG',
      };
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      header[0] === 0x89 &&
      header[1] === 0x50 &&
      header[2] === 0x4e &&
      header[3] === 0x47 &&
      header[4] === 0x0d &&
      header[5] === 0x0a &&
      header[6] === 0x1a &&
      header[7] === 0x0a
    ) {
      return {
        category: 'PHOTO',
        mimeType: 'image/png',
        extension: '.png',
        fileType: 'PNG',
      };
    }

    // WebP: RIFF....WEBP
    if (
      bytesRead >= 12 &&
      header.subarray(0, 4).toString('ascii') === 'RIFF' &&
      header.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return {
        category: 'PHOTO',
        mimeType: 'image/webp',
        extension: '.webp',
        fileType: 'WEBP',
      };
    }

    // WebM / Matroska: 1A 45 DF A3
    if (
      header[0] === 0x1a &&
      header[1] === 0x45 &&
      header[2] === 0xdf &&
      header[3] === 0xa3
    ) {
      return {
        category: 'VIDEO',
        mimeType: 'video/webm',
        extension: '.webm',
        fileType: 'WEBM',
      };
    }

    // ISO Base Media File Format (MP4, MOV, HEIC/HEIF) — "ftyp" at offset 4
    if (bytesRead >= 12 && header.subarray(4, 8).toString('ascii') === 'ftyp') {
      const brand = header.subarray(8, 12).toString('ascii');
      if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) {
        return {
          category: 'PHOTO',
          mimeType: 'image/heic',
          extension: '.heic',
          fileType: 'HEIC',
        };
      }
      if (brand === 'qt  ') {
        return {
          category: 'VIDEO',
          mimeType: 'video/quicktime',
          extension: '.mov',
          fileType: 'MOV',
        };
      }
      if (
        ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ', '3gp4', '3gp5', 'mmp4'].includes(
          brand
        )
      ) {
        return {
          category: 'VIDEO',
          mimeType: 'video/mp4',
          extension: '.mp4',
          fileType: 'MP4',
        };
      }
    }

    return null;
  } finally {
    await fh.close();
  }
}

export class MediaStorageService {
  private readonly baseDir: string;

  constructor(baseDir = resolveStorageDirectory()) {
    this.baseDir = path.resolve(baseDir);
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  public getBaseDir(): string {
    return this.baseDir;
  }

  private resolveSafePath(storageKey: string): string {
    if (!storageKey || storageKey.includes('..') || path.isAbsolute(storageKey)) {
      throw new Error('Invalid storage key');
    }
    const cleanName = path.basename(storageKey);
    const resolved = path.resolve(this.baseDir, cleanName);
    if (!resolved.startsWith(this.baseDir + path.sep)) {
      throw new Error('Storage path traversal blocked');
    }
    return resolved;
  }

  public async saveFile(
    tempFilePath: string,
    originalFilename: string
  ): Promise<{
    storageKey: string;
    thumbnailStorageKey: string | null;
    mediaCategory: 'PHOTO' | 'VIDEO';
    mimeType: string;
    fileType: string;
    fileSize: number;
    sanitizedOriginalName: string;
  }> {
    const detected = await detectMagicFileType(tempFilePath);
    if (!detected) {
      throw new Error(
        `Unsupported or invalid file content for "${path.basename(originalFilename)}". Allowed: JPEG, PNG, WebP, HEIC, MP4, WebM, MOV.`
      );
    }

    const stat = await fs.promises.stat(tempFilePath);
    if (stat.size <= 0) {
      throw new Error('Uploaded file is empty.');
    }
    if (detected.category === 'PHOTO' && stat.size > PHOTO_LIMIT_BYTES) {
      throw new Error(
        `Photo exceeds maximum size of ${Math.round(PHOTO_LIMIT_BYTES / (1024 * 1024))} MB.`
      );
    }
    if (detected.category === 'VIDEO' && stat.size > VIDEO_LIMIT_BYTES) {
      throw new Error(
        `Video exceeds maximum size of ${Math.round(VIDEO_LIMIT_BYTES / (1024 * 1024))} MB.`
      );
    }

    const sanitizedOriginalName = path
      .basename(originalFilename || 'upload')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 120);

    const uuid = crypto.randomUUID();

    if (detected.category === 'PHOTO') {
      // Decode & strip EXIF metadata and create optimized WebP + thumbnail
      const targetKey = `${uuid}.webp`;
      const thumbKey = `thumb_${uuid}.webp`;
      const targetPath = this.resolveSafePath(targetKey);
      const thumbPath = this.resolveSafePath(thumbKey);

      try {
        await sharp(tempFilePath)
          .rotate()
          .resize({ width: 1920, height: 1440, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 84 })
          .toFile(targetPath);

        await this.generateThumbnail(targetPath, thumbKey);
        const outStat = await fs.promises.stat(targetPath);

        return {
          storageKey: targetKey,
          thumbnailStorageKey: thumbKey,
          mediaCategory: 'PHOTO',
          mimeType: 'image/webp',
          fileType: detected.fileType,
          fileSize: outStat.size,
          sanitizedOriginalName,
        };
      } catch (err) {
        // Fallback for HEIC when libvips lacks HEVC decoder: store raw verified file if HEIC
        if (detected.fileType === 'HEIC') {
          const rawKey = `${uuid}${detected.extension}`;
          const rawPath = this.resolveSafePath(rawKey);
          await fs.promises.copyFile(tempFilePath, rawPath);
          return {
            storageKey: rawKey,
            thumbnailStorageKey: null,
            mediaCategory: 'PHOTO',
            mimeType: detected.mimeType,
            fileType: detected.fileType,
            fileSize: stat.size,
            sanitizedOriginalName,
          };
        }
        await this.deleteFile(targetKey, thumbKey).catch(() => {});
        throw new Error(
          `Image validation failed for "${sanitizedOriginalName}": file is corrupted or unreadable.`
        );
      }
    }

    // VIDEO: stream/copy verified file using UUID storage key (never load large video into memory)
    const videoKey = `${uuid}${detected.extension}`;
    const videoPath = this.resolveSafePath(videoKey);
    await fs.promises.copyFile(tempFilePath, videoPath);

    return {
      storageKey: videoKey,
      thumbnailStorageKey: null,
      mediaCategory: 'VIDEO',
      mimeType: detected.mimeType,
      fileType: detected.fileType,
      fileSize: stat.size,
      sanitizedOriginalName,
    };
  }

  public async generateThumbnail(sourcePath: string, thumbKey: string): Promise<string> {
    const thumbPath = this.resolveSafePath(thumbKey);
    await sharp(sourcePath)
      .rotate()
      .resize(480, 320, { fit: 'cover', position: 'centre' })
      .webp({ quality: 76 })
      .toFile(thumbPath);
    return thumbKey;
  }

  public async deleteFile(
    storageKey: string,
    thumbnailStorageKey?: string | null
  ): Promise<void> {
    if (storageKey) {
      const p = this.resolveSafePath(storageKey);
      await fs.promises.unlink(p).catch(() => {});
    }
    if (thumbnailStorageKey) {
      const tp = this.resolveSafePath(thumbnailStorageKey);
      await fs.promises.unlink(tp).catch(() => {});
    }
  }

  public signMediaToken(mediaId: number, ttlSeconds = 1800): string {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const payload = `${mediaId}.${exp}`;
    const sig = crypto
      .createHmac('sha256', MEDIA_SIGN_SECRET)
      .update(payload)
      .digest('hex');
    return `${exp}.${sig}`;
  }

  public verifyMediaToken(mediaId: number, token?: string): boolean {
    if (!token) return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [expStr, sig] = parts;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const expectedSig = crypto
      .createHmac('sha256', MEDIA_SIGN_SECRET)
      .update(`${mediaId}.${exp}`)
      .digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
    } catch {
      return false;
    }
  }

  public getFileUrl(
    media: {
      id: number;
      externalUrl?: string | null;
      thumbnailStorageKey?: string | null;
    },
    scope: 'public' | 'internal',
    variant: 'full' | 'thumb' = 'full'
  ): string {
    if (media.externalUrl) {
      return media.externalUrl;
    }
    const qsVariant =
      variant === 'thumb' && media.thumbnailStorageKey ? 'variant=thumb' : '';
    if (scope === 'public') {
      return qsVariant
        ? `/api/public/media/${media.id}?${qsVariant}`
        : `/api/public/media/${media.id}`;
    }
    const token = this.signMediaToken(media.id);
    return qsVariant
      ? `/api/media/${media.id}?${qsVariant}&token=${encodeURIComponent(token)}`
      : `/api/media/${media.id}?token=${encodeURIComponent(token)}`;
  }

  public async getStream(
    storageKey: string,
    mimeType: string,
    rangeHeader?: string
  ): Promise<{
    stream: fs.ReadStream;
    statusCode: 200 | 206;
    headers: Record<string, string | number>;
  }> {
    const filePath = this.resolveSafePath(storageKey);
    const stat = await fs.promises.stat(filePath);
    const total = stat.size;

    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
      if (match) {
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1;
        if (start >= 0 && start < total && end >= start) {
          const chunkSize = end - start + 1;
          return {
            stream: fs.createReadStream(filePath, { start, end }),
            statusCode: 206,
            headers: {
              'Content-Range': `bytes ${start}-${end}/${total}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunkSize,
              'Content-Type': mimeType,
              'Cache-Control': 'private, max-age=300',
            },
          };
        }
      }
    }

    return {
      stream: fs.createReadStream(filePath),
      statusCode: 200,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': total,
        'Content-Type': mimeType,
        'Cache-Control': 'private, max-age=300',
      },
    };
  }
}

export const mediaStorage = new MediaStorageService();
