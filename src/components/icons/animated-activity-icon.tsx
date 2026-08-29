"use client";

import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes, MouseEvent } from "react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

import { useAnimatedIconHover } from "@/components/icons/animated-icon-hover-context";
import { cn } from "@/lib/utils";

export interface AnimatedActivityIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface AnimatedActivityIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const variants: Variants = {
  normal: {
    opacity: 1,
    pathLength: 1,
    pathOffset: 0,
    transition: {
      duration: 0.4,
      opacity: { duration: 0.1 },
    },
  },
  animate: {
    opacity: [0, 1],
    pathLength: [0, 1],
    pathOffset: [1, 0],
    transition: {
      duration: 0.6,
      ease: "linear",
      opacity: { duration: 0.1 },
    },
  },
};

const AnimatedActivityIcon = forwardRef<AnimatedActivityIconHandle, AnimatedActivityIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);
    const parentHovered = useAnimatedIconHover();

    useEffect(() => {
      if (isControlledRef.current) return;
      void controls.start(parentHovered ? "animate" : "normal");
    }, [controls, parentHovered]);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return {
        startAnimation: () => controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });

    const handleMouseEnter = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        onMouseEnter?.(event);
        if (!isControlledRef.current) void controls.start("animate");
      },
      [controls, onMouseEnter],
    );

    const handleMouseLeave = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        onMouseLeave?.(event);
        if (!isControlledRef.current) void controls.start("normal");
      },
      [controls, onMouseLeave],
    );

    return (
      <div
        aria-hidden="true"
        className={cn("inline-flex shrink-0 items-center justify-center", className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <motion.path
            animate={controls}
            d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"
            initial="normal"
            variants={variants}
          />
        </svg>
      </div>
    );
  },
);

AnimatedActivityIcon.displayName = "AnimatedActivityIcon";

export { AnimatedActivityIcon };
