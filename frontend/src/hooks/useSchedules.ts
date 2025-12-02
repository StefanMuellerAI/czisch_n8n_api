"use client";

import { useState, useCallback } from "react";
import { apiClient, ScrapeSchedule } from "@/lib/api";

type StatusType = "idle" | "loading" | "success" | "error";

export function useSchedules(apiKey: string, showToast: (message: string, type: "success" | "error") => void) {
  const [schedules, setSchedules] = useState<ScrapeSchedule[]>([]);
  const [scheduleActive, setScheduleActive] = useState(false);
  const [newScheduleHour, setNewScheduleHour] = useState(6);
  const [newScheduleMinute, setNewScheduleMinute] = useState(0);
  const [scheduleStatus, setScheduleStatus] = useState<StatusType>("idle");

  const fetchSchedules = useCallback(async () => {
    if (!apiKey) return;
    apiClient.setApiKey(apiKey);
    const { data, error } = await apiClient.getSchedules();
    if (data) {
      setSchedules(data.schedules);
      setScheduleActive(data.schedule_active);
    } else if (error) {
      console.error("Failed to fetch schedules:", error);
    }
  }, [apiKey]);

  const addSchedule = useCallback(async () => {
    if (!apiKey) {
      showToast("API key required", "error");
      return;
    }
    setScheduleStatus("loading");
    apiClient.setApiKey(apiKey);
    const { data, error } = await apiClient.createSchedule({
      hour: newScheduleHour,
      minute: newScheduleMinute,
    });
    if (data) {
      setScheduleStatus("success");
      showToast(`Time ${data.time_display} added`, "success");
      fetchSchedules();
    } else {
      setScheduleStatus("error");
      showToast(error || "Error adding schedule", "error");
    }
    setTimeout(() => setScheduleStatus("idle"), 2000);
  }, [apiKey, newScheduleHour, newScheduleMinute, fetchSchedules, showToast]);

  const removeSchedule = useCallback(async (id: number) => {
    apiClient.setApiKey(apiKey);
    const { data, error } = await apiClient.deleteSchedule(id);
    if (data) {
      showToast(data.message, "success");
      fetchSchedules();
    } else {
      showToast(error || "Error deleting schedule", "error");
    }
  }, [apiKey, fetchSchedules, showToast]);

  const toggleScheduleEnabled = useCallback(async (id: number) => {
    apiClient.setApiKey(apiKey);
    const { data, error } = await apiClient.toggleSchedule(id);
    if (data) {
      showToast(`Time ${data.time_display} ${data.enabled ? 'enabled' : 'disabled'}`, "success");
      fetchSchedules();
    } else {
      showToast(error || "Error", "error");
    }
  }, [apiKey, fetchSchedules, showToast]);

  const syncSchedules = useCallback(async () => {
    apiClient.setApiKey(apiKey);
    const { data, error } = await apiClient.syncSchedules();
    if (data) {
      showToast(data.message, "success");
      fetchSchedules();
    } else {
      showToast(error || "Sync failed", "error");
    }
  }, [apiKey, fetchSchedules, showToast]);

  return {
    // State
    schedules,
    scheduleActive,
    newScheduleHour,
    newScheduleMinute,
    scheduleStatus,
    // Actions
    fetchSchedules,
    addSchedule,
    removeSchedule,
    toggleScheduleEnabled,
    syncSchedules,
    setNewScheduleHour,
    setNewScheduleMinute,
  };
}

