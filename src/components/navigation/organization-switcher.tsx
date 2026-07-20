"use client";

import { useTransition } from "react";
import { switchOrganization } from "@/lib/tenant/actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface OrganizationSwitcherProps {
  currentOrganizationId: string;
  memberships: { organizationId: string; name: string; tenantCode: string }[];
}

export function OrganizationSwitcher({ currentOrganizationId, memberships }: OrganizationSwitcherProps) {
  const [isPending, startTransition] = useTransition();
  const current = memberships.find((m) => m.organizationId === currentOrganizationId);

  if (memberships.length <= 1) {
    return (
      <p className="truncate px-3 py-1.5 text-sm font-medium" title={current?.name}>
        {current?.name ?? "Organization"}
      </p>
    );
  }

  return (
    <div className="px-3 pb-1">
      <Select
        items={Object.fromEntries(memberships.map((m) => [m.organizationId, m.name]))}
        value={currentOrganizationId}
        onValueChange={(value) => {
          const formData = new FormData();
          formData.set("organizationId", String(value));
          startTransition(() => {
            void switchOrganization(formData);
          });
        }}
      >
        <SelectTrigger className="w-full" disabled={isPending}>
          <SelectValue placeholder="Select organization" />
        </SelectTrigger>
        <SelectContent>
          {memberships.map((m) => (
            <SelectItem key={m.organizationId} value={m.organizationId}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
