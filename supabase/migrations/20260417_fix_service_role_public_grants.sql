-- Corrige permissoes para a Edge Function PagBank persistir
-- em orders, payments e order_status_history usando service_role.

grant usage on schema public to service_role;

grant select, insert, update, delete on table public.orders to service_role;
grant select, insert, update, delete on table public.payments to service_role;
grant select, insert, update, delete on table public.order_status_history to service_role;
grant select on table public.order_items to service_role;

grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public
grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
grant usage, select on sequences to service_role;
