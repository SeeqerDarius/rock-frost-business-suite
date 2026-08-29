"use client";

import { useEffect } from "react";

const CONTROL_SELECTOR = 'button, a, [role="button"], summary';
const PLAYING_CLASS = "icon-motion-active";
const HOVER_INTENT_MS = 110;
const REPLAY_GUARD_MS = 650;
const COMPLETION_MS = 1_700;

function eligibleControl(target: EventTarget | null) {
  const element = target instanceof Element ? target : null;
  const control = element?.closest<HTMLElement>(CONTROL_SELECTOR) ?? null;
  if (!control || control.matches(':disabled, [aria-disabled="true"], [data-icon-motion="off"]')) return null;
  if (!control.querySelector(".lucide:not(.animate-spin)")) return null;
  return control;
}

export function IconMotionController() {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const hoverTimers = new WeakMap<HTMLElement, number>();
    const lastPlayed = new WeakMap<HTMLElement, number>();

    const play = (control: HTMLElement) => {
      if (reducedMotion.matches) return;
      const now = performance.now();
      if (now - (lastPlayed.get(control) ?? -Infinity) < REPLAY_GUARD_MS) return;
      lastPlayed.set(control, now);
      control.classList.remove(PLAYING_CLASS);
      void control.offsetWidth;
      control.classList.add(PLAYING_CLASS);
      window.setTimeout(() => control.classList.remove(PLAYING_CLASS), COMPLETION_MS);
    };

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const control = eligibleControl(event.target);
      if (!control || control.contains(event.relatedTarget as Node | null)) return;
      const timer = window.setTimeout(() => play(control), HOVER_INTENT_MS);
      hoverTimers.set(control, timer);
    };
    const onPointerOut = (event: PointerEvent) => {
      const control = eligibleControl(event.target);
      if (!control || control.contains(event.relatedTarget as Node | null)) return;
      const timer = hoverTimers.get(control);
      if (timer) window.clearTimeout(timer);
    };
    const onFocusIn = (event: FocusEvent) => {
      const control = eligibleControl(event.target);
      if (control) play(control);
    };
    const onPointerDown = (event: PointerEvent) => {
      const control = eligibleControl(event.target);
      if (control) play(control);
    };

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  return null;
}
