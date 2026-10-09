"use client";

/**
 * Contact picker for new documents. Choosing a contact that has a default
 * currency pre-selects that currency in the document's currency field
 * (rendered by CurrencyFields with the same idPrefix). The user can still
 * change it; the server validates whatever is submitted.
 */
export function ContactSelect({ contacts, currencyFieldId, id = "contactId" }: { contacts: { id: string; name: string; currency: string | null }[]; currencyFieldId: string; id?: string }) {
  function applyDefaultCurrency(contactId: string) {
    const currency = contacts.find((contact) => contact.id === contactId)?.currency;
    const field = document.getElementById(currencyFieldId);
    if (!currency || !(field instanceof HTMLSelectElement)) return;
    if (![...field.options].some((option) => option.value === currency)) return;
    field.value = currency;
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return (
    <select id={id} name="contactId" className="h-10 w-full rounded-md border bg-background px-3" onChange={(event) => applyDefaultCurrency(event.target.value)}>
      <option value="">Enter details manually</option>
      {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.currency ? ` (${contact.currency})` : ""}</option>)}
    </select>
  );
}
