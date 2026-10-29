"use client";

import { useId } from "react";
import Dropdown, { type DropdownOption } from "./Dropdown";

export type SearchOption = DropdownOption;

interface SearchSelectProps {
  label: string;
  required?: boolean;
  options: SearchOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
}

/** Labelled dropdown that always has a search box (complaints, purchases, products...). */
export default function SearchSelect({ label, required, ...props }: SearchSelectProps) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <p id={`${id}-label`} className="text-[13px] font-medium text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </p>
      <Dropdown {...props} searchable required={required} aria-labelledby={`${id}-label`} />
    </div>
  );
}
