import { Module, forwardRef } from '@nestjs/common';
import { SubCategoriesService } from './sub-categories.service';
import { SubCategoriesController } from './sub-categories.controller';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [forwardRef(() => CategoriesModule)],
  controllers: [SubCategoriesController],
  providers: [SubCategoriesService],
  exports: [SubCategoriesService],
})
export class SubCategoriesModule {}
