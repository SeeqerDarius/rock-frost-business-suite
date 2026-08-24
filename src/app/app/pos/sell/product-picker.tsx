"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { createPosQuickItem } from "./actions";

export type PickerItem = { id: string; name: string; sku: string; barcode: string | null; price: string; categoryId: string | null; imageData: string | null };
export type PickerCategory = { id: string; name: string };

const TILE_COLORS = [
  "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
];

function tileColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TILE_COLORS[hash % TILE_COLORS.length];
}

const NEW_CATEGORY = "__new__";

export function ProductPicker({
  items,
  categories,
  onAddItem,
  onItemCreated,
}: {
  items: PickerItem[];
  categories: PickerCategory[];
  onAddItem: (item: PickerItem) => void;
  onItemCreated: (item: PickerItem, category?: PickerCategory) => void;
}) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [categorySelection, setCategorySelection] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesCategory = activeCategory === "all" || item.categoryId === activeCategory;
      const matchesSearch = !query || item.name.toLowerCase().includes(query) || item.sku.toLowerCase().includes(query) || item.barcode?.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [items, activeCategory, search]);

  function submitQuickItem(formData: FormData) {
    setFormError(null);
    startTransition(async () => {
      const result = await createPosQuickItem(formData);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      onItemCreated(result.item, result.category);
      setDialogOpen(false);
      setCategorySelection("");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search products" className="pl-8" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setFormError(null); }}>
          <DialogTrigger render={<Button type="button" variant="outline" />}>
            <Plus />New product
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New product</DialogTitle>
              <DialogDescription>Add a sellable item without leaving the register. It appears in the grid immediately.</DialogDescription>
            </DialogHeader>
            <form id="quick-item-form" action={submitQuickItem} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="qi-name">Product name</Label>
                <Input id="qi-name" name="name" required maxLength={200} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qi-barcode">Barcode (optional)</Label>
                <Input id="qi-barcode" name="barcode" placeholder="Scan or type" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qi-price">Sales price</Label>
                <Input id="qi-price" name="price" type="number" min="0" step="0.01" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qi-category">Category</Label>
                <select
                  id="qi-category"
                  className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
                  value={categorySelection === NEW_CATEGORY ? NEW_CATEGORY : categorySelection}
                  onChange={(event) => setCategorySelection(event.target.value)}
                >
                  <option value="">No category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                  <option value={NEW_CATEGORY}>+ Create category...</option>
                </select>
                <input type="hidden" name="categoryId" value={categorySelection === NEW_CATEGORY ? "" : categorySelection} />
                {categorySelection === NEW_CATEGORY ? (
                  <Input name="newCategoryName" placeholder="New category name" required className="mt-1.5" />
                ) : null}
              </div>
              {formError ? <p className="text-sm text-destructive" role="alert">{formError}</p> : null}
            </form>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
              <Button type="submit" form="quick-item-form" disabled={isPending}>{isPending ? "Adding..." : "Add product"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" variant={activeCategory === "all" ? "default" : "outline"} onClick={() => setActiveCategory("all")}>All</Button>
        {categories.map((category) => (
          <Button key={category.id} type="button" size="sm" variant={activeCategory === category.id ? "default" : "outline"} onClick={() => setActiveCategory(category.id)}>
            {category.name}
          </Button>
        ))}
      </div>

      <div className="grid max-h-[26rem] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
        {visibleItems.length === 0 ? (
          <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No products match. Try a different search or add one.</p>
        ) : visibleItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onAddItem(item)}
            className="flex flex-col items-center gap-2 rounded-xl border bg-card p-3 text-center transition-colors hover:border-primary/40 hover:bg-secondary/50"
          >
            {item.imageData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.imageData} alt="" className="size-12 rounded-lg object-cover" />
            ) : (
              <span className={`flex size-12 items-center justify-center rounded-lg text-lg font-semibold ${tileColor(item.id)}`}>
                {item.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="line-clamp-2 text-xs leading-tight font-medium">{item.name}</span>
            <span className="text-xs text-muted-foreground">{item.price}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
