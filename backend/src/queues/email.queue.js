import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// Connect to Redis using the same URL we configured earlier
const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // Required by BullMQ
});

// Create the high-performance Email Queue
export const emailQueue = new Queue('email-queue', { 
  connection,
  defaultJobOptions: {
    attempts: 3, // If email fails (e.g., SMTP down), retry 3 times
    backoff: {
      type: 'exponential',
      delay: 5000 // Wait 5s, then 25s, then 125s
    },
    removeOnComplete: true, // Keep Redis clean
  }
});

console.log('✅ BullMQ Email Queue initialized');
