import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is missing.');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const events = [
    {
      id: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a201',
      name: 'NestJS Masterclass',
      description: 'Advanced NestJS Workshop',
      eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from today
      totalSeats: 100,
      remainingSeats: 100,
      price: 1200.0,
    },
    {
      id: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a202',
      name: 'React Summit',
      description: 'Advanced React Summit',
      eventDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), // 45 days from today
      totalSeats: 80,
      remainingSeats: 80,
      price: 1500.0,
    },
    {
      id: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a203',
      name: 'AI Conference',
      description: 'State of the art AI Conference',
      eventDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from today
      totalSeats: 250,
      remainingSeats: 250,
      price: 3000.0,
    },
  ];

  console.log('Seeding database...');

  for (const event of events) {
    const upserted = await prisma.event.upsert({
      where: { id: event.id },
      update: {
        name: event.name,
        description: event.description,
        eventDate: event.eventDate,
        totalSeats: event.totalSeats,
        price: event.price,
      },
      create: event,
    });
    console.log(`Upserted event: ${upserted.name} (${upserted.id})`);
  }

  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
