// @ts-nocheck -- Deno runtime (Supabase Edge Functions)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const statusMap: Record<string, string> = {
  approved: "approved",
  pending: "pending",
  in_process: "processing",
  rejected: "refused",
  cancelled: "cancelled",
  refunded: "refunded",
  charged_back: "refunded",
}

const orderStatusMap: Record<string, string> = {
  approved: "paid",
  pending: "pending",
  in_process: "pending",
  rejected: "pending",
  cancelled: "cancelled",
  refunded: "refunded",
  charged_back: "refunded",
}

const methodMap: Record<string, string> = {
  credit_card: "credit_card",
  debit_card: "debit_card",
  account_money: "transfer",
  bank_transfer: "transfer",
  pix: "pix",
  ticket: "boleto",
  bolbradesco: "boleto",
  pec: "boleto",
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-id, x-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function textResponse(body: string, status = 200) {
  return new Response(body, { status, headers: corsHeaders })
}

function parseSignature(header = "") {
  return header.split(",").reduce((acc: Record<string, string>, part) => {
    const [key, value] = part.split("=").map((piece) => piece?.trim())
    if (key && value) acc[key] = value
    return acc
  }, {})
}

function timingSafeEqual(a = "", b = "") {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

async function validarAssinaturaMercadoPago(req: Request, payload: any) {
  const secret = Deno.env.get("MP_WEBHOOK_SECRET")
  if (!secret) return true

  const url = new URL(req.url)
  const xSignature = req.headers.get("x-signature") || ""
  const xRequestId = req.headers.get("x-request-id") || ""
  const parsed = parseSignature(xSignature)
  const ts = parsed.ts
  const received = parsed.v1

  if (!ts || !received || !xRequestId) return false

  const dataId = url.searchParams.get("data.id") || payload?.data?.id || payload?.id || ""
  const templateParts = []
  if (dataId) templateParts.push(`id:${dataId}`)
  templateParts.push(`request-id:${xRequestId}`)
  templateParts.push(`ts:${ts}`)
  const signatureTemplate = `${templateParts.join(";")};`
  const calculated = await hmacSha256Hex(secret, signatureTemplate)

  return timingSafeEqual(calculated, received)
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return textResponse("ok")
    }

    if (req.method !== "POST") {
      return textResponse("ok")
    }

    const accessToken = Deno.env.get("MP_ACCESS_TOKEN")
    if (!accessToken) {
      console.error("[Mercado Pago Webhook] MP_ACCESS_TOKEN nao configurado")
      return textResponse("token missing")
    }

    const url = new URL(req.url)
    const payload = await req.json().catch(() => null)
    console.log("[Mercado Pago Webhook] Recebido:", JSON.stringify(payload || {}).substring(0, 800))

    const eventType = payload?.type || payload?.topic || url.searchParams.get("type") || url.searchParams.get("topic")
    if (eventType !== "payment") {
      return textResponse("ignored")
    }

    const assinaturaValida = await validarAssinaturaMercadoPago(req, payload)
    if (!assinaturaValida) {
      console.warn("[Mercado Pago Webhook] Assinatura invalida. Evento descartado.")
      return textResponse("invalid signature")
    }

    const paymentId = payload?.data?.id || payload?.id || url.searchParams.get("data.id") || url.searchParams.get("id")
    if (!paymentId) {
      return textResponse("no payment id")
    }

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
      },
    })
    const payment = await mpRes.json().catch(() => ({}))

    if (!mpRes.ok || !payment?.id) {
      console.error("[Mercado Pago Webhook] Erro ao consultar pagamento:", JSON.stringify(payment))
      return textResponse("ok")
    }

    const externalReference = String(payment.external_reference || payment.metadata?.order_id || "")
    if (!externalReference) {
      console.error("[Mercado Pago Webhook] Pagamento sem external_reference:", paymentId)
      return textResponse("no external reference")
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    const { data: order, error: orderFindError } = await supabase
      .from("orders")
      .select("id, status, order_number")
      .or(`id.eq.${externalReference},order_number.eq.${externalReference}`)
      .maybeSingle()

    if (orderFindError || !order) {
      console.error("[Mercado Pago Webhook] Pedido nao encontrado:", externalReference, orderFindError)
      return textResponse("order not found")
    }

    const paymentMethod = methodMap[payment.payment_type_id] || payment.payment_type_id || "mercadopago"
    const internalPaymentStatus = statusMap[payment.status] || "pending"
    const orderStatus = orderStatusMap[payment.status] || "pending"
    const now = new Date().toISOString()

    const paymentUpdate: Record<string, unknown> = {
      gateway: "mercadopago",
      gateway_transaction_id: String(payment.id),
      gateway_response: payment,
      method: paymentMethod,
      status: internalPaymentStatus,
      amount: Number(payment.transaction_amount || 0),
      updated_at: now,
    }

    if (payment.status === "approved") paymentUpdate.paid_at = now
    if (["refunded", "charged_back"].includes(payment.status)) paymentUpdate.refunded_at = now

    const { error: paymentUpdateError } = await supabase
      .from("payments")
      .update(paymentUpdate)
      .eq("order_id", order.id)

    if (paymentUpdateError) {
      console.error("[Mercado Pago Webhook] Erro ao atualizar payment:", paymentUpdateError)
    }

    const statusPriority = ["pending", "paid", "preparing", "shipped", "delivered"]
    const currentIndex = statusPriority.indexOf(order.status)
    const newIndex = statusPriority.indexOf(orderStatus)
    const shouldUpdateOrder = newIndex > currentIndex || ["cancelled", "refunded"].includes(orderStatus)

    if (shouldUpdateOrder) {
      const { error: orderUpdateError } = await supabase
        .from("orders")
        .update({
          status: orderStatus,
          payment_method: paymentMethod,
          updated_at: now,
        })
        .eq("id", order.id)

      if (orderUpdateError) {
        console.error("[Mercado Pago Webhook] Erro ao atualizar pedido:", orderUpdateError)
      }

      const { error: historyError } = await supabase
        .from("order_status_history")
        .insert({
          order_id: order.id,
          status: orderStatus,
          notes: `Pagamento ${payment.status} via Mercado Pago. ID: ${payment.id}. Detalhe: ${payment.status_detail || ""}`,
        })

      if (historyError) {
        console.error("[Mercado Pago Webhook] Erro ao inserir historico:", historyError)
      }
    }

    return textResponse("ok")
  } catch (err) {
    console.error("[Mercado Pago Webhook] Erro interno:", err)
    return textResponse("error logged")
  }
})
