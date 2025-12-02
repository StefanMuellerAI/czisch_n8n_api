"use client";

import { useState, useCallback } from "react";
import { apiClient, Call, CallExport } from "@/lib/api";

type StatusType = "idle" | "loading" | "success" | "error";

const PAGE_SIZE = 10;

export function useCalls(apiKey: string, showToast: (message: string, type: "success" | "error") => void) {
  const [calls, setCalls] = useState<Call[]>([]);
  const [callsTotal, setCallsTotal] = useState(0);
  const [callsStatus, setCallsStatus] = useState<StatusType>("idle");
  const [callsPage, setCallsPage] = useState(0);

  // Export viewer state
  const [viewingCallExports, setViewingCallExports] = useState<CallExport[]>([]);
  const [viewingCallId, setViewingCallId] = useState<number | null>(null);
  const [selectedCallExportType, setSelectedCallExportType] = useState<'agfeo' | 'taifun'>('agfeo');

  const fetchCalls = useCallback(async (page: number = callsPage) => {
    if (!apiKey) return;
    setCallsStatus("loading");
    apiClient.setApiKey(apiKey);
    const skip = page * PAGE_SIZE;
    const { data, error } = await apiClient.getCalls(skip, PAGE_SIZE);
    if (data) {
      setCalls(data.calls);
      setCallsTotal(data.total);
      setCallsStatus("success");
    } else {
      setCalls([]);
      setCallsStatus("error");
      showToast(error || "Failed to fetch calls", "error");
    }
  }, [apiKey, callsPage, showToast]);

  const deleteCall = useCallback(async (id: number) => {
    apiClient.setApiKey(apiKey);
    const { data, error } = await apiClient.deleteCall(id);
    if (data) {
      showToast(data.message, "success");
      fetchCalls(callsPage);
    } else {
      showToast(error || "Error deleting", "error");
    }
  }, [apiKey, callsPage, fetchCalls, showToast]);

  const viewCallExports = useCallback(async (callId: number) => {
    setViewingCallId(callId);
    apiClient.setApiKey(apiKey);
    const { data, error } = await apiClient.getCallExports(callId);
    if (data && data.length > 0) {
      setViewingCallExports(data);
      const hasAgfeo = data.some(e => e.export_type === 'agfeo');
      setSelectedCallExportType(hasAgfeo ? 'agfeo' : 'taifun');
    } else {
      showToast(error || "No exports found", "error");
    }
  }, [apiKey, showToast]);

  const closeCallExportViewer = useCallback(() => {
    setViewingCallExports([]);
    setViewingCallId(null);
  }, []);

  const getCurrentCallExport = useCallback(() => {
    return viewingCallExports.find(e => e.export_type === selectedCallExportType);
  }, [viewingCallExports, selectedCallExportType]);

  const goToPage = useCallback((page: number) => {
    setCallsPage(page);
    fetchCalls(page);
  }, [fetchCalls]);

  return {
    // State
    calls,
    callsTotal,
    callsStatus,
    callsPage,
    pageSize: PAGE_SIZE,
    // Export state
    viewingCallExports,
    viewingCallId,
    selectedCallExportType,
    // Actions
    fetchCalls,
    deleteCall,
    goToPage,
    // Export actions
    viewCallExports,
    closeCallExportViewer,
    getCurrentCallExport,
    setSelectedCallExportType,
  };
}

