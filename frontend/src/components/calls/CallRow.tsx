"use client";

import React, { memo } from "react";
import { Call } from "@/lib/api";

interface CallRowProps {
  call: Call;
  onViewExports: (id: number) => void;
  onDelete: (id: number) => void;
  formatDate: (dateStr: string) => string;
}

export const CallRow = memo(function CallRow({
  call,
  onViewExports,
  onDelete,
  formatDate,
}: CallRowProps) {
  return (
    <tr className="hover:bg-[var(--bg-tertiary)] transition-colors">
      <td className="px-6 py-4 text-sm font-mono">{call.id}</td>
      <td className="px-6 py-4 text-sm font-mono">{call.from_number}</td>
      <td className="px-6 py-4 text-sm font-mono">{call.to_number}</td>
      <td className="px-6 py-4 text-sm">{call.caller_name || "—"}</td>
      <td className="px-6 py-4">
        <span
          className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${
            call.state === "ringing"
              ? "bg-yellow-500/20 text-yellow-400"
              : call.state === "answered"
              ? "bg-green-500/20 text-green-400"
              : "bg-gray-500/20 text-gray-400"
          }`}
        >
          {call.state}
        </span>
      </td>
      <td className="px-6 py-4">
        <span
          className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${
            call.status === "received"
              ? "bg-blue-500/20 text-blue-400"
              : call.status === "converted"
              ? "bg-yellow-500/20 text-yellow-400"
              : call.status === "sent"
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-gray-500/20 text-gray-400"
          }`}
        >
          {call.status}
        </span>
      </td>
      <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">
        {formatDate(call.call_timestamp)}
      </td>
      <td className="px-6 py-4 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => onViewExports(call.id)}
            className="p-2 hover:bg-green-500/20 rounded-lg transition-colors text-[var(--text-secondary)] hover:text-green-400"
            title="View Exports"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(call.id)}
            className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-[var(--text-secondary)] hover:text-red-400"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
});

