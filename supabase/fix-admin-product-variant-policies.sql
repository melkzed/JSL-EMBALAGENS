-- Corrige permissao de administradores para editar preco e estoque das variantes.
-- Execute no Supabase SQL Editor ou via:
-- supabase db query --linked -f supabase/fix-admin-product-variant-policies.sql

grant select, insert, update, delete on table public.product_variants to authenticated;

drop policy if exists "Admins can manage product variants" on public.product_variants;

create policy "Admins can manage product variants"
on public.product_variants
for all
to authenticated
using (
    exists (
        select 1
        from public.admin_users au
        where au.user_id = auth.uid()
          and au.active = true
    )
)
with check (
    exists (
        select 1
        from public.admin_users au
        where au.user_id = auth.uid()
          and au.active = true
    )
);

grant select, insert, update, delete on table public.products to authenticated;
grant select, insert, update, delete on table public.product_images to authenticated;

drop policy if exists "Admins can manage products" on public.products;
create policy "Admins can manage products"
on public.products
for all
to authenticated
using (
    exists (
        select 1
        from public.admin_users au
        where au.user_id = auth.uid()
          and au.active = true
    )
)
with check (
    exists (
        select 1
        from public.admin_users au
        where au.user_id = auth.uid()
          and au.active = true
    )
);

drop policy if exists "Admins can manage product images" on public.product_images;
create policy "Admins can manage product images"
on public.product_images
for all
to authenticated
using (
    exists (
        select 1
        from public.admin_users au
        where au.user_id = auth.uid()
          and au.active = true
    )
)
with check (
    exists (
        select 1
        from public.admin_users au
        where au.user_id = auth.uid()
          and au.active = true
    )
);
