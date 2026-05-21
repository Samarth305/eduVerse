import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
import { 
  _sendWelcomeEmail, 
  _sendPasswordResetEmail, 
  _sendEmailVerificationEmail, 
  _sendModeratorRoleEmail 
} from '../lib/emailService.js';

dotenv.config();

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

// Create the background worker
export const emailWorker = new Worker('email-queue', async (job) => {
  const { type, payload } = job.data;
  
  console.log(`[BullMQ Worker] Processing job ${job.id} of type: ${type}`);
  
  switch (type) {
    case 'WELCOME_EMAIL':
      await sendWelcomeEmail(payload.email, payload.fullName);
      break;
    case 'VERIFICATION_EMAIL':
      await sendEmailVerificationEmail(payload.email, payload.fullName, payload.verificationCode);
      break;
    case 'PASSWORD_RESET_EMAIL':
      await sendPasswordResetEmail(payload.email, payload.resetToken);
      break;
    case 'MODERATOR_ROLE_EMAIL':
      await sendModeratorRoleEmail(payload.email, payload.fullName, payload.password);
      break;
    default:
      console.warn(`[BullMQ Worker] Unknown email job type: ${type}`);
  }
  
  return true;
}, { connection });

// Handle worker events
emailWorker.on('completed', (job) => {
  console.log(`[BullMQ Worker] Job ${job.id} completed successfully`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`[BullMQ Worker] Job ${job.id} failed with error:`, err.message);
});

console.log('👷 BullMQ Email Worker started listening in the background');
