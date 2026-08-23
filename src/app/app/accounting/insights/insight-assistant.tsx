"use client";

import { useActionState, useState } from "react";
import { ArrowUp, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { askAccountingInsights, type AccountingInsightAssistantState } from "./actions";

const initialState: AccountingInsightAssistantState = { answer: null, error: null };
const suggestions = ["What is my strongest revenue source?", "What is my average transaction value?", "How many invoices are overdue?"];

export function InsightAssistant({ period }: { period: number }) {
  const [state, action, pending] = useActionState(askAccountingInsights, initialState);
  const [question, setQuestion] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);

  return (
    <div className="flex min-h-[420px] flex-col rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2 font-medium"><Sparkles className="size-4 text-primary" />Business assistant</div>
        <Button type="button" variant="ghost" size="sm" onClick={() => { setQuestion(""); setShowAnswer(false); }}><RotateCcw />New question</Button>
      </div>
      <div className="flex flex-1 flex-col justify-between gap-6 p-4">
        <div className="space-y-4">
          {!showAnswer ? (
            <div className="py-8 text-center">
              <p className="text-xl font-semibold">What would you like to understand about your business?</p>
              <p className="mt-2 text-sm text-muted-foreground">Answers use only your organization&apos;s recorded Accounting data.</p>
            </div>
          ) : null}
          {showAnswer && pending ? <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">Reviewing the selected period...</p> : null}
          {showAnswer && !pending && state.answer ? <div className="rounded-lg bg-primary/5 p-4 text-sm leading-6">{state.answer}</div> : null}
          {showAnswer && !pending && state.error ? <p className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{state.error}</p> : null}
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => <Button key={suggestion} type="button" size="sm" variant="outline" onClick={() => setQuestion(suggestion)}>{suggestion}</Button>)}
          </div>
          <form action={action} onSubmit={() => setShowAnswer(true)} className="flex gap-2 rounded-xl border p-2 focus-within:ring-2 focus-within:ring-ring/40">
            <input type="hidden" name="period" value={period} />
            <textarea name="question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} required placeholder="Ask about revenue, cash, expenses or overdue invoices" className="min-h-16 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none" />
            <Button type="submit" size="icon" disabled={pending || question.trim().length < 3} aria-label="Ask Accounting Insights"><ArrowUp /></Button>
          </form>
        </div>
      </div>
    </div>
  );
}
