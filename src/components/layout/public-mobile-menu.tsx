"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { publicNavLinks } from "@/components/layout/public-nav-links";

export function PublicMobileMenu() {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="outline" size="icon" aria-label="Open site navigation">
            <Menu aria-hidden="true" />
          </Button>
        }
      />
      <SheetContent side="right" className="w-[min(88vw,24rem)] gap-0 p-0">
        <SheetHeader className="border-b p-5 pr-14">
          <SheetTitle>Explore Rock Frost</SheetTitle>
          <SheetDescription>Business software, guidance, and support for your team.</SheetDescription>
        </SheetHeader>
        <nav aria-label="Mobile site navigation" className="flex flex-col gap-1 p-4">
          {publicNavLinks.map((link) => (
            <SheetClose
              key={link.href}
              render={
                <Link
                  href={link.href}
                  className="rounded-lg px-3 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              }
            >
              {link.label}
            </SheetClose>
          ))}
        </nav>
        <SheetFooter className="border-t p-4">
          <SheetClose
            render={
              <Link href="/subscribe" className={buttonVariants()} />
            }
          >
            Start your subscription
          </SheetClose>
          <SheetClose
            render={
              <Link href="/login" className={buttonVariants({ variant: "outline" })} />
            }
          >
            Sign in
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
