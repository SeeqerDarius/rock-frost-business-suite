export interface FleetMetric {
  label: string;
  value: string;
  note?: string;
  icon: string;
}

export interface VehicleRecord {
  id: string;
  plate: string;
  type: string;
  owner: string;
  driver: string;
  status: string;
  documentStatus: string;
  serviceHistory: string;
  nextService: string;
  mileage: string;
  location: string;
}

export interface OwnerRecord {
  id: string;
  name: string;
  business: string;
  phone: string;
  email: string;
  vehicles: number;
  revenue: string;
  history: string;
}

export interface DriverRecord {
  id: string;
  name: string;
  licence: string;
  phone: string;
  email: string;
  assignedVehicle: string;
  startDate: string;
  status: string;
  performance: string;
}

export interface PolicyRecord {
  id: string;
  vehicle: string;
  provider: string;
  policyNumber: string;
  insuranceExpires: string;
  roadworthyExpires: string;
  renewalStatus: string;
  alerts: string;
}

export interface MaintenanceRecord {
  id: string;
  vehicle: string;
  requestedBy: string;
  fault: string;
  status: string;
  timeline: string;
  mechanic: string;
  cost: string;
  requestDate: string;
}

export interface WorkPayRecord {
  id: string;
  contractName: string;
  vehicle: string;
  client: string;
  contractAmount: string;
  deposit: string;
  weeklyPayment: string;
  paid: string;
  outstanding: string;
  remaining: string;
  completion: string;
  status: string;
}

export interface PaymentRecord {
  id: string;
  date: string;
  type: string;
  reference: string;
  amount: string;
  status: string;
  related: string;
  verified: boolean;
}

export interface PerformanceRecord {
  name: string;
  value: string;
  delta: string;
  note: string;
}

export const dashboardMetrics: FleetMetric[] = [
  { label: "Total vehicles", value: "148", note: "Fleet-ready for multi-company use.", icon: "🚛" },
  { label: "Active drivers", value: "84", note: "Assigned across current contracts.", icon: "🧑‍✈️" },
  { label: "Vehicle owners", value: "27", note: "Partner organizations and asset holders.", icon: "👥" },
  { label: "Under maintenance", value: "12", note: "Vehicles currently in service.", icon: "🔧" },
  { label: "Weekly revenue", value: "$92.8k", note: "Work-and-pay and logistics earnings.", icon: "💰" },
  { label: "Monthly revenue", value: "$385.4k", note: "Enterprise fleet income projection.", icon: "📈" },
  { label: "Outstanding balances", value: "$56.2k", note: "Pending settlement across contracts.", icon: "⚖️" },
  { label: "Expiring insurance", value: "9 vehicles", note: "Renewal alerts in the next 30 days.", icon: "🛡️" },
  { label: "Expiring roadworthy", value: "7 vehicles", note: "Certificates due this month.", icon: "📜" },
];

export const recentPayments: PaymentRecord[] = [
  { id: "PM-4221", date: "2026-06-24", type: "Weekly sales", reference: "INV-2109", amount: "$6,400", status: "Completed", related: "Route support", verified: true },
  { id: "PM-4217", date: "2026-06-23", type: "Contract", reference: "CTR-334", amount: "$12,100", status: "Pending", related: "Work & Pay", verified: false },
  { id: "PM-4209", date: "2026-06-22", type: "Reconciliation", reference: "REC-880", amount: "$4,800", status: "Reviewed", related: "Monthly payout", verified: true },
];

export const recentMaintenance: MaintenanceRecord[] = [
  { id: "MT-912", vehicle: "RF-1023", requestedBy: "Driver A.", fault: "Brake system warning", status: "In review", timeline: "Approval pending", mechanic: "Unassigned", cost: "$320", requestDate: "2026-06-21" },
  { id: "MT-915", vehicle: "RF-1117", requestedBy: "Fleet Manager", fault: "Engine temperature spike", status: "Assigned", timeline: "Mechanic en route", mechanic: "Nova Garage", cost: "$1,250", requestDate: "2026-06-20" },
  { id: "MT-923", vehicle: "RF-1180", requestedBy: "Driver K.", fault: "Door seal replacement", status: "Completed", timeline: "Verified", mechanic: "Titan Repair", cost: "$180", requestDate: "2026-06-18" },
];

export const vehicleRecords: VehicleRecord[] = [
  { id: "RF-1023", plate: "RX 42-6B", type: "Heavy truck", owner: "Frost Logistics", driver: "M. Carter", status: "Active", documentStatus: "Clear", serviceHistory: "Oil change, brakes", nextService: "2026-07-18", mileage: "188,400 km", location: "Portside depot" },
  { id: "RF-1081", plate: "RF 80-T9", type: "Van", owner: "Silver Transit", driver: "J. Alvarez", status: "Maintenance", documentStatus: "Due review", serviceHistory: "Engine tune-up", nextService: "2026-06-30", mileage: "92,100 km", location: "North yard" },
  { id: "RF-1117", plate: "FD 55-3J", type: "Flatbed", owner: "Urban Cargo", driver: "L. Banks", status: "Active", documentStatus: "Verified", serviceHistory: "Suspension check", nextService: "2026-08-02", mileage: "144,900 km", location: "East gate" },
];

