"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { createContext, useContext, useState } from "react";

const AnimatedIconHoverContext = createContext(false);

interface AnimatedIconHoverScopeProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function AnimatedIconHoverScope({
  children,
  onBlur,
  onFocus,
  onMouseEnter,
  onMouseLeave,
  ...props
}: AnimatedIconHoverScopeProps) {
  const [active, setActive] = useState(false);

  return (
    <AnimatedIconHoverContext.Provider value={active}>
      <div
        onBlur={(event) => {
          onBlur?.(event);
          if (!event.currentTarget.contains(event.relatedTarget)) setActive(false);
        }}
        onFocus={(event) => {
          onFocus?.(event);
          setActive(true);
        }}
        onMouseEnter={(event) => {
          onMouseEnter?.(event);
          setActive(true);
        }}
        onMouseLeave={(event) => {
          onMouseLeave?.(event);
          setActive(false);
        }}
        {...props}
      >
        {children}
      </div>
    </AnimatedIconHoverContext.Provider>
  );
}

export function useAnimatedIconHover() {
  return useContext(AnimatedIconHoverContext);
}
