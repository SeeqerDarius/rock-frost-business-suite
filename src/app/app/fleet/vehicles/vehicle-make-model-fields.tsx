"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MakeLogo } from "@/components/fleet/make-logo";
import { VEHICLE_MAKES } from "@/lib/fleet-vehicle-makes";

const OTHER = "__other__";

function knownOrOther(value: string | null | undefined, options: string[]) {
  if (!value) return "";
  return options.includes(value) ? value : OTHER;
}

export function VehicleMakeModelFields({
  idSuffix,
  initialMake,
  initialModel,
}: {
  idSuffix: string;
  initialMake?: string | null;
  initialModel?: string | null;
}) {
  const makeNames = VEHICLE_MAKES.map((entry) => entry.name);
  const [make, setMake] = useState(() => knownOrOther(initialMake, makeNames));
  const [customMake, setCustomMake] = useState(() => (knownOrOther(initialMake, makeNames) === OTHER ? initialMake ?? "" : ""));

  const models = VEHICLE_MAKES.find((entry) => entry.name === make)?.models ?? [];
  const [model, setModel] = useState(() => knownOrOther(initialModel, models));
  const [customModel, setCustomModel] = useState(() => (knownOrOther(initialModel, models) === OTHER ? initialModel ?? "" : ""));

  const effectiveMake = make === OTHER ? customMake : make;
  const effectiveModel = model === OTHER ? customModel : model;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`make${idSuffix}`}>Make</Label>
        <div className="flex items-center gap-2">
          {make && make !== OTHER ? <MakeLogo make={make} size={32} /> : null}
          <select
            id={`make${idSuffix}`}
            value={make}
            onChange={(event) => {
              setMake(event.target.value);
              setModel("");
              setCustomModel("");
            }}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Select make</option>
            {VEHICLE_MAKES.map((entry) => (
              <option key={entry.name} value={entry.name}>
                {entry.name}
              </option>
            ))}
            <option value={OTHER}>Other (not listed)</option>
          </select>
        </div>
        {make === OTHER ? (
          <Input
            placeholder="Enter make"
            value={customMake}
            onChange={(event) => setCustomMake(event.target.value)}
            aria-label="Custom make"
          />
        ) : null}
        <input type="hidden" name="make" value={effectiveMake} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`model${idSuffix}`}>Model</Label>
        <select
          id={`model${idSuffix}`}
          value={model}
          onChange={(event) => setModel(event.target.value)}
          disabled={!make}
          className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-50"
        >
          <option value="">{make ? "Select model" : "Select a make first"}</option>
          {models.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          {make ? <option value={OTHER}>Other (not listed)</option> : null}
        </select>
        {model === OTHER ? (
          <Input
            placeholder="Enter model"
            value={customModel}
            onChange={(event) => setCustomModel(event.target.value)}
            aria-label="Custom model"
          />
        ) : null}
        <input type="hidden" name="model" value={effectiveModel} />
      </div>
    </div>
  );
}
