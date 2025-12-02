"use client";

import { ScrapeSchedule } from "@/lib/api";

type StatusType = "idle" | "loading" | "success" | "error";

interface ScheduleManagerProps {
  apiKey: string;
  schedules: ScrapeSchedule[];
  scheduleActive: boolean;
  newScheduleHour: number;
  newScheduleMinute: number;
  scheduleStatus: StatusType;
  onAddSchedule: () => void;
  onRemoveSchedule: (id: number) => void;
  onToggleSchedule: (id: number) => void;
  onSyncSchedules: () => void;
  onHourChange: (hour: number) => void;
  onMinuteChange: (minute: number) => void;
}

export function ScheduleManager({
  apiKey,
  schedules,
  scheduleActive,
  newScheduleHour,
  newScheduleMinute,
  scheduleStatus,
  onAddSchedule,
  onRemoveSchedule,
  onToggleSchedule,
  onSyncSchedules,
  onHourChange,
  onMinuteChange,
}: ScheduleManagerProps) {
  if (!apiKey) return null;

  return (
    <div className="mt-6 pt-6 border-t border-[var(--border)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg
            className="w-5 h-5 text-purple-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="font-semibold">Automatic Scraping</h3>
          {scheduleActive ? (
            <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded-full">
              Active
            </span>
          ) : schedules.length > 0 ? (
            <button
              onClick={onSyncSchedules}
              className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded-full hover:bg-yellow-500/30 transition-colors cursor-pointer"
              title="Click to sync"
            >
              ⚠ Not synced - Click to sync
            </button>
          ) : null}
        </div>
      </div>

      <p className="text-sm text-[var(--text-secondary)] mb-4">
        Configure times for automatic scraping. The system will run scraping daily at these times.
      </p>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <select
            value={newScheduleHour}
            onChange={(e) => onHourChange(parseInt(e.target.value))}
            className="w-20 text-center"
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>
                {i.toString().padStart(2, '0')}
              </option>
            ))}
          </select>
          <span className="text-lg font-bold">:</span>
          <select
            value={newScheduleMinute}
            onChange={(e) => onMinuteChange(parseInt(e.target.value))}
            className="w-20 text-center"
          >
            {[0, 15, 30, 45].map((m) => (
              <option key={m} value={m}>
                {m.toString().padStart(2, '0')}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={onAddSchedule}
          disabled={scheduleStatus === "loading"}
          className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {scheduleStatus === "loading" ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          )}
          Add
        </button>
      </div>

      {schedules.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {schedules.map((schedule) => (
            <div
              key={schedule.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                schedule.enabled
                  ? 'bg-purple-500/10 border-purple-500/30'
                  : 'bg-[var(--bg-tertiary)] border-[var(--border)] opacity-50'
              }`}
            >
              <span className={`font-mono font-medium ${schedule.enabled ? 'text-purple-400' : 'text-[var(--text-secondary)]'}`}>
                {schedule.time_display}
              </span>
              <button
                onClick={() => onToggleSchedule(schedule.id)}
                className={`p-1 rounded transition-colors ${
                  schedule.enabled
                    ? 'hover:bg-purple-500/20 text-purple-400'
                    : 'hover:bg-[var(--border)] text-[var(--text-secondary)]'
                }`}
                title={schedule.enabled ? 'Disable' : 'Enable'}
              >
                {schedule.enabled ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => onRemoveSchedule(schedule.id)}
                className="p-1 hover:bg-red-500/20 rounded transition-colors text-[var(--text-secondary)] hover:text-red-400"
                title="Delete"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--text-secondary)] italic">
          No automatic scraping times configured.
        </p>
      )}
    </div>
  );
}

