import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PublicSupportFloat() {
  return <Button className="fixed bottom-5 right-5 z-40 size-14 rounded-full shadow-lg" size="icon" nativeButton={false} render={<Link href="/contact#contact-form" />} aria-label="Contact Rock Frost support"><MessageCircle className="size-6" /></Button>;
}
