"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/context/ToastContext";
import { useHealth } from "@/hooks/useHealth";
import { useOrders } from "@/hooks/useOrders";
import { useScraping } from "@/hooks/useScraping";
import { useSchedules } from "@/hooks/useSchedules";
import { useCalls } from "@/hooks/useCalls";

import { ToastContainer } from "@/components/ToastContainer";
import { Header } from "@/components/Header";
import { HealthCard } from "@/components/HealthCard";
import { ScrapingSection } from "@/components/scraping/ScrapingSection";
import { OrdersTable } from "@/components/orders/OrdersTable";
import { CallsTable } from "@/components/calls/CallsTable";
import { XmlViewerModal } from "@/components/modals/XmlViewerModal";
import { CallExportModal } from "@/components/modals/CallExportModal";
import { Footer } from "@/components/Footer";

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const { showToast } = useToast();

  // Initialize hooks
  const health = useHealth(showToast);
  const orders = useOrders(apiKey, showToast);
  const calls = useCalls(apiKey, showToast);
  const schedules = useSchedules(apiKey, showToast);

  // Scraping needs a callback to refresh orders when complete
  const handleScrapeComplete = useCallback(() => {
    orders.goToPage(0);
  }, [orders]);

  const scraping = useScraping(apiKey, showToast, handleScrapeComplete);

  // Initial health check
  useEffect(() => {
    health.checkHealth();
  }, []);

  // Fetch data when API key changes
  useEffect(() => {
    if (apiKey) {
      orders.goToPage(0);
      scraping.fetchPendingCount();
      schedules.fetchSchedules();
      calls.goToPage(0);
    }
  }, [apiKey]);

  // Convert all handler
  const handleConvertAll = useCallback(() => {
    scraping.convertAllPending(() => orders.fetchOrders(orders.currentPage));
  }, [scraping, orders]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <ToastContainer />
      
      <Header apiKey={apiKey} onApiKeyChange={setApiKey} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <HealthCard
          health={health.health}
          healthStatus={health.healthStatus}
          checkHealth={health.checkHealth}
        />

        <ScrapingSection
          apiKey={apiKey}
          scrapeStatus={scraping.scrapeStatus}
          scrapeResult={scraping.scrapeResult}
          scrapeUrl={scraping.scrapeUrl}
          currentWorkflowId={scraping.currentWorkflowId}
          onRunScrape={scraping.runScrape}
          onScrapeUrlChange={scraping.setScrapeUrl}
          pendingCount={scraping.pendingCount}
          convertAllStatus={scraping.convertAllStatus}
          onConvertAll={handleConvertAll}
          pendingUploads={orders.pendingUploads}
          uploadAllStatus={orders.uploadAllStatus}
          onUploadAll={orders.uploadAllOrders}
          schedules={schedules.schedules}
          scheduleActive={schedules.scheduleActive}
          newScheduleHour={schedules.newScheduleHour}
          newScheduleMinute={schedules.newScheduleMinute}
          scheduleStatus={schedules.scheduleStatus}
          onAddSchedule={schedules.addSchedule}
          onRemoveSchedule={schedules.removeSchedule}
          onToggleSchedule={schedules.toggleScheduleEnabled}
          onSyncSchedules={schedules.syncSchedules}
          onHourChange={schedules.setNewScheduleHour}
          onMinuteChange={schedules.setNewScheduleMinute}
        />

        <OrdersTable
          apiKey={apiKey}
          orders={orders.orders}
          ordersTotal={orders.ordersTotal}
          ordersStatus={orders.ordersStatus}
          currentPage={orders.currentPage}
          pageSize={orders.pageSize}
          xmlLoading={orders.xmlLoading}
          onRefresh={() => orders.fetchOrders(orders.currentPage)}
          onDelete={orders.deleteOrder}
          onViewXml={orders.viewOrderXml}
          onUpload={orders.uploadSingleOrder}
          onPageChange={orders.goToPage}
        />

        <CallsTable
          apiKey={apiKey}
          calls={calls.calls}
          callsTotal={calls.callsTotal}
          callsStatus={calls.callsStatus}
          callsPage={calls.callsPage}
          pageSize={calls.pageSize}
          onRefresh={() => calls.fetchCalls(calls.callsPage)}
          onViewExports={calls.viewCallExports}
          onDelete={calls.deleteCall}
          onPageChange={calls.goToPage}
        />
      </main>

      {orders.viewingExports.length > 0 && (
        <XmlViewerModal
          viewingExports={orders.viewingExports}
          selectedExportType={orders.selectedExportType}
          onExportTypeChange={orders.setSelectedExportType}
          onClose={orders.closeXmlViewer}
          getCurrentExport={orders.getCurrentExport}
        />
      )}

      {calls.viewingCallExports.length > 0 && (
        <CallExportModal
          viewingCallExports={calls.viewingCallExports}
          viewingCallId={calls.viewingCallId}
          selectedCallExportType={calls.selectedCallExportType}
          onExportTypeChange={calls.setSelectedCallExportType}
          onClose={calls.closeCallExportViewer}
          getCurrentCallExport={calls.getCurrentCallExport}
        />
      )}

      <Footer />
    </div>
  );
}
