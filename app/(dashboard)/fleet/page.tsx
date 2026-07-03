import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { MetricCard } from "@/components/fleet/MetricCard";
import { SectionTable } from "@/components/fleet/SectionTable";
import { dashboardMetrics, driverRecords, ownerRecords, policyRecords, vehicleRecords, workPayRecords } from "@/lib/fleet";

export default function FleetPage() {
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
          rows={[
            [ownerRecords[0].name, ownerRecords[0].business, String(ownerRecords[0].vehicles), "Active", ownerRecords[0].revenue],
            [ownerRecords[1].name, ownerRecords[1].business, String(ownerRecords[1].vehicles), "Active", ownerRecords[1].revenue],
            [driverRecords[0].name, driverRecords[0].assignedVehicle, "—", driverRecords[0].status, driverRecords[0].performance],
            [driverRecords[1].name, driverRecords[1].assignedVehicle, "—", driverRecords[1].status, driverRecords[1].performance],
          ]}
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
