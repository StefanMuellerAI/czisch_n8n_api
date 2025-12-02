"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { apiClient, WorkflowStatusResponse } from "@/lib/api";

type StatusType = "idle" | "loading" | "success" | "error";

const DEFAULT_SCRAPE_URL = "https://hapodu.duisburg.de/risource/do/order/list/editable?initSearch=true&reset=false";

export function useScraping(
  apiKey: string,
  showToast: (message: string, type: "success" | "error") => void,
  onScrapeComplete: () => void
) {
  const [scrapeStatus, setScrapeStatus] = useState<StatusType>("idle");
  const [scrapeResult, setScrapeResult] = useState<WorkflowStatusResponse["result"] | null>(null);
  const [scrapeUrl, setScrapeUrl] = useState(DEFAULT_SCRAPE_URL);
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Conversion state
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [convertAllStatus, setConvertAllStatus] = useState<StatusType>("idle");

  // Load saved URL from backend on mount
  useEffect(() => {
    if (!apiKey) return;
    
    const loadSavedUrl = async () => {
      apiClient.setApiKey(apiKey);
      const { data } = await apiClient.getScrapeConfig();
      if (data?.custom_order_list_url) {
        setScrapeUrl(data.custom_order_list_url);
      }
    };
    
    loadSavedUrl();
  }, [apiKey]);

  // Save URL to backend with debounce and sync schedules
  const saveUrlToBackend = useCallback(async (url: string) => {
    if (!apiKey) return;
    
    apiClient.setApiKey(apiKey);
    const urlToSave = url.trim() === DEFAULT_SCRAPE_URL ? null : url.trim() || null;
    
    const { error } = await apiClient.updateScrapeConfig(urlToSave);
    if (error) {
      showToast("Failed to save URL", "error");
      return;
    }
    
    // Sync schedules so Temporal gets the new URL
    await apiClient.syncSchedules();
    
    showToast("URL saved", "success");
  }, [apiKey, showToast]);

  // Handle URL change with debounced save
  const handleScrapeUrlChange = useCallback((url: string) => {
    setScrapeUrl(url);
    
    // Debounce the save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      saveUrlToBackend(url);
    }, 1000); // Save 1 second after user stops typing
  }, [saveUrlToBackend]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const pollWorkflowStatus = useCallback(async (workflowId: string): Promise<WorkflowStatusResponse["result"] | null> => {
    const maxAttempts = 120;
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      const { data, error } = await apiClient.getWorkflowStatus(workflowId);
      
      if (error || !data) {
        throw new Error(error || "Failed to get workflow status");
      }
      
      if (data.status === "COMPLETED") {
        return data.result || null;
      }
      
      if (data.status === "FAILED" || data.status === "CANCELED" || data.status === "TERMINATED") {
        throw new Error(data.error || `Workflow ${data.status.toLowerCase()}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;
    }
    
    throw new Error("Workflow timed out");
  }, []);

  const runScrape = useCallback(async () => {
    if (!apiKey) {
      showToast("API key required", "error");
      return;
    }
    if (!scrapeUrl.trim()) {
      showToast("Order list URL required", "error");
      return;
    }
    setScrapeStatus("loading");
    setScrapeResult(null);
    setCurrentWorkflowId(null);
    apiClient.setApiKey(apiKey);
    
    const { data, error } = await apiClient.scrapeOrders(scrapeUrl);
    
    if (!data) {
      setScrapeStatus("error");
      showToast(error || "Failed to start scraping", "error");
      return;
    }
    
    setCurrentWorkflowId(data.workflow_id);
    showToast("Workflow started - please wait...", "success");
    
    try {
      const result = await pollWorkflowStatus(data.workflow_id);
      
      if (result) {
        setScrapeResult(result);
        setScrapeStatus("success");
        
        const newCount = result.processed_count || 0;
        const skippedCount = result.skipped_orders || 0;
        const failedCount = result.failed_count || 0;
        
        if (failedCount > 0) {
          showToast(
            `Done: ${newCount} processed, ${skippedCount} skipped, ${failedCount} failed`,
            "error"
          );
        } else {
          showToast(
            `Done: ${newCount} processed, ${skippedCount} skipped`,
            "success"
          );
        }
        
        onScrapeComplete();
      } else {
        setScrapeStatus("success");
        showToast("Workflow completed", "success");
        onScrapeComplete();
      }
    } catch (err) {
      setScrapeStatus("error");
      showToast(err instanceof Error ? err.message : "Workflow failed", "error");
    }
    
    setCurrentWorkflowId(null);
  }, [apiKey, scrapeUrl, showToast, pollWorkflowStatus, onScrapeComplete]);

  const fetchPendingCount = useCallback(async () => {
    if (!apiKey) return;
    apiClient.setApiKey(apiKey);
    const { data } = await apiClient.getPendingConversions();
    if (data) {
      setPendingCount(data.pending_count);
    }
  }, [apiKey]);

  const convertAllPending = useCallback(async (refreshOrders: () => void) => {
    if (!apiKey) {
      showToast("API key required", "error");
      return;
    }
    setConvertAllStatus("loading");
    apiClient.setApiKey(apiKey);
    const { data, error } = await apiClient.triggerAllConversions();
    if (data) {
      setConvertAllStatus("success");
      showToast(data.message, "success");
      setPendingCount(0);
      refreshOrders();
    } else {
      setConvertAllStatus("error");
      showToast(error || "Conversion failed", "error");
    }
    setTimeout(() => setConvertAllStatus("idle"), 3000);
  }, [apiKey, showToast]);

  return {
    // State
    scrapeStatus,
    scrapeResult,
    scrapeUrl,
    currentWorkflowId,
    pendingCount,
    convertAllStatus,
    // Actions
    runScrape,
    setScrapeUrl: handleScrapeUrlChange,
    fetchPendingCount,
    convertAllPending,
  };
}

