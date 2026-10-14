import {
  BadRequestException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../../database/services/prisma.service';

@Injectable()
export class ProductImagesService {
  constructor(private readonly db: PrismaService) {}

  async upload(productId: number, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('An image file is required');
    let content: Buffer;
    try {
      const image = sharp(file.buffer, {
        limitInputPixels: 16000000,
        failOn: 'warning',
      });
      const metadata = await image.metadata();
      if (
        !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
        (metadata.pages ?? 1) > 1
      ) {
        throw new Error('Unsupported image');
      }
      content = await image
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer();
      if (content.length > 1048576) throw new Error('Image too large');
    } catch {
      throw new BadRequestException(
        'Use a valid static JPEG, PNG or WebP image, at most 16 megapixels',
      );
    }
    await this.db.catalogWrite(async (tx) => {
      if (
        !(await tx.product.findUnique({
          where: { productId },
          select: { productId: true },
        }))
      ) {
        throw new NotFoundException('Product not found');
      }
      await tx.productImage.upsert({
        where: { productId },
        create: { productId, content: new Uint8Array(content) },
        update: { content: new Uint8Array(content) },
      });
    });
    return { productId, imageUrl: `/api/products/${productId}/image` };
  }

  async get(productId: number, publicOnly = false) {
    const image = await this.db.productImage.findFirst({
      where: {
        productId,
        ...(publicOnly
          ? {
              product: {
                isActive: true,
                subCategory: { isActive: true, category: { isActive: true } },
              },
            }
          : {}),
      },
      select: { content: true },
    });
    if (!image) throw new NotFoundException('Image not found');
    return new StreamableFile(Buffer.from(image.content), {
      type: 'image/webp',
      disposition: 'inline',
      length: image.content.length,
    });
  }

  remove(productId: number) {
    return this.db.catalogWrite(async (tx) => {
      if (
        !(await tx.product.findUnique({
          where: { productId },
          select: { productId: true },
        }))
      ) {
        throw new NotFoundException('Product not found');
      }
      await tx.productImage.deleteMany({ where: { productId } });
      return { productId, imageUrl: null };
    });
  }
}
