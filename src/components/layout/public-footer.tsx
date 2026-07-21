export function PublicFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>&copy; {new Date().getFullYear()} Rock Frost Technologies. All rights reserved.</p>
        <p>Rock Frost Business Suite: a modular business operating platform.</p>
      </div>
    </footer>
  );
}
