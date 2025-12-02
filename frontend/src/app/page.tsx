"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient, Order, HealthResponse, WorkflowStatusResponse, OrderExport, ScrapeSchedule, Call, CallExport } from "@/lib/api";

type StatusType = "idle" | "loading" | "success" | "error";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthStatus, setHealthStatus] = useState<StatusType>("idle");

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersStatus, setOrdersStatus] = useState<StatusType>("idle");
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 10;

  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editOrderId, setEditOrderId] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [updateStatus, setUpdateStatus] = useState<StatusType>("idle");

  const [scrapeStatus, setScrapeStatus] = useState<StatusType>("idle");
  const [scrapeResult, setScrapeResult] = useState<WorkflowStatusResponse["result"] | null>(null);
  const [scrapeUrl, setScrapeUrl] = useState(
    "https://hapodu.duisburg.de/risource/do/order/list/editable?initSearch=true&reset=false"
  );
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(null);

  const [viewingExports, setViewingExports] = useState<OrderExport[]>([]);
  const [selectedExportType, setSelectedExportType] = useState<'hapodu' | 'taifun'>('hapodu');
  const [xmlLoading, setXmlLoading] = useState(false);
  const [viewingOrderId, setViewingOrderId] = useState<number | null>(null);

  const [pendingCount, setPendingCount] = useState<number>(0);
  const [convertAllStatus, setConvertAllStatus] = useState<StatusType>("idle");

  const [pendingUploads, setPendingUploads] = useState<number>(0);
  const [uploadAllStatus, setUploadAllStatus] = useState<StatusType>("idle");

  // Schedule state
  const [schedules, setSchedules] = useState<ScrapeSchedule[]>([]);
  const [scheduleActive, setScheduleActive] = useState(false);
  const [newScheduleHour, setNewScheduleHour] = useState(6);
  const [newScheduleMinute, setNewScheduleMinute] = useState(0);
  const [scheduleStatus, setScheduleStatus] = useState<StatusType>("idle");

  // Calls state
  const [calls, setCalls] = useState<Call[]>([]);
  const [callsTotal, setCallsTotal] = useState(0);
  const [callsStatus, setCallsStatus] = useState<StatusType>("idle");
  const [callsPage, setCallsPage] = useState(0);
  const [viewingCallExports, setViewingCallExports] = useState<CallExport[]>([]);
  const [viewingCallId, setViewingCallId] = useState<number | null>(null);
  const [selectedCallExportType, setSelectedCallExportType] = useState<'agfeo' | 'taifun'>('agfeo');

  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (message: string, type: "success" | "error") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const checkHealth = async () => {
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
  };

  const fetchOrders = useCallback(async (page: number = currentPage) => {
    if (!apiKey) return;
    setOrdersStatus("loading");
    apiClient.setApiKey(apiKey);
    const skip = page * pageSize;
    const { data, error } = await apiClient.getOrders(skip, pageSize);
    if (data) {
      setOrders(data.orders);
      setOrdersTotal(data.total);
      setOrdersStatus("success");
      // Count pending uploads (converted but not sent)
      const converted = data.orders.filter(o => o.status === "converted").length;
      setPendingUploads(converted);
    } else {
      setOrders([]);
      setOrdersStatus("error");
      showToast(error || "Failed to fetch orders", "error");
    }
  }, [apiKey, currentPage]);

  const uploadAllOrders = async () => {
    if (!apiKey) {
      showToast("API key required", "error");
      return;
    }
    setUploadAllStatus("loading");
    apiClient.setApiKey(apiKey);
    const { data, error } = await apiClient.triggerAllUploads();
    if (data) {
      setUploadAllStatus("success");
      if (data.triggered_count > 0) {
        showToast(`${data.triggered_count} upload(s) triggered`, "success");
        // Refresh orders after a delay to see status changes
        setTimeout(() => fetchOrders(currentPage), 3000);
      } else {
        showToast("No pending uploads", "success");
      }
    } else {
      setUploadAllStatus("error");
      showToast(error || "Failed to trigger uploads", "error");
    }
    setTimeout(() => setUploadAllStatus("idle"), 3000);
  };

  const uploadSingleOrder = async (orderId: number) => {
    apiClient.setApiKey(apiKey);
    const { data, error } = await apiClient.triggerUpload(orderId);
    if (data) {
      showToast(`Upload triggered for order ${orderId}`, "success");
      setTimeout(() => fetchOrders(currentPage), 3000);
    } else {
      showToast(error || "Failed to trigger upload", "error");
    }
  };

  const startEdit = (order: Order) => {
    setEditingOrder(order);
    setEditOrderId(order.order_id);
    setEditStatus(order.status);
  };

  const cancelEdit = () => {
    setEditingOrder(null);
    setEditOrderId("");
    setEditStatus("");
  };

  const updateOrder = async () => {
    if (!editingOrder) return;
    setUpdateStatus("loading");
    apiClient.setApiKey(apiKey);
    const { data, error } = await apiClient.updateOrder(editingOrder.id, {
      order_id: editOrderId,
      status: editStatus,
    });
    if (data) {
      setUpdateStatus("success");
      showToast(`Order updated successfully`, "success");
      cancelEdit();
      fetchOrders(currentPage);
    } else {
      setUpdateStatus("error");
      showToast(error || "Failed to update order", "error");
    }
    setTimeout(() => setUpdateStatus("idle"), 2000);
  };

  const deleteOrder = async (id: number) => {
    apiClient.setApiKey(apiKey);
    const { data, error } = await apiClient.deleteOrder(id);
    if (data) {
      showToast(data.message, "success");
      fetchOrders(currentPage);
    } else {
      showToast(error || "Failed to delete order", "error");
    }
  };

  const pollWorkflowStatus = async (workflowId: string): Promise<WorkflowStatusResponse["result"] | null> => {
    const maxAttempts = 120; // 10 minutes max (5s intervals)
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
      
      // Wait 5 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;
    }
    
    throw new Error("Workflow timed out");
  };

  const runScrape = async () => {
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
    
    // Step 1: Trigger the workflow
    const { data, error } = await apiClient.scrapeOrders(scrapeUrl);
    
    if (!data) {
      setScrapeStatus("error");
      showToast(error || "Failed to start scraping", "error");
      return;
    }
    
    setCurrentWorkflowId(data.workflow_id);
    showToast("Workflow gestartet - bitte warten...", "success");
    
    try {
      // Step 2: Poll until complete
      const result = await pollWorkflowStatus(data.workflow_id);
      
      if (result) {
        setScrapeResult(result);
        setScrapeStatus("success");
        
        const newCount = result.processed_count || 0;
        const skippedCount = result.skipped_orders || 0;
        const failedCount = result.failed_count || 0;
        
        if (failedCount > 0) {
          showToast(
            `Fertig: ${newCount} verarbeitet, ${skippedCount} übersprungen, ${failedCount} fehlgeschlagen`,
            "error"
          );
        } else {
          showToast(
            `Fertig: ${newCount} verarbeitet, ${skippedCount} übersprungen`,
            "success"
          );
        }
        
        setCurrentPage(0);
        fetchOrders(0);
      } else {
        setScrapeStatus("success");
        showToast("Workflow abgeschlossen", "success");
        setCurrentPage(0);
        fetchOrders(0);
      }
    } catch (err) {
      setScrapeStatus("error");
      showToast(err instanceof Error ? err.message : "Workflow fehlgeschlagen", "error");
    }
    
    setCurrentWorkflowId(null);
  };

  const viewOrderXml = async (orderId: number) => {
    setXmlLoading(true);
    setViewingOrderId(orderId);
    apiClient.setApiKey(apiKey);
    const { data, error } = await apiClient.getOrderExports(orderId);
    if (data && data.length > 0) {
      setViewingExports(data);
      // Default to hapodu, or taifun if only taifun exists
      const hasHapodu = data.some(e => e.export_type === 'hapodu');
      setSelectedExportType(hasHapodu ? 'hapodu' : 'taifun');
    } else {
      showToast(error || "No XML export found", "error");
    }
    setXmlLoading(false);
  };

  const closeXmlViewer = () => {
    setViewingExports([]);
    setViewingOrderId(null);
  };

  const getCurrentExport = () => {
    return viewingExports.find(e => e.export_type === selectedExportType);
  };

  const fetchPendingCount = useCallback(async () => {
    if (!apiKey) return;
    apiClient.setApiKey(apiKey);
    const { data } = await apiClient.getPendingConversions();
    if (data) {
      setPendingCount(data.pending_count);
    }
  }, [apiKey]);

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

  const addSchedule = async () => {
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
      showToast(`Zeit ${data.time_display} hinzugefügt`, "success");
      fetchSchedules();
    } else {
      setScheduleStatus("error");
      showToast(error || "Fehler beim Hinzufügen", "error");
    }
    setTimeout(() => setScheduleStatus("idle"), 2000);
  };

  const removeSchedule = async (id: number) => {
    apiClient.setApiKey(apiKey);
    const { data, error } = await apiClient.deleteSchedule(id);
    if (data) {
      showToast(data.message, "success");
      fetchSchedules();
    } else {
      showToast(error || "Fehler beim Löschen", "error");
    }
  };

  const toggleScheduleEnabled = async (id: number) => {
    apiClient.setApiKey(apiKey);
    const { data, error } = await apiClient.toggleSchedule(id);
    if (data) {
      showToast(`Zeit ${data.time_display} ${data.enabled ? 'aktiviert' : 'deaktiviert'}`, "success");
      fetchSchedules();
    } else {
      showToast(error || "Fehler", "error");
    }
  };

  // Call functions
  const fetchCalls = useCallback(async (page: number = callsPage) => {
    if (!apiKey) return;
    setCallsStatus("loading");
    apiClient.setApiKey(apiKey);
    const skip = page * pageSize;
    const { data, error } = await apiClient.getCalls(skip, pageSize);
    if (data) {
      setCalls(data.calls);
      setCallsTotal(data.total);
      setCallsStatus("success");
    } else {
      setCalls([]);
      setCallsStatus("error");
      showToast(error || "Failed to fetch calls", "error");
    }
  }, [apiKey, callsPage]);

  const viewCallExports = async (callId: number) => {
    setViewingCallId(callId);
    apiClient.setApiKey(apiKey);
    const { data, error } = await apiClient.getCallExports(callId);
    if (data && data.length > 0) {
      setViewingCallExports(data);
      const hasAgfeo = data.some(e => e.export_type === 'agfeo');
      setSelectedCallExportType(hasAgfeo ? 'agfeo' : 'taifun');
    } else {
      showToast(error || "Keine Exports gefunden", "error");
    }
  };

  const closeCallExportViewer = () => {
    setViewingCallExports([]);
    setViewingCallId(null);
  };

  const getCurrentCallExport = () => {
    return viewingCallExports.find(e => e.export_type === selectedCallExportType);
  };

  const deleteCall = async (id: number) => {
    apiClient.setApiKey(apiKey);
    const { data, error } = await apiClient.deleteCall(id);
    if (data) {
      showToast(data.message, "success");
      fetchCalls(callsPage);
    } else {
      showToast(error || "Fehler beim Löschen", "error");
    }
  };

  const convertAllPending = async () => {
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
      fetchOrders(currentPage);
    } else {
      setConvertAllStatus("error");
      showToast(error || "Conversion failed", "error");
    }
    setTimeout(() => setConvertAllStatus("idle"), 3000);
  };

  useEffect(() => {
    checkHealth();
  }, []);

  useEffect(() => {
    if (apiKey) {
      setCurrentPage(0);
      fetchOrders(0);
      fetchPendingCount();
      fetchSchedules();
      setCallsPage(0);
      fetchCalls(0);
    }
  }, [apiKey, fetchPendingCount, fetchSchedules, fetchCalls]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`animate-slide-in px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
              toast.type === "success"
                ? "bg-[var(--success)] text-white"
                : "bg-[var(--error)] text-white"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-purple-600 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)]">
                  Czisch N8N API
          </h1>
                <p className="text-sm text-[var(--text-secondary)]">
                  Test Dashboard
                </p>
              </div>
            </div>

            {/* API Key Input */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <input
                  type="password"
                  placeholder="Enter API Key..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-64 pr-10"
                />
                <svg
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Health Status Card */}
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

        {/* Scraping Section */}
        <section className="mb-8 animate-fade-in" style={{ animationDelay: "0.05s" }}>
          <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border)] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-orange-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                  />
                </svg>
                Web Scraping
              </h2>
              <button
                onClick={runScrape}
                disabled={!apiKey || scrapeStatus === "loading"}
                className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {scrapeStatus === "loading" ? (
                  <>
                    <svg
                      className="w-4 h-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Verarbeite...
                  </>
                ) : (
                  <>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Scrape Hapodu
                  </>
                )}
              </button>
            </div>
            <div className="mb-4">
              <label className="block text-sm text-[var(--text-secondary)] mb-2">
                Order List URL
              </label>
              <input
                type="text"
                placeholder="https://hapodu.duisburg.de/risource/do/order/list/..."
                value={scrapeUrl}
                onChange={(e) => setScrapeUrl(e.target.value)}
                className="w-full"
              />
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Fetches orders from the specified URL and downloads XML exports for new orders.
            </p>
            {!apiKey && (
              <p className="text-sm text-[var(--warning)]">
                ⚠️ Please enter your API key to use scraping
              </p>
            )}
            
            {/* Workflow Progress Indicator */}
            {scrapeStatus === "loading" && currentWorkflowId && (
              <div className="mt-4 p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <svg
                    className="w-5 h-5 text-orange-400 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <div>
                    <p className="font-medium text-orange-400">Workflow läuft...</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Scraping und Verarbeitung der Bestellungen. Dies kann einige Minuten dauern.
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
                    <p className="text-2xl font-bold text-[var(--text-secondary)]">
                      {scrapeResult.total_found || 0}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">Gefunden</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[var(--success)]">
                      {scrapeResult.processed_count || 0}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">Verarbeitet</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[var(--text-secondary)]">
                      {scrapeResult.skipped_orders || 0}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">Übersprungen</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[var(--error)]">
                      {scrapeResult.failed_count || 0}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">Fehlgeschlagen</p>
                  </div>
                </div>
                
                {/* Processed orders list */}
                {scrapeResult.processed && scrapeResult.processed.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-[var(--success)] mb-2">
                      ✓ Erfolgreich verarbeitet:
                    </p>
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
                
                {/* Failed orders list */}
                {scrapeResult.failed && scrapeResult.failed.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-[var(--error)] mb-2">
                      ✗ Fehlgeschlagen:
                    </p>
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
            
            {/* Schedule Management */}
            {apiKey && (
              <div className="mt-6 pt-6 border-t border-[var(--border)]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-purple-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <h3 className="font-semibold">Automatisches Scraping</h3>
                    {scheduleActive ? (
                      <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded-full">
                        Aktiv
                      </span>
                    ) : schedules.length > 0 ? (
                      <button
                        onClick={async () => {
                          apiClient.setApiKey(apiKey);
                          const { data, error } = await apiClient.syncSchedules();
                          if (data) {
                            showToast(data.message, "success");
                            fetchSchedules();
                          } else {
                            showToast(error || "Sync fehlgeschlagen", "error");
                          }
                        }}
                        className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded-full hover:bg-yellow-500/30 transition-colors cursor-pointer"
                        title="Klicken zum Synchronisieren"
                      >
                        ⚠ Nicht synchronisiert - Klicken zum Sync
                      </button>
                    ) : null}
                  </div>
                </div>
                
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  Konfiguriere Uhrzeiten für automatisches Scraping. Das System führt zu diesen Zeiten täglich das Scraping durch.
                </p>
                
                {/* Add new schedule */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <select
                      value={newScheduleHour}
                      onChange={(e) => setNewScheduleHour(parseInt(e.target.value))}
                      className="w-20 text-center"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>
                          {i.toString().padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                    <span className="text-lg font-bold">:</span>
                    <select
                      value={newScheduleMinute}
                      onChange={(e) => setNewScheduleMinute(parseInt(e.target.value))}
                      className="w-20 text-center"
                    >
                      {[0, 15, 30, 45].map((m) => (
                        <option key={m} value={m}>
                          {m.toString().padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={addSchedule}
                    disabled={scheduleStatus === "loading"}
                    className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {scheduleStatus === "loading" ? (
                      <svg
                        className="w-4 h-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                    )}
                    Hinzufügen
                  </button>
                </div>
                
                {/* Schedule list */}
                {schedules.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {schedules.map((schedule) => (
                      <div
                        key={schedule.id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                          schedule.enabled
                            ? 'bg-purple-500/10 border-purple-500/30'
                            : 'bg-[var(--bg-tertiary)] border-[var(--border)] opacity-50'
                        }`}
                      >
                        <span className={`font-mono font-medium ${schedule.enabled ? 'text-purple-400' : 'text-[var(--text-secondary)]'}`}>
                          {schedule.time_display}
                        </span>
                        <button
                          onClick={() => toggleScheduleEnabled(schedule.id)}
                          className={`p-1 rounded transition-colors ${
                            schedule.enabled
                              ? 'hover:bg-purple-500/20 text-purple-400'
                              : 'hover:bg-[var(--border)] text-[var(--text-secondary)]'
                          }`}
                          title={schedule.enabled ? 'Deaktivieren' : 'Aktivieren'}
                        >
                          {schedule.enabled ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => removeSchedule(schedule.id)}
                          className="p-1 hover:bg-red-500/20 rounded transition-colors text-[var(--text-secondary)] hover:text-red-400"
                          title="Löschen"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-secondary)] italic">
                    Keine automatischen Scraping-Zeiten konfiguriert.
                  </p>
                )}
              </div>
            )}
            
            {/* Pending Conversions */}
            {apiKey && pendingCount > 0 && (
              <div className="mt-4 p-4 bg-[var(--bg-tertiary)] rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-yellow-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium">{pendingCount} Pending Conversions</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Hapodu XMLs waiting for Taifun conversion
                    </p>
                  </div>
                </div>
                <button
                  onClick={convertAllPending}
                  disabled={convertAllStatus === "loading"}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {convertAllStatus === "loading" ? (
                    <>
                      <svg
                        className="w-4 h-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Converting...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                      Convert All
                    </>
                  )}
                </button>
              </div>
            )}
            
            {/* Pending Uploads */}
            {apiKey && pendingUploads > 0 && (
              <div className="mt-4 p-4 bg-[var(--bg-tertiary)] rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-blue-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium">{pendingUploads} Pending Uploads</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Converted orders waiting for SFTP upload
                    </p>
                  </div>
                </div>
                <button
                  onClick={uploadAllOrders}
                  disabled={uploadAllStatus === "loading"}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {uploadAllStatus === "loading" ? (
                    <>
                      <svg
                        className="w-4 h-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Uploading...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                      Upload All
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Orders Table Section */}
        <section className="animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border)] overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-[var(--accent)]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
                Orders
                <span className="ml-2 px-2 py-0.5 text-xs bg-[var(--bg-tertiary)] rounded-full">
                  {ordersTotal}
                </span>
              </h2>
              <button
                onClick={() => fetchOrders(currentPage)}
                disabled={!apiKey || ordersStatus === "loading"}
                className="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border)] rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {ordersStatus === "loading" ? "Loading..." : "Refresh"}
              </button>
            </div>

            {!apiKey ? (
              <div className="px-6 py-12 text-center text-[var(--text-secondary)]">
                <svg
                  className="w-12 h-12 mx-auto mb-4 opacity-50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                <p>Enter your API key to view orders</p>
              </div>
            ) : orders.length === 0 && ordersStatus !== "loading" ? (
              <div className="px-6 py-12 text-center text-[var(--text-secondary)]">
                <svg
                  className="w-12 h-12 mx-auto mb-4 opacity-50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                  />
                </svg>
                <p>No orders found. Create your first order above!</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[var(--bg-tertiary)]">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                        ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                        Order ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                        Bestellnr.
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                        Updated
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {orders.map((order) => (
                      <tr
                        key={order.id}
                        className="hover:bg-[var(--bg-tertiary)] transition-colors"
                      >
                        <td className="px-6 py-4 text-sm font-mono">
                          {order.id}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium">
                          {order.order_id}
                        </td>
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
                                onClick={() => viewOrderXml(order.id)}
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
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                                  />
                                </svg>
                              </button>
                            )}
                            {order.status === "converted" && (
                              <button
                                onClick={() => uploadSingleOrder(order.id)}
                                className="p-2 hover:bg-blue-500/20 rounded-lg transition-colors text-[var(--text-secondary)] hover:text-blue-400"
                                title="Upload to SFTP"
                              >
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                                  />
                                </svg>
                              </button>
                            )}
                            <button
                              onClick={() => startEdit(order)}
                              className="p-2 hover:bg-[var(--border)] rounded-lg transition-colors text-[var(--text-secondary)] hover:text-[var(--accent)]"
                              title="Edit"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() => deleteOrder(order.id)}
                              className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-[var(--text-secondary)] hover:text-red-400"
                              title="Delete"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {/* Pagination */}
            {apiKey && ordersTotal > 0 && (
              <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-between">
                <p className="text-sm text-[var(--text-secondary)]">
                  Zeige {currentPage * pageSize + 1}-{Math.min((currentPage + 1) * pageSize, ordersTotal)} von {ordersTotal}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const newPage = currentPage - 1;
                      setCurrentPage(newPage);
                      fetchOrders(newPage);
                    }}
                    disabled={currentPage === 0 || ordersStatus === "loading"}
                    className="px-3 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border)] rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ← Zurück
                  </button>
                  <span className="px-3 py-1.5 text-sm text-[var(--text-secondary)]">
                    Seite {currentPage + 1} von {Math.ceil(ordersTotal / pageSize)}
                  </span>
                  <button
                    onClick={() => {
                      const newPage = currentPage + 1;
                      setCurrentPage(newPage);
                      fetchOrders(newPage);
                    }}
                    disabled={(currentPage + 1) * pageSize >= ordersTotal || ordersStatus === "loading"}
                    className="px-3 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border)] rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Weiter →
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Calls Table Section */}
        <section className="mt-8 animate-fade-in" style={{ animationDelay: "0.3s" }}>
          <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border)] overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
                AGFEO Calls
                <span className="ml-2 px-2 py-0.5 text-xs bg-[var(--bg-tertiary)] rounded-full">
                  {callsTotal}
                </span>
              </h2>
              <button
                onClick={() => fetchCalls(callsPage)}
                disabled={!apiKey || callsStatus === "loading"}
                className="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border)] rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {callsStatus === "loading" ? "Loading..." : "Refresh"}
              </button>
            </div>

            {!apiKey ? (
              <div className="px-6 py-12 text-center text-[var(--text-secondary)]">
                <svg
                  className="w-12 h-12 mx-auto mb-4 opacity-50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                <p>Enter your API key to view calls</p>
              </div>
            ) : calls.length === 0 && callsStatus !== "loading" ? (
              <div className="px-6 py-12 text-center text-[var(--text-secondary)]">
                <svg
                  className="w-12 h-12 mx-auto mb-4 opacity-50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
                <p>Keine Anrufe vorhanden</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[var(--bg-tertiary)]">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                        ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                        Von
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                        An
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                        Anrufer
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                        State
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                        Zeit
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {calls.map((call) => (
                      <tr
                        key={call.id}
                        className="hover:bg-[var(--bg-tertiary)] transition-colors"
                      >
                        <td className="px-6 py-4 text-sm font-mono">
                          {call.id}
                        </td>
                        <td className="px-6 py-4 text-sm font-mono">
                          {call.from_number}
                        </td>
                        <td className="px-6 py-4 text-sm font-mono">
                          {call.to_number}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {call.caller_name || "—"}
                        </td>
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
                              onClick={() => viewCallExports(call.id)}
                              className="p-2 hover:bg-green-500/20 rounded-lg transition-colors text-[var(--text-secondary)] hover:text-green-400"
                              title="View Exports"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() => deleteCall(call.id)}
                              className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-[var(--text-secondary)] hover:text-red-400"
                              title="Delete"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Calls Pagination */}
            {apiKey && callsTotal > 0 && (
              <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-between">
                <p className="text-sm text-[var(--text-secondary)]">
                  Zeige {callsPage * pageSize + 1}-{Math.min((callsPage + 1) * pageSize, callsTotal)} von {callsTotal}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const newPage = callsPage - 1;
                      setCallsPage(newPage);
                      fetchCalls(newPage);
                    }}
                    disabled={callsPage === 0 || callsStatus === "loading"}
                    className="px-3 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border)] rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ← Zurück
                  </button>
                  <span className="px-3 py-1.5 text-sm text-[var(--text-secondary)]">
                    Seite {callsPage + 1} von {Math.ceil(callsTotal / pageSize)}
                  </span>
                  <button
                    onClick={() => {
                      const newPage = callsPage + 1;
                      setCallsPage(newPage);
                      fetchCalls(newPage);
                    }}
                    disabled={(callsPage + 1) * pageSize >= callsTotal || callsStatus === "loading"}
                    className="px-3 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border)] rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Weiter →
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Edit Modal */}
      {editingOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border)] p-6 w-full max-w-md animate-fade-in">
            <h3 className="text-lg font-semibold mb-4">Edit Order</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-2">
                  Order ID
                </label>
                <input
                  type="text"
                  value={editOrderId}
                  onChange={(e) => setEditOrderId(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-2">
                  Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full"
                >
                  <option value="scraped">Scraped</option>
                  <option value="converted">Converted</option>
                  <option value="sent">Sent</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={cancelEdit}
                className="flex-1 px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border)] rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={updateOrder}
                disabled={updateStatus === "loading"}
                className="flex-1 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {updateStatus === "loading" ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* XML Viewer Modal */}
      {viewingExports.length > 0 && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border)] w-full max-w-4xl max-h-[90vh] flex flex-col animate-fade-in">
            <div className="flex items-center justify-between p-6 border-b border-[var(--border)]">
              <div>
                <h3 className="text-lg font-semibold">XML Exports</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  {getCurrentExport() && (
                    <>Belnr: {getCurrentExport()?.belnr} • Order ID: {getCurrentExport()?.external_order_id}</>
                  )}
                </p>
              </div>
              <button
                onClick={closeXmlViewer}
                className="p-2 hover:bg-[var(--border)] rounded-lg transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            
            {/* Tabs */}
            <div className="flex border-b border-[var(--border)]">
              <button
                onClick={() => setSelectedExportType('hapodu')}
                className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                  selectedExportType === 'hapodu'
                    ? 'text-orange-400 border-b-2 border-orange-400 bg-orange-500/10'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Hapodu XML
                {viewingExports.some(e => e.export_type === 'hapodu') && (
                  <span className="ml-2 w-2 h-2 bg-orange-400 rounded-full inline-block" />
                )}
              </button>
              <button
                onClick={() => setSelectedExportType('taifun')}
                className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                  selectedExportType === 'taifun'
                    ? 'text-green-400 border-b-2 border-green-400 bg-green-500/10'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Taifun XML
                {viewingExports.some(e => e.export_type === 'taifun') ? (
                  <span className="ml-2 w-2 h-2 bg-green-400 rounded-full inline-block" />
                ) : (
                  <span className="ml-2 text-xs text-[var(--text-secondary)]">(pending)</span>
                )}
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              {getCurrentExport() ? (
                <pre className="text-sm font-mono bg-[var(--bg-tertiary)] p-4 rounded-lg overflow-x-auto whitespace-pre-wrap break-words">
                  {getCurrentExport()?.xml_content}
                </pre>
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-[var(--text-secondary)]">
                  <svg
                    className="w-12 h-12 mb-4 opacity-50"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p>Taifun XML wird gerade generiert...</p>
                  <p className="text-xs mt-2">Die Konvertierung läuft im Hintergrund via Temporal</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Call Export Viewer Modal */}
      {viewingCallExports.length > 0 && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border)] w-full max-w-4xl max-h-[90vh] flex flex-col animate-fade-in">
            <div className="flex items-center justify-between p-6 border-b border-[var(--border)]">
              <div>
                <h3 className="text-lg font-semibold">Call Exports</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  Call ID: {viewingCallId}
                </p>
              </div>
              <button
                onClick={closeCallExportViewer}
                className="p-2 hover:bg-[var(--border)] rounded-lg transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            
            {/* Tabs */}
            <div className="flex border-b border-[var(--border)]">
              <button
                onClick={() => setSelectedCallExportType('agfeo')}
                className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                  selectedCallExportType === 'agfeo'
                    ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/10'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                AGFEO JSON
                {viewingCallExports.some(e => e.export_type === 'agfeo') && (
                  <span className="ml-2 w-2 h-2 bg-blue-400 rounded-full inline-block" />
                )}
              </button>
              <button
                onClick={() => setSelectedCallExportType('taifun')}
                className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                  selectedCallExportType === 'taifun'
                    ? 'text-green-400 border-b-2 border-green-400 bg-green-500/10'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Taifun XML
                {viewingCallExports.some(e => e.export_type === 'taifun') ? (
                  <span className="ml-2 w-2 h-2 bg-green-400 rounded-full inline-block" />
                ) : (
                  <span className="ml-2 text-xs text-[var(--text-secondary)]">(pending)</span>
                )}
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              {getCurrentCallExport() ? (
                <pre className="text-sm font-mono bg-[var(--bg-tertiary)] p-4 rounded-lg overflow-x-auto whitespace-pre-wrap break-words">
                  {getCurrentCallExport()?.content}
                </pre>
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-[var(--text-secondary)]">
                  <svg
                    className="w-12 h-12 mb-4 opacity-50"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p>Taifun XML wird gerade generiert...</p>
                  <p className="text-xs mt-2">Die Konvertierung läuft im Hintergrund via Temporal</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-[var(--border)] mt-12">
        <div className="max-w-7xl mx-auto px-6 py-4 text-center text-sm text-[var(--text-secondary)]">
          API Documentation:{" "}
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline"
          >
            Swagger UI
          </a>
          {" • "}
          <a
            href="http://localhost:8000/redoc"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline"
          >
            ReDoc
          </a>
        </div>
      </footer>
    </div>
  );
}
