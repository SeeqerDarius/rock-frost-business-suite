export interface HirePurchaseMetric {
  label: string;
  value: string;
  note?: string;
  icon: string;
}

export interface StaffRecord {
  id: string;
  code: string;
  fullName: string;
  email: string;
  phone: string;
  active: boolean;
  monthlySalary: string;
  customerCount: number;
  linkedUser: boolean;
}

export interface CustomerRecord {
  id: string;
  customerCode: string;
  fullName: string;
  phone: string;
  address: string;
  nationalId: string;
  staffName: string;
  staffId: string;
  accountCount: number;
  createdAt: string;
}

export interface ProductCategoryRecord {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  productCount: number;
}

export interface ProductRecord {
  id: string;
  name: string;
  category: string;
  description: string;
  costPrice: string;
  transportCost: string;
  landedCost: string;
  dailyAmount: string;
  duration: number;
  price: string;
  quantityOnSale: number;
  active: boolean;
  accountCount: number;
}

export interface AccountRecord {
  id: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  productId: string;
  productName: string;
  staffName: string;
  startDate: string;
  expectedEndDate: string;
  targetAmount: string;
  dailyAmount: string;
  totalPaid: string;
  balance: string;
  progressPercent: number;
  status: string;
  deliveryStatus: string;
}

export interface PaymentRecord {
  id: string;
  receiptNo: string;
  accountId: string;
  customerName: string;
  productName: string;
  amount: string;
  paymentDate: string;
  method: string;
  notes: string;
  createdAt: string;
}

export interface CreditRecord {
  id: string;
  customerName: string;
  customerId: string;
  accountId: string | null;
  amount: string;
  remainingAmount: string;
  status: string;
  source: string;
  notes: string;
  createdAt: string;
}

export interface ProcurementItem {
  productId: string;
  productName: string;
  category: string;
  quantity: number;
  totalCost: string;
  landedUnitCost: string;
  averageProgress: number;
  highestProgress: number;
}

export interface ReportSummary {
  name: string;
  value: string;
  note: string;
}

export interface HirePurchaseSettingsData {
  installmentDurationDays: number;
  defaultDailyCollection: string;
  administrationFeePercent: string;
  refundDeductionPercent: string;
  deliveryTimeAfterCompletionDays: number;
  procurementThresholdPercent: string;
  paymentEditWindowHours: number;
  minimumDeposit: string;
  defaultMonthlySalary: string;
  defaultStaffInventoryQuantity: number;
  commissionEnabled: boolean;
  commissionPercentage: string;
  payrollDay: number;
  receiptPrefix: string;
  customerIdPrefix: string;
  staffCodeLength: number;
}
