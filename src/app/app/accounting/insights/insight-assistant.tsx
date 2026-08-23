"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowUp, LoaderCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { askAccountingInsights, type AccountingInsightAssistantState } from "./actions";

const initialState: AccountingInsightAssistantState = { answer: null, error: null };
const suggestions = ["What is my strongest revenue source?", "What is my average transaction value?", "How many invoices are overdue?"];

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function AssistantAvatar() {
  return (
    <Avatar size="sm" className="overflow-hidden bg-slate-950">
      <AvatarImage className="scale-[1.65] object-[center_42%]" src="/rf-business-assistant.png" alt="Rock Frost Business Assistant" />
      <AvatarFallback>RF</AvatarFallback>
    </Avatar>
  );
}

export function InsightAssistant({ period, userName, userImage }: { period: number; userName: string; userImage: string | null }) {
  const [state, action, pending] = useActionState(askAccountingInsights, initialState);
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!pending && showAnswer) inputRef.current?.focus();
  }, [pending, showAnswer]);

  function submitQuestion(formData: FormData) {
    const submitted = String(formData.get("question") ?? "").trim();
    if (submitted.length < 3 || pending) return;
    setSubmittedQuestion(submitted);
    setQuestion("");
    setShowAnswer(true);
    action(formData);
  }

  function startNewQuestion() {
    setQuestion("");
    setSubmittedQuestion("");
    setShowAnswer(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div className="flex min-h-[420px] flex-col rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar size="sm">
            <AvatarImage src="/icon-192.png" alt="Rock Frost logo" />
            <AvatarFallback>RF</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">Rock Frost Business Assistant</p>
            <p className="truncate text-[11px] text-muted-foreground">Accounting insights</p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={startNewQuestion} disabled={pending}><RotateCcw />New question</Button>
      </div>
      <div className="flex flex-1 flex-col justify-between gap-6 p-4">
        <div className="space-y-4">
          {!showAnswer ? (
            <div className="py-8 text-center">
              <p className="text-xl font-semibold">What would you like to understand about your business?</p>
              <p className="mt-2 text-sm text-muted-foreground">Answers use only your organization&apos;s recorded Accounting data.</p>
            </div>
          ) : null}
          {showAnswer ? (
            <div className="flex animate-in flex-row-reverse items-end gap-2 fade-in-0 slide-in-from-bottom-2 duration-200">
              <Avatar size="sm" className="shrink-0">
                {userImage ? <AvatarImage src={userImage} alt={`${userName} profile picture`} /> : null}
                <AvatarFallback>{initialsFor(userName)}</AvatarFallback>
              </Avatar>
              <div className="max-w-[78%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">{submittedQuestion}</div>
            </div>
          ) : null}
          {showAnswer && pending ? (
            <div role="status" className="flex animate-in items-end gap-2 fade-in-0 slide-in-from-bottom-2 duration-200">
              <AssistantAvatar />
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-4 py-3 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Reviewing the selected period...</div>
            </div>
          ) : null}
          {showAnswer && !pending && state.answer ? (
            <div className="flex animate-in items-end gap-2 fade-in-0 slide-in-from-bottom-2 duration-300">
              <AssistantAvatar />
              <div className="max-w-[86%] rounded-2xl rounded-bl-sm bg-primary/5 px-4 py-3 text-sm leading-6">{state.answer}</div>
            </div>
          ) : null}
          {showAnswer && !pending && state.error ? <p className="animate-in rounded-lg bg-destructive/10 p-4 text-sm text-destructive fade-in-0 duration-200">{state.error}</p> : null}
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => <Button key={suggestion} type="button" size="sm" variant="outline" disabled={pending} onClick={() => { setQuestion(suggestion); inputRef.current?.focus(); }}>{suggestion}</Button>)}
          </div>
          <form action={submitQuestion} className="flex gap-2 rounded-xl border p-2 focus-within:ring-2 focus-within:ring-ring/40">
            <input type="hidden" name="period" value={period} />
            <textarea ref={inputRef} name="question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} required disabled={pending} placeholder={pending ? "Preparing your answer..." : "Ask about revenue, cash, expenses or overdue invoices"} className="min-h-16 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none disabled:cursor-wait disabled:opacity-70" />
            <Button type="submit" size="icon" disabled={pending || question.trim().length < 3} aria-label="Ask Accounting Insights">{pending ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}</Button>
          </form>
        </div>
      </div>
    </div>
  );
}
