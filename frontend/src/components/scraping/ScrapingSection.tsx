"use client";

import { WorkflowStatusResponse, ScrapeSchedule } from "@/lib/api";
import { ScheduleManager } from "./ScheduleManager";

type StatusType = "idle" | "loading" | "success" | "error";

interface ScrapingSectionProps {
  apiKey: string;
  // Scraping
  scrapeStatus: StatusType;
  scrapeResult: WorkflowStatusResponse["result"] | null;
  scrapeUrl: string;
  currentWorkflowId: string | null;
  onRunScrape: () => void;
  onScrapeUrlChange: (url: string) => void;
  // Conversions
  pendingCount: number;
  convertAllStatus: StatusType;
  onConvertAll: () => void;
  // Uploads
  pendingUploads: number;
  uploadAllStatus: StatusType;
  onUploadAll: () => void;
  // Schedules
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

export function ScrapingSection({
  apiKey,
  scrapeStatus,
  scrapeResult,
  scrapeUrl,
  currentWorkflowId,
  onRunScrape,
  onScrapeUrlChange,
  pendingCount,
  convertAllStatus,
  onConvertAll,
  pendingUploads,
  uploadAllStatus,
  onUploadAll,
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
}: ScrapingSectionProps) {
  return (
    <section className="mb-8 animate-fade-in" style={{ animationDelay: "0.05s" }}>
      <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border)] p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            Web Scraping
          </h2>
          <button
            onClick={onRunScrape}
            disabled={!apiKey || scrapeStatus === "loading"}
            className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {scrapeStatus === "loading" ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Scrape Hapodu
              </>
            )}
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-[var(--text-secondary)] mb-2">Order List URL</label>
          <input
            type="text"
            placeholder="https://hapodu.duisburg.de/risource/do/order/list/..."
            value={scrapeUrl}
            onChange={(e) => onScrapeUrlChange(e.target.value)}
            className="w-full"
          />
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            This URL is also used for automatic scheduled scraping. Changes are saved automatically.
          </p>
        </div>

        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Fetches orders from the specified URL and downloads XML exports for new orders.
        </p>

        {!apiKey && (
          <p className="text-sm text-[var(--warning)]">
            ⚠️ Please enter your API key to use scraping
          </p>
        )}

        {scrapeStatus === "loading" && currentWorkflowId && (
          <div className="mt-4 p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-orange-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <div>
                <p className="font-medium text-orange-400">Workflow running...</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Scraping and processing orders. This may take a few minutes.
                </p>
                <p className="text-xs text-[var(--text-secondary)] font-mono mt-1">
                  Workflow: {currentWorkflowId}
                </p>
              </div>
            </div>
          </div>
        )}

        {scrapeResult && (
          <div className="mt-4 p-4 bg-[var(--bg-tertiary)] rounded-lg">
            <div className="grid grid-cols-4 gap-4 text-center mb-4">
              <div>
                <p className="text-2xl font-bold text-[var(--text-secondary)]">{scrapeResult.total_found || 0}</p>
                <p className="text-xs text-[var(--text-secondary)]">Found</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--success)]">{scrapeResult.processed_count || 0}</p>
                <p className="text-xs text-[var(--text-secondary)]">Processed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--text-secondary)]">{scrapeResult.skipped_orders || 0}</p>
                <p className="text-xs text-[var(--text-secondary)]">Skipped</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--error)]">{scrapeResult.failed_count || 0}</p>
                <p className="text-xs text-[var(--text-secondary)]">Failed</p>
              </div>
            </div>

            {scrapeResult.processed && scrapeResult.processed.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-[var(--success)] mb-2">✓ Successfully processed:</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {scrapeResult.processed.map((order, idx) => (
                    <div key={idx} className="text-xs text-[var(--text-secondary)] flex justify-between">
                      <span>{order.belnr} ({order.external_order_id})</span>
                      <span className="text-[var(--success)]">{order.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {scrapeResult.failed && scrapeResult.failed.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-[var(--error)] mb-2">✗ Failed:</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {scrapeResult.failed.map((order, idx) => (
                    <div key={idx} className="text-xs text-[var(--text-secondary)]">
                      <span>{order.belnr} ({order.external_order_id})</span>
                      <span className="text-[var(--error)] ml-2">- {order.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <ScheduleManager
          apiKey={apiKey}
          schedules={schedules}
          scheduleActive={scheduleActive}
          newScheduleHour={newScheduleHour}
          newScheduleMinute={newScheduleMinute}
          scheduleStatus={scheduleStatus}
          onAddSchedule={onAddSchedule}
          onRemoveSchedule={onRemoveSchedule}
          onToggleSchedule={onToggleSchedule}
          onSyncSchedules={onSyncSchedules}
          onHourChange={onHourChange}
          onMinuteChange={onMinuteChange}
        />

        {apiKey && pendingCount > 0 && (
          <div className="mt-4 p-4 bg-[var(--bg-tertiary)] rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="font-medium">{pendingCount} Pending Conversions</p>
                <p className="text-xs text-[var(--text-secondary)]">Hapodu XMLs waiting for Taifun conversion</p>
              </div>
            </div>
            <button
              onClick={onConvertAll}
              disabled={convertAllStatus === "loading"}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {convertAllStatus === "loading" ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Converting...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Convert All
                </>
              )}
            </button>
          </div>
        )}

        {apiKey && pendingUploads > 0 && (
          <div className="mt-4 p-4 bg-[var(--bg-tertiary)] rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <p className="font-medium">{pendingUploads} Pending Uploads</p>
                <p className="text-xs text-[var(--text-secondary)]">Converted orders waiting for SFTP upload</p>
              </div>
            </div>
            <button
              onClick={onUploadAll}
              disabled={uploadAllStatus === "loading"}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {uploadAllStatus === "loading" ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Uploading...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload All
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

