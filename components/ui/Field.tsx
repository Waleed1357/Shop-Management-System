import {
  Children,
  isValidElement,
  type InputHTMLAttributes,
  type OptionHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";
import Dropdown, { type DropdownOption } from "./Dropdown";

/**
 * Shared input look.
 * - text-base on phones: iOS Safari zooms the page when an input's font is under 16px.
 * - appearance-none: removes browser-specific styling (Safari search/date, Firefox selects).
 */
export const inputClass =
  "block w-full min-h-11 appearance-none rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-base text-slate-800 placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-red-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-red-500/10 read-only:cursor-default read-only:bg-slate-100 read-only:text-slate-500 disabled:bg-slate-100 disabled:text-slate-500 sm:min-h-10 sm:text-sm [&::-webkit-date-and-time-value]:text-left [&::-webkit-search-decoration]:appearance-none";

interface LabelProps {
  label: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({ label, required, children, className }: LabelProps) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="block text-[13px] font-medium text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {children}
    </label>
  );
}

/** True when the caller sets its own width (e.g. "w-24"), so the default full width is dropped. */
const hasOwnWidth = (className?: string) => /(^|\s)([a-z0-9]+:)*w-/.test(className ?? "");

/** Shared input style without the full width, for inputs that set their own width. */
const inputClassNoWidth = inputClass.replace("block w-full ", "block ");

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(hasOwnWidth(className) ? inputClassNoWidth : inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputClass, "min-h-24 resize-y", className)} {...props} />;
}

interface SelectProps {
  value?: string | number | readonly string[];
  /** Same shape as a normal <select> change event: read event.target.value */
  onChange?: (event: { target: { value: string } }) => void;
  children?: ReactNode;
  /** Classes for the button */
  className?: string;
  /** Classes for the outer wrapper, e.g. "w-auto" for a compact select. */
  wrapperClassName?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  "aria-label"?: string;
}

/** Reads <option value="..." disabled>Label</option> children into dropdown options. */
function readOptions(children: ReactNode) {
  let placeholder: string | undefined;
  const options: DropdownOption[] = [];
  Children.toArray(children).forEach((child) => {
    if (!isValidElement<OptionHTMLAttributes<HTMLOptionElement> & { children?: ReactNode }>(child) || child.type !== "option") return;
    const label = Children.toArray(child.props.children).join("");
    const value = child.props.value === undefined ? label : String(child.props.value);
    // An empty-value option ("Select item") becomes the placeholder text
    if (value === "") placeholder = label;
    else options.push({ id: value, label, disabled: child.props.disabled });
  });
  return { options, placeholder };
}

/**
 * Drop-in replacement for <select>: same props and <option> children,
 * but uses the app's shared Dropdown so it looks the same everywhere.
 */
export function Select({ className, wrapperClassName, children, value, onChange, disabled, required, id, "aria-label": ariaLabel }: SelectProps) {
  const { options, placeholder } = readOptions(children);
  return (
    <Dropdown
      options={options}
      value={value === undefined ? "" : String(value)}
      onChange={(next) => onChange?.({ target: { value: next } })}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      id={id}
      aria-label={ariaLabel}
      className={wrapperClassName}
      triggerClassName={className}
    />
  );
}
