import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import 'dotenv/config';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const categories = [
  {
    name: 'Cars',
    slug: 'cars',
    attributes: [
      { key: 'brand', label: 'Brand', type: 'string', required: true, options: ['Maruti Suzuki', 'Hyundai', 'Tata', 'Mahindra', 'Honda', 'Toyota', 'Kia', 'Volkswagen', 'Skoda', 'Other'] },
      { key: 'model', label: 'Model', type: 'string', required: true },
      { key: 'variant', label: 'Variant', type: 'string', required: false },
      { key: 'year', label: 'Year', type: 'number', required: true, min: 1990, max: 2026 },
      { key: 'fuelType', label: 'Fuel Type', type: 'string', required: true, options: ['Petrol', 'Diesel', 'CNG', 'Electric', 'Hybrid'] },
      { key: 'transmission', label: 'Transmission', type: 'string', required: true, options: ['Manual', 'Automatic'] },
      { key: 'kmDriven', label: 'KM Driven', type: 'number', required: true, min: 0, max: 1000000 },
      { key: 'owners', label: 'No. of Owners', type: 'string', required: false, options: ['1st', '2nd', '3rd', '4th+'] },
    ],
    children: ['Sedan', 'Hatchback', 'SUV', 'MUV', 'Luxury'],
  },
  {
    name: 'Bikes',
    slug: 'bikes',
    attributes: [
      { key: 'brand', label: 'Brand', type: 'string', required: true, options: ['Hero', 'Honda', 'Bajaj', 'TVS', 'Royal Enfield', 'Yamaha', 'KTM', 'Suzuki', 'Other'] },
      { key: 'year', label: 'Year', type: 'number', required: true, min: 1990, max: 2026 },
      { key: 'kmDriven', label: 'KM Driven', type: 'number', required: true, min: 0, max: 500000 },
    ],
    children: ['Motorcycles', 'Scooters', 'Electric Bikes', 'Bicycles'],
  },
  {
    name: 'Properties',
    slug: 'properties',
    attributes: [
      { key: 'propertyType', label: 'Property Type', type: 'string', required: true, options: ['Apartment', 'Independent House', 'Villa', 'Plot', 'Commercial Office', 'Shop'] },
      { key: 'transactionType', label: 'Transaction Type', type: 'string', required: true, options: ['For Sale', 'For Rent'] },
      { key: 'bedrooms', label: 'Bedrooms', type: 'number', required: false, min: 1, max: 10 },
      { key: 'area', label: 'Super Builtup Area', type: 'number', required: true, min: 10 },
      { key: 'areaUnit', label: 'Area Unit', type: 'string', required: true, options: ['sq.ft', 'sq.yards', 'sq.m'] },
      { key: 'furnishing', label: 'Furnishing', type: 'string', required: false, options: ['Furnished', 'Semi-Furnished', 'Unfurnished'] },
      { key: 'floor', label: 'Floor No', type: 'number', required: false },
      { key: 'parking', label: 'Parking', type: 'string', required: false, options: ['Covered', 'Open', 'None'] },
    ],
    children: ['For Sale: Houses & Apartments', 'For Rent: Houses & Apartments', 'Lands & Plots', 'For Rent: Shops & Offices', 'PG & Guest Houses'],
  },
  {
    name: 'Electronics and Appliances',
    slug: 'electronics-and-appliances',
    attributes: [
      { key: 'deviceType', label: 'Device Type', type: 'string', required: true, options: ['TV', 'Refrigerator', 'Washing Machine', 'Air Conditioner', 'Camera', 'Audio & Speakers'] },
      { key: 'brand', label: 'Brand', type: 'string', required: true },
      { key: 'condition', label: 'Condition', type: 'string', required: true, options: ['Brand New', 'Like New', 'Good', 'Fair'] },
    ],
    children: ['TVs, Video - Audio', 'Kitchen & Other Appliances', 'Computers & Laptops', 'Cameras & Lenses', 'Games & Entertainment'],
  },
  {
    name: 'Mobiles',
    slug: 'mobiles',
    attributes: [
      { key: 'brand', label: 'Brand', type: 'string', required: true, options: ['Apple', 'Samsung', 'Xiaomi', 'OnePlus', 'Vivo', 'Oppo', 'Realme', 'Google', 'Other'] },
      { key: 'storage', label: 'Storage', type: 'string', required: true, options: ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB'] },
      { key: 'ram', label: 'RAM', type: 'string', required: false, options: ['4GB', '6GB', '8GB', '12GB', '16GB'] },
      { key: 'condition', label: 'Condition', type: 'string', required: true, options: ['Brand New', 'Like New', 'Good', 'Fair'] },
    ],
    children: ['Mobile Phones', 'Accessories', 'Tablets'],
  },
  {
    name: 'Fashion',
    slug: 'fashion',
    attributes: [
      { key: 'targetGender', label: 'Gender', type: 'string', required: true, options: ['Men', 'Women', 'Boys', 'Girls', 'Unisex'] },
      { key: 'itemType', label: 'Type', type: 'string', required: true, options: ['Clothing', 'Footwear', 'Watches', 'Bags & Luggage', 'Accessories'] },
      { key: 'condition', label: 'Condition', type: 'string', required: true, options: ['New with tags', 'Pre-owned like new', 'Gently used'] },
    ],
    children: ['Men', 'Women', 'Kids', 'Watches & Wearables', 'Footwear'],
  },
  {
    name: 'Books, Sports and Hobbies',
    slug: 'books-sports-and-hobbies',
    attributes: [
      { key: 'subType', label: 'Type', type: 'string', required: true, options: ['Books & Magazines', 'Musical Instruments', 'Sports Equipment', 'Gym & Fitness', 'Collectibles'] },
    ],
    children: ['Books & Magazines', 'Musical Instruments', 'Sports Equipment', 'Gym & Fitness', 'Other Hobbies'],
  },
  {
    name: 'Furniture',
    slug: 'furniture',
    attributes: [
      { key: 'furnitureType', label: 'Furniture Type', type: 'string', required: true, options: ['Sofa & Dining', 'Beds & Wardrobes', 'Home Decor & Garden', 'Kids Furniture', 'Other Household Items'] },
      { key: 'material', label: 'Material', type: 'string', required: false, options: ['Solid Wood', 'Engineered Wood', 'Metal', 'Plastic', 'Glass'] },
    ],
    children: ['Sofa & Dining', 'Beds & Wardrobes', 'Home Decor & Garden', 'Kids Furniture', 'Other Household Items'],
  },
  {
    name: 'Pets',
    slug: 'pets',
    attributes: [
      { key: 'petType', label: 'Pet Category', type: 'string', required: true, options: ['Dogs Accessories & Food', 'Cats Accessories & Food', 'Fishes & Aquarium', 'Pet Food & Accessories'] },
    ],
    children: ['Fishes & Aquarium', 'Pet Food & Accessories', 'Other Pets Care'],
  },
  {
    name: 'Vehicle Spares',
    slug: 'vehicle-spares',
    attributes: [
      { key: 'partType', label: 'Part Type', type: 'string', required: true, options: ['Engine & Transmission', 'Tyres & Wheels', 'Electrical & Lights', 'Body Parts', 'Accessories'] },
      { key: 'compatibleVehicle', label: 'Compatible With', type: 'string', required: true, options: ['Car', 'Bike', 'Commercial Vehicle'] },
    ],
    children: ['Car Parts', 'Two Wheeler Parts', 'Commercial Vehicle Parts'],
  },
  {
    name: 'Jobs',
    slug: 'jobs',
    attributes: [
      { key: 'jobType', label: 'Job Type', type: 'string', required: true, options: ['Full-time', 'Part-time', 'Contract', 'Internship'] },
      { key: 'salaryMin', label: 'Minimum Salary (Monthly)', type: 'number', required: false, min: 0 },
      { key: 'salaryMax', label: 'Maximum Salary (Monthly)', type: 'number', required: false, min: 0 },
      { key: 'experience', label: 'Experience Level', type: 'string', required: false, options: ['Fresher', '1-2 Years', '3-5 Years', '5+ Years'] },
      { key: 'qualification', label: 'Minimum Qualification', type: 'string', required: false, options: ['10th Pass', '12th Pass', 'Graduate', 'Post Graduate'] },
    ],
    children: ['Data entry & Back office', 'Sales & Marketing', 'BPO & Telecaller', 'Driver', 'Office Assistant', 'Delivery & Collection', 'Teacher', 'Cook'],
  },
  {
    name: 'Services',
    slug: 'services',
    attributes: [
      { key: 'serviceType', label: 'Service Type', type: 'string', required: true, options: ['Electronics Repair', 'Home Renovation', 'Education & Classes', 'Health & Beauty', 'Travel & Tour', 'Driver & Taxi', 'Other Services'] },
      { key: 'availability', label: 'Availability', type: 'string', required: false, options: ['On Demand', 'Working Hours', '24x7'] },
    ],
    children: ['Electronics Repair', 'Home Renovation', 'Education & Classes', 'Health & Beauty', 'Travel & Tour', 'Other Services'],
  },
  {
    name: 'Commercial Vehicles and Equipment',
    slug: 'commercial-vehicles-and-equipment',
    attributes: [
      { key: 'vehicleType', label: 'Type', type: 'string', required: true, options: ['Commercial & Other Vehicles', 'Spare Parts', 'Heavy Machinery', 'Tractors'] },
      { key: 'year', label: 'Year', type: 'number', required: true, min: 1990, max: 2026 },
      { key: 'kmDriven', label: 'KM Driven', type: 'number', required: false, min: 0 },
    ],
    children: ['Commercial & Other Vehicles', 'Spare Parts', 'Heavy Machinery', 'Tractors'],
  },
];

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

async function main() {
  console.log('Seeding dev & admin users...');

  // Ensure dev-creator-001 exists
  await prisma.user.upsert({
    where: { id: 'dev-creator-001' },
    update: { isActive: true },
    create: {
      id: 'dev-creator-001',
      name: 'Dev Creator',
      email: 'dev-creator@example.com',
      phone: '9999900001',
      role: 'USER',
      isActive: true,
      isVerifiedSeller: true,
    },
  });

  // Ensure admin user exists
  const adminPasswordHash = await bcrypt.hash('Admin@123456', 10);
  await prisma.user.upsert({
    where: { email: 'admin@olxmarketplace.com' },
    update: { role: 'ADMIN', isActive: true },
    create: {
      name: 'System Administrator',
      email: 'admin@olxmarketplace.com',
      phone: '9999900000',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      isActive: true,
      isVerifiedSeller: true,
    },
  });

  console.log('Seeding marketplace categories with attribute definitions...');
  for (const [parentOrder, item] of categories.entries()) {
    const parent = await prisma.category.upsert({
      where: { slug: item.slug },
      update: {
        name: item.name,
        attributes: item.attributes,
        isActive: true,
        displayOrder: parentOrder,
      },
      create: {
        name: item.name,
        slug: item.slug,
        attributes: item.attributes,
        displayOrder: parentOrder,
      },
    });

    for (const [childOrder, name] of item.children.entries()) {
      const childSlug = `${item.slug}-${slugify(name)}`;
      await prisma.category.upsert({
        where: { slug: childSlug },
        update: {
          name,
          parentId: parent.id,
          attributes: item.attributes, // inherit or specialize
          isActive: true,
          displayOrder: childOrder,
        },
        create: {
          name,
          slug: childSlug,
          parentId: parent.id,
          attributes: item.attributes,
          displayOrder: childOrder,
        },
      });
    }
  }

  console.log('✅ Seed completed successfully.');
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
