-- Evita PATCH direto em product_variants no painel admin.
-- As funcoes validam public.is_admin() e gravam com SECURITY DEFINER.

create or replace function public.admin_upsert_product_variant(
    p_id uuid,
    p_product_id uuid,
    p_size_label text,
    p_sku text,
    p_price numeric,
    p_compare_at_price numeric,
    p_stock integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id uuid;
begin
    if not public.is_admin() then
        raise exception 'Acesso negado';
    end if;

    if p_id is null then
        insert into public.product_variants (
            product_id,
            size_label,
            sku,
            price,
            compare_at_price,
            stock
        )
        values (
            p_product_id,
            nullif(trim(coalesce(p_size_label, '')), ''),
            nullif(trim(coalesce(p_sku, '')), ''),
            p_price,
            p_compare_at_price,
            coalesce(p_stock, 0)
        )
        returning id into v_id;
    else
        update public.product_variants
        set
            product_id = p_product_id,
            size_label = nullif(trim(coalesce(p_size_label, '')), ''),
            sku = nullif(trim(coalesce(p_sku, '')), ''),
            price = p_price,
            compare_at_price = p_compare_at_price,
            stock = coalesce(p_stock, 0)
        where id = p_id
        returning id into v_id;

        if v_id is null then
            raise exception 'Variante nao encontrada';
        end if;
    end if;

    return v_id;
end;
$$;

create or replace function public.admin_delete_product_variant(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_admin() then
        raise exception 'Acesso negado';
    end if;

    delete from public.product_variants where id = p_id;
end;
$$;

grant execute on function public.admin_upsert_product_variant(uuid, uuid, text, text, numeric, numeric, integer) to authenticated;
grant execute on function public.admin_delete_product_variant(uuid) to authenticated;
