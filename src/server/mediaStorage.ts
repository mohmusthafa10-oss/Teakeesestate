import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
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

interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
}

function getS3Config(): S3Config | null {
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  const explicitDriver = process.env.STORAGE_DRIVER?.trim().toLowerCase();

  if (explicitDriver === 'local') return null;
  if (!bucket || !accessKeyId || !secretAccessKey) {
    if (explicitDriver === 's3') {
      throw new Error(
        'STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.'
      );
    }
    return null;
  }

  const region = process.env.S3_REGION?.trim() || 'auto';
  const endpoint = (
    process.env.S3_ENDPOINT?.trim() || `https://s3.${region}.amazonaws.com`
  ).replace(/\/+$/, '');

  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL?.trim()?.replace(/\/+$/, ''),
  };
}

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function signS3Request(params: {
  config: S3Config;
  method: 'PUT' | 'GET' | 'DELETE';
  objectKey: string;
  contentType?: string;
  payloadHash: string;
  extraHeaders?: Record<string, string>;
}): { url: string; headers: Record<string, string> } {
  const { config, method, objectKey, contentType, payloadHash, extraHeaders } = params;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const parsedEndpoint = new URL(config.endpoint);
  const encodedKey = objectKey
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  const canonicalUri = `/${encodeURIComponent(config.bucket)}/${encodedKey}`;
  const url = `${config.endpoint}${canonicalUri}`;

  const headersToSign: Record<string, string> = {
    host: parsedEndpoint.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType) headersToSign['content-type'] = contentType;
  if (extraHeaders) {
    Object.entries(extraHeaders).forEach(([k, v]) => {
      headersToSign[k.toLowerCase()] = v;
    });
  }

  const sortedHeaderKeys = Object.keys(headersToSign).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k}:${headersToSign[k].trim()}\n`)
    .join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  const canonicalRequest = [
    method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmacSha256(`AWS4${config.secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, config.region);
  const kService = hmacSha256(kRegion, 's3');
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = hmacSha256(kSigning, stringToSign).toString('hex');

  return {
    url,
    headers: {
      ...headersToSign,
      Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

export function resolveStorageDirectory(): string {
  const configured = process.env.MEDIA_STORAGE_DIR?.trim();
  const target = configured
    ? path.resolve(configured)
    : path.resolve(process.cwd(), 'storage', 'media');

  if (
    (process.env.STORAGE_REQUIRE_DURABLE === 'true' ||
      process.env.NODE_ENV === 'production') &&
    !getS3Config() &&
    (target === '/tmp' || target.startsWith('/tmp' + path.sep))
  ) {
    throw new Error(
      'MEDIA_STORAGE_DIR cannot point to /tmp in production. Configure S3-compatible storage or a mounted persistent disk.'
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

  public getProviderName(): 'LOCAL' | 'S3' {
    return getS3Config() ? 'S3' : 'LOCAL';
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

  private async uploadBufferToS3(
    config: S3Config,
    objectKey: string,
    body: Buffer,
    mimeType: string
  ): Promise<void> {
    const signed = signS3Request({
      config,
      method: 'PUT',
      objectKey,
      contentType: mimeType,
      payloadHash: sha256Hex(body),
    });
    const res = await fetch(signed.url, {
      method: 'PUT',
      headers: signed.headers,
      body: new Uint8Array(body),
    });
    if (!res.ok) {
      throw new Error(`S3 object upload failed (${res.status}).`);
    }
  }

  public async saveFile(
    tempFilePath: string,
    originalFilename: string,
    options?: { durationSeconds?: number | null }
  ): Promise<{
    storageKey: string;
    thumbnailStorageKey: string | null;
    mediaCategory: 'PHOTO' | 'VIDEO';
    mimeType: string;
    fileType: string;
    fileSize: number;
    width: number | null;
    height: number | null;
    durationSeconds: number | null;
    storageProvider: 'LOCAL' | 'S3';
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
    const s3 = getS3Config();

    if (detected.category === 'PHOTO') {
      const targetKey = `${uuid}.webp`;
      const thumbKey = `thumb_${uuid}.webp`;
      const targetPath = this.resolveSafePath(targetKey);
      const thumbPath = this.resolveSafePath(thumbKey);

      try {
        const mainInfo = await sharp(tempFilePath)
          .rotate()
          .resize({ width: 1920, height: 1440, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 84 })
          .toFile(targetPath);

        await this.generateThumbnail(targetPath, thumbKey);

        if (s3) {
          const [mainBuf, thumbBuf] = await Promise.all([
            fs.promises.readFile(targetPath),
            fs.promises.readFile(thumbPath),
          ]);
          await this.uploadBufferToS3(s3, targetKey, mainBuf, 'image/webp');
          await this.uploadBufferToS3(s3, thumbKey, thumbBuf, 'image/webp');
          await fs.promises.unlink(targetPath).catch(() => {});
          await fs.promises.unlink(thumbPath).catch(() => {});
        }

        return {
          storageKey: targetKey,
          thumbnailStorageKey: thumbKey,
          mediaCategory: 'PHOTO',
          mimeType: 'image/webp',
          fileType: detected.fileType,
          fileSize: mainInfo.size,
          width: mainInfo.width || null,
          height: mainInfo.height || null,
          durationSeconds: null,
          storageProvider: s3 ? 'S3' : 'LOCAL',
          sanitizedOriginalName,
        };
      } catch (err) {
        if (detected.fileType === 'HEIC') {
          const rawKey = `${uuid}${detected.extension}`;
          if (s3) {
            const buf = await fs.promises.readFile(tempFilePath);
            await this.uploadBufferToS3(s3, rawKey, buf, detected.mimeType);
          } else {
            const rawPath = this.resolveSafePath(rawKey);
            await fs.promises.copyFile(tempFilePath, rawPath);
          }
          return {
            storageKey: rawKey,
            thumbnailStorageKey: null,
            mediaCategory: 'PHOTO',
            mimeType: detected.mimeType,
            fileType: detected.fileType,
            fileSize: stat.size,
            width: null,
            height: null,
            durationSeconds: null,
            storageProvider: s3 ? 'S3' : 'LOCAL',
            sanitizedOriginalName,
          };
        }
        await this.deleteFile(targetKey, thumbKey).catch(() => {});
        throw new Error(
          `Image validation failed for "${sanitizedOriginalName}": file is corrupted or unreadable.`
        );
      }
    }

    // VIDEO: store using UUID object key in S3 or durable filesystem
    const videoKey = `${uuid}${detected.extension}`;
    if (s3) {
      const videoBuf = await fs.promises.readFile(tempFilePath);
      await this.uploadBufferToS3(s3, videoKey, videoBuf, detected.mimeType);
    } else {
      const videoPath = this.resolveSafePath(videoKey);
      await fs.promises.copyFile(tempFilePath, videoPath);
    }

    return {
      storageKey: videoKey,
      thumbnailStorageKey: null,
      mediaCategory: 'VIDEO',
      mimeType: detected.mimeType,
      fileType: detected.fileType,
      fileSize: stat.size,
      width: null,
      height: null,
      durationSeconds:
        typeof options?.durationSeconds === 'number' && Number.isFinite(options.durationSeconds)
          ? Math.max(0, Math.round(options.durationSeconds))
          : null,
      storageProvider: s3 ? 'S3' : 'LOCAL',
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
    const s3 = getS3Config();
    const keys = [storageKey, thumbnailStorageKey].filter(Boolean) as string[];
    for (const k of keys) {
      if (s3) {
        const signed = signS3Request({
          config: s3,
          method: 'DELETE',
          objectKey: k,
          payloadHash: sha256Hex(''),
        });
        await fetch(signed.url, { method: 'DELETE', headers: signed.headers }).catch(
          () => {}
        );
      }
      try {
        const localPath = this.resolveSafePath(k);
        await fs.promises.unlink(localPath).catch(() => {});
      } catch {
        // ignore invalid key cleanup
      }
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
      storageKey?: string;
      storageProvider?: string;
      externalUrl?: string | null;
      thumbnailStorageKey?: string | null;
    },
    scope: 'public' | 'internal',
    variant: 'full' | 'thumb' = 'full'
  ): string {
    if (media.externalUrl) {
      return media.externalUrl;
    }
    const s3 = getS3Config();
    if (scope === 'public' && s3?.publicBaseUrl && media.storageProvider === 'S3') {
      const targetKey =
        variant === 'thumb' && media.thumbnailStorageKey
          ? media.thumbnailStorageKey
          : media.storageKey;
      if (targetKey) {
        return `${s3.publicBaseUrl}/${encodeURIComponent(targetKey)}`;
      }
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
    stream: Readable;
    statusCode: 200 | 206;
    headers: Record<string, string | number>;
  }> {
    const s3 = getS3Config();
    const localCandidate = (() => {
      try {
        return this.resolveSafePath(storageKey);
      } catch {
        return null;
      }
    })();

    const existsLocally =
      localCandidate !== null && fs.existsSync(localCandidate);

    if (s3 && !existsLocally) {
      const extraHeaders: Record<string, string> = {};
      if (rangeHeader) extraHeaders.range = rangeHeader;
      const signed = signS3Request({
        config: s3,
        method: 'GET',
        objectKey: storageKey,
        payloadHash: sha256Hex(''),
        extraHeaders,
      });
      const res = await fetch(signed.url, {
        method: 'GET',
        headers: signed.headers,
      });
      if (!res.ok || !res.body) {
        throw new Error(`S3 media read failed (${res.status})`);
      }
      const headers: Record<string, string | number> = {
        'Accept-Ranges': 'bytes',
        'Content-Type': res.headers.get('content-type') || mimeType,
        'Cache-Control': 'private, max-age=300',
      };
      const len = res.headers.get('content-length');
      if (len) headers['Content-Length'] = Number(len);
      const cr = res.headers.get('content-range');
      if (cr) headers['Content-Range'] = cr;

      return {
        stream: Readable.fromWeb(res.body as any),
        statusCode: res.status === 206 ? 206 : 200,
        headers,
      };
    }

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
