export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startBackgroundPingCron } = await import('@/lib/casper/pingCron');
  startBackgroundPingCron();
}
