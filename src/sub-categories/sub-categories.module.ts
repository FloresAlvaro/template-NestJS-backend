import { Module, forwardRef } from '@nestjs/common';
import { SubCategoriesService } from './services/sub-categories.service';
import { SubCategoriesController } from './controllers/sub-categories.controller';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [forwardRef(() => CategoriesModule)],
  controllers: [SubCategoriesController],
  providers: [SubCategoriesService],
  exports: [SubCategoriesService],
})
export class SubCategoriesModule {}
