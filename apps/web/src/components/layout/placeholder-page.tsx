import { Card, CardBody } from "@/components/ui/card";

export function PlaceholderPage({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      <Card>
        <CardBody className="py-16 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-steel">Under construction</p>
          <p className="mt-2 text-sm text-steel">
            This screen ships in {phase}. The API behind it is already live.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
