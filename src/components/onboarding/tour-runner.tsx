"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { EVENTS, STATUS, type EventData, type Step } from "react-joyride";
import { buildGeneralTourSteps, buildModuleTourSteps, GENERAL_TOUR_KEY, type TourStep } from "@/lib/tours/definitions";
import { completeTour, getPendingTourKeys } from "@/lib/tours/actions";
import { COOKIE_CONSENT_CHANGED_EVENT, readCookieConsent } from "@/lib/cookie-consent";
import type { ModuleNavItem } from "@/types/module";

const Joyride = dynamic(() => import("react-joyride").then((mod) => mod.Joyride), { ssr: false });

/** Onboarding tours are chrome-heavy (sidebar, module switcher) and don't
 * translate well to the mobile Sheet nav, which duplicates the same
 * data-tour targets in a hidden portal - skip below the desktop sidebar's
 * own breakpoint rather than risk spotlighting a hidden element. */
const MIN_TOUR_VIEWPORT_WIDTH = 1024;

type QueuedTour = { key: string; steps: TourStep[]; runId: number };

function toJoyrideSteps(steps: TourStep[]): Step[] {
  return steps.map((step) => ({
    target: step.target,
    title: step.title,
    content: step.content,
    placement: step.placement,
  }));
}

export function TourRunner({
  moduleKey,
  sectionLabel,
  moduleDescription,
  navigation,
  showModuleLauncher,
}: {
  moduleKey?: string;
  sectionLabel: string;
  moduleDescription?: string;
  navigation: ModuleNavItem[];
  showModuleLauncher: boolean;
}) {
  const [queue, setQueue] = useState<QueuedTour[]>([]);
  const [replayMessage, setReplayMessage] = useState("");

  const buildCandidateTours = useCallback((): QueuedTour[] => {
    const runId = Date.now();
    const tours: QueuedTour[] = [{ key: GENERAL_TOUR_KEY, steps: buildGeneralTourSteps(showModuleLauncher), runId }];
    if (moduleKey) {
      tours.push({ key: moduleKey, steps: buildModuleTourSteps(sectionLabel, moduleDescription, navigation), runId });
    }
    return tours
      .map((tour) => ({ ...tour, steps: tour.steps.filter((step) => document.querySelector(step.target)) }))
      .filter((tour) => tour.steps.length > 0);
  }, [moduleKey, sectionLabel, moduleDescription, navigation, showModuleLauncher]);

  /**
   * The cookie banner and this tour both want the screen the moment a new
   * workspace is first opened, and neither knew about the other: the result
   * was a spotlight popover over the page heading with a consent dialog
   * sitting on top of it, two interruptions competing before the customer
   * had seen anything. The banner cannot wait (nothing optional may run
   * until it is answered), so the tour yields to it and starts once the
   * choice is made. An explicit replay is never gated this way.
   */
  const [consentSettled, setConsentSettled] = useState(() =>
    typeof document === "undefined" ? false : readCookieConsent(document.cookie) !== null);

  useEffect(() => {
    if (consentSettled) return;
    function check() {
      if (readCookieConsent(document.cookie) !== null) setConsentSettled(true);
    }
    check();
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, check);
    return () => window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, check);
  }, [consentSettled]);

  useEffect(() => {
    if (!consentSettled) return;
    if (window.innerWidth < MIN_TOUR_VIEWPORT_WIDTH) return;
    let active = true;
    const candidates = buildCandidateTours();
    void getPendingTourKeys(candidates.map((tour) => tour.key)).then((pendingKeys) => {
      if (!active) return;
      const pending = new Set(pendingKeys);
      setQueue(candidates.filter((tour) => pending.has(tour.key)));
    });
    return () => {
      active = false;
    };
    // Runs once per mounted module/section, and again if the privacy choice
    // is made while this page is open - buildCandidateTours is stable for
    // the lifetime of a given page's AppShell instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consentSettled]);

  useEffect(() => {
    function handleReplay() {
      if (window.innerWidth < MIN_TOUR_VIEWPORT_WIDTH) {
        setReplayMessage("The guided tour is available on a wider screen. Open this page on a desktop or enlarge the window.");
        return;
      }
      setReplayMessage("");
      // Let the account menu close before Joyride measures its targets. A
      // fresh run id guarantees a remount even when the same tour is active.
      window.setTimeout(() => setQueue(buildCandidateTours()), 0);
    }
    window.addEventListener("rf-tour-replay", handleReplay);
    return () => window.removeEventListener("rf-tour-replay", handleReplay);
  }, [buildCandidateTours]);

  const current = queue[0];

  function handleEvent(data: EventData) {
    if (data.type !== EVENTS.TOUR_END) return;
    if (data.status !== STATUS.FINISHED && data.status !== STATUS.SKIPPED) return;
    if (current) void completeTour(current.key);
    setQueue((remaining) => remaining.slice(1));
  }

  if (!current) return replayMessage ? <p role="status" className="fixed bottom-20 right-4 z-50 max-w-sm rounded-lg border bg-background p-3 text-sm shadow-lg">{replayMessage}</p> : null;

  return (
    <Joyride
      key={`${current.key}-${current.runId}`}
      steps={toJoyrideSteps(current.steps)}
      run
      continuous
      scrollToFirstStep
      onEvent={handleEvent}
      locale={{ last: "Done" }}
      options={{
        buttons: ["skip", "back", "primary"],
        showProgress: true,
        skipBeacon: true,
        primaryColor: "var(--primary)",
        backgroundColor: "var(--card)",
        textColor: "var(--card-foreground)",
        overlayColor: "rgba(0, 0, 0, 0.5)",
        arrowColor: "var(--card)",
        zIndex: 1000,
      }}
    />
  );
}
