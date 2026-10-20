import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const categories = [
  {
    name: 'Mobiles',
    slug: 'mobiles',
    children: ['Smartphones', 'Feature Phones', 'Mobile Accessories'],
  },
  {
    name: 'Laptops & Computers',
    slug: 'laptops-computers',
    children: ['Laptops', 'Desktop Computers', 'Computer Accessories'],
  },
  {
    name: 'Electronics & Appliances',
    slug: 'electronics-appliances',
    children: ['Televisions', 'Cameras', 'Audio & Speakers', 'Home Appliances'],
  },
  {
    name: 'Vehicles',
    slug: 'vehicles',
    children: ['Cars', 'Motorcycles', 'Scooters', 'Bicycles'],
  },
  {
    name: 'Furniture',
    slug: 'furniture',
    children: ['Sofas', 'Beds', 'Tables & Chairs', 'Home Decor'],
  },
  {
    name: 'Fashion',
    slug: 'fashion',
    children: ['Men', 'Women', 'Watches & Accessories'],
  },
];

const slugify = (name) => name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

async function main() {
  for (const [parentOrder, item] of categories.entries()) {
    const parent = await prisma.category.upsert({
      where: { slug: item.slug },
      update: { name: item.name, isActive: true, displayOrder: parentOrder },
      create: { name: item.name, slug: item.slug, displayOrder: parentOrder },
    });

    for (const [childOrder, name] of item.children.entries()) {
      await prisma.category.upsert({
        where: { slug: `${item.slug}-${slugify(name)}` },
        update: { name, parentId: parent.id, isActive: true, displayOrder: childOrder },
        create: {
          name,
          slug: `${item.slug}-${slugify(name)}`,
          parentId: parent.id,
          displayOrder: childOrder,
        },
      });
    }
  }
}

main()
  .then(() => console.log('Marketplace categories seeded.'))
  .catch((error) => {
    console.error('Category seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
