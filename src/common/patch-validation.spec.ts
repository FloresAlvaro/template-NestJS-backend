import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCategoryDto } from '../categories/dto/update-category.dto';
import { UpdateSubCategoryDto } from '../sub-categories/dto/update-sub-category.dto';

describe('PATCH validation', () => {
  it('allows omitted fields but rejects a null category name', async () => {
    expect(await validate(plainToInstance(UpdateCategoryDto, {}))).toHaveLength(
      0,
    );
    expect(
      await validate(plainToInstance(UpdateCategoryDto, { name: null })),
    ).not.toHaveLength(0);
  });
  it.each(['name', 'categoryId'])(
    'rejects explicit null for subcategory %s',
    async (field) => {
      expect(
        await validate(
          plainToInstance(UpdateSubCategoryDto, { [field]: null }),
        ),
      ).not.toHaveLength(0);
    },
  );
  it('trims input before validating length', async () => {
    const dto = plainToInstance(UpdateCategoryDto, { name: '   ' });
    expect(await validate(dto)).not.toHaveLength(0);
  });
  it('retains null as a way to clear the optional description', async () => {
    expect(
      await validate(plainToInstance(UpdateCategoryDto, { description: null })),
    ).toHaveLength(0);
  });
});
