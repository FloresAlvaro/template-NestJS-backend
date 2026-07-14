import { Module, forwardRef } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { SubCategoriesModule } from 'src/sub-categories/sub-categories.module';

@Module({
  imports: [forwardRef(() => SubCategoriesModule)],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
