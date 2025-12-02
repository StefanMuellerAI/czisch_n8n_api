"use client";

import { useState, useCallback } from "react";
import { apiClient, HealthResponse } from "@/lib/api";

type StatusType = "idle" | "loading" | "success" | "error";

export function useHealth(showToast: (message: string, type: "success" | "error") => void) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthStatus, setHealthStatus] = useState<StatusType>("idle");

  const checkHealth = useCallback(async () => {
    setHealthStatus("loading");
    const { data, error } = await apiClient.health();
    if (data) {
      setHealth(data);
      setHealthStatus("success");
    } else {
      setHealth(null);
      setHealthStatus("error");
      showToast(error || "Health check failed", "error");
    }
  }, [showToast]);

  return {
    health,
    healthStatus,
    checkHealth,
  };
}

