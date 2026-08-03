import type { ModuleNavItem } from "@/types/module";

function routeMatches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Selects one current item, preferring the most-specific segment-boundary match. */
export function getActiveNavigationHref(pathname: string, items: Pick<ModuleNavItem, "href">[]) {
  return items
    .filter((item) => routeMatches(pathname, item.href))
    .toSorted((left, right) => right.href.length - left.href.length)[0]?.href;
}
