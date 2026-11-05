-- Delivery Received: the invoice is scanned page by page in the wizard and consolidated into one PDF.
-- The PDF is filed in the `invoices` bucket (store / supplier / month, same as Invoice Upload) and an
-- `invoices` row is created, so it also shows in the Invoice folder. The delivery keeps a pointer to it
-- so reviewers can open the invoice straight from the delivery row.
alter table public.deliveries
  add column if not exists invoice_pdf_path text,
  add column if not exists invoice_pages smallint;
