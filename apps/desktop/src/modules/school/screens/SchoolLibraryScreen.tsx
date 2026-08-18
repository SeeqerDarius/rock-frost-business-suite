import { useId, useState, type FormEvent } from "react";
import { Plus, Undo2 } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useApp } from "@/state/AppProvider";
import { createSchoolAdapter } from "@/modules/school/adapter";
import type { SchoolSnapshot } from "@/modules/school/school-data";
import { Field, inputStyle, selectStyle, ErrorText, SyncBadge } from "@/components/form-fields";

export function SchoolLibraryScreen({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  return (
    <section aria-labelledby="school-library-heading" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <h2 id="school-library-heading" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
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
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>Books</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate style={{ display: "flex", gap: "0.6rem", alignItems: "end", flexWrap: "wrap" }}>
          <Field label="Accession code" id={codeId}>
            <input id={codeId} value={accessionCode} onChange={(e) => setAccessionCode(e.target.value)} style={{ ...inputStyle, width: "8rem" }} />
          </Field>
          <Field label="Title" id={titleId}>
            <input id={titleId} value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...inputStyle, width: "10rem" }} />
          </Field>
          <Field label="Author" id={authorId} hint="Optional">
            <input id={authorId} value={author} onChange={(e) => setAuthor(e.target.value)} style={{ ...inputStyle, width: "9rem" }} />
          </Field>
          <Field label="Copies" id={copiesId}>
            <input id={copiesId} inputMode="numeric" value={totalCopies} onChange={(e) => setTotalCopies(e.target.value)} style={{ ...inputStyle, width: "4.5rem" }} />
          </Field>
          <Button type="submit" variant="secondary" loading={saving}>
            <Plus size={14} aria-hidden="true" />
            Add book
          </Button>
        </form>
        {error ? <div style={{ marginTop: "0.6rem" }}><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.libraryBooks.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>No library books cached on this device yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {snapshot.libraryBooks.map((book) => (
            <li key={book.entityId}>
              <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>{book.data.title}</p>
                  <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>
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
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>Loans</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate style={{ display: "flex", gap: "0.6rem", alignItems: "end", flexWrap: "wrap" }}>
          <Field label="Book" id={bookId}>
            <select id={bookId} value={book} onChange={(e) => setBook(e.target.value)} style={{ ...selectStyle, width: "10rem" }}>
              <option value="">Select a book</option>
              {availableBooks.map((b) => (
                <option key={b.entityId} value={b.entityId}>{b.data.title}</option>
              ))}
            </select>
          </Field>
          <Field label="Student" id={studentId}>
            <select id={studentId} value={student} onChange={(e) => setStudent(e.target.value)} style={{ ...selectStyle, width: "9rem" }}>
              <option value="">Select a student</option>
              {activeStudents.map((s) => (
                <option key={s.entityId} value={s.entityId}>{s.data.firstName} {s.data.lastName}</option>
              ))}
            </select>
          </Field>
          <Field label="Due" id={dueId}>
            <input id={dueId} type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} style={{ ...inputStyle, width: "9rem" }} />
          </Field>
          <Button type="submit" variant="secondary" loading={saving} disabled={availableBooks.length === 0 || activeStudents.length === 0}>
            <Plus size={14} aria-hidden="true" />
            Borrow
          </Button>
        </form>
        {availableBooks.length === 0 ? (
          <p style={{ margin: "0.6rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>No already-synced book with an available copy yet.</p>
        ) : null}
        {error ? <div style={{ marginTop: "0.6rem" }}><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.libraryLoans.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>No loans cached on this device yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {snapshot.libraryLoans.map((loan) => (
            <li key={loan.entityId}>
              <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>
                    {titleForBook(loan.data.bookId)} &middot; {nameForStudent(loan.data.studentId)}
                  </p>
                  <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>
                    {loan.data.status} &middot; due {loan.data.dueAt.slice(0, 10)}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexShrink: 0 }}>
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
