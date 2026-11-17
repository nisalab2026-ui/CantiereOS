"use client";

import { SITE_STATUS_LABELS, SITE_STATUSES } from "@cantiereos/core";
import { useState } from "react";
import { FormField, Input, Select, Textarea } from "@/components/ui/input";
import { errorProp, fieldAttrs } from "@/lib/form-helpers";

export interface CustomerSiteOption {
  id: string;
  name: string;
  address: string;
}

export interface SiteDefaults {
  siteName?: string;
  customerSiteId?: string | null;
  addressLine?: string | null;
  postalCode?: string | null;
  city?: string | null;
  province?: string | null;
  siteStatus?: string;
  siteStartDate?: string | null;
  siteEndDate?: string | null;
  accessNotes?: string | null;
  safetyNotes?: string | null;
}

/**
 * Campi del cantiere: una sede già registrata del cliente oppure un indirizzo
 * proprio (il database accetta solo sedi dello stesso cliente).
 */
export function SiteFields({
  customerSites,
  defaults = {},
  errors,
  showStatus = true,
}: {
  customerSites: CustomerSiteOption[];
  defaults?: SiteDefaults;
  errors: Record<string, string>;
  showStatus?: boolean;
}) {
  const [where, setWhere] = useState<"site" | "address">(
    defaults.customerSiteId || (!defaults.addressLine && customerSites.length > 0)
      ? "site"
      : "address",
  );
  const f = (name: string) => fieldAttrs("s", errors, name);
  const useSite = where === "site" && customerSites.length > 0;
  return (
    <div className="space-y-4">
      <FormField
        id="s-siteName"
        label="Nome del cantiere"
        required
        {...errorProp(errors, "siteName")}
      >
        <Input
          {...f("siteName")}
          defaultValue={defaults.siteName ?? ""}
          required
          maxLength={200}
          autoComplete="off"
          placeholder="Es. Condominio via Roma 12, scala B"
        />
      </FormField>
      {customerSites.length > 0 && (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Dove</legend>
          <div className="inline-flex rounded-md border border-border p-0.5">
            {(
              [
                ["site", "Una sede del cliente"],
                ["address", "Un altro indirizzo"],
              ] as const
            ).map(([v, l]) => (
              <label
                key={v}
                className={`cursor-pointer rounded-sm px-3 py-1.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
                  where === v ? "bg-accent font-medium" : "text-muted-foreground"
                }`}
              >
                <input
                  type="radio"
                  name="siteWhere"
                  value={v}
                  className="sr-only"
                  checked={where === v}
                  onChange={() => setWhere(v)}
                />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {useSite ? (
        <FormField
          id="s-customerSiteId"
          label="Sede del cliente"
          required
          {...errorProp(errors, "customerSiteId")}
        >
          <Select {...f("customerSiteId")} defaultValue={defaults.customerSiteId ?? ""} required>
            <option value="">Scegli…</option>
            {customerSites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.address ? `${s.name} — ${s.address}` : s.name}
              </option>
            ))}
          </Select>
        </FormField>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(0,0.7fr)_5rem]">
          <FormField
            id="s-addressLine"
            label="Indirizzo"
            required
            {...errorProp(errors, "addressLine")}
          >
            <Input
              {...f("addressLine")}
              defaultValue={defaults.addressLine ?? ""}
              maxLength={300}
              autoComplete="off"
            />
          </FormField>
          <FormField id="s-postalCode" label="CAP" {...errorProp(errors, "postalCode")}>
            <Input
              {...f("postalCode")}
              defaultValue={defaults.postalCode ?? ""}
              inputMode="numeric"
              maxLength={5}
              autoComplete="off"
            />
          </FormField>
          <FormField id="s-city" label="Città" required {...errorProp(errors, "city")}>
            <Input
              {...f("city")}
              defaultValue={defaults.city ?? ""}
              maxLength={120}
              autoComplete="off"
            />
          </FormField>
          <FormField id="s-province" label="Prov." {...errorProp(errors, "province")}>
            <Input
              {...f("province")}
              defaultValue={defaults.province ?? ""}
              maxLength={2}
              autoComplete="off"
              className="uppercase"
            />
          </FormField>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {showStatus && (
          <FormField id="s-siteStatus" label="Stato" {...errorProp(errors, "siteStatus")}>
            <Select {...f("siteStatus")} defaultValue={defaults.siteStatus ?? "planned"}>
              {SITE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {SITE_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        <FormField id="s-siteStartDate" label="Apertura" {...errorProp(errors, "siteStartDate")}>
          <Input {...f("siteStartDate")} type="date" defaultValue={defaults.siteStartDate ?? ""} />
        </FormField>
        <FormField
          id="s-siteEndDate"
          label="Chiusura prevista"
          {...errorProp(errors, "siteEndDate")}
        >
          <Input {...f("siteEndDate")} type="date" defaultValue={defaults.siteEndDate ?? ""} />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="s-accessNotes"
          label="Accesso e orari"
          hint="Chiavi, cancello, orari del condominio"
          {...errorProp(errors, "accessNotes")}
        >
          <Textarea
            {...f("accessNotes")}
            className="min-h-16"
            defaultValue={defaults.accessNotes ?? ""}
            maxLength={2000}
          />
        </FormField>
        <FormField
          id="s-safetyNotes"
          label="Sicurezza"
          hint="Rischi particolari, DPI, riferimenti del PSC/POS"
          {...errorProp(errors, "safetyNotes")}
        >
          <Textarea
            {...f("safetyNotes")}
            className="min-h-16"
            defaultValue={defaults.safetyNotes ?? ""}
            maxLength={2000}
          />
        </FormField>
      </div>
    </div>
  );
}
