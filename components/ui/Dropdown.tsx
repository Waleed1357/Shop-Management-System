"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusNextField } from "@/components/providers/EnterKeyNavigation";

export interface DropdownOption {
  id: string;
  label: string;
  /** Smaller second line, e.g. phone number or stock */
  sublabel?: string;
  disabled?: boolean;
}

/** Shared look for every dropdown list in the app (also used by the inline pickers). */
export const dropdownPanelClass = "rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10";
export function dropdownOptionClass(active: boolean, selected: boolean, disabled = false) {
  return cn(
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
    disabled ? "cursor-not-allowed opacity-40" : active ? "bg-red-50" : "hover:bg-red-50",
    selected ? "font-medium text-red-700" : "text-slate-800",
  );
}

export interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  /** Show a search box. Default: only when there are more than 7 options. */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** field = looks like the form inputs (default) · compact = small, for filters · custom = only triggerClassName */
  variant?: "field" | "compact" | "custom";
  triggerClassName?: string;
  /** Classes for the outer wrapper */
  className?: string;
  /** Custom content for the closed button (e.g. a coloured status pill) */
  renderValue?: (option: DropdownOption | undefined) => ReactNode;
  /** Custom content for each row in the list */
  renderOption?: (option: DropdownOption) => ReactNode;
}

type Position = { left: number; width: number; maxHeight: number; top?: number; bottom?: number };

/**
 * The one dropdown used across the app.
 * - The list floats above everything (rendered at the end of the page), so modals can't cut it off.
 * - Keyboard: ↓/↑ move · Enter picks (and jumps to the next form field) · Esc closes · Tab leaves.
 */
