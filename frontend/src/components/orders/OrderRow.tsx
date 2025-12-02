"use client";

import React, { memo } from "react";
import { Order } from "@/lib/api";

interface OrderRowProps {
  order: Order;
  onDelete: (id: number) => void;
  onViewXml: (id: number) => void;
  onUpload: (id: number) => void;
  formatDate: (dateStr: string) => string;
  xmlLoading: boolean;
}

export const OrderRow = memo(function OrderRow({
  order,
  onDelete,
  onViewXml,
  onUpload,
  formatDate,
  xmlLoading,
}: OrderRowProps) {
  return (
    <tr className="hover:bg-[var(--bg-tertiary)] transition-colors">
      <td className="px-6 py-4 text-sm font-mono">{order.id}</td>
      <td className="px-6 py-4 text-sm font-medium">{order.order_id}</td>
      <td className="px-6 py-4 text-sm font-mono text-[var(--text-secondary)]">
        {order.belnr || "—"}
      </td>
      <td className="px-6 py-4">
        <span
          className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${
            order.status === "scraped"
              ? "bg-orange-500/20 text-orange-400"
              : order.status === "converted"
              ? "bg-emerald-500/20 text-emerald-400"
              : order.status === "sent"
              ? "bg-cyan-500/20 text-cyan-400"
              : "bg-gray-500/20 text-gray-400"
          }`}
        >
          {order.status}
        </span>
      </td>
      <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">
        {formatDate(order.created_at)}
      </td>
      <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">
        {formatDate(order.updated_at)}
      </td>
      <td className="px-6 py-4 text-right">
        <div className="flex items-center justify-end gap-2">
          {(order.status === "scraped" || order.status === "converted" || order.status === "sent") && (
            <button
              onClick={() => onViewXml(order.id)}
              disabled={xmlLoading}
              className={`p-2 rounded-lg transition-colors text-[var(--text-secondary)] ${
                order.status === "sent"
                  ? "hover:bg-cyan-500/20 hover:text-cyan-400"
                  : order.status === "converted"
                  ? "hover:bg-emerald-500/20 hover:text-emerald-400"
                  : "hover:bg-orange-500/20 hover:text-orange-400"
              }`}
              title="View XML"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </button>
          )}
          {order.status === "converted" && (
            <button
              onClick={() => onUpload(order.id)}
              className="p-2 hover:bg-blue-500/20 rounded-lg transition-colors text-[var(--text-secondary)] hover:text-blue-400"
              title="Upload to SFTP"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </button>
          )}
          <button
            onClick={() => onDelete(order.id)}
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

