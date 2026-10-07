import { cookies } from "next/headers";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CONTRACTS_FLASH_COOKIE } from "@/modules/contracts/flash";

export async function ContractsFlash({ saved, error, savedMessage = "Saved. The change is recorded in the contract history and audit log." }: { saved?: string; error?: string; savedMessage?: string }) {
  const message = error ? (await cookies()).get(CONTRACTS_FLASH_COOKIE)?.value ?? "The change could not be saved. Check the form and try again." : null;
  if (message) return <Alert variant="destructive"><TriangleAlert /><AlertTitle>Not saved</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>;
  if (saved) return <Alert><CheckCircle2 /><AlertTitle>Saved</AlertTitle><AlertDescription>{savedMessage}</AlertDescription></Alert>;
  return null;
}

export const humanize = (value: string) => value.toLowerCase().split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "outline", PENDING_APPROVAL: "secondary", APPROVED: "secondary", ACTIVE: "default", EXPIRED: "destructive", TERMINATED: "destructive", CANCELLED: "outline", ARCHIVED: "outline",
};

export function ContractStatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{humanize(status)}</Badge>;
}

const RISK_CLASS: Record<string, string> = {
  LOW: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  MEDIUM: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  HIGH: "border-orange-500/50 text-orange-700 dark:text-orange-400",
  CRITICAL: "border-destructive/60 text-destructive",
};

export function RiskBadge({ level }: { level: string }) {
  return <Badge variant="outline" className={RISK_CLASS[level]}>{humanize(level)} risk</Badge>;
}

export const SELECT_CLASS = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

export const dayInput = (date: Date | null | undefined) => (date ? date.toISOString().slice(0, 10) : "");
