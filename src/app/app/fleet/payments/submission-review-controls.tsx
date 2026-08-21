"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { reviewDriverSubmission } from "./actions";

function SubmissionDecisionButton({
  decision,
}: {
  decision: "approve" | "reject";
}) {
  const { pending } = useFormStatus();
  const approving = decision === "approve";

  return (
    <Button
      type="submit"
      size="sm"
      variant={approving ? "default" : "destructive"}
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
      {pending ? (approving ? "Approving..." : "Rejecting...") : approving ? "Approve" : "Reject"}
    </Button>
  );
}

export function SubmissionReviewControls({ submissionId }: { submissionId: string }) {
  return (
    <div className="flex items-center gap-2">
      <form action={reviewDriverSubmission}>
        <input type="hidden" name="id" value={submissionId} />
        <input type="hidden" name="decision" value="approve" />
        <SubmissionDecisionButton decision="approve" />
      </form>
      <form action={reviewDriverSubmission}>
        <input type="hidden" name="id" value={submissionId} />
        <input type="hidden" name="decision" value="reject" />
        <SubmissionDecisionButton decision="reject" />
      </form>
    </div>
  );
}
