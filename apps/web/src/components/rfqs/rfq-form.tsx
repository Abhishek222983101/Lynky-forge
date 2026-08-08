"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCompanies } from "@/hooks/use-companies";
import { useCreateRfq } from "@/hooks/use-rfqs";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { INDUSTRY_META, type Industry, type RfqSource } from "@/lib/types";

const MATERIALS = [
  "SS 304",
  "SS 316",
  "SS 316L",
  "MS",
  "Aluminium 6061",
  "Aluminium 7075",
  "Brass",
  "Bronze",
  "Copper",
  "EN8",
  "EN24",
  "EN36",
  "Ti-6Al-4V",
  "Inconel 718",
  "Delrin",
];

const SOURCES: { value: RfqSource; label: string }[] = [
  { value: "EMAIL", label: "Email" },
  { value: "WEBSITE", label: "Website" },
  { value: "PHONE", label: "Phone" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "REFERRAL", label: "Referral" },
];

const INDUSTRIES = Object.entries(INDUSTRY_META) as [Industry, string][];

const schema = z.object({
  partName: z.string().min(1, "Part name is required"),
  partNo: z.string().min(1, "Part number is required"),
  material: z.string().min(1, "Material is required"),
  qty: z.coerce.number({ invalid_type_error: "Qty must be a number" }).int("Qty must be a whole number").positive("Qty must be at least 1"),
  tolerance: z.string().optional(),
  targetPrice: z
    .union([z.coerce.number().positive("Must be positive"), z.literal("")])
    .optional(),
  deadline: z.string().min(1, "Deadline is required"),
  drawingNotes: z.string().optional(),
  source: z.enum(["WEBSITE", "EMAIL", "PHONE", "WHATSAPP", "REFERRAL"]),
});

type FormValues = z.infer<typeof schema>;

const fieldClass =
  "h-10 w-full rounded-lg border border-mist bg-surface px-3 text-sm text-ink focus:border-signal focus:outline-none disabled:cursor-not-allowed disabled:opacity-60";

