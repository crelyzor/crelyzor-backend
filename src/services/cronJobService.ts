import * as cron from "node-cron";
import { userDeletionService } from "./userDeletionService";

export interface CronJobConfig {
  hardDeleteEnabled: boolean;
  hardDeleteSchedule: string; // Cron expression
  hardDeleteDaysThreshold: number;
}

class CronJobService {
  private hardDeleteTask: cron.ScheduledTask | null = null;
  private isEnabled = false;

  init(config: CronJobConfig) {
    if (config.hardDeleteEnabled) {
      this.scheduleHardDelete(
        config.hardDeleteSchedule,
        config.hardDeleteDaysThreshold,
      );
      this.isEnabled = true;
      console.log(
        `[CronJobService] Hard delete cron job scheduled: ${config.hardDeleteSchedule}`,
      );
      console.log(
        `[CronJobService] Will delete users soft-deleted more than ${config.hardDeleteDaysThreshold} days ago`,
      );
    }
  }

  private scheduleHardDelete(schedule: string, daysThreshold: number) {
    if (!cron.validate(schedule)) {
      console.error(`[CronJobService] Invalid cron expression: ${schedule}`);
      return;
    }

    this.hardDeleteTask = cron.schedule(
      schedule,
      async () => {
        console.log(
          `[CronJobService] Starting hard delete job - threshold: ${daysThreshold} days`,
        );

        try {
          const result = await userDeletionService.hardDeleteExpiredUsers(
            daysThreshold,
          );

          console.log(
            `[CronJobService] Hard delete completed: deleted ${result.deletedCount} users`,
          );

          if (result.deletedCount > 0) {
            console.log(
              `[CronJobService] Successfully hard deleted ${result.deletedCount} users and all related records`,
            );
          }
        } catch (error) {
          console.error(
            "[CronJobService] Error during hard delete job:",
            error,
          );
        }
      },
      {
        timezone: "UTC", // Use UTC for consistency
      },
    );
  }

  start() {
    if (this.hardDeleteTask && this.isEnabled) {
      this.hardDeleteTask.start();
      console.log("[CronJobService] Hard delete cron job started");
    }
  }

  stop() {
    if (this.hardDeleteTask) {
      this.hardDeleteTask.stop();
      console.log("[CronJobService] Hard delete cron job stopped");
    }
  }

  async triggerHardDelete(daysThreshold: number) {
    console.log(
      `[CronJobService] Manually triggering hard delete - threshold: ${daysThreshold} days`,
    );

    try {
      const result = await userDeletionService.hardDeleteExpiredUsers(
        daysThreshold,
      );

      console.log(
        `[CronJobService] Manual hard delete completed: deleted ${result.deletedCount} users`,
      );
      return result;
    } catch (error) {
      console.error("[CronJobService] Error during manual hard delete:", error);
      throw error;
    }
  }

  getStatus() {
    return {
      hardDeleteEnabled: this.isEnabled,
      hardDeleteRunning: this.hardDeleteTask?.getStatus() === "scheduled",
    };
  }
}

export const cronJobService = new CronJobService();

export const getDefaultCronConfig = (): CronJobConfig => ({
  hardDeleteEnabled: process.env.HARD_DELETE_ENABLED === "true",
  hardDeleteSchedule: process.env.HARD_DELETE_SCHEDULE || "*/5 * * * *", // Every 5 minutes
  hardDeleteDaysThreshold: parseInt(
    process.env.HARD_DELETE_DAYS_THRESHOLD || "7",
    10,
  ),
});

if (
  process.env.NODE_ENV === "production" ||
  process.env.AUTO_START_CRON === "true"
) {
  const config = getDefaultCronConfig();
  if (config.hardDeleteEnabled) {
    cronJobService.init(config);
    cronJobService.start();
  }
}
