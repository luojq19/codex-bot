import type { AppConfig } from "../config.js";
import { appendQueuedRun, listTasks, runTask, updateTaskNextRun } from "../tasks/service.js";
import type { ScheduledTask } from "../tasks/types.js";

type QueueItem = {
  task: ScheduledTask;
  trigger: "schedule" | "manual";
};

export class TaskScheduler {
  private readonly queue: QueueItem[] = [];
  private readonly runningTaskIds = new Set<string>();
  private activeCount = 0;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly config: AppConfig,
    private readonly options: { concurrency: number; tickMs: number } = { concurrency: 2, tickMs: 1000 }
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.options.tickMs);
  }

  stop(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async enqueueTask(task: ScheduledTask, trigger: "schedule" | "manual"): Promise<void> {
    await appendQueuedRun(task.id, trigger);
    this.queue.push({ task, trigger });
    this.processQueue();
  }

  getStatus(): { queued: number; active: number; runningTaskIds: string[] } {
    return {
      queued: this.queue.length,
      active: this.activeCount,
      runningTaskIds: [...this.runningTaskIds]
    };
  }

  private async tick(): Promise<void> {
    const now = new Date();
    const tasks = await listTasks();
    const dueTasks = tasks.filter((task) => task.enabled && new Date(task.nextRunAt).getTime() <= now.getTime());

    for (const task of dueTasks) {
      await this.enqueueTask(task, "schedule");
      await updateTaskNextRun(task, now);
    }

    this.processQueue();
  }

  private processQueue(): void {
    while (this.activeCount < this.options.concurrency) {
      const index = this.queue.findIndex((item) => !this.runningTaskIds.has(item.task.id));
      if (index < 0) {
        return;
      }

      const [item] = this.queue.splice(index, 1);
      this.activeCount += 1;
      this.runningTaskIds.add(item.task.id);

      void runTask(item.task, this.config, { trigger: item.trigger }).finally(() => {
        this.activeCount -= 1;
        this.runningTaskIds.delete(item.task.id);
        this.processQueue();
      });
    }
  }
}
