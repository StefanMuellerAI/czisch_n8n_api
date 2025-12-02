"use client";

import { useCallback, useMemo } from "react";
import { Order } from "@/lib/api";
import { OrderRow } from "./OrderRow";

type StatusType = "idle" | "loading" | "success" | "error";

interface OrdersTableProps {
  apiKey: string;
  orders: Order[];
  ordersTotal: number;
  ordersStatus: StatusType;
  currentPage: number;
  pageSize: number;
  xmlLoading: boolean;
  onRefresh: () => void;
  onDelete: (id: number) => void;
  onViewXml: (id: number) => void;
  onUpload: (id: number) => void;
  onPageChange: (page: number) => void;
}

export function OrdersTable({
  apiKey,
  orders,
  ordersTotal,
  ordersStatus,
  currentPage,
  pageSize,
  xmlLoading,
  onRefresh,
  onDelete,
  onViewXml,
  onUpload,
  onPageChange,
}: OrdersTableProps) {
  const formatDate = useCallback((dateStr: string) => {
    return new Date(dateStr).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, []);

  const totalPages = useMemo(() => Math.ceil(ordersTotal / pageSize), [ordersTotal, pageSize]);

  return (
    <section className="animate-fade-in" style={{ animationDelay: "0.2s" }}>
      <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <svg className="w-5 h-5 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Orders
            <span className="ml-2 px-2 py-0.5 text-xs bg-[var(--bg-tertiary)] rounded-full">{ordersTotal}</span>
          </h2>
          <button
            onClick={onRefresh}
            disabled={!apiKey || ordersStatus === "loading"}
            className="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border)] rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {ordersStatus === "loading" ? "Loading..." : "Refresh"}
          </button>
        </div>

        {!apiKey ? (
          <div className="px-6 py-12 text-center text-[var(--text-secondary)]">
            <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <p>Enter your API key to view orders</p>
          </div>
        ) : orders.length === 0 && ordersStatus !== "loading" ? (
          <div className="px-6 py-12 text-center text-[var(--text-secondary)]">
            <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p>No orders found. Create your first order above!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[var(--bg-tertiary)]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Order ID</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Belnr</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Updated</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {orders.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    onDelete={onDelete}
                    onViewXml={onViewXml}
                    onUpload={onUpload}
                    formatDate={formatDate}
                    xmlLoading={xmlLoading}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {apiKey && ordersTotal > 0 && (
          <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-between">
            <p className="text-sm text-[var(--text-secondary)]">
              Showing {currentPage * pageSize + 1}-{Math.min((currentPage + 1) * pageSize, ordersTotal)} of {ordersTotal}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 0 || ordersStatus === "loading"}
                className="px-3 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border)] rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ← Previous
              </button>
              <span className="px-3 py-1.5 text-sm text-[var(--text-secondary)]">
                Page {currentPage + 1} of {totalPages}
              </span>
              <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={(currentPage + 1) * pageSize >= ordersTotal || ordersStatus === "loading"}
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