export function RfqForm() {
  const router = useRouter();
  const companies = useCompanies();
  const createRfq = useCreateRfq();

  const [companySearch, setCompanySearch] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<{ id: string; name: string } | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyIndustry, setNewCompanyIndustry] = useState<Industry>("INDUSTRIAL");
  const [newCompanyCity, setNewCompanyCity] = useState("");
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { source: "EMAIL" },
  });

  const matches = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    if (!q || selectedCompany) return [];
    return (companies.data ?? []).filter((c) => c.name.toLowerCase().includes(q)).slice(0, 5);
  }, [companies.data, companySearch, selectedCompany]);

  function pickCompany(c: { id: string; name: string }) {
    setSelectedCompany(c);
    setCreatingNew(false);
    setCompanyError(null);
    setDropdownOpen(false);
    setCompanySearch("");
  }

  function startCreateNew() {
    setCreatingNew(true);
    setSelectedCompany(null);
    setNewCompanyName(companySearch.trim());
    setCompanyError(null);
    setDropdownOpen(false);
  }

  function clearCompany() {
    setSelectedCompany(null);
    setCreatingNew(false);
    setNewCompanyName("");
    setNewCompanyCity("");
  }

  function onSubmit(values: FormValues) {
    if (!selectedCompany && !creatingNew) {
      setCompanyError("Pick an existing company or create a new one");
      return;
    }
    if (creatingNew && !newCompanyName.trim()) {
      setCompanyError("New company needs a name");
      return;
    }
    setCompanyError(null);

    createRfq.mutate(
      {
        partName: values.partName,
        partNo: values.partNo,
        material: values.material,
        qty: values.qty,
        tolerance: values.tolerance || undefined,
        targetPrice: values.targetPrice === "" || values.targetPrice === undefined ? undefined : Number(values.targetPrice),
        deadline: values.deadline,
        drawingNotes: values.drawingNotes || undefined,
        source: values.source,
        ...(selectedCompany
          ? { companyId: selectedCompany.id }
          : {
              companyName: newCompanyName.trim(),
              companyIndustry: newCompanyIndustry,
              companyCity: newCompanyCity.trim() || undefined,
            }),
      },
      {
        onSuccess: (res) => {
          setSuccess(res.deal.title);
          setTimeout(() => router.push("/pipeline"), 1200);
        },
      }
    );
  }

  if (success) {
    return (
      <Card>
        <CardBody className="py-16 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-signal">RFQ captured</p>
          <p className="mt-2 font-display text-lg font-semibold text-ink">{success}</p>
          <p className="mt-1 text-sm text-steel">Deal created in pipeline · taking you there…</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Part details</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Input label="Part name" placeholder="SS304 Precision Shaft" error={errors.partName?.message} {...register("partName")} />
          <Input label="Part number" placeholder="SHFT-2026-018" className="font-mono" error={errors.partNo?.message} {...register("partNo")} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="material" className="text-[13px] font-medium text-ink">Material</label>
            <input
              id="material"
              list="material-options"
              placeholder="SS 304"
              className={cn(fieldClass, errors.material ? "border-hazard" : "")}
              {...register("material")}
            />
            <datalist id="material-options">
              {MATERIALS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            {errors.material ? <p className="text-[13px] text-hazard">{errors.material.message}</p> : null}
          </div>
          <Input label="Quantity" type="number" min={1} step={1} placeholder="500" className="font-mono" error={errors.qty?.message} {...register("qty")} />
          <Input label="Tolerance" placeholder="±0.01 mm" className="font-mono" error={errors.tolerance?.message} {...register("tolerance")} />
          <Input label="Target price / unit (₹)" type="number" min={0} step="any" placeholder="1450" className="font-mono" error={errors.targetPrice?.message} {...register("targetPrice")} />
          <Input label="Deadline" type="date" error={errors.deadline?.message} {...register("deadline")} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="source" className="text-[13px] font-medium text-ink">Source</label>
            <select id="source" className={fieldClass} {...register("source")}>
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="drawingNotes" className="text-[13px] font-medium text-ink">Drawing notes</label>
            <textarea
              id="drawingNotes"
              rows={3}
              placeholder="Anodized finish, chamfer all edges…"
              className={cn(fieldClass, "h-auto py-2.5")}
              {...register("drawingNotes")}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {selectedCompany ? (
            <div className="flex items-center justify-between rounded-lg border border-signal/40 bg-signal-soft px-3 py-2.5">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-ink">
                <Building2 className="size-4 text-signal" strokeWidth={1.8} />
                {selectedCompany.name}
              </span>
              <button type="button" onClick={clearCompany} className="rounded-md p-1 text-steel hover:text-ink" aria-label="Clear company">
                <X className="size-4" />
              </button>
            </div>
          ) : creatingNew ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium text-signal">Creating new company</p>
                <button type="button" onClick={clearCompany} className="text-[13px] text-steel hover:text-ink">
                  Cancel — pick existing
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Input label="Company name" value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} placeholder="Aakash CNC Works" />
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="newCompanyIndustry" className="text-[13px] font-medium text-ink">Industry</label>
                  <select
                    id="newCompanyIndustry"
                    className={fieldClass}
                    value={newCompanyIndustry}
                    onChange={(e) => setNewCompanyIndustry(e.target.value as Industry)}
                  >
                    {INDUSTRIES.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <Input label="City" value={newCompanyCity} onChange={(e) => setNewCompanyCity(e.target.value)} placeholder="Pune" />
              </div>
            </div>
          ) : (
            <div className="relative">
              <Input
                label="Search company"
                value={companySearch}
                onChange={(e) => {
                  setCompanySearch(e.target.value);
                  setDropdownOpen(true);
                  setCompanyError(null);
                }}
                onFocus={() => setDropdownOpen(true)}
                onBlur={() => {
                  blurTimer.current = setTimeout(() => setDropdownOpen(false), 150);
                }}
                placeholder="Start typing a company name…"
                error={companyError ?? undefined}
              />
              {dropdownOpen && companySearch.trim() ? (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-mist bg-surface shadow-lg shadow-ink/5">
                  {matches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (blurTimer.current) clearTimeout(blurTimer.current);
                        pickCompany(c);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm text-ink hover:bg-canvas"
                    >
                      <span>{c.name}</span>
                      <span className="text-xs text-steel">{c.city ?? ""}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (blurTimer.current) clearTimeout(blurTimer.current);
                      startCreateNew();
                    }}
                    className="flex w-full items-center gap-2 border-t border-mist px-3 py-2.5 text-left text-sm font-medium text-signal hover:bg-signal-soft/50"
                  >
                    + Create new company
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </CardBody>
      </Card>

      {createRfq.isError ? (
        <div className="rounded-lg border border-hazard/40 bg-hazard-soft px-4 py-3 text-sm font-medium text-hazard">
          {createRfq.error instanceof ApiError ? createRfq.error.message : "Couldn’t capture the RFQ. Try again."}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="secondary" onClick={() => router.push("/rfqs")}>
          Cancel
        </Button>
        <Button type="submit" loading={createRfq.isPending}>
          Capture RFQ
        </Button>
      </div>
    </form>
  );
}
