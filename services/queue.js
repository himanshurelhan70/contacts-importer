const Queue = require('bull');
const Redis = require('redis');
const config = require('../config');

// Create Redis connection
const redis = Redis.createClient({ url: config.redis.url });

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redis.on('connect', () => {
  console.log('Connected to Redis');
});

// Create job queue
const importQueue = new Queue('import jobs', config.redis.url, {
  defaultJobOptions: {
    removeOnComplete: 10, // Keep last 10 completed jobs
    removeOnFail: 50,     // Keep last 50 failed jobs
    attempts: 3,          // Retry failed jobs 3 times
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  }
});

// Queue event listeners
importQueue.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed with result:`, result);
});

importQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});

importQueue.on('stalled', (job) => {
  console.warn(`Job ${job.id} stalled`);
});

// Add job to queue
const addImportJob = async (jobData, options = {}) => {
  try {
    const job = await importQueue.add('processImport', jobData, {
      delay: options.delay || 0,
      priority: options.priority || 0,
      ...options
    });
    
    console.log(`Import job ${job.id} added to queue`);
    return job;
  } catch (error) {
    console.error('Error adding job to queue:', error);
    throw error;
  }
};

// Get job status
const getJobStatus = async (jobId) => {
  try {
    const job = await importQueue.getJob(jobId);
    if (!job) {
      return null;
    }

    return {
      id: job.id,
      data: job.data,
      progress: job.progress(),
      state: await job.getState(),
      createdAt: new Date(job.timestamp),
      processedOn: job.processedOn ? new Date(job.processedOn) : null,
      finishedOn: job.finishedOn ? new Date(job.finishedOn) : null,
      failedReason: job.failedReason,
      returnvalue: job.returnvalue
    };
  } catch (error) {
    console.error('Error getting job status:', error);
    throw error;
  }
};

// Get queue statistics
const getQueueStats = async () => {
  try {
    const waiting = await importQueue.getWaiting();
    const active = await importQueue.getActive();
    const completed = await importQueue.getCompleted();
    const failed = await importQueue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length
    };
  } catch (error) {
    console.error('Error getting queue stats:', error);
    throw error;
  }
};

// Clean old jobs
const cleanQueue = async () => {
  try {
    await importQueue.clean(24 * 60 * 60 * 1000, 'completed'); // Remove completed jobs older than 24 hours
    await importQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed'); // Remove failed jobs older than 7 days
    console.log('Queue cleaned successfully');
  } catch (error) {
    console.error('Error cleaning queue:', error);
  }
};

// Graceful shutdown
const closeQueue = async () => {
  try {
    await importQueue.close();
    await redis.quit();
    console.log('Queue and Redis connections closed');
  } catch (error) {
    console.error('Error closing queue:', error);
  }
};

module.exports = {
  importQueue,
  redis,
  addImportJob,
  getJobStatus,
  getQueueStats,
  cleanQueue,
  closeQueue
};
