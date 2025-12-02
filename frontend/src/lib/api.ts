const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface OrderExport {
  id: number;
  order_id: number;
  belnr: string;
  external_order_id: string;
  xml_content: string;
  export_type: 'hapodu' | 'taifun';
  created_at: string;
}

export interface Order {
  id: number;
  order_id: string;
  status: string;
  belnr?: string | null;
  created_at: string;
  updated_at: string;
  exports?: OrderExport[];
}

export interface OrderCreate {
  order_id: string;
  status?: string;
}

export interface OrderUpdate {
  order_id?: string;
  status?: string;
}

export interface OrderListResponse {
  orders: Order[];
  total: number;
}

export interface HealthResponse {
  status: string;
  version: string;
  database: string;
}

export interface ScrapedOrderInfo {
  belnr: string;
  external_order_id: string;
  order_id: string;
  is_new: boolean;
}

export interface ScrapeResponse {
  status: string;
  new_orders: number;
  skipped_orders: number;
  failed_exports: number;
  orders: ScrapedOrderInfo[];
}

export interface ScrapeTriggeredResponse {
  status: string;
  workflow_id: string;
  message: string;
}

export interface WorkflowStatusResponse {
  workflow_id: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELED' | 'TERMINATED' | 'TIMED_OUT' | 'NOT_FOUND';
  result?: {
    success: boolean;
    total_found: number;
    new_orders: number;
    skipped_orders: number;
    processed_count: number;
    failed_count: number;
    processed: Array<{
      external_order_id: string;
      belnr: string;
      status: string;
      remote_path?: string;
    }>;
    failed: Array<{
      external_order_id: string;
      belnr: string;
      error: string;
      step?: string;
    }>;
    error?: string;
  };
  error?: string;
}

export interface ApiError {
  detail: string;
}

// Schedule interfaces
export interface ScrapeSchedule {
  id: number;
  hour: number;
  minute: number;
  enabled: boolean;
  created_at: string;
  time_display: string;
}

export interface ScheduleListResponse {
  schedules: ScrapeSchedule[];
  total: number;
  schedule_active: boolean;
}

export interface ScheduleCreate {
  hour: number;
  minute: number;
}

// Scrape Config interfaces
export interface ScrapeConfig {
  custom_order_list_url: string | null;
  updated_at: string | null;
}

// Call interfaces
export interface Call {
  id: number;
  call_id: string;
  state: string;
  from_number: string;
  to_number: string;
  extension?: string;
  caller_name?: string;
  call_timestamp: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CallExport {
  id: number;
  call_id: number;
  content: string;
  export_type: 'agfeo' | 'taifun';
  created_at: string;
}

export interface CallWithExports extends Call {
  exports: CallExport[];
}

export interface CallListResponse {
  calls: Call[];
  total: number;
}

class ApiClient {
  private apiKey: string = '';

  setApiKey(key: string) {
    this.apiKey = key;
  }

