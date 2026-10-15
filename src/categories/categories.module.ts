import { Module, forwardRef } from '@nestjs/common';
import { CategoriesService } from './services/categories.service';
import { CategoriesController } from './controllers/categories.controller';
import { SubCategoriesModule } from '../sub-categories/sub-categories.module';

@Module({
  imports: [forwardRef(() => SubCategoriesModule)],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
