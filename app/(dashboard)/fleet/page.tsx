import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { MetricCard } from "@/components/fleet/MetricCard";
import { SectionTable } from "@/components/fleet/SectionTable";
import { getDashboardMetrics, getDrivers, getOwners, getVehicleDocuments, getVehicles, getWorkAndPayContracts } from "@/lib/fleet";
import { requireCurrentTenant } from "@/lib/tenant";

export default async function FleetPage() {
  const tenant = await requireCurrentTenant();
  const [dashboardMetrics, vehicleRecords, ownerRecords, driverRecords, policyRecords, workPayRecords] = await Promise.all([
    getDashboardMetrics(tenant.organizationId),
    getVehicles(tenant.organizationId),
    getOwners(tenant.organizationId),
    getDrivers(tenant.organizationId),
    getVehicleDocuments(tenant.organizationId),
    getWorkAndPayContracts(tenant.organizationId),
  ]);

  const ownerRows = ownerRecords.slice(0, 2).map((owner) => [owner.name, owner.business, String(owner.vehicles), "Active", owner.revenue]);
  const driverRows = driverRecords.slice(0, 2).map((driver) => [driver.name, driver.assignedVehicle, "—", driver.status, driver.performance]);

  return (
    <DashboardShell
      title="Fleet overview"
      subtitle="Track vehicle health, owner relationships, insurance coverage, and business performance across your fleet."
    >
      <div className="grid gap-6 xl:grid-cols-3">
        {dashboardMetrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            note={metric.note}
            icon={metric.icon}
          />
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <SectionTable
          title="Top vehicles"
          columns={["Vehicle", "Type", "Driver", "Status", "Next service"]}
          rows={vehicleRecords.map((vehicle) => [
            vehicle.id,
            vehicle.type,
            vehicle.driver,
            vehicle.status,
            vehicle.nextService,
          ])}
        />
        <SectionTable
          title="Owner and driver snapshot"
          columns={["Owner / Driver", "Business / Assigned", "Vehicles", "Status", "Revenue / Performance"]}
          rows={[...ownerRows, ...driverRows]}
        />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <SectionTable
          title="Insurance and roadworthy alerts"
          columns={["Vehicle", "Provider", "Insurance expires", "Roadworthy expires", "Status"]}
          rows={policyRecords.map((policy) => [
            policy.vehicle,
            policy.provider,
            policy.insuranceExpires,
            policy.roadworthyExpires,
            policy.renewalStatus,
          ])}
        />
        <SectionTable
          title="Active work & pay contracts"
          columns={["Contract", "Vehicle", "Client", "Paid", "Outstanding", "Status"]}
          rows={workPayRecords.map((contract) => [
            contract.contractName,
            contract.vehicle,
            contract.client,
            contract.paid,
            contract.outstanding,
            contract.status,
          ])}
        />
      </div>
    </DashboardShell>
  );
}
