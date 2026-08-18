import { useId, useState, type FormEvent } from "react";
import { Plus, Undo2 } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/state/AppProvider";
import { createSchoolAdapter } from "@/modules/school/adapter";
import type { SchoolSnapshot } from "@/modules/school/school-data";
import { Field, ErrorText, SyncBadge } from "@/components/form-fields";

export function SchoolLibraryScreen({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  return (
    <section aria-labelledby="school-library-heading" className="flex flex-col gap-6">
      <h2 id="school-library-heading" className="m-0 text-[1.05rem] font-bold">
        Library
      </h2>
      <BookSection snapshot={snapshot} onChanged={onChanged} />
      <LoanSection snapshot={snapshot} onChanged={onChanged} />
    </section>
  );
}

function BookSection({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const codeId = useId();
  const titleId = useId();
  const authorId = useId();
  const copiesId = useId();
  const [accessionCode, setAccessionCode] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [totalCopies, setTotalCopies] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!device) return;
    const copies = Number(totalCopies);
    if (!accessionCode.trim() || !title.trim() || !Number.isInteger(copies) || copies < 1) {
      setError("Enter an accession code, a title, and at least one copy.");
      return;
    }
    setError(null);
    setSaving(true);
    recordActivity();
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).createLibraryBook(crypto.randomUUID(), {
        accessionCode: accessionCode.trim(),
        title: title.trim(),
        author: author.trim() || null,
        totalCopies: copies,
      });
      setAccessionCode("");
      setTitle("");
      setAuthor("");
      setTotalCopies("1");
      await onChanged();
    } catch {
      setError("Could not queue this book. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-sm font-semibold">Books</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-wrap items-end gap-2.5">
          <Field label="Accession code" id={codeId} className="w-32">
            <Input id={codeId} value={accessionCode} onChange={(e) => setAccessionCode(e.target.value)} />
          </Field>
          <Field label="Title" id={titleId} className="w-40">
            <Input id={titleId} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Author" id={authorId} hint="Optional" className="w-36">
            <Input id={authorId} value={author} onChange={(e) => setAuthor(e.target.value)} />
          </Field>
          <Field label="Copies" id={copiesId} className="w-20">
            <Input id={copiesId} inputMode="numeric" value={totalCopies} onChange={(e) => setTotalCopies(e.target.value)} />
          </Field>
          <Button type="submit" variant="secondary" loading={saving}>
            <Plus size={14} aria-hidden="true" />
            Add book
          </Button>
        </form>
        {error ? <div className="mt-2.5"><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.libraryBooks.length === 0 ? (
        <p className="m-0 text-[0.8125rem] text-muted-foreground">No library books cached on this device yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {snapshot.libraryBooks.map((book) => (
            <li key={book.entityId}>
              <Card className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold">{book.data.title}</p>
                  <p className="mt-0.5 mb-0 text-xs text-muted-foreground">
                    {book.data.accessionCode} &middot; {book.data.availableCopies}/{book.data.totalCopies} available
                  </p>
                </div>
                <SyncBadge pending={book.hasPendingLocalChange} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LoanSection({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const bookId = useId();
  const studentId = useId();
  const dueId = useId();
  const [book, setBook] = useState("");
  const [student, setStudent] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [returningId, setReturningId] = useState<string | null>(null);

  const availableBooks = snapshot.libraryBooks.filter((b) => !b.hasPendingLocalChange && b.data.availableCopies > 0);
  const activeStudents = snapshot.students.filter((s) => !s.hasPendingLocalChange && s.data.status === "ACTIVE");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!device) return;
    if (!book || !student || !dueAt) {
      setError("Select a book, a student, and a due date.");
      return;
    }
    setError(null);
    setSaving(true);
    recordActivity();
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).borrowLibraryBook(crypto.randomUUID(), {
        bookId: book,
        studentId: student,
        dueAt,
      });
      setBook("");
      setStudent("");
      setDueAt("");
      await onChanged();
    } catch {
      setError("Could not queue this loan. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReturn(loanId: string) {
    if (!device) return;
    recordActivity();
    setReturningId(loanId);
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).returnLibraryBook(crypto.randomUUID(), { loanId });
      await onChanged();
    } finally {
      setReturningId(null);
    }
  }

  const titleForBook = (id: string) => snapshot.libraryBooks.find((b) => b.entityId === id)?.data.title ?? id.slice(0, 8);
  const nameForStudent = (id: string) => {
    const row = snapshot.students.find((s) => s.entityId === id);
    return row ? `${row.data.firstName} ${row.data.lastName}` : id.slice(0, 8);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-sm font-semibold">Loans</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-wrap items-end gap-2.5">
          <Field label="Book" id={bookId} className="w-40">
            <Select value={book} onValueChange={(value) => setBook(value ?? "")}>
              <SelectTrigger id={bookId} className="w-full">
                <SelectValue placeholder="Select a book" />
              </SelectTrigger>
              <SelectContent>
                {availableBooks.map((b) => (
                  <SelectItem key={b.entityId} value={b.entityId}>{b.data.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Student" id={studentId} className="w-36">
            <Select value={student} onValueChange={(value) => setStudent(value ?? "")}>
              <SelectTrigger id={studentId} className="w-full">
                <SelectValue placeholder="Select a student" />
              </SelectTrigger>
              <SelectContent>
                {activeStudents.map((s) => (
                  <SelectItem key={s.entityId} value={s.entityId}>{s.data.firstName} {s.data.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Due" id={dueId} className="w-36">
            <Input id={dueId} type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </Field>
          <Button type="submit" variant="secondary" loading={saving} disabled={availableBooks.length === 0 || activeStudents.length === 0}>
            <Plus size={14} aria-hidden="true" />
            Borrow
          </Button>
        </form>
        {availableBooks.length === 0 ? (
          <p className="mt-2.5 mb-0 text-xs text-muted-foreground">No already-synced book with an available copy yet.</p>
        ) : null}
        {error ? <div className="mt-2.5"><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.libraryLoans.length === 0 ? (
        <p className="m-0 text-[0.8125rem] text-muted-foreground">No loans cached on this device yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {snapshot.libraryLoans.map((loan) => (
            <li key={loan.entityId}>
              <Card className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold">
                    {titleForBook(loan.data.bookId)} &middot; {nameForStudent(loan.data.studentId)}
                  </p>
                  <p className="mt-0.5 mb-0 text-xs text-muted-foreground">
                    {loan.data.status} &middot; due {loan.data.dueAt.slice(0, 10)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <SyncBadge pending={loan.hasPendingLocalChange} />
                  {(loan.data.status === "BORROWED" || loan.data.status === "OVERDUE") && !loan.hasPendingLocalChange ? (
                    <Button variant="secondary" onClick={() => void handleReturn(loan.entityId)} loading={returningId === loan.entityId}>
                      <Undo2 size={14} aria-hidden="true" />
                      Return
                    </Button>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
