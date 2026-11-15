/* What: amounts on invoices. Why: billing. Task: demo-2 */
create table public.invoices (
  id bigint generated always as identity primary key,
  account_id uuid not null,
  amount money,
  fee_usd double precision,
  price numeric(12, 2),
  meta jsonb,
  constraint invoices_fee_check check (fee_usd >= 0)
);
alter table public.invoices add column tax_eur float8, add column refund_cents bigint;
alter table public.invoices drop constraint invoices_fee_check;
alter table public.invoices alter column meta drop default;
alter table public.invoices rename column price to price_eur;
