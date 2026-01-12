// @ts-nocheck

// supabase/functions/actualizar-mesas/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: {
      persistSession: false,
    },
  }
);

function logError(context: string, error: unknown) {
  console.error(`❌ Error en ${context}:`, error);
}

Deno.serve(async (_req) => {
  const now = new Date();

  console.log(`⏱️ Ejecutando actualizar-mesas`);
  console.log(`   Ahora (ISO/UTC): ${now.toISOString()}`);

  try {
    // -----------------------------------------------------------
    // 1) LIBERAR MESAS — reserva vencida
    //
    // Condición:
    //   now >= fecha_reservada + 45 min
    //   => fecha_reservada <= now - 45 min
    // -----------------------------------------------------------
    const cutoffVencida = new Date(now.getTime() - 45 * 60_000);
    const cutoffVencidaIso = cutoffVencida.toISOString();

    console.log(
      `🔍 Buscando mesas vencidas con fecha_reservada <= ${cutoffVencidaIso}`
    );

    const { data: mesasVencidas, error: errorMesasVencidas } = await supabase
      .from("menuya_mesas")
      .select("numero_mesa")
      .lte("fecha_reservada", cutoffVencidaIso)
      .eq("reservada", true);

    if (errorMesasVencidas) {
      logError("select mesas vencidas", errorMesasVencidas);
      throw errorMesasVencidas;
    }

    console.log(`📌 Mesas vencidas encontradas: ${mesasVencidas?.length ?? 0}`);

    if (mesasVencidas && mesasVencidas.length > 0) {
      const numerosMesa = mesasVencidas.map(
        (m) => m.numero_mesa as number
      );

      console.log(
        `➡️ Liberando mesas número: ${numerosMesa.join(", ")}`
      );

      // 1.1 Liberar mesas
      const { error: errorUpdateMesas } = await supabase
        .from("menuya_mesas")
        .update({
          disponible: true,
          reservada: false,
          fecha_reservada: null,
        })
        .in("numero_mesa", numerosMesa);

      if (errorUpdateMesas) {
        logError("update menuya_mesas (liberar)", errorUpdateMesas);
        throw errorUpdateMesas;
      }

      // 1.2 Actualizar clientes que tenían esas mesas asignadas
      const { error: errorUpdateClientes } = await supabase
        .from("menuya_clientes")
        .update({
          mesa_id: null,
          en_espera: false,
        })
        .in("mesa_id", numerosMesa);

      if (errorUpdateClientes) {
        logError(
          "update menuya_clientes (liberar clientes)",
          errorUpdateClientes
        );
        throw errorUpdateClientes;
      }

      console.log("✔️ Mesas vencidas liberadas y clientes actualizados.");
    } else {
      console.log("✅ No hay mesas vencidas para liberar en este ciclo.");
    }

    // -----------------------------------------------------------
    // 2) BLOQUEAR MESAS — 45 min antes de la reserva (ventana 1 min)
    //
    // Queremos:
    //   now ≈ fecha_reservada - 45 min
    //
    // Usamos ventana:
    //   fecha_reservada en [ now + 45 min, now + 46 min )
    // -----------------------------------------------------------
    const preStart = new Date(now.getTime() + 45 * 60_000);
    const preEnd = new Date(preStart.getTime() + 60_000);

    const preStartIso = preStart.toISOString();
    const preEndIso = preEnd.toISOString();

    console.log(
      `🔍 Buscando mesas para bloquear con fecha_reservada entre ${preStartIso} y ${preEndIso}`
    );

    const { data: mesasPrevias, error: errorMesasPrevias } = await supabase
      .from("menuya_mesas")
      .select("numero_mesa")
      .gte("fecha_reservada", preStartIso)
      .lt("fecha_reservada", preEndIso)
      .eq("disponible", true)   // solo las que siguen libres
      .eq("reservada", true);   // con reserva creada

    if (errorMesasPrevias) {
      logError("select mesas previas (bloqueo)", errorMesasPrevias);
      throw errorMesasPrevias;
    }

    console.log(`📌 Mesas a bloquear previo a reserva: ${mesasPrevias?.length ?? 0}`);

    if (mesasPrevias && mesasPrevias.length > 0) {
      const numerosMesaPrevias = mesasPrevias.map(
        (m) => m.numero_mesa as number
      );

      console.log(
        `➡️ Bloqueando mesas número: ${numerosMesaPrevias.join(", ")}`
      );

      const { error: errorUpdatePrevias } = await supabase
        .from("menuya_mesas")
        .update({
          // A partir de 45 min antes, consideramos la mesa "ocupada"
          disponible: false,
          reservada: false,
        })
        .in("numero_mesa", numerosMesaPrevias);

      if (errorUpdatePrevias) {
        logError("update menuya_mesas (bloqueo previo)", errorUpdatePrevias);
        throw errorUpdatePrevias;
      }

      console.log("✔️ Mesas bloqueadas 45 minutos antes de la reserva.");
    } else {
      console.log("✅ No hay mesas para bloquear en este ciclo.");
    }

    // -----------------------------------------------------------
    // 3) ASEGURAR MESAS RESERVADAS PERO AÚN DISPONIBLES
    //
    // Requisito:
    //   Si la mesa está reservada y falta MÁS de 45 minutos para la reserva,
    //   la mesa debe estar disponible = TRUE.
    //
    // Condición:
    //   fecha_reservada > now + 45 min  (usamos preStartIso)
    // -----------------------------------------------------------
    console.log(
      `🔍 Asegurando que mesas con reserva a más de 45 min sigan disponibles (fecha_reservada > ${preStartIso})`
    );

    const { error: errorUpdateReservadasDisponibles } = await supabase
      .from("menuya_mesas")
      .update({
        disponible: true,
      })
      .gt("fecha_reservada", preStartIso)
      .eq("reservada", true)
      .neq("disponible", true); // solo las que no están ya en true

    if (errorUpdateReservadasDisponibles) {
      logError(
        "update menuya_mesas (reservadas pero disponibles)",
        errorUpdateReservadasDisponibles
      );
      throw errorUpdateReservadasDisponibles;
    }

    console.log("✔️ Mesas reservadas a más de 45 min marcadas como disponibles.");

    return new Response(
      JSON.stringify({
        status: "ok",
        now_iso: now.toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    logError("actualizar-mesas (global)", error);
    return new Response(
      JSON.stringify({
        status: "error",
        message: "Error interno en actualizar-mesas",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});