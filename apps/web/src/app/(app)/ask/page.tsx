"use client";

import { ArrowUp, Sparkles, AlertCircle } from "lucide-react";
import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAskQuestion, useAskSuggestions } from "@/hooks/use-ask";
import { ApiError } from "@/lib/api";

interface QaPair {
  question: string;
  answer: string;
  cards: { label: string; value: string }[];
}

export default function AskPage() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<QaPair[]>([]);
  const ask = useAskQuestion();
  const { data: suggestions } = useAskSuggestions();

  function submit(question: string) {
    const q = question.trim();
    if (!q || ask.isPending) return;
    setInput("");
    ask.mutate(q, {
      onSuccess: (res) => {
        setHistory((prev) => [...prev, { question: q, ...res }]);
      },
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-signal" />
          <h1 className="font-display text-xl font-semibold text-ink">Ask Your CRM</h1>
        </div>
        <p className="mt-1 text-sm text-steel">
          Your pipeline in plain English. Ask about deals, quotes, tasks, or what needs attention.
        </p>
      </div>

      {/* Conversation */}
      {history.length > 0 ? (
        <div className="space-y-4">
          {history.map((qa, i) => (
            <Fragment key={i}>
              <UserBubble text={qa.question} />
              <AnswerCard answer={qa.answer} cards={qa.cards} />
            </Fragment>
          ))}
        </div>
      ) : null}

      {/* Loading */}
      {ask.isPending ? (
        <div className="space-y-3">
          <UserBubble text={ask.variables ?? ""} />
          <Card>
            <CardBody className="space-y-2.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <p className="pt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-steel">
                Analyzing pipeline…
              </p>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {/* Error */}
      {ask.isError ? (
        <Card className="border-hazard/40">
          <CardBody className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-hazard" />
            <div>
              <p className="text-sm font-medium text-ink">Couldn&apos;t reach the AI engine.</p>
              <p className="mt-0.5 text-[13px] text-steel">
                {ask.error instanceof ApiError ? ask.error.message : "Try again in a moment."}
              </p>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {/* Suggested questions */}
      {history.length === 0 && !ask.isPending && suggestions ? (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => submit(s)}
              className="rounded-full border border-mist bg-surface px-3.5 py-2 text-[13px] font-medium text-steel transition-colors hover:border-signal/40 hover:bg-signal-soft hover:text-signal"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      {/* Input bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-mist bg-canvas/95 px-4 py-3 backdrop-blur md:left-[240px] md:px-8">
        <div className="mx-auto max-w-3xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
            className="flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about your pipeline…"
              className="h-12 flex-1 rounded-xl border border-mist bg-surface px-4 text-sm text-ink placeholder:text-steel/60 focus:border-signal focus:outline-none"
              autoFocus
            />
            <Button
              type="submit"
              size="md"
              loading={ask.isPending}
              disabled={!input.trim()}
              className="h-12 w-12 shrink-0 !px-0"
              aria-label="Send question"
            >
              {!ask.isPending ? <ArrowUp className="size-4" /> : null}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[80%] rounded-xl rounded-br-sm bg-ink px-4 py-2.5 text-sm font-medium text-white">
        {text}
      </p>
    </div>
  );
}

function AnswerCard({ answer, cards }: { answer: string; cards: { label: string; value: string }[] }) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3 text-signal" />
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-steel">AI Analyst</span>
        </div>
        <FormattedAnswer text={answer} />
        {cards.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-2">
            {cards.map((c, i) => (
              <div key={i} className="rounded-lg border border-mist bg-canvas px-3 py-1.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-steel">{c.label}</p>
                <p className="font-mono text-sm font-semibold text-ink tnum">{c.value}</p>
              </div>
            ))}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

/** Minimal markdown renderer — handles bullets (•/-) and bold (**text**). */
function FormattedAnswer({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => l.trim());
  const bulletLines = lines.filter((l) => /^[•-]\s/.test(l.trim()));
  const proseLines = lines.filter((l) => !/^[•-]\s/.test(l.trim()));

  return (
    <div className="space-y-2 text-sm leading-relaxed text-ink">
      {proseLines.map((p, i) => (
        <p key={`p${i}`}>{renderBold(p)}</p>
      ))}
      {bulletLines.length > 0 ? (
        <ul className="space-y-1.5">
          {bulletLines.map((b, i) => (
            <li key={`b${i}`} className="flex gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-signal" />
              <span>{renderBold(b.trim().replace(/^[•-]\s*/, ""))}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function renderBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
