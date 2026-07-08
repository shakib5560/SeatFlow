import { PrismaClient, BookingType } from '@prisma/client';
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

const ROOMS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10'];

const ROOM_DESCRIPTIONS: Record<string, string> = {
  A1: 'Standard meeting room — capacity 8, projector included',
  A2: 'Standard meeting room — capacity 8, whiteboard included',
  A3: 'Standard meeting room — capacity 10, projector included',
  A4: 'Standard meeting room — capacity 10, dual monitor setup',
  A5: 'Large conference room — capacity 20, full AV system',
  A6: 'Large conference room — capacity 20, video conferencing enabled',
  A7: 'Executive boardroom — capacity 12, premium furnishings',
  A8: 'Training room — capacity 30, classroom layout',
  A9: 'Creative space — capacity 15, flexible open layout',
  A10: 'Workshop room — capacity 25, equipment storage available',
};

async function main() {
  console.log('Seeding rooms...');

  for (const name of ROOMS) {
    const room = await prisma.room.upsert({
      where: { name },
      update: { description: ROOM_DESCRIPTIONS[name] },
      create: {
        name,
        description: ROOM_DESCRIPTIONS[name],
      },
    });
    console.log(`Upserted room: ${room.name} (${room.id})`);
  }

  console.log('Seeding complete. All 10 rooms are ready.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
