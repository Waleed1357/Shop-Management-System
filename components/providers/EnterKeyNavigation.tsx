"use client";

import { useEffect } from "react";

const SKIP_INPUT_TYPES = new Set(["button", "submit", "reset", "checkbox", "radio", "file", "hidden", "range", "color", "image"]);

/** Fields Enter can move between: visible, enabled, editable inputs / selects / textareas, and our dropdowns. */
function isField(el: Element): el is HTMLElement {
  if (el instanceof HTMLButtonElement) {
    // Our custom dropdowns (components/ui/Dropdown.tsx) count as fields
    if (!el.hasAttribute("data-dropdown-trigger") || el.disabled) return false;
  } else if (el instanceof HTMLInputElement) {
    if (SKIP_INPUT_TYPES.has(el.type) || el.readOnly || el.disabled) return false;
  } else if (el instanceof HTMLTextAreaElement) {
    if (el.readOnly || el.disabled) return false;
  } else if (el instanceof HTMLSelectElement) {
    if (el.disabled) return false;
  } else {
    return false;
  }
  return el.getClientRects().length > 0 && !el.closest("[data-enter-skip]");
}

/**
 * Moves focus from `from` to the next field in its form.
 * After the last field it focuses the form's Save (submit) button.
 */
export function focusNextField(from: Element) {
  const form = from.closest("form");
  if (!form) return;
  const fields = Array.from(form.querySelectorAll("input, select, textarea, button[data-dropdown-trigger]")).filter(isField);
  const next = fields[fields.indexOf(from as HTMLElement) + 1];
  if (next) {
    next.focus();
    // Select the text so typing replaces it (handy for numbers like quantity "1")
    if (next instanceof HTMLInputElement && ["text", "number", "tel", "email", "search"].includes(next.type)) {
      next.select();
    }
    return;
  }
  form.querySelector<HTMLButtonElement>("button[type='submit']:not([disabled])")?.focus();
}

/**
 * In every form: pressing Enter in a field jumps to the next field instead of submitting.
 * On the last field it moves to the Save button; pressing Enter there saves.
 * Shift+Enter still adds a new line in text areas.
 * Components that handle Enter themselves (dropdowns, search lists) call preventDefault and are left alone.
 * Add data-enter-skip to an element to leave it out.
 */
export default function EnterKeyNavigation() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.defaultPrevented || event.isComposing) return;
      if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;

      const target = event.target as Element | null;
      if (!target || !isField(target) || !target.closest("form")) return;

      event.preventDefault();
      focusNextField(target);
    }

    // Bubble phase: React's own handlers run first, so their preventDefault is respected.
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}
