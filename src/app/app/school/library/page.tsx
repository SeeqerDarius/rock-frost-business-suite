import { BookPlus, Library, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormFeedback, ReadOnlyNotice } from "@/components/school/form-feedback";
import { FieldGrid, SelectField, TextField } from "@/components/school/form-fields";
import { SectionCard } from "@/components/school/section-card";
import { RecordSearch } from "@/components/school/record-search";
import { StatusBadge } from "@/components/school/status-badge";
import { formatDate } from "@/components/school/format";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listSchoolLibraryBookChoices, listSchoolLibraryBookPage, listSchoolLibraryLoanPage, listSchoolStudentChoices } from "@/modules/school/service";
import { RecordPagination } from "@/components/school/record-pagination";
import { borrowBookAction, createLibraryBookAction, returnBookAction } from "../actions";
import { schoolPlanGate } from "@/components/school/plan-gate";

const PATH = "/app/school/library";

export default async function SchoolLibraryPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; q?: string; loansQ?: string; view?: string; page?: string; loansPage?: string; studentQ?: string; bookQ?: string }> }) {
  const [tenant, query] = await Promise.all([requireModuleAccess("school"), searchParams]);
  // Plan gate. Navigation already hides this page when the plan does
  // not include it, but a hidden link is not a boundary.
  const gate = await schoolPlanGate(tenant.organizationId, "school.services", "Library", "Catalogue, copy availability, and circulation.");
  if (gate) return gate;
  const canManage = hasPermission(tenant, PERMISSIONS.SCHOOL_LIBRARY_MANAGE);
  const requestedPage = query.page && /^\d{1,6}$/.test(query.page) ? Number(query.page) : 1;
  const requestedLoanPage = query.loansPage && /^\d{1,6}$/.test(query.loansPage) ? Number(query.loansPage) : 1;
  const showReturned = query.view === "all";
  const [bookPage, loanPage, availableBooks, students] = await Promise.all([
    listSchoolLibraryBookPage(tenant.organizationId, { query: query.q, page: requestedPage }),
    listSchoolLibraryLoanPage(tenant.organizationId, { query: query.loansQ, showAll: showReturned, page: requestedLoanPage }),
    listSchoolLibraryBookChoices(tenant.organizationId, { query: query.bookQ }),
    listSchoolStudentChoices(tenant.organizationId, { query: query.studentQ, activeOnly: true }),
  ]);
  const books = bookPage.rows;

  const now = new Date();
  const loans = loanPage.rows;
  const overdueCount = loanPage.overdueCount;
  const visibleBooks = books;

  const visibleLoans = loans;
  const loanViewParams = new URLSearchParams();
  if (query.q) loanViewParams.set("q", query.q);
  if (query.loansQ) loanViewParams.set("loansQ", query.loansQ);
  if (query.studentQ) loanViewParams.set("studentQ", query.studentQ);
  if (query.bookQ) loanViewParams.set("bookQ", query.bookQ);
  if (!showReturned) loanViewParams.set("view", "all");
  const loanViewHref = loanViewParams.size ? `${PATH}?${loanViewParams.toString()}` : PATH;

  const newBookDialog = (
    <EntityDialog
      trigger={<Button size="sm"><Plus />Add book</Button>}
      title="Add a book to the catalogue"
      description="All copies start as available."
      action={createLibraryBookAction}
      submitLabel="Add book"
    >
      <TextField id="book-title" name="title" label="Title" required maxLength={200} />
      <FieldGrid>
        <TextField id="book-accession" name="accessionCode" label="Accession code" required maxLength={200} hint="The library's own catalogue number." />
        <TextField id="book-isbn" name="isbn" label="ISBN" maxLength={200} hint="Optional." />
      </FieldGrid>
      <FieldGrid>
        <TextField id="book-author" name="author" label="Author" maxLength={200} hint="Optional." />
        <TextField id="book-category" name="category" label="Category" maxLength={200} hint="Optional. e.g. Fiction, Science." />
      </FieldGrid>
      <TextField id="book-copies" name="totalCopies" label="Number of copies" type="number" min="1" max="10000" defaultValue="1" required />
    </EntityDialog>
  );

  const issueDialog = (
    <EntityDialog
      trigger={<Button size="sm" variant="outline"><BookPlus />Issue book</Button>}
      title="Issue a book"
      description="One available copy is reserved for the student until it is returned."
      action={borrowBookAction}
      submitLabel="Issue book"
    >
      <SelectField
        id="borrow-book"
        name="bookId"
        label="Book"
        required
        options={availableBooks.rows.map((book) => ({ value: book.id, label: `${book.title} (${book.availableCopies} available)` }))}
        emptyHint="No copies are currently available."
      />
      <SelectField
        id="borrow-student"
        name="studentId"
        label="Student"
        required
        options={students.rows.map((student) => ({ value: student.id, label: `${student.lastName}, ${student.firstName} (${student.admissionNumber})` }))}
        emptyHint="Only active students can borrow."
        hint="Only active students are listed. Search by name or admission number above."
      />
      <TextField id="borrow-due" name="dueAt" label="Due date" type="date" required hint="When the student must return the book." />
    </EntityDialog>
  );

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <PageHeader
        title="Library"
        description="Catalogue, copy availability, and circulation."
        actions={canManage ? <>{newBookDialog}{availableBooks.total > 0 && students.total > 0 ? issueDialog : null}</> : undefined}
      />

      <FormFeedback
        saved={query.saved}
        error={query.error}
        savedMessage="The library record is up to date."
        stateMessage="No copy of that book is available, or the loan is already closed."
      />
      <div className="space-y-3">
        <RecordSearch action={PATH} queryName="studentQ" label="Find a student for a library loan" placeholder="Name or admission number" defaultValue={query.studentQ} hiddenFilters={{ q: query.q, loansQ: query.loansQ, bookQ: query.bookQ, view: showReturned ? "all" : undefined }} resultSummary={`Showing ${students.rows.length} of ${students.total} active students`} />
        <RecordSearch action={PATH} queryName="bookQ" label="Find a book to issue" placeholder="Title, author, or accession code" defaultValue={query.bookQ} hiddenFilters={{ q: query.q, loansQ: query.loansQ, studentQ: query.studentQ, view: showReturned ? "all" : undefined }} resultSummary={`Showing ${availableBooks.rows.length} of ${availableBooks.total} books with available copies`} />
      </div>
      {!canManage ? <ReadOnlyNotice>Your role can review the library but cannot add books or manage loans.</ReadOnlyNotice> : null}

      {bookPage.total === 0 && !query.q?.trim() ? (
        <EmptyState
          icon={Library}
          title="No books in the catalogue yet"
          description="Add catalogue records with their copy counts before issuing books to students."
          action={canManage ? newBookDialog : undefined}
        />
      ) : (
        <>
          <SectionCard
            title="Circulation"
            description={showReturned ? "Every loan, newest first." : "Books currently on loan."}
            actions={
              <>
                {overdueCount > 0 ? <Badge variant="destructive">{overdueCount} overdue</Badge> : null}
                <Button size="sm" variant="outline" nativeButton={false} render={<a href={loanViewHref} />}>
                  {showReturned ? "Show open loans only" : "Show all loans"}
                </Button>
              </>
            }
          >
            <div className="space-y-4">
            <RecordSearch
              action={PATH}
              queryName="loansQ"
              label="Search loan history"
              placeholder="Book, student, or admission number"
              defaultValue={query.loansQ}
              hiddenFilters={{ q: query.q, studentQ: query.studentQ, bookQ: query.bookQ, view: showReturned ? "all" : undefined }}
              resultSummary={`Showing ${visibleLoans.length} of ${loanPage.total}`}
            />
            {visibleLoans.length === 0 ? (
              <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                {query.loansQ?.trim() ? "No loans match this search." : showReturned ? "No loans recorded yet." : "No books are currently on loan."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Book</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead className="hidden sm:table-cell">Borrowed</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage ? <TableHead><span className="sr-only">Actions</span></TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleLoans.map((loan) => {
                    const isOpen = loan.status === "BORROWED" || loan.status === "OVERDUE";
                    const isOverdue = isOpen && loan.dueAt < now;
                    return (
                      <TableRow key={loan.id}>
                        <TableCell className="font-medium">{loan.book.title}</TableCell>
                        <TableCell>
                          {loan.student.firstName} {loan.student.lastName}
                          <span className="block font-mono text-xs text-muted-foreground">{loan.student.admissionNumber}</span>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">{formatDate(loan.borrowedAt)}</TableCell>
                        <TableCell className={isOverdue ? "font-medium text-destructive" : "text-muted-foreground"}>{formatDate(loan.dueAt)}</TableCell>
                        <TableCell>{isOverdue ? <Badge variant="destructive">Overdue</Badge> : <StatusBadge status={loan.status} />}</TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            {isOpen ? (
                              <form action={returnBookAction}>
                                <input type="hidden" name="loanId" value={loan.id} />
                                <Button type="submit" size="sm" variant="ghost">Mark returned</Button>
                              </form>
                            ) : null}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            <RecordPagination path={PATH} page={loanPage.page} pageCount={loanPage.pageCount} filters={{ q: query.q, loansQ: query.loansQ, studentQ: query.studentQ, bookQ: query.bookQ, view: showReturned ? "all" : undefined }} label="Library loan history" queryName="loansPage" />
            </div>
          </SectionCard>

          <SectionCard title="Catalogue" description={`${bookPage.total} title${bookPage.total === 1 ? "" : "s"} on record.`}>
            <div className="space-y-4">
              <RecordSearch
                action={PATH}
                label="Search the catalogue"
                placeholder="Title, author, accession code, or ISBN"
                defaultValue={query.q}
                hiddenFilters={{ loansQ: query.loansQ, studentQ: query.studentQ, bookQ: query.bookQ, view: showReturned ? "all" : undefined }}
                resultSummary={`Showing ${visibleBooks.length} of ${bookPage.total}`}
              />
              {visibleBooks.length === 0 ? (
                <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No books match this search.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Accession</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead className="hidden md:table-cell">Author</TableHead>
                      <TableHead className="hidden lg:table-cell">Category</TableHead>
                      <TableHead>Available</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleBooks.map((book) => (
                      <TableRow key={book.id}>
                        <TableCell className="font-mono text-xs">{book.accessionCode}</TableCell>
                        <TableCell>
                          <span className="font-medium">{book.title}</span>
                          <span className="block text-xs text-muted-foreground md:hidden">{book.author ?? "Unknown author"}</span>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">{book.author ?? "-"}</TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell">{book.category ?? "-"}</TableCell>
                        <TableCell>
                          <span className="tabular-nums">{book.availableCopies} / {book.totalCopies}</span>
                          {book.availableCopies === 0 ? <Badge variant="outline" className="ml-2">All on loan</Badge> : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <RecordPagination path={PATH} page={bookPage.page} pageCount={bookPage.pageCount} filters={{ q: query.q, loansQ: query.loansQ, studentQ: query.studentQ, bookQ: query.bookQ, view: showReturned ? "all" : undefined }} label="Library catalogue" />
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
