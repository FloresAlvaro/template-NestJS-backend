import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
export class NotificationListDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['PENDING', 'SENT', 'FAILED', 'UNREAD'])
  status?: string;
}
