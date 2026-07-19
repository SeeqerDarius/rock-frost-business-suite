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
