"use client";

import { AnimatedSettingsIcon } from "@/components/icons/animated-settings-icon";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Compass, LogOut } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initialsFor(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "";
  if (!source) return "U";
  const parts = source.split(/\s+/);
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function UserMenu() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<{ name: string | null; email: string; image: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    const refreshProfile = () => {
      void fetch("/api/account/profile", { cache: "no-store" })
        .then((response) => response.ok ? response.json() : null)
        .then((nextProfile) => {
          if (active && nextProfile) setProfile(nextProfile);
        });
    };
    const initialRequest = window.setTimeout(refreshProfile, 0);
    window.addEventListener("profile-updated", refreshProfile);
    return () => {
      active = false;
      window.clearTimeout(initialRequest);
      window.removeEventListener("profile-updated", refreshProfile);
    };
  }, []);
  const name = profile?.name ?? session?.user?.name ?? null;
  const email = profile?.email ?? session?.user?.email ?? null;
  const image = profile?.image ?? undefined;
  const isPlatformOwner = session?.user?.role === "Super Admin";
  const profileHref = isPlatformOwner ? "/app/platform/account" : "/app/account";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="gap-2 px-2" aria-label="Open account menu" data-tour="user-menu" />}>
        <Avatar className="size-6">
          {image ? <AvatarImage src={image} alt={name ? `${name} profile picture` : "Profile picture"} /> : null}
          <AvatarFallback className="text-xs">{initialsFor(name, email)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <p className="truncate font-medium">{name ?? "Your account"}</p>
            {email ? <p className="truncate text-xs font-normal text-muted-foreground">{email}</p> : null}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href={profileHref} />}>
          <AnimatedSettingsIcon size={16} />
          Profile settings
        </DropdownMenuItem>
        {isPlatformOwner ? null : (
          <DropdownMenuItem onClick={() => window.dispatchEvent(new Event("rf-tour-replay"))}>
            <Compass />
            Replay the tour
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => signOut({ callbackUrl: new URL("/login", window.location.origin).toString() })}
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
