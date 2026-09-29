// In-memory job queue with concurrency limit (PRD: max 2 simultaneous downloads)
const MAX_CONCURRENT = 2;
let running = 0;
const pending: Array<{ run: () => Promise<void> }> = [];

function drain() {
  while (running < MAX_CONCURRENT && pending.length > 0) {
    const job = pending.shift()!;
    running++;
    job.run().finally(() => {
      running--;
      drain();
    });
  }
}

export function enqueue<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    pending.push({
      run: () => job().then(resolve, reject)
    });
    drain();
  });
}

export function getQueueLength(): number {
  return pending.length;
}

export function getRunningCount(): number {
  return running;
}
