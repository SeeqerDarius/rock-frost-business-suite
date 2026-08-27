import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { EmptyState } from "@/components/feedback/empty-state";
import { Lock } from "lucide-react";
import { getHotelSummary } from "@/modules/hotel/service";
import { ReportExportLinks } from "@/components/reports/report-export-links";
export default async function HotelReportsPage(){const tenant=await requireModuleAccess("hotel");if(!hasPermission(tenant,PERMISSIONS.HOTEL_REPORTS_VIEW))return <EmptyState icon={Lock} title="Hotel reports are restricted" description="Your role does not include hotel reporting access."/>;const s=await getHotelSummary(tenant.organizationId);const stats=[["Total rooms",s.totalRooms],["Occupied rooms",s.occupiedRooms],["Confirmed arrivals",s.arrivals],["In house",s.inHouse],["Open folios",s.openFolios],["Outstanding",formatMoney(s.outstanding, tenant.organization.currency)],["Housekeeping queue",s.housekeeping],["Open restaurant orders",s.openOrders]];return <div className="space-y-6"><PageHeader title="Hotel Reports" description="Current occupancy, guest, settlement, housekeeping, and restaurant indicators." actions={<ReportExportLinks moduleKey="hotel" />}/><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{stats.map(([label,value])=><Card key={label}><CardHeader><p className="text-xs text-muted-foreground">{label}</p><CardTitle className="text-2xl">{value}</CardTitle></CardHeader></Card>)}</div></div>}
