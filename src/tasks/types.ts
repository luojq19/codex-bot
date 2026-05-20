export type TaskSchedule =
  | {
      type: "interval";
      everyMs: number;
    }
  | {
      type: "cron";
      expression: string;
      timezone: string;
    };

export type ScheduledTask = {
  id: string;
  name: string;
  prompt: string;
  model: string;
  enabled: boolean;
  schedule: TaskSchedule;
  nextRunAt: string;
  createdAt: string;
  updatedAt: string;
};

export type RunStatus = "queued" | "success" | "failed";

export type TaskRunRecord = {
  runId: string;
  taskId: string;
  trigger: "schedule" | "manual";
  startedAt: string;
  finishedAt: string;
  status: RunStatus;
  output?: string;
  error?: string;
};

export type CreateTaskInput = {
  name: string;
  prompt: string;
  model: string;
  schedule: TaskSchedule;
  enabled?: boolean;
};

export type RunTaskOptions = {
  trigger: "schedule" | "manual";
};
