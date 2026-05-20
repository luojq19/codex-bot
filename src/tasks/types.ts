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
  kind?: "prompt" | "workflow";
  prompt: string;
  model: string;
  enabled: boolean;
  schedule: TaskSchedule;
  workflow?: WorkflowConfig;
  delivery?: TaskDelivery;
  nextRunAt: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowConfig = {
  skill: string;
  input: string;
};

export type TaskDelivery = {
  discordChannelId?: string;
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
  workspaceDir?: string;
  artifacts?: string[];
};

export type CreateTaskInput = {
  name: string;
  kind?: "prompt" | "workflow";
  prompt: string;
  model: string;
  schedule: TaskSchedule;
  workflow?: WorkflowConfig;
  delivery?: TaskDelivery;
  enabled?: boolean;
};

export type RunTaskOptions = {
  trigger: "schedule" | "manual";
};
