// @ts-nocheck -- Deno runtime (Supabase Edge Functions)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function onlyDigits(value = "") {
  return String(value || "").replace(/\D/g, "")
}

function buildSiteUrl() {
  return String(Deno.env.get("SITE_URL") || "https://www.jslembalagens.com.br").replace(/\/+$/, "")
}

function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Metodo nao permitido" }, 405)
  }

  try {
    const accessToken = Deno.env.get("MP_ACCESS_TOKEN")
    if (!accessToken) {
      return jsonResponse({ error: "Token Mercado Pago nao configurado" }, 500)
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    const { order_id } = await req.json().catch(() => ({}))
    if (!order_id) {
      return jsonResponse({ error: "order_id e obrigatorio" }, 400)
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(`
        *,
        order_items (
          product_name,
          variant_label,
          quantity,
          unit_price,
          total_price
        )
      `)
      .eq("id", order_id)
      .single()

    if (orderError || !order) {
      return jsonResponse({ error: "Pedido nao encontrado" }, 404)
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, cpf, phone")
      .eq("id", order.user_id)
      .maybeSingle()

    const { data: authUserData } = await supabase.auth.admin.getUserById(order.user_id)
    const payerEmail = profile?.email || authUserData?.user?.email || undefined

    const itemsSubtotal = (order.order_items || []).reduce((sum: number, item: any) => {
      return sum + Number(item.total_price || (Number(item.unit_price || 0) * Number(item.quantity || 0)))
    }, 0)
    const discount = Math.max(0, Number(order.discount || 0))
    const discountFactor = itemsSubtotal > 0 && discount > 0
      ? Math.max(0, (itemsSubtotal - discount) / itemsSubtotal)
      : 1

    const mpItems = (order.order_items || []).map((item: any, index: number) => ({
      id: `${order_id}-${index + 1}`,
      title: item.variant_label
        ? `${item.product_name} - ${item.variant_label}`.substring(0, 256)
        : String(item.product_name || "Produto").substring(0, 256),
      quantity: Number(item.quantity || 1),
      unit_price: roundMoney(Number(item.unit_price || 0) * discountFactor),
      currency_id: "BRL",
    })).filter((item: any) => item.quantity > 0 && item.unit_price > 0)

    if (mpItems.length === 0) {
      return jsonResponse({ error: "Pedido sem itens validos" }, 400)
    }

    const siteUrl = buildSiteUrl()
    const returnUrl = `${siteUrl}/checkout-retorno.html?pedido=${encodeURIComponent(order_id)}`
    const cpf = onlyDigits(profile?.cpf)
    const phone = onlyDigits(profile?.phone)

    const preferenceBody: any = {
      items: mpItems,
      payer: {
        name: profile?.full_name || "Cliente JSL",
        ...(payerEmail ? { email: payerEmail } : {}),
        ...(cpf.length === 11 ? { identification: { type: "CPF", number: cpf } } : {}),
        ...(phone ? { phone: { number: phone } } : {}),
      },
      shipments: {
        cost: roundMoney(Number(order.shipping_cost || 0)),
        mode: "not_specified",
        receiver_address: {
          street_name: order.shipping_street || "",
          street_number: String(order.shipping_number || ""),
          apartment: order.shipping_complement || "",
          city_name: order.shipping_city || "",
          state_name: order.shipping_state || "",
          zip_code: onlyDigits(order.shipping_zip_code),
        },
      },
      external_reference: order_id,
      back_urls: {
        success: returnUrl,
        failure: returnUrl,
        pending: returnUrl,
      },
      auto_return: "approved",
      notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mp-webhook`,
      statement_descriptor: "JSL EMBALAGENS",
      metadata: {
        order_id,
        order_number: order.order_number || null,
      },
    }

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preferenceBody),
    })

    const preference = await mpRes.json().catch(() => ({}))

    if (!mpRes.ok || !preference.id) {
      console.error("[Mercado Pago] Erro ao criar preferencia:", JSON.stringify(preference))
      return jsonResponse({
        error: "Erro ao criar preferencia no Mercado Pago",
        detail: preference,
      }, 500)
    }

    const paymentData = {
      gateway: "mercadopago",
      gateway_transaction_id: preference.id,
      gateway_response: preference,
      status: "pending",
      amount: Number(order.total),
      updated_at: new Date().toISOString(),
    }

    const { data: updatedPayments, error: updateError } = await supabase
      .from("payments")
      .update(paymentData)
      .eq("order_id", order_id)
      .select("id")

    if (updateError) {
      console.error("[Mercado Pago] Erro ao atualizar payment:", updateError)
    }

    if (!updatedPayments || updatedPayments.length === 0) {
      const { error: insertError } = await supabase
        .from("payments")
        .insert({
          order_id,
          method: "credit_card",
          ...paymentData,
          created_at: new Date().toISOString(),
        })

      if (insertError) {
        console.error("[Mercado Pago] Erro ao inserir payment:", insertError)
      }
    }

    return jsonResponse({
      preference_id: preference.id,
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point,
    })
  } catch (err) {
    console.error("[Mercado Pago] Erro interno:", err)
    return jsonResponse({ error: "Erro interno no servidor" }, 500)
  }
})
