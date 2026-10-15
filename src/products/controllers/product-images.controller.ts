import {
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/client';
import { Roles } from '../../auth/decorators/access.decorators';
import { PositiveIdPipe } from '../../common/pipes/positive-id.pipe';
import { ProductImagesService } from '../services/product-images.service';

@ApiTags('Product images')
@ApiCookieAuth('tienda_session')
@Controller('products/:id/image')
export class ProductImagesController {
  constructor(private readonly images: ProductImagesService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'ADMIN: replace the product image (maximum 5 MiB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      // Busboy emits partsLimit when it reaches the limit, including the last part.
      // files/fields still enforce exactly one file and no text fields.
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
    }),
  )
  upload(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.images.upload(id, file);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SELLER)
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary: 'ADMIN/SELLER: read a product image, including inactive products',
  })
  get(@Param('id', ParseIntPipe, PositiveIdPipe) id: number) {
    return this.images.get(id);
  }

  @Delete()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'ADMIN: remove a product image' })
  remove(@Param('id', ParseIntPipe, PositiveIdPipe) id: number) {
    return this.images.remove(id);
  }
}
