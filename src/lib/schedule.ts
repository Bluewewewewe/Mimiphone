// ========== 课程表 — 纯业务逻辑 ==========

export type RepeatType = "none" | "daily" | "weekly" | "monthly";

export interface ScheduleItem {
  id?: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  created_by: string;
  repeat_type: RepeatType;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a schedule item for correctness.
 * - title must not be empty
 * - start_time must be before end_time
 * - repeat_type must be one of the allowed values
 */
export function validateSchedule(item: ScheduleItem): ValidationResult {
  const errors: string[] = [];

  if (!item.title || !item.title.trim()) {
    errors.push("课程标题不能为空");
  }

  if (!item.start_time) {
    errors.push("开始时间不能为空");
  }

  if (!item.end_time) {
    errors.push("结束时间不能为空");
  }

  if (item.start_time && item.end_time) {
    const start = new Date(item.start_time);
    const end = new Date(item.end_time);
    if (isNaN(start.getTime())) {
      errors.push("开始时间格式无效");
    } else if (isNaN(end.getTime())) {
      errors.push("结束时间格式无效");
    } else if (start.getTime() >= end.getTime()) {
      errors.push("结束时间必须晚于开始时间");
    }
  }

  const validRepeatTypes: RepeatType[] = ["none", "daily", "weekly", "monthly"];
  if (!validRepeatTypes.includes(item.repeat_type)) {
    errors.push(`无效的重复类型: ${item.repeat_type}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generate reminder time points for a schedule item.
 * Returns an array of ISO timestamp strings for reminders.
 * Default reminders: 30 minutes before, 1 hour before, 1 day before.
 */
export function generateReminders(item: ScheduleItem): string[] {
  if (!item.start_time) return [];
  const start = new Date(item.start_time);
  if (isNaN(start.getTime())) return [];

  const reminders: string[] = [];

  // 1 day before (earliest reminder first)
  const r1d = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  reminders.push(r1d.toISOString());

  // 1 hour before
  const r1h = new Date(start.getTime() - 60 * 60 * 1000);
  reminders.push(r1h.toISOString());

  // 30 minutes before (closest to event)
  const r30m = new Date(start.getTime() - 30 * 60 * 1000);
  reminders.push(r30m.toISOString());

  return reminders;
}
