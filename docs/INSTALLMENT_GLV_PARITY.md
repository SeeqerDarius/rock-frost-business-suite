# Installment GLV parity

The Installment module is based on the reference project at
`C:\Users\andre\glv-management-system`, adapted to the Business Suite's
multi-tenant authorization model.

## Staff lifecycle

Staff profiles support creation, editing, login linking, salary history,
salary payments, activation, deactivation, and guarded permanent deletion.
Deletion requires the acting administrator's current password and the exact
confirmation phrase `DELETE`.

As in GLV, a staff profile with customer or payroll history cannot be deleted;
it must be deactivated so reports and financial records retain their meaning.
The Business Suite additionally treats assigned installment-account history as
operational history. Deleting an otherwise unused staff profile removes only
the Installment staff profile; it does not delete the linked organization user
account, because membership and authentication are managed centrally under
Organization Administration.

This is an intentional multi-tenant adaptation of GLV's behavior: GLV owns the
staff login inside its staff record and deletes both together, while the
Business Suite may reuse one organization member across several modules.
