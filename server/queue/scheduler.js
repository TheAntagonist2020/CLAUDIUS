const cron = require('node-cron');
const { buildDailyQueue, getTodayQueue, getQueueStats } = require('./dailyQueue');

let scheduledTask = null;

/**
 * Start the daily queue scheduler.
 * Runs at 8:00 AM every day to build the queue.
 * Also builds immediately on startup if today's queue is empty.
 */
function startScheduler() {
  console.log('[Scheduler] Starting daily queue scheduler...');

  // Build today's queue immediately on startup if missing
  setImmediate(async () => {
    try {
      const today = getTodayQueue();
      if (today.length === 0) {
        console.log('[Scheduler] No queue for today — building now...');
        await buildDailyQueue();
        const queue = getTodayQueue();
        console.log(`[Scheduler] Today's queue ready: ${queue.length} films assigned`);
        queue.forEach(q => console.log(`  [${q.slot}] ${q.title} (${q.year})`));
      } else {
        console.log(`[Scheduler] Today's queue already exists: ${today.length} films`);
        today.forEach(q => console.log(`  [${q.slot}] ${q.title} (${q.year}) — ${q.status}`));
      }
    } catch (err) {
      console.error('[Scheduler] Failed to build initial queue:', err.message);
    }
  });

  // Schedule daily at 8:00 AM
  scheduledTask = cron.schedule('0 8 * * *', async () => {
    console.log('[Scheduler] 8:00 AM — Building daily queue...');
    try {
      const queue = await buildDailyQueue();
      console.log(`[Scheduler] Queue built: ${queue.length} films for today`);
      queue.forEach(q => console.log(`  [${q.slot}] ${q.title} (${q.year})`));
    } catch (err) {
      console.error('[Scheduler] Daily build failed:', err.message);
    }
  }, {
    timezone: 'America/New_York', // Dalton's timezone
  });

  // Also schedule a 2:00 PM nudge log (for afternoon slot awareness)
  cron.schedule('0 14 * * *', () => {
    const queue = getTodayQueue();
    const afternoon = queue.find(q => q.slot === 'afternoon' && q.status === 'assigned');
    if (afternoon) {
      console.log(`\n[NUDGE] Afternoon film ready: ${afternoon.title} (${afternoon.year})\n`);
    }
    const stats = getQueueStats();
    if (stats.today_completed === 0) {
      console.log('[NUDGE] No films completed yet today. Get moving, Dalton.');
    }
  }, {
    timezone: 'America/New_York',
  });

  console.log('[Scheduler] Cron jobs registered (8:00 AM build, 2:00 PM nudge)');
}

/**
 * Stop the scheduler
 */
function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('[Scheduler] Stopped');
  }
}

module.exports = { startScheduler, stopScheduler };