export const ownerRecords: OwnerRecord[] = [
  { id: "O-108", name: "Avalon Transport", business: "Avalon Holdings", phone: "+1 312 555 0189", email: "fleet@avalon.com", vehicles: 12, revenue: "$482k", history: "4 years onboard" },
  { id: "O-221", name: "Helix Fleet", business: "Helix Group", phone: "+1 312 555 0221", email: "partners@helixgroup.com", vehicles: 8, revenue: "$310k", history: "2 years onboard" },
  { id: "O-307", name: "Vertex Mobility", business: "Vertex Dynamics", phone: "+1 312 555 0307", email: "contact@vertexmobility.com", vehicles: 7, revenue: "$264k", history: "18 months onboard" },
];

export const driverRecords: DriverRecord[] = [
  { id: "D-881", name: "Marina Fox", licence: "A12-678-002", phone: "+1 312 555 0181", email: "marina.fox@fleet.example", assignedVehicle: "RF-1023", startDate: "2024-11-03", status: "Active", performance: "99.2% on-time" },
  { id: "D-894", name: "Noah Key", licence: "A12-451-009", phone: "+1 312 555 0294", email: "noah.key@fleet.example", assignedVehicle: "RF-1081", startDate: "2025-01-19", status: "Active", performance: "96.7% on-time" },
  { id: "D-900", name: "Lina Park", licence: "A12-921-014", phone: "+1 312 555 0300", email: "lina.park@fleet.example", assignedVehicle: "RF-1117", startDate: "2024-08-07", status: "On leave", performance: "92.5% on-time" },
];

export const policyRecords: PolicyRecord[] = [
  { id: "POL-110", vehicle: "RF-1023", provider: "Sentry Assurance", policyNumber: "SA-23118", insuranceExpires: "2026-08-12", roadworthyExpires: "2026-09-04", renewalStatus: "Ready", alerts: "2 reminders set" },
  { id: "POL-111", vehicle: "RF-1081", provider: "Pinnacle Cover", policyNumber: "PC-42099", insuranceExpires: "2026-07-10", roadworthyExpires: "2026-07-25", renewalStatus: "Due", alerts: "Expiry alert" },
  { id: "POL-112", vehicle: "RF-1117", provider: "Atlas Guard", policyNumber: "AG-92130", insuranceExpires: "2026-10-01", roadworthyExpires: "2026-11-14", renewalStatus: "Clear", alerts: "No active alerts" },
];

export const workPayRecords: WorkPayRecord[] = [
  { id: "WAP-320", contractName: "Metro distribution", vehicle: "RF-1023", client: "Avalon Transport", contractAmount: "$112,000", deposit: "$22,400", weeklyPayment: "$8,000", paid: "$44,000", outstanding: "$67,600", remaining: "8 weeks", completion: "45%", status: "Active" },
  { id: "WAP-321", contractName: "Regional haul", vehicle: "RF-1081", client: "Helix Fleet", contractAmount: "$78,500", deposit: "$15,700", weeklyPayment: "$5,600", paid: "$27,200", outstanding: "$55,300", remaining: "10 weeks", completion: "35%", status: "Active" },
  { id: "WAP-322", contractName: "City cycle service", vehicle: "RF-1117", client: "Vertex Mobility", contractAmount: "$59,900", deposit: "$11,980", weeklyPayment: "$4,700", paid: "$33,000", outstanding: "$28,900", remaining: "6 weeks", completion: "55%", status: "Progressing" },
];

export const reportSummary: PerformanceRecord[] = [
  { name: "Fleet revenue", value: "$385.4k", delta: "+12.8%", note: "Monthly growth" },
  { name: "Driver utilization", value: "84%", delta: "+2.1%", note: "Platform average" },
  { name: "Maintenance cost", value: "$18.6k", delta: "-4.3%", note: "Optimized service cycles" },
  { name: "Insurance risk", value: "Low", delta: "Stable", note: "Renewals on schedule" },
];

export const investorSummary: PerformanceRecord[] = [
  { name: "Outstanding receivables", value: "$56.2k", delta: "-1.6%", note: "Improving cash flow" },
  { name: "Fleet value", value: "$9.2M", delta: "+3.9%", note: "Asset appreciation" },
  { name: "Active contracts", value: "28", delta: "+1", note: "New work onboarding" },
  { name: "Profit trend", value: "+18%", delta: "+4.2%", note: "Quarterly performance" },
];
