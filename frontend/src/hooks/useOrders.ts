"use client";

import { useState, useCallback } from "react";
import { apiClient, Order, OrderExport } from "@/lib/api";

type StatusType = "idle" | "loading" | "success" | "error";

const PAGE_SIZE = 10;

export function useOrders(apiKey: string, showToast: (message: string, type: "success" | "error") => void) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersStatus, setOrdersStatus] = useState<StatusType>("idle");
  const [currentPage, setCurrentPage] = useState(0);
  const [pendingUploads, setPendingUploads] = useState<number>(0);

  // Edit state
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editOrderId, setEditOrderId] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [updateStatus, setUpdateStatus] = useState<StatusType>("idle");

  // Export viewer state
  const [viewingExports, setViewingExports] = useState<OrderExport[]>([]);
  const [selectedExportType, setSelectedExportType] = useState<'hapodu' | 'taifun'>('hapodu');
  const [xmlLoading, setXmlLoading] = useState(false);
  const [viewingOrderId, setViewingOrderId] = useState<number | null>(null);

  // Upload state
  const [uploadAllStatus, setUploadAllStatus] = useState<StatusType>("idle");

  const fetchOrders = useCallback(async (page: number = currentPage) => {
    if (!apiKey) return;
    setOrdersStatus("loading");
    apiClient.setApiKey(apiKey);
    const skip = page * PAGE_SIZE;
    const { data, error } = await apiClient.getOrders(skip, PAGE_SIZE);
    if (data) {
      setOrders(data.orders);
      setOrdersTotal(data.total);
      setOrdersStatus("success");
      const converted = data.orders.filter(o => o.status === "converted").length;
      setPendingUploads(converted);
    } else {
      setOrders([]);
      setOrdersStatus("error");
      showToast(error || "Failed to fetch orders", "error");
    }
  }, [apiKey, currentPage, showToast]);

  const deleteOrder = useCallback(async (id: number) => {
    apiClient.setApiKey(apiKey);
    const { data, error } = await apiClient.deleteOrder(id);
    if (data) {
      showToast(data.message, "success");
      fetchOrders(currentPage);
    } else {
      showToast(error || "Failed to delete order", "error");
    }
  }, [apiKey, currentPage, fetchOrders, showToast]);

  const uploadSingleOrder = useCallback(async (orderId: number) => {
    apiClient.setApiKey(apiKey);
    const { data, error } = await apiClient.triggerUpload(orderId);
    if (data) {
      showToast(`Upload triggered for order ${orderId}`, "success");
      setTimeout(() => fetchOrders(currentPage), 3000);
    } else {
      showToast(error || "Failed to trigger upload", "error");
    }
  }, [apiKey, currentPage, fetchOrders, showToast]);

  const uploadAllOrders = useCallback(async () => {
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
        setTimeout(() => fetchOrders(currentPage), 3000);
      } else {
        showToast("No pending uploads", "success");
      }
    } else {
      setUploadAllStatus("error");
      showToast(error || "Failed to trigger uploads", "error");
    }
    setTimeout(() => setUploadAllStatus("idle"), 3000);
  }, [apiKey, currentPage, fetchOrders, showToast]);

  // Edit functions
  const startEdit = useCallback((order: Order) => {
    setEditingOrder(order);
    setEditOrderId(order.order_id);
    setEditStatus(order.status);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingOrder(null);
    setEditOrderId("");
    setEditStatus("");
  }, []);

  const updateOrder = useCallback(async () => {
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
  }, [apiKey, editingOrder, editOrderId, editStatus, currentPage, fetchOrders, cancelEdit, showToast]);

  // Export viewer functions
  const viewOrderXml = useCallback(async (orderId: number) => {
    setXmlLoading(true);
    setViewingOrderId(orderId);
    apiClient.setApiKey(apiKey);
    const { data, error } = await apiClient.getOrderExports(orderId);
    if (data && data.length > 0) {
      setViewingExports(data);
      const hasHapodu = data.some(e => e.export_type === 'hapodu');
      setSelectedExportType(hasHapodu ? 'hapodu' : 'taifun');
    } else {
      showToast(error || "No XML export found", "error");
    }
    setXmlLoading(false);
  }, [apiKey, showToast]);

  const closeXmlViewer = useCallback(() => {
    setViewingExports([]);
    setViewingOrderId(null);
  }, []);

  const getCurrentExport = useCallback(() => {
    return viewingExports.find(e => e.export_type === selectedExportType);
  }, [viewingExports, selectedExportType]);

  // Pagination
  const goToPage = useCallback((page: number) => {
    setCurrentPage(page);
    fetchOrders(page);
  }, [fetchOrders]);

  return {
    // State
    orders,
    ordersTotal,
    ordersStatus,
    currentPage,
    pageSize: PAGE_SIZE,
    pendingUploads,
    uploadAllStatus,
    // Edit state
    editingOrder,
    editOrderId,
    editStatus,
    updateStatus,
    // Export state
    viewingExports,
    selectedExportType,
    xmlLoading,
    viewingOrderId,
    // Actions
    fetchOrders,
    deleteOrder,
    uploadSingleOrder,
    uploadAllOrders,
    goToPage,
    // Edit actions
    startEdit,
    cancelEdit,
    updateOrder,
    setEditOrderId,
    setEditStatus,
    // Export actions
    viewOrderXml,
    closeXmlViewer,
    getCurrentExport,
    setSelectedExportType,
  };
}

