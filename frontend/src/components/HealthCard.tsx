"use client";

import { HealthResponse } from "@/lib/api";

type StatusType = "idle" | "loading" | "success" | "error";

interface HealthCardProps {
  health: HealthResponse | null;
  healthStatus: StatusType;
  checkHealth: () => void;
}

export function HealthCard({ health, healthStatus, checkHealth }: HealthCardProps) {
  return (
    <section className="mb-8 animate-fade-in">
      <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border)] p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className={`w-3 h-3 rounded-full ${
                healthStatus === "success" && health?.database === "connected"
                  ? "bg-[var(--success)]"
                  : healthStatus === "loading"
                  ? "bg-[var(--warning)] animate-pulse"
                  : "bg-[var(--error)]"
              }`}
            />
            <div>
              <h2 className="text-lg font-semibold">Backend Status</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                {health
                  ? `v${health.version} • Database: ${health.database}`
                  : "Checking connection..."}
              </p>
            </div>
          </div>
          <button
            onClick={checkHealth}
            disabled={healthStatus === "loading"}
            className="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border)] rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {healthStatus === "loading" ? "Checking..." : "Refresh"}
          </button>
        </div>
      </div>
    </section>
  );
}