export default function Dropdown({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchable,
  searchPlaceholder = "Search...",
  emptyText = "Nothing found.",
  disabled,
  required,
  id: idProp,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  variant = "field",
  triggerClassName,
  className,
  renderValue,
  renderOption,
}: DropdownProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const showSearch = searchable ?? options.length > 7;
  const selected = options.find((o) => o.id === value);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    const digits = q.replace(/\D/g, "");
    return options.filter((o) => {
      const text = `${o.label} ${o.sublabel ?? ""}`;
      return (
        text.toLowerCase().includes(q) ||
        // phone search ignores dashes and spaces
        (digits.length >= 3 && text.replace(/\D/g, "").includes(digits))
      );
    });
  }, [options, query]);

  // ---- open / close ----
  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  function openList() {
    if (disabled) return;
    setQuery("");
    const current = options.findIndex((o) => o.id === value);
    setActive(current >= 0 ? current : Math.max(0, options.findIndex((o) => !o.disabled)));
    setOpen(true);
  }

  function pick(option: DropdownOption, viaKeyboard: boolean) {
    if (option.disabled) return;
    onChange(option.id);
    setOpen(false);
    const trigger = triggerRef.current;
    if (!trigger) return;
    trigger.focus();
    // Keyboard users keep moving through the form, like pressing Enter in a text field
    if (viaKeyboard) requestAnimationFrame(() => focusNextField(trigger));
  }

  // ---- position the floating list under (or above) the button ----
  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(Math.max(rect.width, 200), window.innerWidth - 16);
    const left = Math.min(Math.max(rect.left, 8), window.innerWidth - width - 8);
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const up = below < 240 && above > below;
    setPos(
      up
        ? { left, width, maxHeight: Math.min(320, above), bottom: window.innerHeight - rect.top + 6 }
        : { left, width, maxHeight: Math.min(320, below), top: rect.bottom + 6 },
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  // Close when clicking anywhere else
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  // Keep the highlighted row visible while using the arrow keys
  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  // ---- keyboard ----
  function move(step: 1 | -1) {
    if (!matches.length) return;
    let next = active;
    for (let i = 0; i < matches.length; i++) {
      next = (next + step + matches.length) % matches.length;
      if (!matches[next].disabled) break;
    }
    setActive(next);
  }

  function onListKeyDown(event: KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "Enter":
        event.preventDefault(); // don't submit the form
        if (matches[active]) pick(matches[active], true);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation(); // close the list, not the whole modal
        close(true);
        break;
      case "Tab":
        close(false);
        break;
    }
  }

  function onTriggerKeyDown(event: KeyboardEvent) {
    if (open) {
      if (!showSearch) onListKeyDown(event);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      openList();
    }
  }

  // ---- render ----
  const optionId = (i: number) => `${id}-opt-${i}`;
  const triggerClasses =
    variant === "custom"
      ? cn("inline-flex items-center gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40", triggerClassName)
      : variant === "compact"
        ? cn(
            "relative flex h-9 min-w-44 items-center rounded-lg border bg-white pl-3 pr-9 text-left text-xs text-slate-700 transition-colors hover:border-slate-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-500/10",
            open ? "border-red-500" : "border-slate-200",
            triggerClassName,
          )
        : cn(
            "relative flex min-h-11 w-full items-center rounded-xl border py-2.5 pl-3.5 pr-10 text-left text-base transition-colors hover:border-slate-300 focus:outline-none focus-visible:border-red-500 focus-visible:ring-4 focus-visible:ring-red-500/10 sm:min-h-10 sm:text-sm",
            open ? "border-red-500 bg-white ring-4 ring-red-500/10" : "border-slate-200 bg-slate-50/60",
            disabled && "cursor-not-allowed bg-slate-100 text-slate-500",
            triggerClassName,
          );

  return (
    <div className={cn(variant === "field" ? "relative w-full" : "relative inline-block", className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        data-dropdown-trigger=""
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && !showSearch && matches[active] ? optionId(active) : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onTriggerKeyDown}
        className={triggerClasses}
      >
        {renderValue ? (
          renderValue(selected)
        ) : selected ? (
          <span className="min-w-0 truncate">
            <span className="text-slate-900">{selected.label}</span>
            {selected.sublabel && <span className="text-slate-500"> · {selected.sublabel}</span>}
          </span>
        ) : (
          <span className="truncate text-slate-400">{placeholder}</span>
        )}
        <ChevronDown
          className={cn(
            "shrink-0 transition-transform",
            variant === "custom" ? "size-3.5" : "pointer-events-none absolute right-3 size-4 text-slate-400",
            open && "rotate-180",
          )}
        />
      </button>

      {/* Lets the browser's "please fill in this field" check work like a normal select */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          data-enter-skip=""
          required
          value={value}
          onChange={() => {}}
          onFocus={() => triggerRef.current?.focus()}
          className="pointer-events-none absolute bottom-0 left-4 h-px w-px opacity-0"
        />
      )}

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight, zIndex: 70 }}
            className={cn(dropdownPanelClass, "flex animate-fade-in flex-col overflow-hidden")}
          >
            {showSearch && (
              <div className="relative shrink-0 border-b border-slate-100 bg-slate-50 p-2">
                <Search className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onListKeyDown}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  aria-controls={listId}
                  aria-activedescendant={matches[active] ? optionId(active) : undefined}
                  data-enter-skip=""
                  className="block min-h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-red-500 focus:outline-none focus:ring-4 focus:ring-red-500/10 sm:text-sm [&::-webkit-search-decoration]:appearance-none"
                />
              </div>
            )}
            <div ref={listRef} id={listId} role="listbox" aria-label={ariaLabel} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
              {matches.length ? (
                matches.map((o, i) => (
                  <div
                    key={o.id}
                    id={optionId(i)}
                    role="option"
                    data-index={i}
                    aria-selected={o.id === value}
                    aria-disabled={o.disabled || undefined}
                    onMouseEnter={() => !o.disabled && setActive(i)}
                    // Keep focus on the button / search box while clicking
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(o, false)}
                    className={cn(dropdownOptionClass(i === active, o.id === value, o.disabled), "cursor-pointer")}
                  >
                    {renderOption ? (
                      <span className="min-w-0 flex-1">{renderOption(o)}</span>
                    ) : (
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{o.label}</span>
                        {o.sublabel && <span className="block truncate text-xs font-normal text-slate-500">{o.sublabel}</span>}
                      </span>
                    )}
                    {o.id === value && <Check className="size-4 shrink-0 text-red-600" />}
                  </div>
                ))
              ) : (
                <p className="px-3 py-4 text-center text-sm text-slate-500">{emptyText}</p>
              )}
            </div>
            {showSearch && matches.length > 0 && (
              <p className="shrink-0 border-t border-slate-100 px-3 py-1.5 text-right text-[11px] text-slate-400">
                {matches.length} of {options.length}
              </p>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
