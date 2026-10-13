import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class PositiveIdPipe implements PipeTransform<number, number> {
  transform(value: number) {
    if (!Number.isInteger(value) || value < 1 || value > 2147483647)
      throw new BadRequestException('id must be a positive 32-bit integer');
    return value;
  }
}