  getApiKey(): string {
    return this.apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ data?: T; error?: string; status: number }> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.apiKey && endpoint !== '/health') {
      (headers as Record<string, string>)['X-API-Key'] = this.apiKey;
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          error: (data as ApiError).detail || 'An error occurred',
          status: response.status,
        };
      }

      return { data: data as T, status: response.status };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Network error',
        status: 0,
      };
    }
  }

  async health(): Promise<{ data?: HealthResponse; error?: string; status: number }> {
    return this.request<HealthResponse>('/health');
  }

  async createOrder(
    order: OrderCreate
  ): Promise<{ data?: Order; error?: string; status: number }> {
    return this.request<Order>('/api/v1/orders', {
      method: 'POST',
      body: JSON.stringify(order),
    });
  }

  async getOrders(
    skip: number = 0,
    limit: number = 100
  ): Promise<{ data?: OrderListResponse; error?: string; status: number }> {
    return this.request<OrderListResponse>(
      `/api/v1/orders?skip=${skip}&limit=${limit}`
    );
  }

  async getOrder(
    id: number
  ): Promise<{ data?: Order; error?: string; status: number }> {
    return this.request<Order>(`/api/v1/orders/${id}`);
  }

  async updateOrder(
    id: number,
    order: OrderUpdate
  ): Promise<{ data?: Order; error?: string; status: number }> {
    return this.request<Order>(`/api/v1/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(order),
    });
  }

  async deleteOrder(
    id: number
  ): Promise<{ data?: { message: string }; error?: string; status: number }> {
    return this.request<{ message: string }>(`/api/v1/orders/${id}`, {
      method: 'DELETE',
    });
  }

  async scrapeOrders(
    orderListUrl?: string
  ): Promise<{ data?: ScrapeTriggeredResponse; error?: string; status: number }> {
    return this.request<ScrapeTriggeredResponse>('/api/v1/scrape/orders', {
      method: 'POST',
      body: JSON.stringify({
        order_list_url: orderListUrl || 'https://hapodu.duisburg.de/risource/do/order/list/editable?initSearch=true&reset=false'
      }),
    });
  }

  async getWorkflowStatus(
    workflowId: string
  ): Promise<{ data?: WorkflowStatusResponse; error?: string; status: number }> {
    return this.request<WorkflowStatusResponse>(`/api/v1/workflows/${workflowId}/status`);
  }

  async getOrderExports(
    orderId: number,
    exportType?: 'hapodu' | 'taifun'
  ): Promise<{ data?: OrderExport[]; error?: string; status: number }> {
    let url = `/api/v1/orders/${orderId}/exports`;
    if (exportType) {
      url += `?export_type=${exportType}`;
    }
    return this.request<OrderExport[]>(url);
  }

  async getExportXml(
    exportId: number
  ): Promise<{ data?: { id: number; belnr: string; external_order_id: string; xml_content: string; export_type: string }; error?: string; status: number }> {
    return this.request<{ id: number; belnr: string; external_order_id: string; xml_content: string; export_type: string }>(
      `/api/v1/exports/${exportId}/xml`
    );
  }

  async triggerConversion(
    exportId: number
  ): Promise<{ data?: { status: string; workflow_id: string; export_id: number }; error?: string; status: number }> {
    return this.request<{ status: string; workflow_id: string; export_id: number }>(
      `/api/v1/exports/${exportId}/convert`,
      { method: 'POST' }
    );
  }

  async getPendingConversions(): Promise<{
    data?: {
      pending_count: number;
      exports: { id: number; order_id: number; belnr: string; external_order_id: string }[];
    };
    error?: string;
    status: number;
  }> {
    return this.request<{
      pending_count: number;
      exports: { id: number; order_id: number; belnr: string; external_order_id: string }[];
    }>('/api/v1/exports/pending');
  }

  async triggerAllConversions(): Promise<{
    data?: {
      status: string;
      message: string;
      triggered_count: number;
      workflow_ids: string[];
    };
    error?: string;
    status: number;
  }> {
    return this.request<{
      status: string;
      message: string;
      triggered_count: number;
      workflow_ids: string[];
    }>('/api/v1/exports/convert-all', { method: 'POST' });
  }

  async getPendingUploads(): Promise<{
    data?: {
      pending_count: number;
      orders: { id: number; order_id: string; status: string }[];
    };
    error?: string;
    status: number;
  }> {
    return this.request<{
      pending_count: number;
      orders: { id: number; order_id: string; status: string }[];
    }>('/api/v1/exports/pending-upload');
  }

  async triggerUpload(
    orderId: number
  ): Promise<{
    data?: { status: string; workflow_id: string; order_id: number };
    error?: string;
    status: number;
  }> {
    return this.request<{ status: string; workflow_id: string; order_id: number }>(
      `/api/v1/exports/${orderId}/upload`,
      { method: 'POST' }
    );
  }

  async triggerAllUploads(): Promise<{
    data?: {
      status: string;
      message: string;
      triggered_count: number;
      workflow_ids: string[];
    };
    error?: string;
    status: number;
  }> {
    return this.request<{
      status: string;
      message: string;
      triggered_count: number;
      workflow_ids: string[];
    }>('/api/v1/exports/upload-all', { method: 'POST' });
  }

  // Schedule API methods
  async getSchedules(): Promise<{
    data?: ScheduleListResponse;
    error?: string;
    status: number;
  }> {
    return this.request<ScheduleListResponse>('/api/v1/schedules');
  }

  async createSchedule(
    schedule: ScheduleCreate
  ): Promise<{ data?: ScrapeSchedule; error?: string; status: number }> {
    return this.request<ScrapeSchedule>('/api/v1/schedules', {
      method: 'POST',
      body: JSON.stringify(schedule),
    });
  }

  async deleteSchedule(
    scheduleId: number
  ): Promise<{ data?: { message: string }; error?: string; status: number }> {
    return this.request<{ message: string }>(`/api/v1/schedules/${scheduleId}`, {
      method: 'DELETE',
    });
  }

  async toggleSchedule(
    scheduleId: number
  ): Promise<{ data?: ScrapeSchedule; error?: string; status: number }> {
    return this.request<ScrapeSchedule>(`/api/v1/schedules/${scheduleId}/toggle`, {
      method: 'PUT',
    });
  }

  async syncSchedules(): Promise<{
    data?: { message: string };
    error?: string;
    status: number;
  }> {
    return this.request<{ message: string }>('/api/v1/schedules/sync', {
      method: 'POST',
    });
  }

  // Call API methods
  async getCalls(
    skip: number = 0,
    limit: number = 10
  ): Promise<{ data?: CallListResponse; error?: string; status: number }> {
    return this.request<CallListResponse>(
      `/api/v1/agfeo/calls?skip=${skip}&limit=${limit}`
    );
  }

  async getCall(
    id: number
  ): Promise<{ data?: CallWithExports; error?: string; status: number }> {
    return this.request<CallWithExports>(`/api/v1/agfeo/calls/${id}`);
  }

  async getCallExports(
    callId: number,
    exportType?: 'agfeo' | 'taifun'
  ): Promise<{ data?: CallExport[]; error?: string; status: number }> {
    let url = `/api/v1/agfeo/calls/${callId}/exports`;
    if (exportType) {
      url += `?export_type=${exportType}`;
    }
    return this.request<CallExport[]>(url);
  }

  async deleteCall(
    id: number
  ): Promise<{ data?: { message: string }; error?: string; status: number }> {
    return this.request<{ message: string }>(`/api/v1/agfeo/calls/${id}`, {
      method: 'DELETE',
    });
  }

  // Scrape Config API methods
  async getScrapeConfig(): Promise<{
    data?: ScrapeConfig;
    error?: string;
    status: number;
  }> {
    return this.request<ScrapeConfig>('/api/v1/scrape/config');
  }

  async updateScrapeConfig(
    customUrl: string | null
  ): Promise<{ data?: ScrapeConfig; error?: string; status: number }> {
    return this.request<ScrapeConfig>('/api/v1/scrape/config', {
      method: 'PUT',
      body: JSON.stringify({ custom_order_list_url: customUrl }),
    });
  }
}

export const apiClient = new ApiClient();
