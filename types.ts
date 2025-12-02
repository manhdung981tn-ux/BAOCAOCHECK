
export enum ViewState {
  ANALYTICS = 'ANALYTICS', // New Dashboard View
  HALL_OF_FAME = 'HALL_OF_FAME', // New Dedicated Hall of Fame
  TICKET_PRICING = 'TICKET_PRICING', // Replaced DRIVER_STATS
  CUSTOMER_DAILY = 'CUSTOMER_DAILY',
  CUSTOMER_SELF = 'CUSTOMER_SELF',
  CUSTOMER_PHONE = 'CUSTOMER_PHONE', 
  TRANSIT_DETAILED = 'TRANSIT_DETAILED', 
  REVENUE_VAT = 'REVENUE_VAT',
}

export interface PricingStat {
  route: string;
  routeGroup: string; // New: Merged Group (e.g., TN <-> MD)
  price: number;
  quantity: number;
  totalRevenue: number;
  ticketType: string; // New: Classification (Student, Taxi, etc.)
  notes?: string;
}

export interface DriverStat {
  driverName: string;
  tripCount: number;
  totalDistance?: string;
  notes?: string;
}

export interface CustomerStat {
  driverName: string;
  customerCount: number;
  ticketCount?: number; 
  tripCount?: number; 
  date?: string; 
  customerNames: string[];
  notes?: string;
}

export interface PhoneStat {
  phoneNumber: string;
  customerName: string;
  tripCount: number;
  lastDate?: string;
  notes?: string;
  routes: string[]; 
}

export interface TransitStat {
  driverName: string;
  date: string;
  passengerCount: number;
  tripCount?: number;
  licensePlate?: string;
  notes?: string;
}

export interface InvoiceItem {
  ticketCode: string;
  tripDate?: string;
  realAmount: number;
  invoiceAmount: number;
  isVatIssued: boolean;
  notes?: string;
}

export interface AnalysisResult {
  driverStats: DriverStat[]; // Keep for legacy compatibility if needed
  pricingStats: PricingStat[];
  dailyCustomerStats: CustomerStat[];
  selfCustomerStats: CustomerStat[];
  phoneStats: PhoneStat[];
  transitStats: TransitStat[]; 
  invoiceStats: InvoiceItem[];
  summary: string;
}
