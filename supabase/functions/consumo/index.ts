import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOKEN = "hidrosmart123";
const COST_PER_LITER = 0.0064;

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  if (req.method !== "POST") {
    return jsonResponse({
      success: false,
      error: "Metodo nao permitido",
    }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({
      success: false,
      error: "Variaveis de ambiente do Supabase nao configuradas",
    }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json();

    if (body.token !== TOKEN) {
      return jsonResponse({
        success: false,
        error: "Unauthorized",
      }, 401);
    }

    const litros = toNumber(body.litros);
    const fluxo = toNumber(body.fluxo ?? body.fluxo_litros_min);
    const tempoLigado = toNumber(body.tempo_ligado ?? body.tempo_ligado_segundos);
    const custoReais = toNumber(body.custo ?? body.custo_reais) ?? (litros ?? 0) * COST_PER_LITER;

    if (litros === null || fluxo === null || tempoLigado === null) {
      return jsonResponse({
        success: false,
        error: "Dados incompletos ou invalidos",
      }, 400);
    }

    const { data, error } = await supabase
      .from("consumo_agua")
      .insert([
        {
          litros,
          custo_reais: Number(custoReais.toFixed(6)),
          fluxo_litros_min: fluxo,
          tempo_ligado_segundos: Math.floor(tempoLigado),
        },
      ])
      .select();

    if (error) {
      return jsonResponse({
        success: false,
        error: error.message,
      }, 500);
    }

    return jsonResponse({
      success: true,
      message: "Dados salvos com sucesso",
      data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro inesperado";

    return jsonResponse({
      success: false,
      error: message,
    }, 500);
  }
});
