"use client";

import { useCallback, useMemo } from "react";
import { Call } from "@/lib/api";
import { CallRow } from "./CallRow";

type StatusType = "idle" | "loading" | "success" | "error";

interface CallsTableProps {
  apiKey: string;
  calls: Call[];
  callsTotal: number;
  callsStatus: StatusType;
  callsPage: number;
  pageSize: number;
  onRefresh: () => void;
  onViewExports: (id: number) => void;
  onDelete: (id: number) => void;
  onPageChange: (page: number) => void;
}

export function CallsTable({
  apiKey,
  calls,
  callsTotal,
  callsStatus,
  callsPage,
  pageSize,
  onRefresh,
  onViewExports,
  onDelete,
  onPageChange,
}: CallsTableProps) {
  const formatDate = useCallback((dateStr: string) => {
    return new Date(dateStr).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, []);

  const totalPages = useMemo(() => Math.ceil(callsTotal / pageSize), [callsTotal, pageSize]);

  return (
    <section className="mt-8 animate-fade-in" style={{ animationDelay: "0.3s" }}>
      <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            AGFEO Calls
            <span className="ml-2 px-2 py-0.5 text-xs bg-[var(--bg-tertiary)] rounded-full">{callsTotal}</span>
          </h2>
          <button
            onClick={onRefresh}
            disabled={!apiKey || callsStatus === "loading"}
            className="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border)] rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {callsStatus === "loading" ? "Loading..." : "Refresh"}
          </button>
        </div>

        {!apiKey ? (
          <div className="px-6 py-12 text-center text-[var(--text-secondary)]">
            <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <p>Enter your API key to view calls</p>
          </div>
        ) : calls.length === 0 && callsStatus !== "loading" ? (
          <div className="px-6 py-12 text-center text-[var(--text-secondary)]">
            <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <p>No calls available</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[var(--bg-tertiary)]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">From</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">To</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Caller</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">State</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Time</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {calls.map((call) => (
                  <CallRow
                    key={call.id}
                    call={call}
                    onViewExports={onViewExports}
                    onDelete={onDelete}
                    formatDate={formatDate}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {apiKey && callsTotal > 0 && (
          <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-between">
            <p className="text-sm text-[var(--text-secondary)]">
              Showing {callsPage * pageSize + 1}-{Math.min((callsPage + 1) * pageSize, callsTotal)} of {callsTotal}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPageChange(callsPage - 1)}
                disabled={callsPage === 0 || callsStatus === "loading"}
                className="px-3 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border)] rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ← Previous
              </button>
              <span className="px-3 py-1.5 text-sm text-[var(--text-secondary)]">
                Page {callsPage + 1} of {totalPages}
              </span>
              <button
                onClick={() => onPageChange(callsPage + 1)}
                disabled={(callsPage + 1) * pageSize >= callsTotal || callsStatus === "loading"}
                className="px-3 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border)] rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

